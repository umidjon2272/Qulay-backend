import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InstagramCryptoService } from './instagram-crypto.service';
import { InstagramGraphService } from './instagram-graph.service';
import { InstagramIntegrationService } from './instagram-integration.service';
import { InstagramOAuthService } from './instagram-oauth.service';

@Module({
  imports: [PrismaModule],
  providers: [InstagramCryptoService, InstagramGraphService, InstagramIntegrationService, InstagramOAuthService],
  exports: [InstagramCryptoService, InstagramGraphService, InstagramIntegrationService, InstagramOAuthService],
})
export class InstagramCoreModule {}
