import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { FileStorageAdapter, StorageMetadata, StorageUploadInput } from './file-storage-adapter';
export declare class LocalFileStorageAdapter implements FileStorageAdapter {
    private readonly rootPath;
    constructor(config: ConfigService);
    upload(input: StorageUploadInput): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    getMetadata(key: string): Promise<StorageMetadata | null>;
    getDownloadStream(key: string): Promise<Readable>;
    private safePath;
}
