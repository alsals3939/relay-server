import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
