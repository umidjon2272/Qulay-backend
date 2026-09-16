import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InstagramCryptoService } from './instagram-crypto.service';
import { InstagramGraphService } from './instagram-graph.service';
import { InstagramIntegrationService } from './instagram-integration.service';

@Module({
  imports: [PrismaModule],
  providers: [InstagramCryptoService, InstagramGraphService, InstagramIntegrationService],
  exports: [InstagramCryptoService, InstagramGraphService, InstagramIntegrationService],
})
export class InstagramCoreModule {}
