import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('platform')
  async getPlatform(): Promise<{ name: string }> {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: 'global' }, select: { name: true } });
    return { name: settings?.name ?? 'Qulay AI' };
  }
}
