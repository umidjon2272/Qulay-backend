import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { json, Request, Response, urlencoded } from 'express';
import { AppModule } from './app.module';
import { ProductionExceptionFilter } from './common/security/production-exception.filter';
import { SecurityRateLimitService } from './common/security/security-rate-limit.service';
import { SECURITY_LIMITS } from './common/security/security-limits.constants';
import { PrismaService } from './prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './auth/types/jwt-payload.type';
import { createGlobalRateLimitKey, resolveClientIp } from './common/security/client-ip';

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const frontendOrigins = configService
    .getOrThrow<string>('frontendUrl')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const httpServer = app.getHttpAdapter().getInstance() as { set: (name: string, value: unknown) => void; disable: (name: string) => void };
  httpServer.set('trust proxy', configService.get<boolean>('trustProxy', false));
  app.setGlobalPrefix('api');
  httpServer.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(json({ limit: configService.get<string>('requestBodyLimit', '1mb'), verify: (request, _response, buffer) => { (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));
  app.use(urlencoded({ extended: true, limit: configService.get<string>('requestBodyLimit', '1mb') }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(app.get(ProductionExceptionFilter));
  app.enableCors({
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  });

  const rateLimiter = app.get(SecurityRateLimitService);
  const jwtService = app.get(JwtService);
  const trustProxy = configService.get<boolean>('trustProxy', false);
  app.use((request: Request, response: Response, next: () => void) => {
    const ip = resolveClientIp(request, trustProxy);
    const authorization = request.headers.authorization;
    let userId: string | undefined;
    if (authorization?.toLowerCase().startsWith('bearer ')) {
      try {
        userId = jwtService.verify<JwtPayload>(authorization.slice(7), {
          secret: configService.getOrThrow<string>('jwt.accessSecret'),
        }).sub;
      } catch {
        // Invalid/expired credentials stay in the anonymous IP bucket and are
        // rejected by the authentication guard where appropriate.
      }
    }
    const decision = rateLimiter.consume('global', createGlobalRateLimitKey(ip, userId), SECURITY_LIMITS.globalPerIp.max, SECURITY_LIMITS.globalPerIp.windowMs);
    if (!decision.allowed) {
      response.setHeader('Retry-After', String(decision.retryAfterSeconds));
      response.status(429).json({ statusCode: 429, message: 'Too many requests. Try again later.', code: 'RATE_LIMITED', retryAfterSeconds: decision.retryAfterSeconds });
      return;
    }
    next();
  });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApp(app);

  await app.get(PrismaService).enableShutdownHooks(app);
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('port');

  await app.listen(port, '0.0.0.0');

  new Logger('Bootstrap').log(`Qulay AI backend running on port ${port}`);
}

if (require.main === module) {
  void bootstrap();
}
