import { SetMetadata } from '@nestjs/common';
import type { GlobalRole } from '../../../generated/prisma/enums';

export const GLOBAL_ROLES_KEY = 'globalRoles';
export const GlobalRoles = (...roles: GlobalRole[]) =>
  SetMetadata(GLOBAL_ROLES_KEY, roles);
