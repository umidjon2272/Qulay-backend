export declare const ALLOWED_FILE_MIME_TYPES: readonly ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "text/csv", "application/json", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
export type AllowedFileMimeType = (typeof ALLOWED_FILE_MIME_TYPES)[number];
export declare function validateAndSniffMime(buffer: Buffer, declaredMime: string): Promise<AllowedFileMimeType>;
export declare function assertSafeFilename(name: string): void;
