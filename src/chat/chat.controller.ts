import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateChatSessionDto } from './dto/update-chat-session.dto';

@Controller('workspaces/:workspaceId/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('sessions')
  listSessions(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.chatService.listSessions(workspaceId, user.id, roleGroupId);
  }

  @Get('sessions/:sessionId/messages')
  listMessages(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.listMessages(workspaceId, sessionId, user.id);
  }

  @Patch('sessions/:sessionId')
  updateSession(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateChatSessionDto,
  ) {
    return this.chatService.updateSession(workspaceId, sessionId, user.id, dto);
  }

  @Delete('sessions/:sessionId')
  deleteSession(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.deleteSession(workspaceId, sessionId, user.id);
  }

  @Post()
  async send(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendMessageDto,
    @Res() response: Response,
  ) {
    const result = await this.chatService.createStream(
      workspaceId,
      user.id,
      dto,
    );

    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.write(
      `${JSON.stringify({
        type: 'session',
        sessionId: result.sessionId,
      })}\n`,
    );

    try {
      for await (const content of result.stream) {
        response.write(`${JSON.stringify({ type: 'delta', content })}\n`);
      }
      response.write(`${JSON.stringify({ type: 'done' })}\n`);
    } catch {
      response.write(
        `${JSON.stringify({
          type: 'error',
          message: 'AI 응답 생성 중 오류가 발생했습니다.',
        })}\n`,
      );
    } finally {
      response.end();
    }
  }
}
