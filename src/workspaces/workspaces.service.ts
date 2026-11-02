import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceAccessService } from './workspace-access.service';
import { AssignMemberRoleGroupsDto } from './dto/assign-member-role-groups.dto';
import { CreateRoleGroupDto } from './dto/create-role-group.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateRoleGroupDto } from './dto/update-role-group.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
  ) {}

  create(userId: string, dto: CreateWorkspaceDto) {
    return this.prisma.$transaction(async (transaction) => {
      const workspace = await transaction.workspace.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim(),
          ownerId: userId,
        },
      });
      const member = await transaction.workspaceMember.create({
        data: { workspaceId: workspace.id, userId, role: 'OWNER' },
      });
      const roleGroup = await transaction.roleGroup.create({
        data: {
          workspaceId: workspace.id,
          name: '기본 역할군',
          description: '워크스페이스의 기본 인수인계 역할군입니다.',
          isDefault: true,
          aiConfig: {
            create: { workspaceId: workspace.id },
          },
        },
      });
      await transaction.workspaceMemberRoleGroup.create({
        data: {
          workspaceMemberId: member.id,
          roleGroupId: roleGroup.id,
        },
      });

      return transaction.workspace.findUniqueOrThrow({
        where: { id: workspace.id },
        include: {
          roleGroups: true,
          _count: { select: { members: true } },
        },
      });
    });
  }

  findAll(userId: string) {
    return this.prisma.workspace.findMany({
      where: { members: { some: { userId } } },
      include: {
        _count: {
          select: {
            members: true,
            documents: true,
            knowledge: true,
            checklists: true,
          },
        },
        members: {
          where: { userId },
          select: { role: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(workspaceId: string, userId: string) {
    const membership = await this.access.requireMember(workspaceId, userId);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        roleGroups: {
          where:
            membership.role === 'MEMBER'
              ? {
                  members: {
                    some: { workspaceMemberId: membership.id },
                  },
                }
              : undefined,
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        },
        _count: {
          select: {
            members: true,
            documents: true,
            knowledge: true,
            checklists: true,
          },
        },
        members: {
          where: { userId },
          select: {
            role: true,
            roleGroups: {
              select: {
                roleGroup: {
                  select: { id: true, name: true, isDefault: true },
                },
              },
            },
          },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException('워크스페이스를 찾을 수 없습니다.');
    }

    return workspace;
  }

  async update(workspaceId: string, userId: string, dto: UpdateWorkspaceDto) {
    await this.access.requireRole(workspaceId, userId, ['OWNER', 'ADMIN']);

    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
      },
    });
  }

  async remove(workspaceId: string, userId: string) {
    await this.access.requireRole(workspaceId, userId, ['OWNER']);
    await this.prisma.workspace.delete({ where: { id: workspaceId } });

    return { success: true };
  }

  async listMembers(workspaceId: string, userId: string) {
    await this.access.requireMember(workspaceId, userId);

    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        roleGroups: {
          select: {
            roleGroup: {
              select: {
                id: true,
                name: true,
                isDefault: true,
              },
            },
          },
          orderBy: { assignedAt: 'asc' },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async listRoleGroups(workspaceId: string, userId: string) {
    const membership = await this.access.requireMember(workspaceId, userId);

    return this.prisma.roleGroup.findMany({
      where: {
        workspaceId,
        ...(membership.role === 'MEMBER'
          ? {
              members: {
                some: { workspaceMemberId: membership.id },
              },
            }
          : {}),
      },
      include: {
        _count: {
          select: {
            members: true,
            documents: true,
            knowledge: true,
            checklists: true,
          },
        },
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createRoleGroup(
    workspaceId: string,
    userId: string,
    dto: CreateRoleGroupDto,
  ) {
    await this.access.requireRole(workspaceId, userId, ['OWNER', 'ADMIN']);
    const duplicate = await this.prisma.roleGroup.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: dto.name,
        },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('같은 이름의 역할군이 이미 있습니다.');
    }

    const last = await this.prisma.roleGroup.findFirst({
      where: { workspaceId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    return this.prisma.roleGroup.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description?.trim() || null,
        position: (last?.position ?? -1) + 1,
        aiConfig: { create: { workspaceId } },
      },
      include: { aiConfig: true },
    });
  }

  async updateRoleGroup(
    workspaceId: string,
    roleGroupId: string,
    userId: string,
    dto: UpdateRoleGroupDto,
  ) {
    await this.access.requireRole(workspaceId, userId, ['OWNER', 'ADMIN']);
    const roleGroup = await this.prisma.roleGroup.findFirst({
      where: { id: roleGroupId, workspaceId },
      select: { id: true },
    });
    if (!roleGroup) {
      throw new NotFoundException('역할군을 찾을 수 없습니다.');
    }

    if (dto.name) {
      const duplicate = await this.prisma.roleGroup.findFirst({
        where: {
          workspaceId,
          name: dto.name,
          NOT: { id: roleGroupId },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException('같은 이름의 역할군이 이미 있습니다.');
      }
    }

    return this.prisma.roleGroup.update({
      where: { id: roleGroupId },
      data: {
        name: dto.name,
        description:
          dto.description === undefined
            ? undefined
            : dto.description.trim() || null,
      },
    });
  }

  async removeRoleGroup(
    workspaceId: string,
    roleGroupId: string,
    userId: string,
  ) {
    await this.access.requireRole(workspaceId, userId, ['OWNER', 'ADMIN']);
    const roleGroup = await this.prisma.roleGroup.findFirst({
      where: { id: roleGroupId, workspaceId },
      include: {
        _count: {
          select: {
            members: true,
            documents: true,
            knowledge: true,
            checklists: true,
            chatSessions: true,
            assistantSessions: true,
          },
        },
      },
    });
    if (!roleGroup) {
      throw new NotFoundException('역할군을 찾을 수 없습니다.');
    }
    if (roleGroup.isDefault) {
      throw new BadRequestException('기본 역할군은 삭제할 수 없습니다.');
    }
    if (Object.values(roleGroup._count).some((count) => count > 0)) {
      throw new ConflictException(
        '멤버나 인수인계 데이터가 남은 역할군은 삭제할 수 없습니다.',
      );
    }

    await this.prisma.roleGroup.delete({ where: { id: roleGroupId } });
    return { success: true };
  }

  async assignMemberRoleGroups(
    workspaceId: string,
    memberId: string,
    userId: string,
    dto: AssignMemberRoleGroupsDto,
  ) {
    await this.access.requireRole(workspaceId, userId, ['OWNER', 'ADMIN']);
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
    });
    if (!member) {
      throw new NotFoundException('워크스페이스 멤버를 찾을 수 없습니다.');
    }
    if (member.role === 'MEMBER' && dto.roleGroupIds.length === 0) {
      throw new BadRequestException(
        '일반 멤버에게는 역할군을 하나 이상 배정해야 합니다.',
      );
    }

    const validRoleGroups = await this.prisma.roleGroup.count({
      where: { workspaceId, id: { in: dto.roleGroupIds } },
    });
    if (validRoleGroups !== dto.roleGroupIds.length) {
      throw new BadRequestException(
        '이 워크스페이스에 속하지 않은 역할군이 포함되어 있습니다.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.workspaceMemberRoleGroup.deleteMany({
        where: { workspaceMemberId: memberId },
      }),
      this.prisma.workspaceMemberRoleGroup.createMany({
        data: dto.roleGroupIds.map((roleGroupId) => ({
          workspaceMemberId: memberId,
          roleGroupId,
        })),
      }),
    ]);

    return this.prisma.workspaceMember.findUniqueOrThrow({
      where: { id: memberId },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        roleGroups: {
          select: {
            roleGroup: {
              select: {
                id: true,
                name: true,
                isDefault: true,
              },
            },
          },
          orderBy: { assignedAt: 'asc' },
        },
      },
    });
  }
}
