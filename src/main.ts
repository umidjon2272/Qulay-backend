import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { json, Request, Response, urlencoded } from 'express';
import { AppModule } from './app.module';
import { ProductionExceptionFilter } from './common/security/production-exception.filter';
import { SecurityRateLimitService } from './common/security/security-rate-limit.service';
import { PrismaService } from './prisma/prisma.service';

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
  app.use(json({ limit: configService.get<string>('requestBodyLimit', '1mb') }));
  app.use(urlencoded({ extended: true, limit: configService.get<string>('requestBodyLimit', '1mb') }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new ProductionExceptionFilter());
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
  app.use((request: Request, response: Response, next: () => void) => {
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    if (!rateLimiter.isAllowed('global-ip', ip, 240, 60 * 1000)) {
      response.status(429).json({ statusCode: 429, message: 'Too many requests. Try again later.' });
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
