import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { SecurityRateLimitService } from './security/security-rate-limit.service';

@Global()
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  providers: [JwtAuthGuard, RolesGuard, SecurityRateLimitService],
  exports: [JwtModule, JwtAuthGuard, RolesGuard, SecurityRateLimitService],
})
export class CommonModule {}
