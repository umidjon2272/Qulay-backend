import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramController } from './telegram.controller';
import { TelegramIntegrationService } from './telegram-integration.service';
import { GramJsTelegramClientService, TelegramClientService } from './telegram-client.service';
import { TelegramCryptoService } from './telegram-crypto.service';
import { TelegramLoginDiagnosticService } from './telegram-login-diagnostic.service';

@Module({
  imports: [PrismaModule, ActivityLogModule],
  controllers: [TelegramController],
  providers: [
    TelegramCryptoService,
    GramJsTelegramClientService,
    { provide: TelegramClientService, useExisting: GramJsTelegramClientService },
    TelegramIntegrationService,
    TelegramLoginDiagnosticService,
  ],
  exports: [TelegramIntegrationService, TelegramClientService, TelegramCryptoService, TelegramLoginDiagnosticService],
})
export class TelegramModule {}
