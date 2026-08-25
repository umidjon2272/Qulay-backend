import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Files API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerId: string;
  let otherId: string;
  let ownerToken: string;
  let otherToken: string;
  let fileId: string;
  let folderId: string;
  const pdf = Buffer.from('%PDF-1.7\n');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    prisma = app.get(PrismaService);
    await app.init();
    const password = 'StrongPassword123!';
    const owner = await request(app.getHttpServer()).post('/api/auth/register').send({ email: `files-owner-${Date.now()}@example.com`, password, firstName: 'File', lastName: 'Owner' }).expect(201);
    const other = await request(app.getHttpServer()).post('/api/auth/register').send({ email: `files-other-${Date.now()}@example.com`, password, firstName: 'File', lastName: 'Other' }).expect(201);
    ownerId = owner.body.user.id; otherId = other.body.user.id; ownerToken = owner.body.accessToken; otherToken = other.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: ownerId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: otherId } }).catch(() => undefined);
    await fs.rm(join(process.cwd(), 'test-uploads'), { recursive: true, force: true });
    await app.close();
  });

  it('blocks unauthenticated upload and accepts valid PDF/image uploads', async () => {
    await request(app.getHttpServer()).post('/api/files/upload').attach('file', pdf, { filename: 'unauth.pdf', contentType: 'application/pdf' }).expect(401);
    const folder = await request(app.getHttpServer()).post('/api/files/folders').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Receipts' }).expect(201);
    folderId = folder.body.id;
    const uploaded = await request(app.getHttpServer()).post('/api/files/upload').set('Authorization', `Bearer ${ownerToken}`).field('folderId', folderId).attach('file', pdf, { filename: 'receipt.pdf', contentType: 'application/pdf' }).expect(201);
    fileId = uploaded.body.id;
    expect(uploaded.body).toMatchObject({ originalName: 'receipt.pdf', mimeType: 'application/pdf', folderId, status: 'ACTIVE' });
    expect(uploaded.body.storageKey).toBeUndefined();
    await request(app.getHttpServer()).post('/api/files/upload').set('Authorization', `Bearer ${ownerToken}`).attach('file', png, { filename: 'photo.png', contentType: 'image/png' }).expect(201);
  });

  it('rejects dangerous and oversized files and sanitizes traversal names', async () => {
    await request(app.getHttpServer()).post('/api/files/upload').set('Authorization', `Bearer ${ownerToken}`).attach('file', Buffer.from('MZ\x90\x00'), { filename: 'payload.exe', contentType: 'application/octet-stream' }).expect(400);
    await request(app.getHttpServer()).post('/api/files/upload').set('Authorization', `Bearer ${ownerToken}`).attach('file', Buffer.alloc(20 * 1024 * 1024 + 1), { filename: 'large.txt', contentType: 'text/plain' }).expect(400);
    const traversal = await request(app.getHttpServer()).post('/api/files/upload').set('Authorization', `Bearer ${ownerToken}`).attach('file', Buffer.from('safe text'), { filename: '../../safe.txt', contentType: 'text/plain' }).expect(201);
    expect(traversal.body.originalName).toBe('safe.txt');
  });

  it('lists/searches own files, protects foreign metadata, and preserves checksum', async () => {
    const list = await request(app.getHttpServer()).get('/api/files?search=receipt').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(list.body.items.some((item: { id: string }) => item.id === fileId)).toBe(true);
    expect(list.body.items[0].storageKey).toBeUndefined();
    const details = await request(app.getHttpServer()).get(`/api/files/${fileId}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(details.body.checksum).toBe(createHash('sha256').update(pdf).digest('hex'));
    await request(app.getHttpServer()).get(`/api/files/${fileId}`).set('Authorization', `Bearer ${otherToken}`).expect(404);
    await request(app.getHttpServer()).get(`/api/files/${fileId}/download`).set('Authorization', `Bearer ${otherToken}`).expect(404);
  });

  it('downloads and soft-deletes owned files', async () => {
    const downloaded = await request(app.getHttpServer()).get(`/api/files/${fileId}/download`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(downloaded.body).toEqual(pdf);
    expect(downloaded.headers['content-disposition']).toContain('receipt.pdf');
    await request(app.getHttpServer()).delete(`/api/files/${fileId}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    await request(app.getHttpServer()).get(`/api/files/${fileId}`).set('Authorization', `Bearer ${ownerToken}`).expect(404);
  });

  it('supports folder CRUD and moves contained files to root on delete', async () => {
    const created = await request(app.getHttpServer()).post('/api/files/folders').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Nested' }).expect(201);
    const nestedId = created.body.id;
    await request(app.getHttpServer()).patch(`/api/files/folders/${nestedId}`).set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Nested renamed' }).expect(200);
    const uploaded = await request(app.getHttpServer()).post('/api/files/upload').set('Authorization', `Bearer ${ownerToken}`).field('folderId', nestedId).attach('file', Buffer.from('folder file'), { filename: 'folder.txt', contentType: 'text/plain' }).expect(201);
    await request(app.getHttpServer()).delete(`/api/files/folders/${nestedId}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const moved = await request(app.getHttpServer()).get(`/api/files/${uploaded.body.id}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(moved.body.folderId).toBeNull();
  });

  it('exposes user-scoped read tools for file search and metadata', async () => {
    const search = await request(app.getHttpServer()).post('/api/ai/tools/execute').set('Authorization', `Bearer ${ownerToken}`).send({ tool: 'search_files', input: { query: 'folder' }, confirmed: false }).expect(201);
    expect(search.body).toMatchObject({ status: 'success', tool: 'search_files' });
    await request(app.getHttpServer()).post('/api/ai/tools/execute').set('Authorization', `Bearer ${ownerToken}`).send({ tool: 'get_file_metadata', input: { fileId }, confirmed: false }).expect(404);
  });
});
