import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetService } from './password-reset/password-reset.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.type';
import { SecurityRateLimitService } from '../common/security/security-rate-limit.service';
import { RateLimitException } from '../common/security/rate-limit.exception';
import { SECURITY_LIMITS } from '../common/security/security-limits.constants';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly rateLimiter: SecurityRateLimitService,
  ) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: Request) {
    return this.passwordResetService.forgotPassword(dto, request.ip ?? 'unknown');
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request) {
    return this.passwordResetService.resetPassword(dto, request.ip ?? 'unknown');
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    const ip = request.ip ?? 'unknown';
    if (!this.rateLimiter.isAllowed('register-ip', ip, SECURITY_LIMITS.registerPerIp.max, SECURITY_LIMITS.registerPerIp.windowMs)
      || !this.rateLimiter.isAllowed('register-email', dto.email.trim().toLowerCase(), SECURITY_LIMITS.registerPerEmail.max, SECURITY_LIMITS.registerPerEmail.windowMs)) {
      throw new RateLimitException('Too many registration attempts. Try again later.');
    }
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() request: Request) {
    const ip = request.ip ?? 'unknown';
    if (!this.rateLimiter.isAllowed('login-ip', ip, SECURITY_LIMITS.loginPerIp.max, SECURITY_LIMITS.loginPerIp.windowMs)
      || !this.rateLimiter.isAllowed('login-email', dto.email.trim().toLowerCase(), SECURITY_LIMITS.loginPerEmail.max, SECURITY_LIMITS.loginPerEmail.windowMs)) {
      throw new RateLimitException('Too many login attempts. Try again later.');
    }
    return this.authService.login(dto, ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto);
  }
}
