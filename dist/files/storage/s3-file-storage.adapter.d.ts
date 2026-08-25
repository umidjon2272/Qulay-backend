import { Readable } from 'node:stream';
import { FileStorageAdapter, StorageMetadata, StorageUploadInput } from './file-storage-adapter';
export declare class S3FileStorageAdapter implements FileStorageAdapter {
    private unavailable;
    upload(_input: StorageUploadInput): Promise<void>;
    delete(_key: string): Promise<void>;
    exists(_key: string): Promise<boolean>;
    getMetadata(_key: string): Promise<StorageMetadata | null>;
    getDownloadStream(_key: string): Promise<Readable>;
}
