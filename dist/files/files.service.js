"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilesService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const pagination_query_dto_1 = require("../common/dto/pagination-query.dto");
const prisma_service_1 = require("../prisma/prisma.service");
const file_storage_adapter_1 = require("./storage/file-storage-adapter");
const mime_sniffing_1 = require("./storage/mime-sniffing");
const FILE_PUBLIC_SELECT = {
    id: true, originalName: true, label: true, mimeType: true, extension: true, sizeBytes: true,
    source: true, folderId: true, status: true, checksum: true, createdAt: true, updatedAt: true, deletedAt: true,
};
let FilesService = class FilesService {
    constructor(prisma, activityLog, config, storage) {
        this.prisma = prisma;
        this.activityLog = activityLog;
        this.config = config;
        this.storage = storage;
        this.maxSizeBytes = config.get('storage.maxSizeBytes') ?? 20 * 1024 * 1024;
        this.provider = config.get('storage.provider') ?? 'LOCAL';
    }
    async uploadForUser(userId, file, folderId, label) {
        if (!file)
            throw new common_1.BadRequestException('A file is required');
        if (file.size > this.maxSizeBytes)
            throw new common_1.BadRequestException(`Maximum file size is ${this.maxSizeBytes / 1024 / 1024} MB`);
        (0, mime_sniffing_1.assertSafeFilename)(file.originalname);
        const mimeType = await (0, mime_sniffing_1.validateAndSniffMime)(file.buffer, file.mimetype);
        if (!mime_sniffing_1.ALLOWED_FILE_MIME_TYPES.includes(mimeType))
            throw new common_1.BadRequestException('File type is not allowed');
        if (folderId)
            await this.getFolderForUser(userId, folderId);
        const originalName = sanitizeOriginalName(file.originalname);
        const extension = extensionOf(originalName);
        const storedName = `${cryptoRandomUuid()}${extension ? `.${extension}` : ''}`;
        const storageKey = `${userId}/${storedName}`;
        const checksum = (0, node_crypto_1.createHash)('sha256').update(file.buffer).digest('hex');
        await this.storage.upload({ key: storageKey, body: file.buffer, contentType: mimeType });
        try {
            const created = await this.prisma.userFile.create({
                data: {
                    userId, originalName, storedName, label: label?.trim() || undefined, mimeType, extension,
                    sizeBytes: BigInt(file.size), storageProvider: this.provider, storageKey, folderId,
                    source: client_1.FileSource.UPLOAD, status: client_1.FileStatus.ACTIVE, checksum,
                },
                select: FILE_PUBLIC_SELECT,
            });
            await this.activityLog.record({ userId, action: activity_log_service_1.ACTIVITY_ACTIONS.FILE_UPLOADED, entityType: 'FILE', entityId: created.id, metadata: { fileId: created.id, mimeType, source: client_1.FileSource.UPLOAD } });
            return serializeFile(created);
        }
        catch (error) {
            await this.storage.delete(storageKey).catch(() => undefined);
            throw error;
        }
    }
    async listForUser(userId, query) {
        const search = query.search?.trim();
        const where = {
            userId, status: query.status ?? client_1.FileStatus.ACTIVE, mimeType: query.mimeType, source: query.source,
            folderId: query.folderId,
            ...(search ? { OR: [
                    { originalName: { contains: search, mode: 'insensitive' } },
                    { extension: { contains: search, mode: 'insensitive' } },
                    { folder: { name: { contains: search, mode: 'insensitive' } } },
                ] } : {}),
        };
        const sort = query.sort === 'originalName' || query.sort === 'sizeBytes' ? query.sort : 'createdAt';
        const [items, total] = await Promise.all([
            this.prisma.userFile.findMany({ where, select: FILE_PUBLIC_SELECT, orderBy: { [sort]: 'desc' }, skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit), take: query.limit }),
            this.prisma.userFile.count({ where }),
        ]);
        return { items: items.map(serializeFile), meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total) };
    }
    searchForUser(userId, query, filters = {}) {
        return this.listForUser(userId, { page: 1, limit: filters.limit ?? 20, search: query, mimeType: filters.mimeType, folderId: filters.folderId, source: filters.source });
    }
    async getForUser(userId, id) {
        const file = await this.prisma.userFile.findFirst({ where: { id, userId, status: { not: client_1.FileStatus.DELETED } }, select: FILE_PUBLIC_SELECT });
        if (!file)
            throw new common_1.NotFoundException('File was not found');
        return serializeFile(file);
    }
    async getDownloadForUser(userId, id) {
        const file = await this.prisma.userFile.findFirst({ where: { id, userId, status: client_1.FileStatus.ACTIVE } });
        if (!file)
            throw new common_1.NotFoundException('File was not found');
        if (file.source !== client_1.FileSource.UPLOAD)
            throw new common_1.ConflictException('This linked file has no local download');
        const stream = await this.storage.getDownloadStream(file.storageKey);
        return { stream, mimeType: file.mimeType, originalName: file.originalName, sizeBytes: Number(file.sizeBytes) };
    }
    async deleteForUser(userId, id) {
        const file = await this.prisma.userFile.findFirst({ where: { id, userId, status: { not: client_1.FileStatus.DELETED } } });
        if (!file)
            throw new common_1.NotFoundException('File was not found');
        if (file.source === client_1.FileSource.UPLOAD)
            await this.storage.delete(file.storageKey);
        const deleted = await this.prisma.userFile.update({ where: { id: file.id }, data: { status: client_1.FileStatus.DELETED, deletedAt: new Date() }, select: FILE_PUBLIC_SELECT });
        await this.activityLog.record({ userId, action: activity_log_service_1.ACTIVITY_ACTIONS.FILE_DELETED, entityType: 'FILE', entityId: id, metadata: { fileId: id, mimeType: file.mimeType, source: file.source } });
        return { message: 'File deleted successfully', file: serializeFile(deleted) };
    }
    async listFoldersForUser(userId) {
        return this.prisma.fileFolder.findMany({ where: { userId }, orderBy: [{ parentId: 'asc' }, { name: 'asc' }], include: { _count: { select: { files: true, children: true } } } });
    }
    async createFolderForUser(userId, dto) {
        if (dto.parentId)
            await this.getFolderForUser(userId, dto.parentId);
        try {
            const folder = await this.prisma.fileFolder.create({ data: { userId, name: dto.name, parentId: dto.parentId } });
            await this.activityLog.record({ userId, action: activity_log_service_1.ACTIVITY_ACTIONS.FOLDER_CREATED, entityType: 'FILE_FOLDER', entityId: folder.id });
            return folder;
        }
        catch (error) {
            throw mapFolderError(error);
        }
    }
    async updateFolderForUser(userId, id, dto) {
        const folder = await this.getFolderForUser(userId, id);
        if (dto.parentId === id)
            throw new common_1.BadRequestException('A folder cannot be its own parent');
        if (dto.parentId)
            await this.assertParentAllowed(userId, id, dto.parentId);
        try {
            const updated = await this.prisma.fileFolder.update({ where: { id: folder.id }, data: { name: dto.name, parentId: dto.parentId === undefined ? undefined : dto.parentId } });
            await this.activityLog.record({ userId, action: activity_log_service_1.ACTIVITY_ACTIONS.FOLDER_UPDATED, entityType: 'FILE_FOLDER', entityId: id });
            return updated;
        }
        catch (error) {
            throw mapFolderError(error);
        }
    }
    async deleteFolderForUser(userId, id) {
        const folder = await this.getFolderForUser(userId, id);
        const children = await this.prisma.fileFolder.count({ where: { userId, parentId: id } });
        if (children > 0)
            throw new common_1.ConflictException('Delete child folders before deleting this folder');
        await this.prisma.$transaction([
            this.prisma.userFile.updateMany({ where: { userId, folderId: id }, data: { folderId: null } }),
            this.prisma.fileFolder.delete({ where: { id: folder.id } }),
        ]);
        await this.activityLog.record({ userId, action: activity_log_service_1.ACTIVITY_ACTIONS.FOLDER_DELETED, entityType: 'FILE_FOLDER', entityId: id });
        return { message: 'Folder deleted; contained files moved to root' };
    }
    async linkGoogleDriveFile(userId, input) {
        if (!input.id || !input.name || !input.mimeType)
            throw new common_1.BadRequestException('Google Drive file metadata is incomplete');
        const key = `external:google-drive:${input.id}`;
        const existing = await this.prisma.userFile.findFirst({ where: { userId, storageKey: key, status: { not: client_1.FileStatus.DELETED } }, select: FILE_PUBLIC_SELECT });
        if (existing)
            return serializeFile(existing);
        const linked = await this.prisma.userFile.create({ data: {
                userId, originalName: sanitizeOriginalName(input.name), storedName: input.id, mimeType: input.mimeType,
                extension: extensionOf(input.name), sizeBytes: BigInt(input.size ?? 0), storageProvider: 'LOCAL', storageKey: key,
                source: client_1.FileSource.GOOGLE_DRIVE, status: client_1.FileStatus.ACTIVE,
            }, select: FILE_PUBLIC_SELECT });
        return serializeFile(linked);
    }
    async getFolderForUser(userId, id) {
        const folder = await this.prisma.fileFolder.findFirst({ where: { id, userId } });
        if (!folder)
            throw new common_1.NotFoundException('Folder was not found');
        return folder;
    }
    async assertParentAllowed(userId, folderId, parentId) {
        let current = parentId;
        for (let i = 0; i < 100 && current; i += 1) {
            if (current === folderId)
                throw new common_1.BadRequestException('Folder nesting cycle is not allowed');
            const parent = await this.prisma.fileFolder.findFirst({ where: { id: current, userId }, select: { parentId: true } });
            if (!parent)
                throw new common_1.NotFoundException('Parent folder was not found');
            current = parent.parentId;
        }
        if (current)
            throw new common_1.BadRequestException('Folder nesting is too deep');
    }
};
exports.FilesService = FilesService;
exports.FilesService = FilesService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)(file_storage_adapter_1.FILE_STORAGE_ADAPTER)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        activity_log_service_1.ActivityLogService,
        config_1.ConfigService, Object])
], FilesService);
function cryptoRandomUuid() { return require('node:crypto').randomUUID(); }
function sanitizeOriginalName(value) {
    const base = value.replace(/\\/g, '/').split('/').pop() ?? 'file';
    const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return (cleaned || 'file').slice(0, 255);
}
function extensionOf(name) {
    const match = /\.([a-z0-9]{1,20})$/i.exec(name);
    return match ? match[1].toLowerCase() : null;
}
function serializeFile(file) {
    return { ...file, sizeBytes: Number(file.sizeBytes) };
}
function mapFolderError(error) {
    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return new common_1.ConflictException('A folder with this name already exists here');
    return error instanceof Error ? error : new Error('Folder operation failed');
}
//# sourceMappingURL=files.service.js.map