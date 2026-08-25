import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleApiClientService } from './google-api-client.service';
import { GoogleAuthService } from './google-auth.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleController } from './google.controller';
import { GoogleCryptoService } from './google-crypto.service';
import { GoogleDriveService } from './google-drive.service';

@Module({
  imports: [PrismaModule, ActivityLogModule],
  controllers: [GoogleController],
  providers: [GoogleApiClientService, GoogleAuthService, GoogleCalendarService, GoogleCryptoService, GoogleDriveService],
  exports: [GoogleAuthService, GoogleCalendarService, GoogleDriveService, GoogleApiClientService, GoogleCryptoService],
})
export class GoogleModule {}

