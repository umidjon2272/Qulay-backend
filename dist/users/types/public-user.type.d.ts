import { User, UserRole, UserStatus } from '@prisma/client';
export type PublicUser = Omit<User, 'passwordHash'>;
export declare function toPublicUser(user: User): PublicUser;
export type UserProfileUpdate = {
    firstName?: string;
    lastName?: string;
    avatarUrl?: string | null;
    timezone?: string;
    language?: string;
};
export { UserRole, UserStatus };
