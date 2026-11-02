import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { WorkspaceRole } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireMember(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
    });

    if (!membership) {
      throw new ForbiddenException('워크스페이스에 접근할 권한이 없습니다.');
    }

    return membership;
  }

  async requireRole(
    workspaceId: string,
    userId: string,
    roles: WorkspaceRole[],
  ) {
    const membership = await this.requireMember(workspaceId, userId);

    if (!roles.includes(membership.role)) {
      throw new ForbiddenException('해당 작업을 수행할 권한이 없습니다.');
    }

    return membership;
  }

  async requireRoleGroupAccess(
    workspaceId: string,
    roleGroupId: string,
    userId: string,
  ) {
    const membership = await this.requireMember(workspaceId, userId);
    const roleGroup = await this.prisma.roleGroup.findFirst({
      where: { id: roleGroupId, workspaceId },
    });

    if (!roleGroup) {
      throw new NotFoundException('역할군을 찾을 수 없습니다.');
    }

    if (membership.role === 'MEMBER') {
      const assignment = await this.prisma.workspaceMemberRoleGroup.findUnique({
        where: {
          workspaceMemberId_roleGroupId: {
            workspaceMemberId: membership.id,
            roleGroupId,
          },
        },
      });

      if (!assignment) {
        throw new ForbiddenException('이 역할군에 접근할 권한이 없습니다.');
      }
    }

    return { membership, roleGroup };
  }
}
