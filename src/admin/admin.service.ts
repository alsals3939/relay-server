import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListAdminResourcesDto } from './dto/list-admin-resources.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [users, workspaces, members, messages] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.workspace.count(),
      this.prisma.workspaceMember.count(),
      this.prisma.chatMessage.count(),
    ]);

    return { users, workspaces, members, messages };
  }

  async listUsers(query: ListAdminResourcesDto) {
    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        select: {
          id: true,
          email: true,
          name: true,
          globalRole: true,
          createdAt: true,
          _count: { select: { memberships: true, chatSessions: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }

  async listWorkspaces(query: ListAdminResourcesDto) {
    const where = query.search
      ? {
          name: { contains: query.search, mode: 'insensitive' as const },
        }
      : {};
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workspace.findMany({
        where,
        skip,
        take: query.limit,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          _count: {
            select: {
              members: true,
              documents: true,
              chatSessions: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.workspace.count({ where }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }
}
