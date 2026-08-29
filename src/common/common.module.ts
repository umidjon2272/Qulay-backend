import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { SecurityRateLimitService } from './security/security-rate-limit.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { ProductionExceptionFilter } from './security/production-exception.filter';

@Global()
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  providers: [JwtAuthGuard, RolesGuard, SecurityRateLimitService, MonitoringService, ProductionExceptionFilter],
  exports: [JwtModule, JwtAuthGuard, RolesGuard, SecurityRateLimitService, MonitoringService, ProductionExceptionFilter],
})
export class CommonModule {}
