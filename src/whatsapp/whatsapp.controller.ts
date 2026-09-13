import { Body, Controller, Delete, Get, Headers, HttpCode, Patch, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WhatsAppCloudService } from './whatsapp-cloud.service';
import { WhatsAppSalesAgentService } from './whatsapp-sales-agent.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

class ConnectWhatsAppDto {
  @IsString() @Matches(/^\d{5,30}$/) phoneNumberId!: string;
  @IsOptional() @IsString() @Matches(/^\d{5,30}$/) wabaId?: string;
  @IsString() @MinLength(20) accessToken!: string;
}


class EmbeddedConnectWhatsAppDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @Matches(/^\d{5,30}$/) phoneNumberId!: string;
  @IsString() @Matches(/^\d{5,30}$/) wabaId!: string;
}

class UpdateWhatsAppSalesDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() salesOnly?: boolean;
  @IsOptional() @IsBoolean() voiceEnabled?: boolean;
}

@Controller('integrations/whatsapp')
export class WhatsAppController {
  constructor(private readonly sales: WhatsAppSalesAgentService, private readonly cloud: WhatsAppCloudService, private readonly subscriptions: SubscriptionsService) {}

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

  @Get('embedded-config')
  @UseGuards(JwtAuthGuard)
  async embeddedConfig(@CurrentUser() user: AuthenticatedUser) { await this.subscriptions.assertFeatureAllowed(user.sub, 'WHATSAPP_SALES'); return this.cloud.embeddedSignupPublicConfig(); }

  @Post('embedded-connect')
  @UseGuards(JwtAuthGuard)
  async embeddedConnect(@CurrentUser() user: AuthenticatedUser, @Body() dto: EmbeddedConnectWhatsAppDto) { await this.subscriptions.assertFeatureAllowed(user.sub, 'WHATSAPP_SALES'); return this.sales.connectEmbedded(user.sub, dto); }

  @Post('connect')
  @UseGuards(JwtAuthGuard)
  async connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectWhatsAppDto) { await this.subscriptions.assertFeatureAllowed(user.sub, 'WHATSAPP_SALES'); return this.sales.connect(user.sub, dto); }

  @Post('test')
  @UseGuards(JwtAuthGuard)
  async test(@CurrentUser() user: AuthenticatedUser) { await this.subscriptions.assertFeatureAllowed(user.sub, 'WHATSAPP_SALES'); return this.sales.test(user.sub); }

  @Patch('sales-agent')
  @UseGuards(JwtAuthGuard)
  async update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateWhatsAppSalesDto) { await this.subscriptions.assertFeatureAllowed(user.sub, 'WHATSAPP_SALES'); return this.sales.updateSettings(user.sub, dto); }

  @Delete('disconnect')
  @UseGuards(JwtAuthGuard)
  disconnect(@CurrentUser() user: AuthenticatedUser) { return this.sales.disconnect(user.sub); }
}
