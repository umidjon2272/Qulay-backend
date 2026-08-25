import { createReadStream, promises as fs } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStorageAdapter, StorageMetadata, StorageUploadInput } from './file-storage-adapter';

@Injectable()
export class LocalFileStorageAdapter implements FileStorageAdapter {
  private readonly rootPath: string;

  constructor(config: ConfigService) {
    const configuredPath = config.get<string>('storage.localPath') ?? './uploads';
    this.rootPath = resolve(process.cwd(), configuredPath);
  }

  async upload(input: StorageUploadInput): Promise<void> {
    const path = this.safePath(input.key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, input.body, { flag: 'wx' });
  }

  async delete(key: string): Promise<void> {
    const path = this.safePath(key);
    try {
      await fs.unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.safePath(key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async getMetadata(key: string): Promise<StorageMetadata | null> {
    try {
      const stats = await fs.stat(this.safePath(key));
      return { sizeBytes: stats.size, modifiedAt: stats.mtime };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async getDownloadStream(key: string): Promise<Readable> {
    const path = this.safePath(key);
    if (!(await this.exists(key))) throw new Error('Storage object was not found');
    return createReadStream(path);
  }

  private safePath(key: string): string {
    if (!key || isAbsolute(key)) throw new Error('Invalid storage key');
    const path = resolve(join(this.rootPath, key));
    const relativePath = relative(this.rootPath, path);
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('Invalid storage key');
    }
    return path;
  }
}
