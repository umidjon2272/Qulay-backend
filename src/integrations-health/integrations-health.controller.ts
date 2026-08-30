import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { IntegrationsHealthService } from './integrations-health.service';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsHealthController {
  constructor(private readonly integrationsHealth: IntegrationsHealthService) {}

  @Get('health')
  health(@CurrentUser() user: AuthenticatedUser) {
    return this.integrationsHealth.getHealthForUser(user.sub);
  }
}
