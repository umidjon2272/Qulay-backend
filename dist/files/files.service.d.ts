import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFolderDto, UpdateFolderDto } from './dto/folder.dto';
import { FileQueryDto } from './dto/file-query.dto';
import { FileStorageAdapter } from './storage/file-storage-adapter';
type UploadedInput = {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
};
export declare class FilesService {
    private readonly prisma;
    private readonly activityLog;
    private readonly config;
    private readonly storage;
    private readonly maxSizeBytes;
    private readonly provider;
    constructor(prisma: PrismaService, activityLog: ActivityLogService, config: ConfigService, storage: FileStorageAdapter);
    uploadForUser(userId: string, file: UploadedInput | undefined, folderId?: string, label?: string): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.FileStatus;
        createdAt: Date;
        updatedAt: Date;
        source: import(".prisma/client").$Enums.FileSource;
        mimeType: string;
        originalName: string;
        sizeBytes: bigint;
        folderId: string | null;
        label: string | null;
        extension: string | null;
        checksum: string | null;
        deletedAt: Date | null;
    } & {
        sizeBytes: number;
    }>;
    listForUser(userId: string, query: FileQueryDto): Promise<{
        items: ({
            id: string;
            status: import(".prisma/client").$Enums.FileStatus;
            createdAt: Date;
            updatedAt: Date;
            source: import(".prisma/client").$Enums.FileSource;
            mimeType: string;
            originalName: string;
            sizeBytes: bigint;
            folderId: string | null;
            label: string | null;
            extension: string | null;
            checksum: string | null;
            deletedAt: Date | null;
        } & {
            sizeBytes: number;
        })[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    searchForUser(userId: string, query: string, filters?: Partial<Pick<FileQueryDto, 'mimeType' | 'folderId' | 'source' | 'limit'>>): Promise<{
        items: ({
            id: string;
            status: import(".prisma/client").$Enums.FileStatus;
            createdAt: Date;
            updatedAt: Date;
            source: import(".prisma/client").$Enums.FileSource;
            mimeType: string;
            originalName: string;
            sizeBytes: bigint;
            folderId: string | null;
            label: string | null;
            extension: string | null;
            checksum: string | null;
            deletedAt: Date | null;
        } & {
            sizeBytes: number;
        })[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    getForUser(userId: string, id: string): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.FileStatus;
        createdAt: Date;
        updatedAt: Date;
        source: import(".prisma/client").$Enums.FileSource;
        mimeType: string;
        originalName: string;
        sizeBytes: bigint;
        folderId: string | null;
        label: string | null;
        extension: string | null;
        checksum: string | null;
        deletedAt: Date | null;
    } & {
        sizeBytes: number;
    }>;
    getDownloadForUser(userId: string, id: string): Promise<{
        stream: Readable;
        mimeType: string;
        originalName: string;
        sizeBytes: number;
    }>;
    deleteForUser(userId: string, id: string): Promise<{
        message: string;
        file: {
            id: string;
            status: import(".prisma/client").$Enums.FileStatus;
            createdAt: Date;
            updatedAt: Date;
            source: import(".prisma/client").$Enums.FileSource;
            mimeType: string;
            originalName: string;
            sizeBytes: bigint;
            folderId: string | null;
            label: string | null;
            extension: string | null;
            checksum: string | null;
            deletedAt: Date | null;
        } & {
            sizeBytes: number;
        };
    }>;
    listFoldersForUser(userId: string): Promise<({
        _count: {
            files: number;
            children: number;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        userId: string;
        parentId: string | null;
    })[]>;
    createFolderForUser(userId: string, dto: CreateFolderDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        userId: string;
        parentId: string | null;
    }>;
    updateFolderForUser(userId: string, id: string, dto: UpdateFolderDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        userId: string;
        parentId: string | null;
    }>;
    deleteFolderForUser(userId: string, id: string): Promise<{
        message: string;
    }>;
    linkGoogleDriveFile(userId: string, input: {
        id: string;
        name: string;
        mimeType: string;
        size?: number;
        modifiedTime?: string;
    }): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.FileStatus;
        createdAt: Date;
        updatedAt: Date;
        source: import(".prisma/client").$Enums.FileSource;
        mimeType: string;
        originalName: string;
        sizeBytes: bigint;
        folderId: string | null;
        label: string | null;
        extension: string | null;
        checksum: string | null;
        deletedAt: Date | null;
    } & {
        sizeBytes: number;
    }>;
    private getFolderForUser;
    private assertParentAllowed;
}
export {};
