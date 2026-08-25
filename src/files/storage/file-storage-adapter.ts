import { Readable } from 'node:stream';

export type StorageUploadInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export type StorageMetadata = {
  sizeBytes: number;
  contentType?: string;
  modifiedAt?: Date;
};

export interface FileStorageAdapter {
  upload(input: StorageUploadInput): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<StorageMetadata | null>;
  getDownloadStream(key: string): Promise<Readable>;
}

export const FILE_STORAGE_ADAPTER = Symbol('FILE_STORAGE_ADAPTER');
