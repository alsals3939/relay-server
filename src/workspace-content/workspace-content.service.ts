import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { PDFParse } from 'pdf-parse';
import { createAiClient, embedTexts, resolveAiModel } from '../ai/ai-client';
import { chunkText } from '../ai/document-search';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceAccessService } from '../workspaces/workspace-access.service';
import { AiConfigAssistantDto } from './dto/ai-config-assistant.dto';
import {
  CreateAiConfigAssistantSessionDto,
  SendAiConfigAssistantMessageDto,
} from './dto/ai-config-assistant-session.dto';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateAiConfigDto } from './dto/update-ai-config.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';

@Injectable()
export class WorkspaceContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
    private readonly configService: ConfigService,
  ) {}

  async getAiConfig(workspaceId: string, userId: string, roleGroupId?: string) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
    );
    return this.prisma.aiConfig.findUnique({
      where: { roleGroupId: roleGroup.id },
    });
  }

  async updateAiConfig(
    workspaceId: string,
    userId: string,
    dto: UpdateAiConfigDto,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
      true,
    );

    return this.prisma.aiConfig.upsert({
      where: { roleGroupId: roleGroup.id },
      create: { workspaceId, roleGroupId: roleGroup.id, ...dto },
      update: dto,
    });
  }

  async assistAiConfig(
    workspaceId: string,
    userId: string,
    dto: AiConfigAssistantDto,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
      true,
    );

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        name: true,
        description: true,
        roleGroups: { select: { name: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!workspace) {
      throw new NotFoundException('워크스페이스를 찾을 수 없습니다.');
    }

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: [
          '당신은 한국어로 대화하는 AI 시스템 프롬프트 설계 인터뷰어입니다.',
          '사용자가 팀 업무를 설명하면 자연스러운 대화를 통해 다음 항목을 구체화하세요:',
          '1. 업종과 팀의 역할, 2. AI를 사용할 사람, 3. 주요 업무와 질문 유형,',
          '4. 답변 말투와 출력 형식, 5. 하지 말아야 할 행동과 모를 때의 대응 기준.',
          '한 번에 한두 가지만 짧고 친근하게 질문하세요. 이미 답한 내용을 다시 묻지 마세요.',
          '필수 내용이 충분하면 status를 ready로 바꾸고 실무에서 바로 쓸 수 있는 한국어 시스템 프롬프트를 작성하세요.',
          '사용자가 지금까지 내용으로 만들어 달라고 하면 부족한 내용은 합리적인 기본값으로 채워 ready로 응답하세요.',
          'ready 이후 사용자가 수정을 요청하면 대화를 계속하고 개선된 프롬프트를 다시 제안하세요.',
          '프롬프트는 역할, 목표, 지식 사용 원칙, 답변 규칙, 금지 사항, 모르는 경우 대응을 명확한 섹션으로 구성하세요.',
          '사용자가 새 역할군을 만들어 달라고 명시적으로 요청하면 action을 create_role_group으로 설정하고, 60자 이내 이름과 300자 이내 설명을 제안하세요.',
          '역할군은 아직 생성되지 않았으며 사용자의 확인이 필요하다고 안내하세요. 기존 역할군과 같은 이름은 제안하지 마세요.',
          '새 역할군 요청이 아니면 action은 none이고 역할군 이름과 설명은 빈 문자열이어야 합니다.',
          `워크스페이스 이름: ${workspace.name}`,
          `현재 역할군: ${roleGroup.name}`,
          `기존 역할군: ${workspace.roleGroups.map(({ name }) => name).join(', ')}`,
          workspace.description
            ? `워크스페이스 설명: ${workspace.description}`
            : '',
          dto.currentSystemPrompt
            ? `현재 시스템 프롬프트:\n${dto.currentSystemPrompt}`
            : '현재 시스템 프롬프트는 비어 있습니다.',
          '반드시 지정된 JSON 스키마로만 응답하세요.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
      ...dto.messages.slice(-30).map((message): ChatCompletionMessageParam => ({
        role: message.role,
        content: message.content.trim(),
      })),
    ];
    const latestUserMessage = [...dto.messages]
      .reverse()
      .find((message) => message.role === 'user')?.content;
    const requestedRoleGroupCreation =
      latestUserMessage !== undefined &&
      /역할군.{0,20}(만들|생성|추가)|(?:만들|생성|추가).{0,20}역할군/i.test(
        latestUserMessage,
      );
    const requestedImmediateProposal =
      !requestedRoleGroupCreation &&
      latestUserMessage !== undefined &&
      /(지금|이대로|내용으로|바로).{0,12}(만들|생성|작성|제안|정리)|프롬프트.{0,10}(만들|생성|작성|제안)/i.test(
        latestUserMessage,
      );

    if (requestedImmediateProposal) {
      messages.push({
        role: 'system',
        content:
          '사용자가 현재까지의 내용으로 프롬프트 생성을 명시적으로 요청했습니다. 추가 질문 없이 합리적인 기본값을 보완해 반드시 status를 ready로 응답하고 proposedSystemPrompt를 완성하세요.',
      });
    }
    if (requestedRoleGroupCreation) {
      messages.push({
        role: 'system',
        content:
          '사용자가 새 역할군 생성을 명시적으로 요청했습니다. action을 반드시 create_role_group으로 설정하고 중복되지 않는 역할군 이름과 설명을 제안하세요. 아직 생성했다고 말하지 말고 확인 버튼이 필요하다고 안내하세요.',
      });
    }

    const openai = createAiClient(this.configService);
    const completion = await openai.chat.completions
      .create({
        model: resolveAiModel(this.configService, undefined),
        messages,
        temperature: 0.3,
        max_tokens: 2200,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'ai_config_interview',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                reply: { type: 'string' },
                status: { type: 'string', enum: ['gathering', 'ready'] },
                summary: { type: 'string' },
                proposedSystemPrompt: { type: 'string' },
                action: {
                  type: 'string',
                  enum: ['none', 'create_role_group'],
                },
                suggestedRoleGroupName: {
                  type: 'string',
                  maxLength: 60,
                },
                suggestedRoleGroupDescription: {
                  type: 'string',
                  maxLength: 300,
                },
                missingTopics: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: [
                'reply',
                'status',
                'summary',
                'proposedSystemPrompt',
                'action',
                'suggestedRoleGroupName',
                'suggestedRoleGroupDescription',
                'missingTopics',
              ],
            },
          },
        },
      })
      .catch(() => {
        throw new ServiceUnavailableException(
          'OpenAI에 연결하지 못했습니다. API 키와 네트워크 상태를 확인해 주세요.',
        );
      });

    const content = completion.choices[0]?.message.content;
    if (!content) {
      throw new ServiceUnavailableException(
        'AI 설정 도우미의 응답이 비어 있습니다.',
      );
    }

    try {
      const result = JSON.parse(content) as {
        reply?: unknown;
        status?: unknown;
        summary?: unknown;
        proposedSystemPrompt?: unknown;
        action?: unknown;
        suggestedRoleGroupName?: unknown;
        suggestedRoleGroupDescription?: unknown;
        missingTopics?: unknown;
      };

      if (
        typeof result.reply !== 'string' ||
        (result.status !== 'gathering' && result.status !== 'ready') ||
        typeof result.summary !== 'string' ||
        typeof result.proposedSystemPrompt !== 'string' ||
        (result.action !== 'none' && result.action !== 'create_role_group') ||
        typeof result.suggestedRoleGroupName !== 'string' ||
        typeof result.suggestedRoleGroupDescription !== 'string' ||
        (result.action === 'create_role_group' &&
          !result.suggestedRoleGroupName.trim()) ||
        !Array.isArray(result.missingTopics) ||
        !result.missingTopics.every((item) => typeof item === 'string')
      ) {
        throw new Error('응답 형식이 올바르지 않습니다.');
      }

      return {
        reply: result.reply,
        status: result.status,
        summary: result.summary,
        proposedSystemPrompt: result.proposedSystemPrompt,
        action: result.action,
        suggestedRoleGroupName: result.suggestedRoleGroupName,
        suggestedRoleGroupDescription: result.suggestedRoleGroupDescription,
        missingTopics: result.missingTopics,
      };
    } catch {
      throw new ServiceUnavailableException(
        'AI 설정 도우미의 응답을 해석하지 못했습니다.',
      );
    }
  }

  async listAssistantSessions(
    workspaceId: string,
    roleGroupId: string,
    userId: string,
  ) {
    await this.resolveRoleGroup(workspaceId, userId, roleGroupId, true);
    return this.prisma.aiConfigAssistantSession.findMany({
      where: { workspaceId, roleGroupId },
      select: {
        id: true,
        title: true,
        status: true,
        lastSummary: true,
        lastProposedSystemPrompt: true,
        lastMissingTopics: true,
        lastSuggestedRoleGroupName: true,
        lastSuggestedRoleGroupDescription: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createAssistantSession(
    workspaceId: string,
    userId: string,
    dto: CreateAiConfigAssistantSessionDto,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      dto.roleGroupId,
      true,
    );
    const greeting =
      '안녕하세요! 우리 팀에 꼭 맞는 AI를 함께 만들어볼게요. 먼저 어느 분야에서, 어떤 일을 하는 팀인지 알려주세요.';

    return this.prisma.aiConfigAssistantSession.create({
      data: {
        workspaceId,
        roleGroupId: roleGroup.id,
        createdById: userId,
        title: `${roleGroup.name} 설정 대화`,
        messages: {
          create: { role: 'ASSISTANT', content: greeting },
        },
      },
      include: {
        messages: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async listAssistantMessages(
    workspaceId: string,
    sessionId: string,
    userId: string,
  ) {
    const session = await this.requireAssistantSession(
      workspaceId,
      sessionId,
      userId,
    );
    return this.prisma.aiConfigAssistantMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendAssistantMessage(
    workspaceId: string,
    sessionId: string,
    userId: string,
    dto: SendAiConfigAssistantMessageDto,
  ) {
    const session = await this.requireAssistantSession(
      workspaceId,
      sessionId,
      userId,
    );
    const storedMessages = await this.prisma.aiConfigAssistantMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 29,
    });
    const messages = [
      ...storedMessages.reverse().map((message) => ({
        role:
          message.role === 'USER' ? ('user' as const) : ('assistant' as const),
        content: message.content,
      })),
      { role: 'user' as const, content: dto.message.trim() },
    ];
    const result = await this.assistAiConfig(
      workspaceId,
      userId,
      {
        messages,
        currentSystemPrompt: dto.currentSystemPrompt,
      },
      session.roleGroupId,
    );

    await this.prisma.$transaction([
      this.prisma.aiConfigAssistantMessage.createMany({
        data: [
          {
            sessionId,
            role: 'USER',
            content: dto.message.trim(),
          },
          {
            sessionId,
            role: 'ASSISTANT',
            content: result.reply,
          },
        ],
      }),
      this.prisma.aiConfigAssistantSession.update({
        where: { id: sessionId },
        data: {
          status: result.status === 'ready' ? 'READY' : 'GATHERING',
          lastSummary: result.summary || null,
          lastProposedSystemPrompt: result.proposedSystemPrompt || null,
          lastMissingTopics: result.missingTopics,
          lastSuggestedRoleGroupName:
            result.action === 'create_role_group'
              ? result.suggestedRoleGroupName
              : null,
          lastSuggestedRoleGroupDescription:
            result.action === 'create_role_group'
              ? result.suggestedRoleGroupDescription
              : null,
          title:
            session.title.endsWith('설정 대화') &&
            storedMessages.filter((message) => message.role === 'USER')
              .length === 0
              ? dto.message.trim().slice(0, 40)
              : undefined,
        },
      }),
    ]);

    return { sessionId, ...result };
  }

  async listKnowledge(
    workspaceId: string,
    userId: string,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
    );
    return this.prisma.knowledgeItem.findMany({
      where: { workspaceId, roleGroupId: roleGroup.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createKnowledge(
    workspaceId: string,
    userId: string,
    dto: CreateKnowledgeDto,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
      true,
    );
    return this.prisma.knowledgeItem.create({
      data: {
        workspaceId,
        roleGroupId: roleGroup.id,
        question: dto.question.trim(),
        answer: dto.answer.trim(),
      },
    });
  }

  async updateKnowledge(
    workspaceId: string,
    itemId: string,
    userId: string,
    dto: UpdateKnowledgeDto,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
      true,
    );
    await this.requireKnowledgeItem(workspaceId, itemId, roleGroup.id);

    return this.prisma.knowledgeItem.update({
      where: { id: itemId },
      data: {
        question: dto.question?.trim(),
        answer: dto.answer?.trim(),
      },
    });
  }

  async removeKnowledge(
    workspaceId: string,
    itemId: string,
    userId: string,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
      true,
    );
    await this.requireKnowledgeItem(workspaceId, itemId, roleGroup.id);
    await this.prisma.knowledgeItem.delete({ where: { id: itemId } });
    return { success: true };
  }

  async listChecklists(
    workspaceId: string,
    userId: string,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
    );
    const checklists = await this.prisma.checklist.findMany({
      where: { workspaceId, roleGroupId: roleGroup.id },
      include: {
        items: {
          orderBy: { position: 'asc' },
          include: {
            completions: {
              where: { userId },
              select: { userId: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return checklists.map((checklist) => ({
      ...checklist,
      items: checklist.items.map(({ completions, ...item }) => ({
        ...item,
        completed: completions.length > 0,
      })),
    }));
  }

  async createChecklist(
    workspaceId: string,
    userId: string,
    dto: CreateChecklistDto,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
      true,
    );

    return this.prisma.checklist.create({
      data: {
        workspaceId,
        roleGroupId: roleGroup.id,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        items: dto.items
          ? {
              create: dto.items.map((item, position) => ({
                title: item.title.trim(),
                description: item.description?.trim(),
                position,
              })),
            }
          : undefined,
      },
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }

  async updateChecklist(
    workspaceId: string,
    checklistId: string,
    userId: string,
    dto: UpdateChecklistDto,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
      true,
    );
    await this.requireChecklist(workspaceId, checklistId, roleGroup.id);

    return this.prisma.checklist.update({
      where: { id: checklistId },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        items: dto.items
          ? {
              deleteMany: {},
              create: dto.items.map((item, position) => ({
                title: item.title.trim(),
                description: item.description?.trim(),
                position,
              })),
            }
          : undefined,
      },
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }

  async createChecklistItem(
    workspaceId: string,
    checklistId: string,
    userId: string,
    dto: CreateChecklistItemDto,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
      true,
    );
    await this.requireChecklist(workspaceId, checklistId, roleGroup.id);

    const lastItem = await this.prisma.checklistItem.findFirst({
      where: { checklistId },
      select: { position: true },
      orderBy: { position: 'desc' },
    });
    const item = await this.prisma.checklistItem.create({
      data: {
        checklistId,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        position: (lastItem?.position ?? -1) + 1,
      },
    });

    return { ...item, completed: false };
  }

  async removeChecklist(
    workspaceId: string,
    checklistId: string,
    userId: string,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
      true,
    );
    await this.requireChecklist(workspaceId, checklistId, roleGroup.id);
    await this.prisma.checklist.delete({ where: { id: checklistId } });
    return { success: true };
  }

  async updateChecklistItemCompletion(
    workspaceId: string,
    checklistId: string,
    itemId: string,
    userId: string,
    completed: boolean,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
    );
    const item = await this.prisma.checklistItem.findFirst({
      where: {
        id: itemId,
        checklistId,
        checklist: { workspaceId, roleGroupId: roleGroup.id },
      },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException('체크리스트 항목을 찾을 수 없습니다.');
    }

    if (completed) {
      await this.prisma.checklistItemCompletion.upsert({
        where: { checklistItemId_userId: { checklistItemId: itemId, userId } },
        create: { checklistItemId: itemId, userId },
        update: { completedAt: new Date() },
      });
    } else {
      await this.prisma.checklistItemCompletion.deleteMany({
        where: { checklistItemId: itemId, userId },
      });
    }

    return { itemId, completed };
  }

  async listDocuments(
    workspaceId: string,
    userId: string,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
    );
    return this.prisma.document.findMany({
      where: { workspaceId, roleGroupId: roleGroup.id },
      select: {
        id: true,
        name: true,
        mimeType: true,
        status: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadDocument(
    workspaceId: string,
    userId: string,
    file: Express.Multer.File | undefined,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
      true,
    );

    if (!file) {
      throw new BadRequestException('업로드할 파일이 필요합니다.');
    }

    const document = await this.prisma.document.create({
      data: {
        workspaceId,
        roleGroupId: roleGroup.id,
        name: this.decodeOriginalName(file.originalname),
        mimeType: file.mimetype,
      },
    });

    try {
      const content = await this.extractText(file);
      const trimmedContent = content.slice(0, 2_000_000);
      const updated = await this.prisma.document.update({
        where: { id: document.id },
        data: {
          content: trimmedContent,
          status: 'READY',
        },
        select: {
          id: true,
          name: true,
          mimeType: true,
          status: true,
          createdAt: true,
        },
      });

      await this.indexDocumentChunks(
        document.id,
        roleGroup.id,
        workspaceId,
        trimmedContent,
      );

      return updated;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '문서 처리에 실패했습니다.';
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: 'FAILED', error: message },
      });
      throw new BadRequestException(message);
    }
  }

  async removeDocument(
    workspaceId: string,
    documentId: string,
    userId: string,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
      true,
    );
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, workspaceId, roleGroupId: roleGroup.id },
      select: { id: true },
    });

    if (!document) {
      throw new NotFoundException('문서를 찾을 수 없습니다.');
    }

    await this.prisma.document.delete({ where: { id: documentId } });
    return { success: true };
  }

  /**
   * multipart/form-data 파일명은 busboy가 latin1로 디코딩하기 때문에 한글 등
   * 비-ASCII 파일명이 깨져서 들어온다. 원래 바이트를 utf8로 다시 해석해 복구한다.
   */
  private decodeOriginalName(originalName: string): string {
    try {
      return Buffer.from(originalName, 'latin1').toString('utf8');
    } catch {
      return originalName;
    }
  }

  private async indexDocumentChunks(
    documentId: string,
    roleGroupId: string,
    workspaceId: string,
    content: string,
  ) {
    const chunks = chunkText(content).slice(0, 200);
    if (!chunks.length) return;

    try {
      const embeddings = await embedTexts(this.configService, chunks);
      await this.prisma.documentChunk.createMany({
        data: chunks.map((chunkContent, index) => ({
          documentId,
          workspaceId,
          roleGroupId,
          content: chunkContent,
          embedding: embeddings[index],
          position: index,
        })),
      });
    } catch {
      // 임베딩 실패 시(OPENAI_API_KEY 미설정 등) 채팅은 문서 원문 폴백으로 계속 동작한다.
    }
  }

  private async extractText(file: Express.Multer.File) {
    if (
      file.mimetype === 'text/plain' ||
      file.mimetype === 'text/markdown' ||
      file.originalname.endsWith('.md')
    ) {
      return file.buffer.toString('utf8');
    }

    if (file.mimetype === 'application/pdf') {
      const parser = new PDFParse({ data: file.buffer });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }

    throw new Error('현재 PDF, TXT, Markdown 파일만 지원합니다.');
  }

  private requireManager(workspaceId: string, userId: string) {
    return this.access.requireRole(workspaceId, userId, ['OWNER', 'ADMIN']);
  }

  private async resolveRoleGroup(
    workspaceId: string,
    userId: string,
    roleGroupId?: string,
    managerOnly = false,
  ) {
    if (managerOnly) {
      await this.requireManager(workspaceId, userId);
    }

    const roleGroup = roleGroupId
      ? await this.prisma.roleGroup.findFirst({
          where: { id: roleGroupId, workspaceId },
        })
      : await this.prisma.roleGroup.findFirst({
          where: { workspaceId, isDefault: true },
        });
    if (!roleGroup) {
      throw new NotFoundException('역할군을 찾을 수 없습니다.');
    }

    if (!managerOnly) {
      await this.access.requireRoleGroupAccess(
        workspaceId,
        roleGroup.id,
        userId,
      );
    }

    return roleGroup;
  }

  private async requireKnowledgeItem(
    workspaceId: string,
    itemId: string,
    roleGroupId: string,
  ) {
    const item = await this.prisma.knowledgeItem.findFirst({
      where: { id: itemId, workspaceId, roleGroupId },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException('지식 항목을 찾을 수 없습니다.');
    }
  }

  private async requireAssistantSession(
    workspaceId: string,
    sessionId: string,
    userId: string,
  ) {
    await this.requireManager(workspaceId, userId);
    const session = await this.prisma.aiConfigAssistantSession.findFirst({
      where: { id: sessionId, workspaceId },
    });
    if (!session) {
      throw new NotFoundException('AI 설정 대화를 찾을 수 없습니다.');
    }
    return session;
  }

  private async requireChecklist(
    workspaceId: string,
    checklistId: string,
    roleGroupId: string,
  ) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, workspaceId, roleGroupId },
      select: { id: true },
    });

    if (!checklist) {
      throw new NotFoundException('체크리스트를 찾을 수 없습니다.');
    }
  }
}
