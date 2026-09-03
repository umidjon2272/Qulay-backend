import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileExtractionStatus, FileSource, FileStatus, Prisma } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreateFolderDto, UpdateFolderDto } from './dto/folder.dto';
import { FileQueryDto } from './dto/file-query.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { FileStorageAdapter, FILE_STORAGE_ADAPTER } from './storage/file-storage-adapter';
import { ALLOWED_FILE_MIME_TYPES, assertSafeFilename, validateAndSniffMime } from './storage/mime-sniffing';
import { FileContentExtractionService } from './extractors/file-content-extraction.service';

const FILE_PUBLIC_SELECT = {
  id: true, originalName: true, label: true, mimeType: true, extension: true, sizeBytes: true,
  source: true, folderId: true, status: true, checksum: true, createdAt: true, updatedAt: true, deletedAt: true,
  extractionStatus: true, extractedAt: true, extractionError: true,
} as const;

type UploadedInput = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Injectable()
export class FilesService {
  private readonly maxSizeBytes: number;
  private readonly provider: 'LOCAL' | 'S3';

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly config: ConfigService,
    @Inject(FILE_STORAGE_ADAPTER) private readonly storage: FileStorageAdapter,
    private readonly extraction: FileContentExtractionService,
    private readonly subscriptions: SubscriptionsService,
  ) {
    this.maxSizeBytes = config.get<number>('storage.maxSizeBytes') ?? 20 * 1024 * 1024;
    this.provider = config.get<'LOCAL' | 'S3'>('storage.provider') ?? 'LOCAL';
  }

  async uploadForUser(userId: string, file: UploadedInput | undefined, folderId?: string, label?: string) {
    if (!file) throw new BadRequestException('A file is required');
    if (file.size > this.maxSizeBytes) throw new BadRequestException(`Maximum file size is ${this.maxSizeBytes / 1024 / 1024} MB`);
    await this.subscriptions.assertFileAllowed(userId, file.size);
    assertSafeFilename(file.originalname);
    const mimeType = await validateAndSniffMime(file.buffer, file.mimetype);
    if (!ALLOWED_FILE_MIME_TYPES.includes(mimeType)) throw new BadRequestException('File type is not allowed');
    if (folderId) await this.getFolderForUser(userId, folderId);

    const originalName = sanitizeOriginalName(file.originalname);
    const extension = extensionOf(originalName);
    const storedName = `${cryptoRandomUuid()}${extension ? `.${extension}` : ''}`;
    const storageKey = `${userId}/${storedName}`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    await this.storage.upload({ key: storageKey, body: file.buffer, contentType: mimeType });
    let stored = false;
    try {
      const created = await this.prisma.userFile.create({
        data: {
          userId, originalName, storedName, label: label?.trim() || undefined, mimeType, extension,
          sizeBytes: BigInt(file.size), storageProvider: this.provider, storageKey, folderId,
          source: FileSource.UPLOAD, status: FileStatus.ACTIVE, checksum,
        },
        select: FILE_PUBLIC_SELECT,
      });
      stored = true;
      await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.FILE_UPLOADED, entityType: 'FILE', entityId: created.id, metadata: { fileId: created.id, mimeType, source: FileSource.UPLOAD } }).catch(() => undefined);
      return this.extractAndStore(userId, created.id, mimeType, file.buffer);
    } catch (error) {
      if (!stored) await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async listForUser(userId: string, query: FileQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.UserFileWhereInput = {
      userId, status: query.status ?? FileStatus.ACTIVE, mimeType: query.mimeType, source: query.source,
      folderId: query.folderId === 'root' ? null : query.folderId,
      ...(search ? { OR: [
        { originalName: { contains: search, mode: 'insensitive' } },
        { extension: { contains: search, mode: 'insensitive' } },
              { folder: { name: { contains: search, mode: 'insensitive' } } },
              { extractedText: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    const sort = query.sort === 'originalName' || query.sort === 'sizeBytes' ? query.sort : 'createdAt';
    const [items, total] = await Promise.all([
      this.prisma.userFile.findMany({ where, select: FILE_PUBLIC_SELECT, orderBy: { [sort]: 'desc' }, skip: paginationSkip(query.page, query.limit), take: query.limit }),
      this.prisma.userFile.count({ where }),
    ]);
    return { items: items.map(serializeFile), meta: paginationMeta(query.page, query.limit, total) };
  }

  searchForUser(userId: string, query: string, filters: Partial<Pick<FileQueryDto, 'mimeType' | 'folderId' | 'source' | 'limit'>> = {}) {
    return this.listForUser(userId, { page: 1, limit: filters.limit ?? 20, search: query, mimeType: filters.mimeType, folderId: filters.folderId, source: filters.source });
  }

  async getForUser(userId: string, id: string) {
    const file = await this.prisma.userFile.findFirst({ where: { id, userId, status: { not: FileStatus.DELETED } }, select: FILE_PUBLIC_SELECT });
    if (!file) throw new NotFoundException('File was not found');
    return serializeFile(file);
  }

  async getContentForUser(userId: string, id: string) {
    const file = await this.prisma.userFile.findFirst({
      where: { id, userId, status: FileStatus.ACTIVE },
      select: { ...FILE_PUBLIC_SELECT, extractedText: true },
    });
    if (!file) throw new NotFoundException('File was not found');
    if (file.extractionStatus === FileExtractionStatus.PENDING) throw new ConflictException('Fayl matni hali tayyor emas');
    if (file.extractionStatus !== FileExtractionStatus.READY || !file.extractedText) throw new ConflictException(file.extractionError || 'Bu fayldan matn ajratib bo‘lmadi');
    return { ...serializeFile(file), extractedText: file.extractedText };
  }

  async getDownloadForUser(userId: string, id: string): Promise<{ stream: Readable; mimeType: string; originalName: string; sizeBytes: number }> {
    const file = await this.prisma.userFile.findFirst({ where: { id, userId, status: FileStatus.ACTIVE } });
    if (!file) throw new NotFoundException('File was not found');
    if (file.source !== FileSource.UPLOAD) throw new ConflictException('This linked file has no local download');
    const stream = await this.storage.getDownloadStream(file.storageKey);
    return { stream, mimeType: file.mimeType, originalName: file.originalName, sizeBytes: Number(file.sizeBytes) };
  }

  async deleteForUser(userId: string, id: string) {
    const file = await this.prisma.userFile.findFirst({ where: { id, userId, status: { not: FileStatus.DELETED } } });
    if (!file) throw new NotFoundException('File was not found');
    if (file.source === FileSource.UPLOAD) await this.storage.delete(file.storageKey);
    const deleted = await this.prisma.userFile.update({ where: { id: file.id }, data: { status: FileStatus.DELETED, deletedAt: new Date() }, select: FILE_PUBLIC_SELECT });
    await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.FILE_DELETED, entityType: 'FILE', entityId: id, metadata: { fileId: id, mimeType: file.mimeType, source: file.source } }).catch(() => undefined);
    return { message: 'File deleted successfully', file: serializeFile(deleted) };
  }

  async listFoldersForUser(userId: string) {
    return this.prisma.fileFolder.findMany({ where: { userId }, orderBy: [{ parentId: 'asc' }, { name: 'asc' }], include: { _count: { select: { files: { where: { status: FileStatus.ACTIVE } }, children: true } } } });
  }

  async updateForUser(userId: string, id: string, dto: UpdateFileDto) {
    const file = await this.getForUser(userId, id);
    if (dto.folderId) await this.getFolderForUser(userId, dto.folderId);
    if (dto.originalName !== undefined) {
      assertSafeFilename(dto.originalName);
      if (extensionOf(dto.originalName) !== file.extension) throw new BadRequestException('File extension cannot be changed');
    }
    const updated = await this.prisma.userFile.update({ where: { id: file.id }, data: {
      originalName: dto.originalName, label: dto.originalName === undefined ? undefined : null,
      folderId: dto.folderId,
    }, select: FILE_PUBLIC_SELECT });
    await this.activityLog.record({ userId, action: 'FILE_UPDATED', entityType: 'FILE', entityId: id }).catch(() => undefined);
    return serializeFile(updated);
  }

  async createFolderForUser(userId: string, dto: CreateFolderDto) {
    if (dto.parentId) await this.getFolderForUser(userId, dto.parentId);
    try {
      const folder = await this.prisma.fileFolder.create({ data: { userId, name: dto.name, parentId: dto.parentId } });
      await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.FOLDER_CREATED, entityType: 'FILE_FOLDER', entityId: folder.id }).catch(() => undefined);
      return folder;
    } catch (error) { throw mapFolderError(error); }
  }

  async updateFolderForUser(userId: string, id: string, dto: UpdateFolderDto) {
    const folder = await this.getFolderForUser(userId, id);
    if (dto.parentId === id) throw new BadRequestException('A folder cannot be its own parent');
    if (dto.parentId) await this.assertParentAllowed(userId, id, dto.parentId);
    try {
      const updated = await this.prisma.fileFolder.update({ where: { id: folder.id }, data: { name: dto.name, parentId: dto.parentId === undefined ? undefined : dto.parentId } });
      await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.FOLDER_UPDATED, entityType: 'FILE_FOLDER', entityId: id }).catch(() => undefined);
      return updated;
    } catch (error) { throw mapFolderError(error); }
  }

  async deleteFolderForUser(userId: string, id: string) {
    const folder = await this.getFolderForUser(userId, id);
    const children = await this.prisma.fileFolder.count({ where: { userId, parentId: id } });
    if (children > 0) throw new ConflictException('Delete child folders before deleting this folder');
    await this.prisma.$transaction([
      this.prisma.userFile.updateMany({ where: { userId, folderId: id }, data: { folderId: null } }),
      this.prisma.fileFolder.delete({ where: { id: folder.id } }),
    ]);
    await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.FOLDER_DELETED, entityType: 'FILE_FOLDER', entityId: id }).catch(() => undefined);
    return { message: 'Folder deleted; contained files moved to root' };
  }

  async linkGoogleDriveFile(userId: string, input: { id: string; name: string; mimeType: string; size?: number; modifiedTime?: string }) {
    if (!input.id || !input.name || !input.mimeType) throw new BadRequestException('Google Drive file metadata is incomplete');
    const key = `external:google-drive:${input.id}`;
    const existing = await this.prisma.userFile.findFirst({ where: { userId, storageKey: key, status: { not: FileStatus.DELETED } }, select: FILE_PUBLIC_SELECT });
    if (existing) return serializeFile(existing);
    const linked = await this.prisma.userFile.create({ data: {
      userId, originalName: sanitizeOriginalName(input.name), storedName: input.id, mimeType: input.mimeType,
      extension: extensionOf(input.name), sizeBytes: BigInt(input.size ?? 0), storageProvider: 'LOCAL', storageKey: key,
      source: FileSource.GOOGLE_DRIVE, status: FileStatus.ACTIVE,
    }, select: FILE_PUBLIC_SELECT });
    return serializeFile(linked);
  }

  private async getFolderForUser(userId: string, id: string) {
    const folder = await this.prisma.fileFolder.findFirst({ where: { id, userId } });
    if (!folder) throw new NotFoundException('Folder was not found');
    return folder;
  }

  private async assertParentAllowed(userId: string, folderId: string, parentId: string) {
    let current: string | null = parentId;
    for (let i = 0; i < 100 && current; i += 1) {
      if (current === folderId) throw new BadRequestException('Folder nesting cycle is not allowed');
      const parent: { parentId: string | null } | null = await this.prisma.fileFolder.findFirst({ where: { id: current, userId }, select: { parentId: true } });
      if (!parent) throw new NotFoundException('Parent folder was not found');
      current = parent.parentId;
    }
    if (current) throw new BadRequestException('Folder nesting is too deep');
  }

  private async extractAndStore(userId: string, fileId: string, mimeType: string, buffer: Buffer) {
    if (!this.extraction.supports(mimeType)) {
      const file = await this.prisma.userFile.update({ where: { id: fileId }, data: { extractionStatus: FileExtractionStatus.UNSUPPORTED, extractionError: 'Bu fayl turidan matn ajratilmaydi' }, select: FILE_PUBLIC_SELECT });
      return serializeFile(file);
    }
    try {
      const extractedText = await this.extraction.extract(mimeType, buffer);
      if (!extractedText) throw new Error('Faylda o‘qiladigan matn topilmadi');
      const file = await this.prisma.userFile.update({ where: { id: fileId }, data: { extractionStatus: FileExtractionStatus.READY, extractedText, extractedAt: new Date(), extractionError: null }, select: FILE_PUBLIC_SELECT });
      await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.FILE_CONTENT_EXTRACTED, entityType: 'FILE', entityId: fileId, metadata: { mimeType, characters: extractedText.length } }).catch(() => undefined);
      return serializeFile(file);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 200) : 'Fayl matnini ajratib bo‘lmadi';
      const file = await this.prisma.userFile.update({ where: { id: fileId }, data: { extractionStatus: FileExtractionStatus.FAILED, extractionError: message }, select: FILE_PUBLIC_SELECT });
      return serializeFile(file);
    }
  }
}

function cryptoRandomUuid(): string { return require('node:crypto').randomUUID(); }

function sanitizeOriginalName(value: string): string {
  const base = value.replace(/\\/g, '/').split('/').pop() ?? 'file';
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned || 'file').slice(0, 255);
}

function extensionOf(name: string): string | null {
  const match = /\.([a-z0-9]{1,20})$/i.exec(name);
  return match ? match[1].toLowerCase() : null;
}

function serializeFile<T extends { sizeBytes: bigint; [key: string]: unknown }>(file: T) {
  return { ...file, sizeBytes: Number(file.sizeBytes) };
}

function mapFolderError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return new ConflictException('A folder with this name already exists here');
  return error instanceof Error ? error : new Error('Folder operation failed');
}
