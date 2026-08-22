import { UserRole } from '@prisma/client';

export type JwtPayload = {
  sub: string;
  role: UserRole;
};

export type AuthenticatedUser = JwtPayload;
