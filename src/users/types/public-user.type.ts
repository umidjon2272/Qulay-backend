import { User, UserRole, UserStatus } from '@prisma/client';

export type PublicUser = Omit<User, 'passwordHash'>;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export type UserProfileUpdate = {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
  timezone?: string;
  language?: string;
};

export { UserRole, UserStatus };
