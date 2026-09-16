import { Body, Controller, Delete, Get, Headers, HttpCode, Logger, Param, Patch, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RateLimitException } from '../common/security/rate-limit.exception';
import { SecurityRateLimitService } from '../common/security/security-rate-limit.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { InstagramGraphService } from './instagram-graph.service';
import { InstagramIntegrationService } from './instagram-integration.service';
import { InstagramOAuthService } from './instagram-oauth.service';
import { InstagramSalesAgentService } from './instagram-sales-agent.service';

class ConnectInstagramDto {
  @IsString() @Matches(/^\d{5,40}$/) instagramUserId!: string;
  @IsString() @MinLength(20) accessToken!: string;
}

class UpdateInstagramSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() dmEnabled?: boolean;
  @IsOptional() @IsBoolean() commentsEnabled?: boolean;
  @IsOptional() @IsBoolean() imageVisionEnabled?: boolean;
}

class CreateInstagramAutomationDto {
  @IsString() @MinLength(2) @MaxLength(120) mediaId!: string;
  @IsString() @MinLength(1) @MaxLength(2000) triggerText!: string;
  @IsString() @MinLength(1) @MaxLength(4000) dmMessage!: string;
  @IsOptional() @IsString() @MaxLength(1000) publicReply?: string;
  @IsOptional() @IsBoolean() semanticMatch?: boolean;
  @IsOptional() @IsBoolean() sendPrivateReply?: boolean;
  @IsOptional() @IsBoolean() replyPublicly?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

class UpdateInstagramAutomationDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(2000) triggerText?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(4000) dmMessage?: string;
  @IsOptional() @IsString() @MaxLength(1000) publicReply?: string;
  @IsOptional() @IsBoolean() semanticMatch?: boolean;
  @IsOptional() @IsBoolean() sendPrivateReply?: boolean;
  @IsOptional() @IsBoolean() replyPublicly?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

@Controller('integrations/instagram')
export class InstagramController {
  private readonly logger = new Logger(InstagramController.name);

  constructor(
    private readonly integration: InstagramIntegrationService,
    private readonly graph: InstagramGraphService,
    private readonly sales: InstagramSalesAgentService,
    private readonly subscriptions: SubscriptionsService,
    private readonly oauth: InstagramOAuthService,
    private readonly config: ConfigService,
    private readonly rateLimiter: SecurityRateLimitService,
  ) {}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() response: Response,
  ) {
    if (mode === 'subscribe' && verifyToken && verifyToken === this.graph.webhookVerifyToken() && challenge) return response.status(200).send(challenge);
    return response.status(403).send('Forbidden');
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: unknown,
  ) {
    if (!this.sales.verifyWebhookSignature(request.rawBody, signature)) throw new UnauthorizedException('Invalid Instagram webhook signature');
    await this.sales.handleWebhook(body);
    return { received: true };
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser) { return this.integration.status(user.sub); }

  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
  async authUrl(@CurrentUser() user: AuthenticatedUser) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'INSTAGRAM_SALES');
    return { url: await this.oauth.connectUrl(user.sub) };
  }

  @Get('callback')
  async oauthCallback(
    @Query('code') rawCode: unknown,
    @Query('state') rawState: unknown,
    @Query('error') rawError: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const frontend = this.config.getOrThrow<string>('frontendUrl').split(',')[0].trim();
    const code = this.providerQueryValue(rawCode, 4096);
    const state = this.providerQueryValue(rawState, 4096);
    const oauthError = this.providerQueryValue(rawError, 300);
    if (!this.rateLimiter.isAllowed('instagram-callback-ip', request.ip ?? 'unknown', 30, 60 * 1000)) {
      throw new RateLimitException('Too many Instagram OAuth callback attempts. Try again later.');
    }
    this.logger.log({ event: 'instagram_oauth_callback_received', codePresent: Boolean(code), statePresent: Boolean(state), providerError: oauthError ?? null });
    try {
      await this.oauth.callback(code, state, oauthError);
      return response.redirect(`${frontend}/settings?tab=integrations&integration=instagram&status=connected&success=true`);
    } catch (error) {
      const codeValue = this.oauth.errorCode(error);
      const cancelled = codeValue === 'INSTAGRAM_OAUTH_CANCELLED';
      const params = new URLSearchParams({
        tab: 'integrations',
        integration: 'instagram',
        status: cancelled ? 'cancelled' : 'error',
        reason: cancelled ? 'cancelled' : 'unavailable',
        errorCode: codeValue,
      });
      this.logger.warn({ event: 'instagram_oauth_callback_failed', errorCode: codeValue });
      return response.redirect(`${frontend}/settings?${params.toString()}`);
    }
  }

  @Post('connect')
  @UseGuards(JwtAuthGuard)
  async connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectInstagramDto) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'INSTAGRAM_SALES');
    return this.integration.connect(user.sub, dto);
  }

  @Post('test')
  @UseGuards(JwtAuthGuard)
  async test(@CurrentUser() user: AuthenticatedUser) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'INSTAGRAM_SALES');
    return this.integration.test(user.sub);
  }

  @Patch('sales-agent')
  @UseGuards(JwtAuthGuard)
  async update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateInstagramSettingsDto) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'INSTAGRAM_SALES');
    return this.integration.updateSettings(user.sub, dto);
  }

  @Delete('disconnect')
  @UseGuards(JwtAuthGuard)
  disconnect(@CurrentUser() user: AuthenticatedUser) { return this.integration.disconnect(user.sub); }

  @Get('posts')
  @UseGuards(JwtAuthGuard)
  async posts(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'INSTAGRAM_SALES');
    const parsed = Number(limit ?? 25);
    return this.integration.listPosts(user.sub, Number.isFinite(parsed) ? parsed : 25);
  }

  @Get('automations')
  @UseGuards(JwtAuthGuard)
  async automations(@CurrentUser() user: AuthenticatedUser, @Query('activeOnly') activeOnly?: string) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'INSTAGRAM_SALES');
    return this.integration.listAutomations(user.sub, activeOnly === 'true');
  }

  @Post('automations')
  @UseGuards(JwtAuthGuard)
  async createAutomation(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInstagramAutomationDto) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'INSTAGRAM_SALES');
    return this.integration.createAutomation(user.sub, dto);
  }

  @Patch('automations/:id')
  @UseGuards(JwtAuthGuard)
  async updateAutomation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateInstagramAutomationDto) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'INSTAGRAM_SALES');
    return this.integration.updateAutomation(user.sub, id, dto);
  }

  @Delete('automations/:id')
  @UseGuards(JwtAuthGuard)
  async deleteAutomation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'INSTAGRAM_SALES');
    return this.integration.deleteAutomation(user.sub, id);
  }

  private providerQueryValue(value: unknown, maxLength: number): string | undefined {
    if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return undefined;
    return value;
  }
}
