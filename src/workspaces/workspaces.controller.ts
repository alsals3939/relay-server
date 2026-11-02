import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AssignMemberRoleGroupsDto } from './dto/assign-member-role-groups.dto';
import { CreateRoleGroupDto } from './dto/create-role-group.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateRoleGroupDto } from './dto/update-role-group.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InvitationsService } from './invitations.service';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly invitationsService: InvitationsService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.workspacesService.findAll(user.id);
  }

  @Get(':workspaceId')
  findOne(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workspacesService.findOne(workspaceId, user.id);
  }

  @Patch(':workspaceId')
  update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(workspaceId, user.id, dto);
  }

  @Delete(':workspaceId')
  remove(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workspacesService.remove(workspaceId, user.id);
  }

  @Get(':workspaceId/members')
  listMembers(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workspacesService.listMembers(workspaceId, user.id);
  }

  @Patch(':workspaceId/members/:memberId/role-groups')
  assignMemberRoleGroups(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignMemberRoleGroupsDto,
  ) {
    return this.workspacesService.assignMemberRoleGroups(
      workspaceId,
      memberId,
      user.id,
      dto,
    );
  }

  @Get(':workspaceId/role-groups')
  listRoleGroups(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workspacesService.listRoleGroups(workspaceId, user.id);
  }

  @Post(':workspaceId/role-groups')
  createRoleGroup(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoleGroupDto,
  ) {
    return this.workspacesService.createRoleGroup(workspaceId, user.id, dto);
  }

  @Patch(':workspaceId/role-groups/:roleGroupId')
  updateRoleGroup(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('roleGroupId', ParseUUIDPipe) roleGroupId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateRoleGroupDto,
  ) {
    return this.workspacesService.updateRoleGroup(
      workspaceId,
      roleGroupId,
      user.id,
      dto,
    );
  }

  @Delete(':workspaceId/role-groups/:roleGroupId')
  removeRoleGroup(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('roleGroupId', ParseUUIDPipe) roleGroupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workspacesService.removeRoleGroup(
      workspaceId,
      roleGroupId,
      user.id,
    );
  }

  @Post(':workspaceId/invitations')
  invite(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteMemberDto,
  ) {
    return this.invitationsService.create(workspaceId, user.id, dto);
  }
}
