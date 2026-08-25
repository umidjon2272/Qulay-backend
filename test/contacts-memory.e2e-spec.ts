import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Contacts and memory API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerId: string;
  let otherUserId: string;
  let ownerToken: string;
  let otherToken: string;
  let contactId: string;
  let memoryId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    prisma = app.get(PrismaService);
    await app.init();

    const password = 'StrongPassword123!';
    const owner = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'contacts-owner-' + Date.now() + '@example.com', password, firstName: 'Owner', lastName: 'Test' })
      .expect(201);
    const other = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'contacts-other-' + Date.now() + '@example.com', password, firstName: 'Other', lastName: 'Test' })
      .expect(201);
    ownerId = owner.body.user.id;
    otherUserId = other.body.user.id;
    ownerToken = owner.body.accessToken;
    otherToken = other.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: ownerId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: otherUserId } }).catch(() => undefined);
    await app.close();
  });

  it('creates, searches and scopes contacts to the JWT owner', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', 'Bearer ' + ownerToken)
      .send({
        firstName: 'Aziz',
        displayName: 'Aziz Karimov',
        company: 'Qulay',
        position: 'Marketing rahbari',
        tags: ['client', 'priority'],
      })
      .expect(201);
    contactId = created.body.id;

    await request(app.getHttpServer())
      .get('/api/contacts')
      .query({ search: 'Karimov', tag: 'client' })
      .set('Authorization', 'Bearer ' + ownerToken)
      .expect(200)
      .expect((response) => expect(response.body.items.map((item: { id: string }) => item.id)).toContain(contactId));

    await request(app.getHttpServer())
      .get('/api/contacts/' + contactId)
      .set('Authorization', 'Bearer ' + otherToken)
      .expect(404);
  });

  it('links meetings, notes and memories into contact history', async () => {
    await request(app.getHttpServer())
      .post('/api/meetings')
      .set('Authorization', 'Bearer ' + ownerToken)
      .send({
        title: 'Aziz bilan uchrashuv',
        participant: 'Aziz Karimov',
        contactId,
        startsAt: '2026-08-25T10:00:00Z',
        endsAt: '2026-08-25T11:00:00Z',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/notes')
      .set('Authorization', 'Bearer ' + ownerToken)
      .send({ title: 'Aziz notes', content: 'Marketing reja', contactId })
      .expect(201);

    const memory = await request(app.getHttpServer())
      .post('/api/memories')
      .set('Authorization', 'Bearer ' + ownerToken)
      .send({
        key: 'aziz.position',
        value: 'Marketing rahbari',
        type: 'CONTACT',
        importance: 9,
        contactId,
      })
      .expect(201);
    memoryId = memory.body.id;

    await request(app.getHttpServer())
      .get('/api/contacts/' + contactId + '/history')
      .set('Authorization', 'Bearer ' + ownerToken)
      .expect(200)
      .expect((response) => {
        expect(response.body.contact.id).toBe(contactId);
        expect(response.body.recentMeetings).toHaveLength(1);
        expect(response.body.relatedNotes).toHaveLength(1);
        expect(response.body.relatedMemories).toHaveLength(1);
      });
  });

  it('supports memory filters and protects memory mutations', async () => {
    await request(app.getHttpServer())
      .get('/api/memories')
      .query({ type: 'CONTACT', contactId, importance: 9, search: 'Marketing' })
      .set('Authorization', 'Bearer ' + ownerToken)
      .expect(200)
      .expect((response) => expect(response.body.items[0].id).toBe(memoryId));

    await request(app.getHttpServer())
      .patch('/api/memories/' + memoryId)
      .set('Authorization', 'Bearer ' + otherToken)
      .send({ value: 'private' })
      .expect(404);

    await request(app.getHttpServer())
      .delete('/api/memories/' + memoryId)
      .set('Authorization', 'Bearer ' + ownerToken)
      .expect(200);
  });
});
