import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import {
  CreateAiConfigAssistantSessionDto,
  SendAiConfigAssistantMessageDto,
} from './dto/ai-config-assistant-session.dto';
import { AiConfigAssistantDto } from './dto/ai-config-assistant.dto';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateAiConfigDto } from './dto/update-ai-config.dto';
import { UpdateChecklistItemCompletionDto } from './dto/update-checklist-item-completion.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';
import { WorkspaceContentService } from './workspace-content.service';

@Controller('workspaces/:workspaceId')
export class WorkspaceContentController {
  constructor(private readonly contentService: WorkspaceContentService) {}

  @Get('ai-config')
  getAiConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.getAiConfig(workspaceId, user.id, roleGroupId);
  }

  @Put('ai-config')
  updateAiConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAiConfigDto,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.updateAiConfig(
      workspaceId,
      user.id,
      dto,
      roleGroupId,
    );
  }

  @Post('ai-config/assistant')
  assistAiConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AiConfigAssistantDto,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.assistAiConfig(
      workspaceId,
      user.id,
      dto,
      roleGroupId,
    );
  }

  @Get('ai-config/assistant/sessions')
  listAssistantSessions(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('roleGroupId', ParseUUIDPipe) roleGroupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contentService.listAssistantSessions(
      workspaceId,
      roleGroupId,
      user.id,
    );
  }

  @Post('ai-config/assistant/sessions')
  createAssistantSession(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAiConfigAssistantSessionDto,
  ) {
    return this.contentService.createAssistantSession(
      workspaceId,
      user.id,
      dto,
    );
  }

  @Get('ai-config/assistant/sessions/:sessionId/messages')
  listAssistantMessages(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contentService.listAssistantMessages(
      workspaceId,
      sessionId,
      user.id,
    );
  }

  @Post('ai-config/assistant/sessions/:sessionId/messages')
  sendAssistantMessage(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendAiConfigAssistantMessageDto,
  ) {
    return this.contentService.sendAssistantMessage(
      workspaceId,
      sessionId,
      user.id,
      dto,
    );
  }

  @Get('knowledge')
  listKnowledge(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.listKnowledge(workspaceId, user.id, roleGroupId);
  }

  @Post('knowledge')
  createKnowledge(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateKnowledgeDto,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.createKnowledge(
      workspaceId,
      user.id,
      dto,
      roleGroupId,
    );
  }

  @Patch('knowledge/:itemId')
  updateKnowledge(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateKnowledgeDto,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.updateKnowledge(
      workspaceId,
      itemId,
      user.id,
      dto,
      roleGroupId,
    );
  }

  @Delete('knowledge/:itemId')
  removeKnowledge(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.removeKnowledge(
      workspaceId,
      itemId,
      user.id,
      roleGroupId,
    );
  }

  @Get('checklists')
  listChecklists(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.listChecklists(
      workspaceId,
      user.id,
      roleGroupId,
    );
  }

  @Post('checklists')
  createChecklist(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateChecklistDto,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.createChecklist(
      workspaceId,
      user.id,
      dto,
      roleGroupId,
    );
  }

  @Patch('checklists/:checklistId')
  updateChecklist(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('checklistId', ParseUUIDPipe) checklistId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateChecklistDto,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.updateChecklist(
      workspaceId,
      checklistId,
      user.id,
      dto,
      roleGroupId,
    );
  }

  @Post('checklists/:checklistId/items')
  createChecklistItem(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('checklistId', ParseUUIDPipe) checklistId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateChecklistItemDto,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.createChecklistItem(
      workspaceId,
      checklistId,
      user.id,
      dto,
      roleGroupId,
    );
  }

  @Patch('checklists/:checklistId/items/:itemId/completion')
  updateChecklistItemCompletion(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('checklistId', ParseUUIDPipe) checklistId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateChecklistItemCompletionDto,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.updateChecklistItemCompletion(
      workspaceId,
      checklistId,
      itemId,
      user.id,
      dto.completed,
      roleGroupId,
    );
  }

  @Delete('checklists/:checklistId')
  removeChecklist(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('checklistId', ParseUUIDPipe) checklistId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.removeChecklist(
      workspaceId,
      checklistId,
      user.id,
      roleGroupId,
    );
  }

  @Get('documents')
  listDocuments(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.listDocuments(workspaceId, user.id, roleGroupId);
  }

  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10_000_000 },
      fileFilter: (_req, file, callback) => {
        const allowed =
          file.mimetype === 'text/plain' ||
          file.mimetype === 'text/markdown' ||
          file.mimetype === 'application/pdf' ||
          file.originalname.endsWith('.md');
        callback(null, allowed);
      },
    }),
  )
  uploadDocument(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.uploadDocument(
      workspaceId,
      user.id,
      file,
      roleGroupId,
    );
  }

  @Delete('documents/:documentId')
  removeDocument(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.contentService.removeDocument(
      workspaceId,
      documentId,
      user.id,
      roleGroupId,
    );
  }
}
