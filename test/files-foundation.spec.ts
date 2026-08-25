import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { LocalFileStorageAdapter } from '../src/files/storage/local-file-storage.adapter';
import { assertSafeFilename, validateAndSniffMime } from '../src/files/storage/mime-sniffing';

describe('file storage foundation', () => {
  it('writes and reads a file in a safe temporary local root', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), `qulay-files-${randomUUID()}-`));
    const adapter = new LocalFileStorageAdapter({ get: () => root } as any);
    await adapter.upload({ key: 'user-1/file.bin', body: Buffer.from('hello'), contentType: 'text/plain' });
    expect(await adapter.exists('user-1/file.bin')).toBe(true);
    expect((await adapter.getMetadata('user-1/file.bin'))?.sizeBytes).toBe(5);
    await expect(adapter.exists('../outside')).rejects.toThrow('Invalid storage key');
    await adapter.delete('user-1/file.bin');
    expect(await adapter.exists('user-1/file.bin')).toBe(false);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('sniffs PDF bytes and rejects dangerous extensions', async () => {
    await expect(validateAndSniffMime(Buffer.from('%PDF-1.7\n'), 'application/pdf')).resolves.toBe('application/pdf');
    expect(() => assertSafeFilename('payload.exe')).toThrow(BadRequestException);
    await expect(validateAndSniffMime(Buffer.from('MZ\x90\x00'), 'application/octet-stream')).rejects.toThrow(BadRequestException);
  });
});
