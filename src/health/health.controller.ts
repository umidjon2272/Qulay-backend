import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MonitoringService } from '../monitoring/monitoring.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly monitoring: MonitoringService) {}

  @Get()
  async getHealth() {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        database: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        responseMs: Date.now() - startedAt,
        services: {
          aiConfigured: Boolean(this.config.get<string>('ai.apiKey')),
          emailConfigured: this.config.get<string>('email.provider') === 'resend',
          storageProvider: this.config.get<string>('storage.provider', 'LOCAL'),
          monitoringConfigured: this.monitoring.configured(),
        },
      };
    } catch {
      return { status: 'degraded', database: 'error', uptimeSeconds: Math.floor(process.uptime()), responseMs: Date.now() - startedAt };
    }
  }

  @Get('platform')
  async getPlatform(): Promise<{ name: string }> {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: 'global' }, select: { name: true } });
    return { name: settings?.name ?? 'Qulay AI' };
  }
}
