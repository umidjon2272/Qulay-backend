export type StoredFile = {
  objectKey: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  checksum?: string;
};

export interface ObjectStorage {
  upload(file: Buffer, meta: { originalName: string; mimeType: string }): Promise<StoredFile>;
  delete(objectKey: string): Promise<void>;
}
