import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BitoController } from './bito.controller';
import { BitoCryptoService } from './bito-crypto.service';
import { BitoIntegrationService } from './bito-integration.service';
import { BitoMcpClient } from './bito-mcp.client';
import { BitoToolBridgeService } from './bito-tool-bridge.service';

@Module({
  imports: [PrismaModule, ActivityLogModule],
  controllers: [BitoController],
  providers: [BitoCryptoService, BitoMcpClient, BitoIntegrationService, BitoToolBridgeService],
  exports: [BitoIntegrationService, BitoToolBridgeService],
})
export class BitoModule {}
