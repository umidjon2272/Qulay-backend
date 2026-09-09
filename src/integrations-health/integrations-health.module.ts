import { Module } from '@nestjs/common';
import { GoogleModule } from '../google/google.module';
import { TelegramModule } from '../telegram/telegram.module';
import { BitoModule } from '../bito/bito.module';
import { IntegrationsHealthController } from './integrations-health.controller';
import { IntegrationsHealthService } from './integrations-health.service';

@Module({
  imports: [GoogleModule, TelegramModule, BitoModule],
  controllers: [IntegrationsHealthController],
  providers: [IntegrationsHealthService],
  exports: [IntegrationsHealthService],
})
export class IntegrationsHealthModule {}
