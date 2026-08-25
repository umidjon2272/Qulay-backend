import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';

describe('HTTP production security', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('adds security headers and only allows configured CORS origins', async () => {
    const allowed = await request(app.getHttpServer()).get('/api/health').set('Origin', 'http://localhost:5173').expect(200);
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const disallowed = await request(app.getHttpServer()).get('/api/health').set('Origin', 'https://evil.example');
    expect(disallowed.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps authentication working through the hardened bootstrap', async () => {
    const email = `security-auth-${Date.now()}@example.com`;
    const registration = await request(app.getHttpServer()).post('/api/auth/register').send({
      email, password: 'StrongPassword123!', firstName: 'Security', lastName: 'Test',
    }).expect(201);
    expect(registration.body.accessToken).toEqual(expect.any(String));
    await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'StrongPassword123!' }).expect(200);
  });

  it('rejects oversized JSON request bodies', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'size@example.com', password: 'x'.repeat(1_100_000) }).expect(413);
  });

  it('temporarily blocks repeated invalid login attempts', async () => {
    const email = `brute-force-${Date.now()}@example.com`;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'WrongPassword123!' }).expect(401);
    }
    await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'WrongPassword123!' }).expect(429);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'WrongPassword123!' }).expect(429);
  });
});
