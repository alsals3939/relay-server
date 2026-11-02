import type { GlobalRole } from '../../../generated/prisma/enums';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  globalRole: GlobalRole;
}

export interface JwtPayload {
  sub: string;
  email: string;
}
