import { BadRequestException } from '@nestjs/common';

export const ALLOWED_FILE_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/csv',
  'application/json', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export type AllowedFileMimeType = (typeof ALLOWED_FILE_MIME_TYPES)[number];

const ALLOWED = new Set<string>(ALLOWED_FILE_MIME_TYPES);
const DANGEROUS = new Set([
  'application/x-executable', 'application/x-msdownload', 'application/x-dosexec',
  'application/x-sh', 'application/x-shellscript', 'text/x-shellscript', 'application/x-bat',
  'application/javascript', 'text/javascript', 'application/x-httpd-php', 'application/wasm',
]);
const DANGEROUS_EXTENSIONS = new Set(['exe', 'dll', 'com', 'scr', 'msi', 'bat', 'cmd', 'ps1', 'psm1', 'js', 'mjs', 'cjs', 'sh', 'bash', 'php', 'py', 'rb', 'vbs', 'jar', 'apk', 'wasm']);

type DetectedType = { mime: string; ext?: string };
type FileTypeModule = { fileTypeFromBuffer(buffer: Uint8Array): Promise<DetectedType | undefined> };

const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<FileTypeModule>;

async function detect(buffer: Buffer): Promise<DetectedType | undefined> {
  try {
    const module = await nativeImport('file-type');
    return (await module.fileTypeFromBuffer(buffer)) ?? fallbackDetect(buffer);
  } catch {
    return fallbackDetect(buffer);
  }
}

function fallbackDetect(buffer: Buffer): DetectedType | undefined {
  if (buffer.subarray(0, 4).toString('ascii') === '%PDF') return { ext: 'pdf', mime: 'application/pdf' };
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (buffer.subarray(0, 2).toString('ascii') === 'PK') return { ext: 'zip', mime: 'application/zip' };
  if (buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return { ext: 'cfb', mime: 'application/x-cfb' };
  if (buffer.subarray(0, 2).toString('ascii') === 'MZ') return { ext: 'exe', mime: 'application/x-msdownload' };
  return undefined;
}

function isUtf8Text(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  const decoded = buffer.toString('utf8');
  return !decoded.includes('\ufffd');
}

function compatible(declared: string, detected: string | undefined): boolean {
  if (!detected) return declared === 'text/plain' || declared === 'text/csv' || declared === 'application/json';
  if (detected === declared) return true;
  if (detected === 'application/zip') {
    return declared === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || declared === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (detected === 'application/x-cfb') return declared === 'application/msword' || declared === 'application/vnd.ms-excel';
  return false;
}

export async function validateAndSniffMime(buffer: Buffer, declaredMime: string): Promise<AllowedFileMimeType> {
  const declared = declaredMime.toLowerCase().split(';')[0].trim();
  const detected = await detect(buffer).catch(() => undefined);
  if (detected && DANGEROUS.has(detected.mime)) throw new BadRequestException('Dangerous file type is not allowed');

  let effective = declared;
  if (!ALLOWED.has(effective) && declared === 'application/octet-stream' && detected && ALLOWED.has(detected.mime)) {
    effective = detected.mime;
  }
  if (!ALLOWED.has(effective)) throw new BadRequestException('File type is not allowed');
  if (!compatible(effective, detected?.mime) || (!detected && !isUtf8Text(buffer) && effective.startsWith('text/'))) {
    throw new BadRequestException('File content does not match its declared MIME type');
  }
  return effective as AllowedFileMimeType;
}

export function assertSafeFilename(name: string): void {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension && DANGEROUS_EXTENSIONS.has(extension)) throw new BadRequestException('Executable and script files are not allowed');
}
