import { Readable } from 'node:stream';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { FileStorageAdapter, StorageMetadata, StorageUploadInput } from './file-storage-adapter';

/** S3-compatible seam. Add an S3 SDK and wire these methods when production storage is enabled. */
@Injectable()
export class S3FileStorageAdapter implements FileStorageAdapter {
  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException('S3 storage adapter is not configured');
  }

  upload(_input: StorageUploadInput): Promise<void> { return Promise.reject(this.unavailable()); }
  delete(_key: string): Promise<void> { return Promise.reject(this.unavailable()); }
  exists(_key: string): Promise<boolean> { return Promise.reject(this.unavailable()); }
  getMetadata(_key: string): Promise<StorageMetadata | null> { return Promise.reject(this.unavailable()); }
  getDownloadStream(_key: string): Promise<Readable> { return Promise.reject(this.unavailable()); }
}
