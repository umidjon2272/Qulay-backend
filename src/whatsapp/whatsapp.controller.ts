import { Body, Controller, Delete, Get, Headers, HttpCode, Patch, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WhatsAppCloudService } from './whatsapp-cloud.service';
import { WhatsAppSalesAgentService } from './whatsapp-sales-agent.service';

class ConnectWhatsAppDto {
  @IsString() @Matches(/^\d{5,30}$/) phoneNumberId!: string;
  @IsOptional() @IsString() @Matches(/^\d{5,30}$/) wabaId?: string;
  @IsString() @MinLength(20) accessToken!: string;
}

class UpdateWhatsAppSalesDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() salesOnly?: boolean;
  @IsOptional() @IsBoolean() voiceEnabled?: boolean;
}

@Controller('integrations/whatsapp')
export class WhatsAppController {
  constructor(private readonly sales: WhatsAppSalesAgentService, private readonly cloud: WhatsAppCloudService) {}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() response: Response,
  ) {
    if (mode === 'subscribe' && verifyToken && verifyToken === this.cloud.webhookVerifyToken() && challenge) return response.status(200).send(challenge);
    return response.status(403).send('Forbidden');
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() request: Request & { rawBody?: Buffer }, @Headers('x-hub-signature-256') signature: string | undefined, @Body() body: unknown) {
    if (!this.sales.verifyWebhookSignature(request.rawBody, signature)) throw new UnauthorizedException('Invalid WhatsApp webhook signature');
    await this.sales.handleWebhook(body as Parameters<WhatsAppSalesAgentService['handleWebhook']>[0]);
    return { received: true };
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser) { return this.sales.getSettings(user.sub); }

  @Post('connect')
  @UseGuards(JwtAuthGuard)
  connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectWhatsAppDto) { return this.sales.connect(user.sub, dto); }

  @Post('test')
  @UseGuards(JwtAuthGuard)
  test(@CurrentUser() user: AuthenticatedUser) { return this.sales.test(user.sub); }

  @Patch('sales-agent')
  @UseGuards(JwtAuthGuard)
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateWhatsAppSalesDto) { return this.sales.updateSettings(user.sub, dto); }

  @Delete('disconnect')
  @UseGuards(JwtAuthGuard)
  disconnect(@CurrentUser() user: AuthenticatedUser) { return this.sales.disconnect(user.sub); }
}
