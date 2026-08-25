import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { ContactsModule } from '../contacts/contacts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramController } from './telegram.controller';
import { TelegramIntegrationService } from './telegram-integration.service';
import { TelegramClientService, TeleprotoTelegramClientService } from './telegram-client.service';
import { TelegramCryptoService } from './telegram-crypto.service';

@Module({
  imports: [PrismaModule, ActivityLogModule, ContactsModule],
  controllers: [TelegramController],
  providers: [
    TelegramCryptoService,
    TeleprotoTelegramClientService,
    { provide: TelegramClientService, useExisting: TeleprotoTelegramClientService },
    TelegramIntegrationService,
  ],
  exports: [TelegramIntegrationService, TelegramClientService, TelegramCryptoService],
})
export class TelegramModule {}
