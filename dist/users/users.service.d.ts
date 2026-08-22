import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser, UserProfileUpdate } from './types/public-user.type';
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findById(id: string): Promise<PublicUser | null>;
    findByEmail(email: string): Promise<PublicUser | null>;
    findByEmailWithPassword(email: string): Promise<User | null>;
    findByIdWithPassword(id: string): Promise<User | null>;
    create(data: {
        email: string;
        passwordHash: string;
        firstName: string;
        lastName: string;
        avatarUrl?: string;
        timezone?: string;
        language?: string;
    }): Promise<PublicUser>;
    updateBasicProfile(id: string, data: UserProfileUpdate): Promise<PublicUser>;
}
