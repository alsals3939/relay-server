import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { Prisma } from '../../generated/prisma/client';
import { createAiClient, resolveAiModel } from '../ai/ai-client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceAccessService } from '../workspaces/workspace-access.service';

interface MissionTemplate {
  title: string;
  description: string;
  checkQuestion: string;
}

interface PlanDayTemplate {
  dayNumber: number;
  goal: string;
  keyConcepts: string[];
  missions: MissionTemplate[];
}

interface FaqItemTemplate {
  question: string;
  answer: string;
}

const PLAN_LENGTH = 5;
const STALLED_AFTER_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------
  // 사수: 문서 기반 초안 생성 · 승인
  // ---------------------------------------------------------------------

  async generateDraft(
    workspaceId: string,
    userId: string,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveManagedRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
    );

    const [workspace, documents, knowledge] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true, description: true },
      }),
      this.prisma.document.findMany({
        where: { workspaceId, roleGroupId: roleGroup.id, status: 'READY' },
        select: { name: true, content: true },
        take: 20,
      }),
      this.prisma.knowledgeItem.findMany({
        where: { workspaceId, roleGroupId: roleGroup.id },
        select: { question: true, answer: true },
        take: 50,
      }),
    ]);

    if (!workspace) {
      throw new NotFoundException('워크스페이스를 찾을 수 없습니다.');
    }
    if (!documents.length) {
      throw new BadRequestException(
        '초안을 생성하려면 먼저 문서를 1개 이상 업로드해야 합니다.',
      );
    }

    const result = await this.callDraftGeneration(
      workspace,
      roleGroup.name,
      documents,
      knowledge,
    );

    return this.prisma.roleGroupDraft.upsert({
      where: { roleGroupId: roleGroup.id },
      create: {
        workspaceId,
        roleGroupId: roleGroup.id,
        status: 'PENDING',
        systemPrompt: result.systemPrompt,
        faqItems: result.faqItems as unknown as Prisma.InputJsonValue,
        planDays: result.planDays as unknown as Prisma.InputJsonValue,
      },
      update: {
        status: 'PENDING',
        systemPrompt: result.systemPrompt,
        faqItems: result.faqItems as unknown as Prisma.InputJsonValue,
        planDays: result.planDays as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
        approvedAt: null,
      },
    });
  }

  async getDraft(workspaceId: string, userId: string, roleGroupId?: string) {
    const roleGroup = await this.resolveManagedRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
    );
    return this.prisma.roleGroupDraft.findUnique({
      where: { roleGroupId: roleGroup.id },
    });
  }

  async approveDraft(
    workspaceId: string,
    userId: string,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveManagedRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
    );
    const draft = await this.prisma.roleGroupDraft.findUnique({
      where: { roleGroupId: roleGroup.id },
    });
    if (!draft) {
      throw new NotFoundException('승인할 초안이 없습니다.');
    }

    const faqItems = draft.faqItems as unknown as FaqItemTemplate[];

    await this.prisma.$transaction([
      this.prisma.aiConfig.upsert({
        where: { roleGroupId: roleGroup.id },
        create: {
          workspaceId,
          roleGroupId: roleGroup.id,
          systemPrompt: draft.systemPrompt,
        },
        update: { systemPrompt: draft.systemPrompt },
      }),
      this.prisma.knowledgeItem.createMany({
        data: faqItems.map((item) => ({
          workspaceId,
          roleGroupId: roleGroup.id,
          question: item.question.trim(),
          answer: item.answer.trim(),
        })),
      }),
      this.prisma.roleGroupDraft.update({
        where: { roleGroupId: roleGroup.id },
        data: { status: 'APPROVED', approvedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  // ---------------------------------------------------------------------
  // 신입: 5일 여정
  // ---------------------------------------------------------------------

  async getOrCreatePlan(
    workspaceId: string,
    userId: string,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveMemberRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
    );

    const existing = await this.prisma.onboardingPlan.findUnique({
      where: {
        workspaceId_roleGroupId_userId: {
          workspaceId,
          roleGroupId: roleGroup.id,
          userId,
        },
      },
      include: this.planInclude(),
    });
    if (existing) return existing;

    const draft = await this.prisma.roleGroupDraft.findUnique({
      where: { roleGroupId: roleGroup.id },
    });
    if (!draft || draft.status !== 'APPROVED') {
      throw new BadRequestException(
        '아직 이 역할군의 온보딩 여정이 준비되지 않았습니다. 사수의 승인을 기다려주세요.',
      );
    }

    const planDays = draft.planDays as unknown as PlanDayTemplate[];

    const created = await this.prisma.onboardingPlan.create({
      data: {
        workspaceId,
        roleGroupId: roleGroup.id,
        userId,
        days: {
          create: planDays.map((day) => ({
            dayNumber: day.dayNumber,
            goal: day.goal,
            keyConcepts: day.keyConcepts,
            missions: {
              create: day.missions.map((mission, position) => ({
                title: mission.title,
                description: mission.description || undefined,
                checkQuestion: mission.checkQuestion || undefined,
                position,
              })),
            },
          })),
        },
      },
      include: this.planInclude(),
    });

    return created;
  }

  async updateMissionCompletion(
    workspaceId: string,
    missionId: string,
    userId: string,
    completed: boolean,
  ) {
    const mission = await this.prisma.onboardingMission.findFirst({
      where: {
        id: missionId,
        day: { plan: { workspaceId, userId } },
      },
      select: { id: true },
    });
    if (!mission) {
      throw new NotFoundException('미션을 찾을 수 없습니다.');
    }

    return this.prisma.onboardingMission.update({
      where: { id: missionId },
      data: { completed, completedAt: completed ? new Date() : null },
    });
  }

  async verifyMissionAnswer(
    workspaceId: string,
    missionId: string,
    userId: string,
    answer: string,
  ) {
    const mission = await this.prisma.onboardingMission.findFirst({
      where: {
        id: missionId,
        day: { plan: { workspaceId, userId } },
      },
      include: {
        day: {
          include: {
            plan: {
              include: {
                roleGroup: { select: { name: true } },
                workspace: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!mission) {
      throw new NotFoundException('미션을 찾을 수 없습니다.');
    }

    const result = await this.callMissionVerification(
      mission.day.plan.workspace.name,
      mission.day.plan.roleGroup.name,
      mission.title,
      mission.description ?? '',
      mission.checkQuestion ?? '',
      answer,
    );

    return this.prisma.onboardingMission.update({
      where: { id: missionId },
      data: {
        checkFeedback: result.feedback,
        completed: result.passed || mission.completed,
        completedAt: result.passed
          ? new Date()
          : mission.completedAt,
      },
    });
  }

  async submitReflection(
    workspaceId: string,
    dayId: string,
    userId: string,
    content: string,
  ) {
    const day = await this.prisma.onboardingDay.findFirst({
      where: { id: dayId, plan: { workspaceId, userId } },
      include: {
        missions: true,
        plan: {
          include: {
            roleGroup: { select: { name: true } },
            workspace: { select: { name: true } },
          },
        },
      },
    });
    if (!day) {
      throw new NotFoundException('여정을 찾을 수 없습니다.');
    }
    if (day.plan.currentDay !== day.dayNumber) {
      throw new ConflictException('오늘의 여정이 아닙니다.');
    }

    const previousDays = await this.prisma.onboardingDay.findMany({
      where: { planId: day.planId, dayNumber: { lte: day.dayNumber } },
      include: { missions: true, reflection: true },
      orderBy: { dayNumber: 'asc' },
    });

    const step = await this.callJourneyStep(
      day.plan.workspace.name,
      day.plan.roleGroup.name,
      previousDays.map((d) => ({
        dayNumber: d.dayNumber,
        goal: d.goal,
        missions: d.missions.map((m) => ({
          title: m.title,
          completed: m.completed,
        })),
        reflection: d.id === day.id ? content : (d.reflection?.content ?? null),
      })),
      day.dayNumber < PLAN_LENGTH,
    );

    await this.prisma.onboardingReflection.upsert({
      where: { dayId: day.id },
      create: { dayId: day.id, content, aiSummary: step.daySummary },
      update: { content, aiSummary: step.daySummary },
    });

    if (day.dayNumber >= PLAN_LENGTH || !step.nextDay) {
      const finalSummary = await this.callFinalReport(
        day.plan.workspace.name,
        day.plan.roleGroup.name,
        previousDays,
      );
      await this.prisma.onboardingPlan.update({
        where: { id: day.plan.id },
        data: { status: 'COMPLETED', finalSummary },
      });
    } else {
      const nextDayNumber = day.dayNumber + 1;
      await this.prisma.onboardingDay.upsert({
        where: {
          planId_dayNumber: { planId: day.planId, dayNumber: nextDayNumber },
        },
        create: {
          planId: day.planId,
          dayNumber: nextDayNumber,
          goal: step.nextDay.goal,
          keyConcepts: step.nextDay.keyConcepts,
          missions: {
            create: step.nextDay.missions.map((mission, position) => ({
              title: mission.title,
              description: mission.description || undefined,
              checkQuestion: mission.checkQuestion || undefined,
              position,
            })),
          },
        },
        update: {
          goal: step.nextDay.goal,
          keyConcepts: step.nextDay.keyConcepts,
          missions: {
            deleteMany: {},
            create: step.nextDay.missions.map((mission, position) => ({
              title: mission.title,
              description: mission.description || undefined,
              checkQuestion: mission.checkQuestion || undefined,
              position,
            })),
          },
        },
      });
      await this.prisma.onboardingPlan.update({
        where: { id: day.plan.id },
        data: { currentDay: nextDayNumber },
      });
    }

    return this.prisma.onboardingPlan.findUniqueOrThrow({
      where: { id: day.plan.id },
      include: this.planInclude(),
    });
  }

  async getProgressSummary(
    workspaceId: string,
    userId: string,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveMemberRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
    );
    const plan = await this.prisma.onboardingPlan.findUnique({
      where: {
        workspaceId_roleGroupId_userId: {
          workspaceId,
          roleGroupId: roleGroup.id,
          userId,
        },
      },
      include: this.planInclude(),
    });
    if (!plan) {
      return null;
    }
    return this.computeSummary(plan);
  }

  // ---------------------------------------------------------------------
  // 관리자: 팀 현황 · 주간 리포트
  // ---------------------------------------------------------------------

  async listTeamProgress(
    workspaceId: string,
    userId: string,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveManagedRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
    );
    const plans = await this.prisma.onboardingPlan.findMany({
      where: { workspaceId, roleGroupId: roleGroup.id },
      include: {
        user: { select: { id: true, name: true } },
        ...this.planInclude(),
      },
      orderBy: { updatedAt: 'desc' },
    });

    return plans.map((plan) => {
      const summary = this.computeSummary(plan);
      const lastActivityAt = this.lastActivityAt(plan);
      const stalled =
        plan.status === 'ACTIVE' &&
        Date.now() - lastActivityAt.getTime() > STALLED_AFTER_MS;

      return {
        userId: plan.user.id,
        userName: plan.user.name,
        currentDay: plan.currentDay,
        totalDays: PLAN_LENGTH,
        progressPercent: summary.progressPercent,
        lastActivityAt,
        status:
          plan.status === 'COMPLETED'
            ? 'COMPLETED'
            : stalled
              ? 'STALLED'
              : 'ACTIVE',
      };
    });
  }

  async getMemberPlanDetail(
    workspaceId: string,
    managerUserId: string,
    targetUserId: string,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveManagedRoleGroup(
      workspaceId,
      managerUserId,
      roleGroupId,
    );
    const plan = await this.prisma.onboardingPlan.findUnique({
      where: {
        workspaceId_roleGroupId_userId: {
          workspaceId,
          roleGroupId: roleGroup.id,
          userId: targetUserId,
        },
      },
      include: {
        user: { select: { id: true, name: true } },
        ...this.planInclude(),
      },
    });
    if (!plan) {
      throw new NotFoundException('해당 신입의 온보딩 플랜을 찾을 수 없습니다.');
    }
    return plan;
  }

  async getWeeklyReport(
    workspaceId: string,
    userId: string,
    roleGroupId?: string,
  ) {
    const roleGroup = await this.resolveManagedRoleGroup(
      workspaceId,
      userId,
      roleGroupId,
    );
    const plans = await this.prisma.onboardingPlan.findMany({
      where: { workspaceId, roleGroupId: roleGroup.id },
      include: {
        user: { select: { name: true } },
        ...this.planInclude(),
      },
    });

    if (!plans.length) {
      return {
        summary: '아직 진행 중인 온보딩 여정이 없습니다.',
        teamCount: 0,
        averageProgressPercent: 0,
      };
    }

    const summaries = plans.map((plan) => this.computeSummary(plan));
    const averageProgressPercent = Math.round(
      summaries.reduce((sum, s) => sum + s.progressPercent, 0) /
        summaries.length,
    );

    const narrative = await this.callWeeklyReport(
      roleGroup.name,
      plans.map((plan) => ({
        name: plan.user.name,
        currentDay: plan.currentDay,
        status: plan.status,
        reflections: plan.days
          .filter((d) => d.reflection)
          .map((d) => d.reflection!.aiSummary ?? d.reflection!.content),
      })),
    );

    return {
      summary: narrative,
      teamCount: plans.length,
      averageProgressPercent,
    };
  }

  // ---------------------------------------------------------------------
  // AI 호출
  // ---------------------------------------------------------------------

  private async callDraftGeneration(
    workspace: { name: string; description: string | null },
    roleGroupName: string,
    documents: { name: string; content: string | null }[],
    knowledge: { question: string; answer: string }[],
  ) {
    const documentContext = documents
      .map((doc) => `[문서: ${doc.name}]\n${doc.content ?? ''}`)
      .join('\n\n')
      .slice(0, 40_000);
    const knowledgeContext = knowledge
      .map((item) => `Q: ${item.question}\nA: ${item.answer}`)
      .join('\n\n');

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: [
          '당신은 신입사원 온보딩 설계 전문가입니다.',
          '아래 회사 문서를 분석해서 다음 세 가지를 한 번에 생성하세요.',
          '1. systemPrompt: 이 역할군 전용 AI 어시스턴트가 사용할 한국어 시스템 프롬프트. 역할, 답변 원칙, 지식에 없으면 모른다고 답하기, 금지 사항을 포함하세요.',
          '2. faqItems: 신입이 자주 물을 만한 질문과 답을 문서 내용 기반으로 5개 내외 작성하세요.',
          `3. planDays: 정확히 ${PLAN_LENGTH}일치 온보딩 로드맵. dayNumber는 1부터 ${PLAN_LENGTH}까지 순서대로, 각 Day는 goal(오늘의 목표 한 줄), keyConcepts(핵심 개념 2~4개), missions(오늘 할 일 2~4개)로 구성하세요.`,
          'Day1은 조직·문서 파악처럼 쉽게 시작하고 뒤로 갈수록 실무 미션 비중을 높이세요.',
          '각 미션의 description은 "무엇을 하라"는 지시가 아니라, 신입이 이 카드만 읽어도 이해되도록 문서에서 뽑아낸 실제 학습 내용을 2~4문장으로 압축한 글이어야 합니다. 아무것도 모르는 사람이 읽는다고 생각하고 구체적인 사실을 담으세요.',
          '나쁜 예 (절대 이렇게 쓰지 마세요): "회사의 역할과 조직 구조를 이해합니다." — 이건 아무 정보 없이 할 일만 반복한 문장입니다.',
          '좋은 예 (이렇게 써야 합니다): "흑자 주식회사는 서울 서대문구에 위치한 임직원 50인 이하 스타트업으로, 산업용 AI 카메라와 AIoT 디바이스를 개발합니다. 기구설계팀은 카메라 모듈과 디바이스의 외함·방열 구조 설계를 담당합니다." — 이렇게 문서에 있는 실제 사실(숫자, 고유명사, 규칙)을 그대로 담아야 합니다.',
          '모든 description에 이 좋은 예처럼 문서에서 가져온 구체적인 사실(수치, 이름, 규칙, 절차)이 최소 1개 이상 포함되어야 합니다.',
          '각 미션의 checkQuestion은 그 description 내용을 실제로 읽고 이해했는지 확인하는 짧은 서술형 질문 하나여야 합니다 (예/아니오로 답할 수 있는 질문 금지).',
          '문서에 없는 내용은 추측하지 말고, 문서량이 적다면 일반적인 온보딩 절차로 자연스럽게 보완하세요.',
          `워크스페이스: ${workspace.name}${workspace.description ? ` (${workspace.description})` : ''}`,
          `역할군: ${roleGroupName}`,
          knowledgeContext ? `기존 지식베이스:\n${knowledgeContext}` : '',
          `회사 문서:\n${documentContext}`,
          '반드시 지정된 JSON 스키마로만 응답하세요.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    const openai = createAiClient(this.configService);
    const completion = await openai.chat.completions
      .create({
        model: resolveAiModel(this.configService, undefined),
        messages,
        temperature: 0.4,
        max_tokens: 4000,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'onboarding_draft',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                systemPrompt: { type: 'string' },
                faqItems: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      question: { type: 'string' },
                      answer: { type: 'string' },
                    },
                    required: ['question', 'answer'],
                  },
                },
                planDays: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      dayNumber: { type: 'integer' },
                      goal: { type: 'string' },
                      keyConcepts: { type: 'array', items: { type: 'string' } },
                      missions: {
                        type: 'array',
                        items: {
                          type: 'object',
                          additionalProperties: false,
                          properties: {
                            title: { type: 'string' },
                            description: { type: 'string' },
                            checkQuestion: { type: 'string' },
                          },
                          required: ['title', 'description', 'checkQuestion'],
                        },
                      },
                    },
                    required: ['dayNumber', 'goal', 'keyConcepts', 'missions'],
                  },
                },
              },
              required: ['systemPrompt', 'faqItems', 'planDays'],
            },
          },
        },
      })
      .catch(() => {
        throw new ServiceUnavailableException(
          'AI 초안 생성에 실패했습니다. API 키와 네트워크 상태를 확인해 주세요.',
        );
      });

    const content = completion.choices[0]?.message.content;
    if (!content) {
      throw new ServiceUnavailableException('AI 초안 응답이 비어 있습니다.');
    }

    try {
      const parsed = JSON.parse(content) as {
        systemPrompt: string;
        faqItems: FaqItemTemplate[];
        planDays: PlanDayTemplate[];
      };
      const planDays = this.normalizePlanDays(parsed.planDays);
      return {
        systemPrompt: parsed.systemPrompt,
        faqItems: parsed.faqItems,
        planDays,
      };
    } catch {
      throw new ServiceUnavailableException(
        'AI 초안 응답을 해석하지 못했습니다.',
      );
    }
  }

  private async callJourneyStep(
    workspaceName: string,
    roleGroupName: string,
    daysSoFar: {
      dayNumber: number;
      goal: string;
      missions: { title: string; completed: boolean }[];
      reflection: string | null;
    }[],
    needsNextDay: boolean,
  ): Promise<{
    daySummary: string;
    nextDay: {
      goal: string;
      keyConcepts: string[];
      missions: MissionTemplate[];
    } | null;
  }> {
    const currentDay = daysSoFar[daysSoFar.length - 1];
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: [
          '당신은 신입사원의 온보딩 여정을 매일 관리하는 AI 코치입니다.',
          `워크스페이스: ${workspaceName}, 역할군: ${roleGroupName}`,
          'daySummary는 오늘 신입이 작성한 복기를 바탕으로 "오늘 배운 핵심 개념"을 2~3문장으로 한국어 요약하세요.',
          needsNextDay
            ? '오늘 완료한 미션 여부와 복기 내용을 반영해서 다음 날(nextDay) 계획을 조정하세요. 미완료 미션이 있었다면 다음 날에 보완할 수 있도록 반영하세요.'
            : '오늘이 여정의 마지막 날입니다. nextDay는 임의의 값으로 채우되 사용되지 않습니다.',
          '각 미션의 description은 "무엇을 하라"는 지시가 아니라, 신입이 그 내용을 몰라도 이 카드만 읽으면 이해되도록 실제 학습 내용을 2~4문장으로 압축한 글이어야 합니다.',
          '나쁜 예 (절대 이렇게 쓰지 마세요): "회사의 역할과 조직 구조를 이해합니다." — 좋은 예: "흑자 주식회사는 서울 서대문구에 위치한 임직원 50인 이하 스타트업으로, 산업용 AI 카메라와 AIoT 디바이스를 개발합니다." 처럼 구체적인 사실(수치, 이름, 규칙)을 담으세요.',
          '각 미션의 checkQuestion은 그 description 내용을 실제로 이해했는지 확인할 수 있는 짧은 질문 하나여야 합니다 (예/아니오 질문 금지, 서술형 답을 요구).',
          `지금까지의 여정: ${JSON.stringify(daysSoFar)}`,
          '반드시 지정된 JSON 스키마로만 응답하세요.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Day ${currentDay.dayNumber} 복기: ${currentDay.reflection ?? ''}`,
      },
    ];

    const openai = createAiClient(this.configService);
    const completion = await openai.chat.completions
      .create({
        model: resolveAiModel(this.configService, undefined),
        messages,
        temperature: 0.4,
        max_tokens: 1500,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'onboarding_journey_step',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                daySummary: { type: 'string' },
                nextDay: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    goal: { type: 'string' },
                    keyConcepts: { type: 'array', items: { type: 'string' } },
                    missions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          title: { type: 'string' },
                          description: { type: 'string' },
                          checkQuestion: { type: 'string' },
                        },
                        required: ['title', 'description', 'checkQuestion'],
                      },
                    },
                  },
                  required: ['goal', 'keyConcepts', 'missions'],
                },
              },
              required: ['daySummary', 'nextDay'],
            },
          },
        },
      })
      .catch(() => {
        throw new ServiceUnavailableException(
          '다음 날 일정 생성에 실패했습니다.',
        );
      });

    const content = completion.choices[0]?.message.content;
    if (!content) {
      throw new ServiceUnavailableException('AI 응답이 비어 있습니다.');
    }

    try {
      const parsed = JSON.parse(content) as {
        daySummary: string;
        nextDay: {
          goal: string;
          keyConcepts: string[];
          missions: MissionTemplate[];
        };
      };
      return {
        daySummary: parsed.daySummary,
        nextDay: needsNextDay ? parsed.nextDay : null,
      };
    } catch {
      throw new ServiceUnavailableException('AI 응답을 해석하지 못했습니다.');
    }
  }

  private async callMissionVerification(
    workspaceName: string,
    roleGroupName: string,
    missionTitle: string,
    missionDescription: string,
    checkQuestion: string,
    answer: string,
  ): Promise<{ passed: boolean; feedback: string }> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: [
          `${workspaceName}의 ${roleGroupName} 역할군 온보딩 중인 신입사원의 이해도를 확인하는 AI 코치입니다.`,
          `학습 내용: ${missionDescription}`,
          `확인 질문: ${checkQuestion}`,
          '신입의 답변이 학습 내용의 핵심을 기본적으로 이해했다고 볼 수 있으면 passed를 true로 하세요. 완벽한 표현이 아니어도 핵심을 파악했으면 통과시키고, 너무 엄격하게 채점하지 마세요.',
          '전혀 관련 없는 답이거나 명백히 이해하지 못한 경우에만 false로 하세요.',
          'feedback은 통과 여부와 무관하게 격려하는 톤으로 1~2문장 작성하고, 부족한 경우 무엇을 다시 보면 좋을지 짧게 알려주세요.',
          '반드시 지정된 JSON 스키마로만 응답하세요.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `미션: ${missionTitle}\n신입의 답변: ${answer}`,
      },
    ];

    const openai = createAiClient(this.configService);
    const completion = await openai.chat.completions
      .create({
        model: resolveAiModel(this.configService, undefined),
        messages,
        temperature: 0.3,
        max_tokens: 400,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'mission_verification',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                passed: { type: 'boolean' },
                feedback: { type: 'string' },
              },
              required: ['passed', 'feedback'],
            },
          },
        },
      })
      .catch(() => {
        throw new ServiceUnavailableException('이해도 확인에 실패했습니다.');
      });

    const content = completion.choices[0]?.message.content;
    if (!content) {
      throw new ServiceUnavailableException('AI 응답이 비어 있습니다.');
    }

    try {
      return JSON.parse(content) as { passed: boolean; feedback: string };
    } catch {
      throw new ServiceUnavailableException('AI 응답을 해석하지 못했습니다.');
    }
  }

  private async callFinalReport(
    workspaceName: string,
    roleGroupName: string,
    days: {
      dayNumber: number;
      goal: string;
      keyConcepts: string[];
      reflection: { content: string; aiSummary: string | null } | null;
    }[],
  ): Promise<string> {
    const openai = createAiClient(this.configService);
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: [
          `${workspaceName}의 ${roleGroupName} 역할군 신입사원이 5일 온보딩을 마쳤습니다.`,
          '아래 5일간의 목표·핵심 개념·복기 내용을 바탕으로 "5일 동안 이런 개념들을 배웠어요" 형식의 한국어 리포트를 3~5문장으로 작성하세요.',
          '축하와 격려의 톤을 담되 과장하지 마세요.',
          JSON.stringify(days),
        ].join('\n'),
      },
    ];

    const completion = await openai.chat.completions
      .create({
        model: resolveAiModel(this.configService, undefined),
        messages,
        temperature: 0.5,
        max_tokens: 600,
      })
      .catch(() => null);

    return (
      completion?.choices[0]?.message.content?.trim() ??
      '5일간의 온보딩 여정을 완료했습니다.'
    );
  }

  private async callWeeklyReport(
    roleGroupName: string,
    members: {
      name: string;
      currentDay: number;
      status: string;
      reflections: string[];
    }[],
  ): Promise<string> {
    const openai = createAiClient(this.configService);
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: [
          `${roleGroupName} 역할군 신입사원들의 이번 주 온보딩 진행 현황입니다.`,
          '관리자가 한눈에 파악할 수 있도록 팀 전체 진행 상황과 눈에 띄는 특이사항(정체된 인원, 잘 따라가는 인원 등)을 3~5문장의 한국어로 요약하세요.',
          '개인 평가나 감시처럼 느껴지지 않게, 누구를 도와주면 좋을지 알려주는 톤으로 작성하세요.',
          JSON.stringify(members),
        ].join('\n'),
      },
    ];

    const completion = await openai.chat.completions
      .create({
        model: resolveAiModel(this.configService, undefined),
        messages,
        temperature: 0.4,
        max_tokens: 600,
      })
      .catch(() => null);

    return (
      completion?.choices[0]?.message.content?.trim() ??
      '이번 주 리포트를 생성하지 못했습니다.'
    );
  }

  // ---------------------------------------------------------------------
  // 유틸
  // ---------------------------------------------------------------------

  private normalizePlanDays(days: PlanDayTemplate[]): PlanDayTemplate[] {
    const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
    const normalized: PlanDayTemplate[] = [];
    for (let day = 1; day <= PLAN_LENGTH; day++) {
      const found = sorted.find((d) => d.dayNumber === day);
      normalized.push(
        found ?? {
          dayNumber: day,
          goal: `Day ${day} 적응하기`,
          keyConcepts: [],
          missions: [],
        },
      );
    }
    return normalized;
  }

  private planInclude() {
    return {
      days: {
        orderBy: { dayNumber: 'asc' as const },
        include: {
          missions: { orderBy: { position: 'asc' as const } },
          reflection: true,
        },
      },
    };
  }

  private computeSummary(plan: {
    currentDay: number;
    status: string;
    days: {
      dayNumber: number;
      keyConcepts: string[];
      missions: { completed: boolean }[];
      reflection: { id: string } | null;
    }[];
  }) {
    const allMissions = plan.days.flatMap((d) => d.missions);
    const completedMissions = allMissions.filter((m) => m.completed).length;
    const progressPercent = allMissions.length
      ? Math.round((completedMissions / allMissions.length) * 100)
      : 0;

    const today = plan.days.find((d) => d.dayNumber === plan.currentDay);
    const todayTotal = today?.missions.length ?? 0;
    const todayCompleted =
      today?.missions.filter((m) => m.completed).length ?? 0;

    const learnedConceptCount = plan.days
      .filter((d) => d.reflection || d.dayNumber < plan.currentDay)
      .reduce((sum, d) => sum + d.keyConcepts.length, 0);

    let streak = 0;
    for (const day of [...plan.days].sort(
      (a, b) => a.dayNumber - b.dayNumber,
    )) {
      const total = day.missions.length;
      const completed = day.missions.filter((m) => m.completed).length;
      if (total > 0 && completed === total) {
        streak++;
      } else {
        break;
      }
    }

    return {
      progressPercent,
      todayCompleted,
      todayTotal,
      learnedConceptCount,
      streak,
      status: plan.status,
      currentDay: plan.currentDay,
    };
  }

  private lastActivityAt(plan: {
    updatedAt?: Date;
    createdAt: Date;
    days: {
      missions: { completedAt: Date | null }[];
      reflection: { createdAt: Date } | null;
    }[];
  }): Date {
    const timestamps = plan.days.flatMap((d) => [
      ...d.missions
        .map((m) => m.completedAt)
        .filter((date): date is Date => date !== null),
      ...(d.reflection ? [d.reflection.createdAt] : []),
    ]);
    if (!timestamps.length) return plan.createdAt;
    return timestamps.reduce((latest, date) => (date > latest ? date : latest));
  }

  private async resolveManagedRoleGroup(
    workspaceId: string,
    userId: string,
    roleGroupId?: string,
  ) {
    await this.access.requireRole(workspaceId, userId, ['OWNER', 'ADMIN']);
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
    return roleGroup;
  }

  private async resolveMemberRoleGroup(
    workspaceId: string,
    userId: string,
    roleGroupId?: string,
  ) {
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
    await this.access.requireRoleGroupAccess(workspaceId, roleGroup.id, userId);
    return roleGroup;
  }
}
