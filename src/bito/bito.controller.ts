import { Body, Controller, Delete, Get, Logger, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RateLimitException } from '../common/security/rate-limit.exception';
import { SecurityRateLimitService } from '../common/security/security-rate-limit.service';
import { BitoIntegrationService } from './bito-integration.service';
import { BitoOAuthService } from './bito-oauth.service';
import { ConnectBitoDto } from './dto/bito.dto';
import { bitoToolSideEffect } from './bito-tool-policy';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Controller('integrations/bito')
export class BitoController {
  private readonly logger = new Logger(BitoController.name);

  constructor(
    private readonly bito: BitoIntegrationService,
    private readonly oauth: BitoOAuthService,
    private readonly config: ConfigService,
    private readonly rateLimiter: SecurityRateLimitService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.bito.status(user.sub);
  }

  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
  async authUrl(@CurrentUser() user: AuthenticatedUser) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'BITO');
    const result = await this.bito.startOAuth(user.sub);
    return result.status === 'connected'
      ? { connected: true, url: null, serverName: result.serverName, toolCount: result.toolCount }
      : { connected: false, url: result.authorizationUrl, serverName: result.serverName, toolCount: 0 };
  }

  @Get('client-metadata')
  clientMetadata() {
    return this.oauth.clientMetadata();
  }

  @Get('callback')
  async callback(
    @Query('code') rawCode: unknown,
    @Query('state') rawState: unknown,
    @Query('error') rawError: unknown,
    @Query('iss') rawIssuer: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const frontend = this.config.getOrThrow<string>('frontendUrl').split(',')[0].trim();
    const code = this.providerQueryValue(rawCode, 4096);
    const state = this.providerQueryValue(rawState, 4096);
    const oauthError = this.providerQueryValue(rawError, 300);
    const issuer = this.providerQueryValue(rawIssuer, 2048);
    if (!this.rateLimiter.isAllowed('bito-callback-ip', request.ip ?? 'unknown', 30, 60 * 1000)) {
      throw new RateLimitException('Too many Bito OAuth callback attempts. Try again later.');
    }
    this.logger.log({ event: 'bito_oauth_callback_received', codePresent: Boolean(code), statePresent: Boolean(state), providerError: oauthError ?? null });
    try {
      await this.oauth.callback(code, state, oauthError, issuer);
      return response.redirect(`${frontend}/settings?tab=integrations&integration=bito&status=connected&success=true`);
    } catch (error) {
      const codeValue = this.errorCode(error);
      const cancelled = codeValue === 'BITO_OAUTH_CANCELLED';
      const params = new URLSearchParams({
        tab: 'integrations',
        integration: 'bito',
        status: cancelled ? 'cancelled' : 'error',
        reason: cancelled ? 'cancelled' : 'unavailable',
        errorCode: codeValue,
      });
      this.logger.warn({ event: 'bito_oauth_callback_failed', errorCode: codeValue });
      return response.redirect(`${frontend}/settings?${params.toString()}`);
    }
  }

  // Backwards-compatible manual credentials endpoint.
  @Post('connect')
  @UseGuards(JwtAuthGuard)
  async connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectBitoDto) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'BITO');
    return this.bito.connect(user.sub, dto);
  }

  @Post('test')
  @UseGuards(JwtAuthGuard)
  async test(@CurrentUser() user: AuthenticatedUser) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'BITO');
    return this.bito.test(user.sub);
  }

  @Get('tools')
  @UseGuards(JwtAuthGuard)
  async tools(@CurrentUser() user: AuthenticatedUser) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'BITO');
    const tools = await this.bito.listToolsForUser(user.sub);
    return tools.map((tool) => ({
      name: tool.name,
      title: tool.title ?? null,
      description: tool.description ?? null,
      readOnly: bitoToolSideEffect(tool) === 'READ',
    }));
  }

  @Delete('disconnect')
  @UseGuards(JwtAuthGuard)
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.bito.disconnect(user.sub);
  }

  private providerQueryValue(value: unknown, maxLength: number): string | undefined {
    if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return undefined;
    return value;
  }

  private errorCode(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error ?? '');
    return text.match(/BITO_[A-Z0-9_]+/)?.[0] ?? 'BITO_OAUTH_FAILED';
  }
}
