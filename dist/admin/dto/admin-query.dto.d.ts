import { UserRole, UserStatus } from '@prisma/client';
export declare class AdminRangeQueryDto {
    range: number;
}
export declare class AdminUsersQueryDto {
    search?: string;
    role?: UserRole;
    status?: UserStatus;
    page: number;
    limit: number;
    sort: 'createdAt' | 'lastActivity';
    order: 'asc' | 'desc';
}
export declare class AdminActivityQueryDto {
    userId?: string;
    action?: string;
    entityType?: string;
    from?: string;
    to?: string;
    page: number;
    limit: number;
}
export declare class AdminStatusDto {
    status: UserStatus;
}
export declare class AdminRoleDto {
    role: UserRole;
}
