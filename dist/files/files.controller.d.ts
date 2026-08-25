import { Response } from 'express';
import { StreamableFile } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreateFolderDto, UpdateFolderDto } from './dto/folder.dto';
import { FileQueryDto } from './dto/file-query.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';
export declare class FilesController {
    private readonly files;
    constructor(files: FilesService);
    upload(user: AuthenticatedUser, file: {
        originalname: string;
        mimetype: string;
        size: number;
        buffer: Buffer;
    }, dto: UploadFileDto): Promise<{
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
    list(user: AuthenticatedUser, query: FileQueryDto): Promise<{
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
    listFolders(user: AuthenticatedUser): Promise<({
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
    createFolder(user: AuthenticatedUser, dto: CreateFolderDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        userId: string;
        parentId: string | null;
    }>;
    updateFolder(user: AuthenticatedUser, id: string, dto: UpdateFolderDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        userId: string;
        parentId: string | null;
    }>;
    deleteFolder(user: AuthenticatedUser, id: string): Promise<{
        message: string;
    }>;
    download(user: AuthenticatedUser, id: string, response: Response): Promise<StreamableFile>;
    get(user: AuthenticatedUser, id: string): Promise<{
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
    delete(user: AuthenticatedUser, id: string): Promise<{
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
}
