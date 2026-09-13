import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BitoController } from './bito.controller';
import { BitoCryptoService } from './bito-crypto.service';
import { BitoIntegrationService } from './bito-integration.service';
import { BitoMcpClient } from './bito-mcp.client';
import { BitoOAuthService } from './bito-oauth.service';
import { BitoUrlPolicyService } from './bito-url-policy.service';
import { BitoToolBridgeService } from './bito-tool-bridge.service';

@Module({
  imports: [PrismaModule, ActivityLogModule, SubscriptionsModule],
  controllers: [BitoController],
  providers: [BitoCryptoService, BitoUrlPolicyService, BitoMcpClient, BitoOAuthService, BitoIntegrationService, BitoToolBridgeService],
  exports: [BitoIntegrationService, BitoToolBridgeService, BitoOAuthService],
})
export class BitoModule {}
