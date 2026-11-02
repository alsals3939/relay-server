import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { SubmitReflectionDto } from './dto/submit-reflection.dto';
import { UpdateMissionCompletionDto } from './dto/update-mission-completion.dto';
import { VerifyMissionDto } from './dto/verify-mission.dto';
import { OnboardingService } from './onboarding.service';

@Controller('workspaces/:workspaceId/onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('draft/generate')
  generateDraft(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.onboardingService.generateDraft(
      workspaceId,
      user.id,
      roleGroupId,
    );
  }

  @Get('draft')
  getDraft(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.onboardingService.getDraft(workspaceId, user.id, roleGroupId);
  }

  @Post('draft/approve')
  approveDraft(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.onboardingService.approveDraft(
      workspaceId,
      user.id,
      roleGroupId,
    );
  }

  @Get('plan')
  getOrCreatePlan(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.onboardingService.getOrCreatePlan(
      workspaceId,
      user.id,
      roleGroupId,
    );
  }

  @Patch('missions/:missionId/completion')
  updateMissionCompletion(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMissionCompletionDto,
  ) {
    return this.onboardingService.updateMissionCompletion(
      workspaceId,
      missionId,
      user.id,
      dto.completed,
    );
  }

  @Post('missions/:missionId/verify')
  verifyMissionAnswer(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyMissionDto,
  ) {
    return this.onboardingService.verifyMissionAnswer(
      workspaceId,
      missionId,
      user.id,
      dto.answer,
    );
  }

  @Post('days/:dayId/reflection')
  submitReflection(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitReflectionDto,
  ) {
    return this.onboardingService.submitReflection(
      workspaceId,
      dayId,
      user.id,
      dto.content,
    );
  }

  @Get('summary')
  getProgressSummary(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.onboardingService.getProgressSummary(
      workspaceId,
      user.id,
      roleGroupId,
    );
  }

  @Get('team')
  listTeamProgress(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.onboardingService.listTeamProgress(
      workspaceId,
      user.id,
      roleGroupId,
    );
  }

  @Get('team/:userId/plan')
  getMemberPlanDetail(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.onboardingService.getMemberPlanDetail(
      workspaceId,
      user.id,
      targetUserId,
      roleGroupId,
    );
  }

  @Get('report/weekly')
  getWeeklyReport(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('roleGroupId') roleGroupId?: string,
  ) {
    return this.onboardingService.getWeeklyReport(
      workspaceId,
      user.id,
      roleGroupId,
    );
  }
}
