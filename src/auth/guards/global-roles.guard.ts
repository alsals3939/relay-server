import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { GlobalRole } from '../../../generated/prisma/enums';
import { GLOBAL_ROLES_KEY } from '../decorators/global-roles.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

@Injectable()
export class GlobalRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<GlobalRole[]>(
      GLOBAL_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!roles?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!request.user || !roles.includes(request.user.globalRole)) {
      throw new ForbiddenException('슈퍼어드민 권한이 필요합니다.');
    }

    return true;
  }
}
