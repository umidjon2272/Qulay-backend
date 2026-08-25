import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AI tools API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerId: string;
  let otherId: string;
  let ownerToken: string;
  let otherToken: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    prisma = app.get(PrismaService);
    await app.init();
    const password = 'StrongPassword123!';
    const owner = await request(app.getHttpServer()).post('/api/auth/register').send({ email: `ai-tools-owner-${Date.now()}@example.com`, password, firstName: 'AI', lastName: 'Owner' }).expect(201);
    const other = await request(app.getHttpServer()).post('/api/auth/register').send({ email: `ai-tools-other-${Date.now()}@example.com`, password, firstName: 'AI', lastName: 'Other' }).expect(201);
    ownerId = owner.body.user.id; otherId = other.body.user.id;
    ownerToken = owner.body.accessToken; otherToken = other.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: ownerId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: otherId } }).catch(() => undefined);
    await app.close();
  });

  it('lists tools and protects execution with JWT', async () => {
    await request(app.getHttpServer()).get('/api/ai/tools').expect(401);
    await request(app.getHttpServer()).get('/api/ai/tools').set('Authorization', `Bearer ${ownerToken}`).expect(200).expect((response) => {
      expect(response.body).toHaveLength(27);
      expect(response.body).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'create_task', requiresConfirmation: true, sideEffect: 'WRITE' })]));
      expect(response.body[0].handler).toBeUndefined();
    });
  });

  it('executes a read tool and gates a write tool on confirmation', async () => {
    await request(app.getHttpServer()).post('/api/ai/tools/execute').set('Authorization', `Bearer ${ownerToken}`).send({ tool: 'get_tasks', input: {}, confirmed: false }).expect(201).expect((response) => {
      expect(response.body.status).toBe('success');
      expect(response.body.tool).toBe('get_tasks');
      expect(response.body.meta.requestId).toEqual(expect.any(String));
    });

    const pending = await request(app.getHttpServer()).post('/api/ai/tools/execute').set('Authorization', `Bearer ${ownerToken}`).send({ tool: 'create_task', input: { title: 'AI task' }, confirmed: false }).expect(201);
    expect(pending.body.status).toBe('confirmation_required');
    expect(pending.body.preview).toMatchObject({ title: 'AI task' });

    const created = await request(app.getHttpServer()).post('/api/ai/tools/execute').set('Authorization', `Bearer ${ownerToken}`).send({ tool: 'create_task', input: { title: 'AI confirmed task' }, confirmed: true }).expect(201);
    expect(created.body).toMatchObject({ status: 'success', tool: 'create_task', data: { title: 'AI confirmed task', userId: ownerId } });
  });

  it('blocks a foreign contact in a write tool', async () => {
    const contact = await request(app.getHttpServer()).post('/api/contacts').set('Authorization', `Bearer ${otherToken}`).send({ firstName: 'Foreign', displayName: 'Foreign contact' }).expect(201);
    await request(app.getHttpServer()).post('/api/ai/tools/execute').set('Authorization', `Bearer ${ownerToken}`).send({ tool: 'create_note', input: { content: 'Should not attach', contactId: contact.body.id }, confirmed: false }).expect(404);
  });
});
