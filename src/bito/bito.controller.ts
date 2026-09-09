import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BitoIntegrationService } from './bito-integration.service';
import { ConnectBitoDto } from './dto/bito.dto';

@Controller('integrations/bito')
@UseGuards(JwtAuthGuard)
export class BitoController {
  constructor(private readonly bito: BitoIntegrationService) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.bito.status(user.sub);
  }

  @Post('connect')
  connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectBitoDto) {
    return this.bito.connect(user.sub, dto);
  }

  @Post('test')
  test(@CurrentUser() user: AuthenticatedUser) {
    return this.bito.test(user.sub);
  }

  @Get('tools')
  async tools(@CurrentUser() user: AuthenticatedUser) {
    const tools = await this.bito.listToolsForUser(user.sub);
    return tools.map((tool) => ({ name: tool.name, title: tool.title ?? null, description: tool.description ?? null, readOnly: tool.annotations?.readOnlyHint === true }));
  }

  @Delete('disconnect')
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.bito.disconnect(user.sub);
  }
}
