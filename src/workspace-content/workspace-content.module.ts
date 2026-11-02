import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { WorkspaceContentController } from './workspace-content.controller';
import { WorkspaceContentService } from './workspace-content.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [WorkspaceContentController],
  providers: [WorkspaceContentService],
})
export class WorkspaceContentModule {}
