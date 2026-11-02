import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { WorkspaceAccessService } from './workspace-access.service';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
    private readonly configService: ConfigService,
  ) {}

  async create(workspaceId: string, invitedById: string, dto: InviteMemberDto) {
    await this.access.requireRole(workspaceId, invitedById, ['OWNER', 'ADMIN']);

    const existingMember = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        user: { email: dto.email },
      },
      select: { id: true },
    });

    if (existingMember) {
      throw new ConflictException(
        '이미 워크스페이스에 참여 중인 사용자입니다.',
      );
    }

    let requestedRoleGroupIds = dto.roleGroupIds ?? [];
    if (requestedRoleGroupIds.length === 0) {
      const defaultRoleGroup = await this.prisma.roleGroup.findFirst({
        where: { workspaceId, isDefault: true },
        select: { id: true },
      });
      requestedRoleGroupIds = defaultRoleGroup ? [defaultRoleGroup.id] : [];
    }
    const validRoleGroups = await this.prisma.roleGroup.findMany({
      where: { workspaceId, id: { in: requestedRoleGroupIds } },
      select: { id: true },
    });
    if (validRoleGroups.length !== requestedRoleGroupIds.length) {
      throw new BadRequestException(
        '이 워크스페이스에 속하지 않은 역할군이 포함되어 있습니다.',
      );
    }
    if (validRoleGroups.length === 0) {
      throw new BadRequestException('초대할 역할군을 하나 이상 선택해 주세요.');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.workspaceInvitation.updateMany({
        where: {
          workspaceId,
          email: dto.email,
          status: 'PENDING',
        },
        data: { status: 'REVOKED' },
      });
      await transaction.workspaceInvitation.create({
        data: {
          workspaceId,
          email: dto.email,
          role: dto.role ?? 'MEMBER',
          tokenHash,
          expiresAt,
          invitedById,
          roleGroups: {
            create: validRoleGroups.map(({ id }) => ({ roleGroupId: id })),
          },
        },
      });
    });

    const clientOrigin = this.configService.get<string>(
      'CLIENT_ORIGIN',
      'http://localhost:3000',
    );

    return {
      inviteUrl: `${clientOrigin}/invite/${token}`,
      expiresAt,
    };
  }

  async get(token: string) {
    const invitation = await this.findInvitation(token);

    return {
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      workspace: invitation.workspace,
      roleGroups: invitation.roleGroups.map(({ roleGroup }) => roleGroup),
    };
  }

  async accept(token: string, user: { id: string; email: string }) {
    const invitation = await this.findInvitation(token);

    if (invitation.email !== user.email.toLowerCase()) {
      throw new BadRequestException(
        '초대받은 이메일로 로그인한 사용자만 수락할 수 있습니다.',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.workspaceInvitation.updateMany({
        where: {
          id: invitation.id,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException('이미 처리되었거나 만료된 초대입니다.');
      }

      const member = await transaction.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId: user.id,
          },
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId: user.id,
          role: invitation.role,
        },
        update: {},
      });
      await transaction.workspaceMemberRoleGroup.createMany({
        data: invitation.roleGroups.map(({ roleGroupId }) => ({
          workspaceMemberId: member.id,
          roleGroupId,
        })),
        skipDuplicates: true,
      });

      return { workspaceId: invitation.workspaceId };
    });
  }

  private async findInvitation(token: string) {
    const invitation = await this.prisma.workspaceInvitation.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: {
        workspace: {
          select: { id: true, name: true, description: true },
        },
        roleGroups: {
          include: {
            roleGroup: {
              select: { id: true, name: true, description: true },
            },
          },
        },
      },
    });

    if (!invitation || invitation.status !== 'PENDING') {
      throw new NotFoundException('유효한 초대를 찾을 수 없습니다.');
    }

    if (invitation.expiresAt <= new Date()) {
      await this.prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('초대가 만료되었습니다.');
    }

    return invitation;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
