import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

export interface RefreshAuthUser extends AuthUser {
  refreshTokenId: string;
}
