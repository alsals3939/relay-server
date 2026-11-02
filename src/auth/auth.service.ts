import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './types/authenticated-user';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('이미 가입된 이메일입니다.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          name: dto.name.trim(),
        },
        select: this.publicUserSelect,
      });

      return this.createAuthResponse(user);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('이미 가입된 이메일입니다.');
      }

      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    const passwordMatches =
      user && (await bcrypt.compare(dto.password, user.passwordHash));

    if (!user || !passwordMatches) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    return this.createAuthResponse({
      id: user.id,
      email: user.email,
      name: user.name,
      globalRole: user.globalRole,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  private async createAuthResponse(user: {
    id: string;
    email: string;
    name: string;
    globalRole: 'USER' | 'SUPERADMIN';
    createdAt: Date;
    updatedAt: Date;
  }) {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken, user };
  }

  private readonly publicUserSelect = {
    id: true,
    email: true,
    name: true,
    globalRole: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}
