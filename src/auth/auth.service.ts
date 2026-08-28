import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PublicUser, toPublicUser } from '../users/types/public-user.type';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.type';
import { LoginBruteForceService } from './login-brute-force.service';
import { AuthSecurityAuditService } from './auth-security-audit.service';
import { RateLimitException } from '../common/security/rate-limit.exception';
import { hashPassword } from './password-hash';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  tokenFingerprint: string;
  refreshTokenExpiresAt: Date;
};

type AuthResponse = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly bruteForce: LoginBruteForceService,
    private readonly securityAudit: AuthSecurityAuditService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const startedAt = this.timestamp();
    this.logTiming('register:start', startedAt);
    const email = this.normalizeEmail(dto.email);
    let stageStartedAt = this.timestamp();
    const existingUser = await this.usersService.findByEmail(email);
    this.logTiming('register:user_lookup', stageStartedAt);
    if (existingUser) {
      await this.securityAudit.recordUserAction(existingUser.id, AuthSecurityAuditService.actions.REGISTER_FAILED, 'email_already_registered');
      throw new ConflictException('Email is already registered');
    }

    stageStartedAt = this.timestamp();
    const passwordHash = await this.hashPassword(dto.password);
    this.logTiming('register:password_hash', stageStartedAt);

    stageStartedAt = this.timestamp();
    const user = await this.usersService.create({
      email,
      passwordHash,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      avatarUrl: dto.avatarUrl,
      timezone: dto.timezone?.trim(),
      language: dto.language?.trim(),
    });
    this.logTiming('register:user_create', stageStartedAt);

    await this.securityAudit.recordUserAction(user.id, AuthSecurityAuditService.actions.REGISTERED);
    return this.issueAndPersistTokens(user, 'register', startedAt);
  }

  async login(dto: LoginDto, ip = 'unknown'): Promise<AuthResponse> {
    const startedAt = this.timestamp();
    this.logTiming('login:start', startedAt);
    const email = this.normalizeEmail(dto.email);
    if (this.bruteForce.isBlocked(ip, email)) {
      this.securityAudit.recordSuspicious(AuthSecurityAuditService.actions.LOGIN_BLOCKED, ip, email);
      throw new RateLimitException('Too many login attempts. Try again later.');
    }
    let stageStartedAt = this.timestamp();
    const user = await this.usersService.findByEmailWithPassword(email);
    this.logTiming('login:user_lookup', stageStartedAt);

    if (!user || user.status === UserStatus.BLOCKED) {
      if (user?.status === UserStatus.BLOCKED) {
        await this.securityAudit.recordUserAction(user.id, AuthSecurityAuditService.actions.LOGIN_FAILED, 'blocked_user');
        throw new ForbiddenException('User is blocked');
      }
      const locked = this.bruteForce.recordFailure(ip, email);
      this.securityAudit.recordSuspicious(locked ? AuthSecurityAuditService.actions.LOGIN_BLOCKED : AuthSecurityAuditService.actions.LOGIN_FAILED, ip, email);
      if (locked) throw new RateLimitException('Too many login attempts. Try again later.');
      throw new UnauthorizedException('Invalid email or password');
    }

    stageStartedAt = this.timestamp();
    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    this.logTiming('login:bcrypt_compare', stageStartedAt);
    if (!passwordMatches) {
      const locked = this.bruteForce.recordFailure(ip, email);
      await this.securityAudit.recordUserAction(user.id, AuthSecurityAuditService.actions.LOGIN_FAILED, 'invalid_credentials');
      this.securityAudit.recordSuspicious(locked ? AuthSecurityAuditService.actions.LOGIN_BLOCKED : AuthSecurityAuditService.actions.LOGIN_FAILED, ip, email);
      if (locked) throw new RateLimitException('Too many login attempts. Try again later.');
      throw new UnauthorizedException('Invalid email or password');
    }

    this.bruteForce.recordSuccess(ip, email);
    await this.securityAudit.recordUserAction(user.id, AuthSecurityAuditService.actions.LOGIN_SUCCEEDED);
    return this.issueAndPersistTokens(toPublicUser(user), 'login', startedAt);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponse> {
    const startedAt = this.timestamp();
    this.logTiming('refresh:start', startedAt);
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    let stageStartedAt = this.timestamp();
    const user = await this.usersService.findByIdWithPassword(payload.sub);
    this.logTiming('refresh:user_lookup', stageStartedAt);

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException('User is blocked');
    }

    const now = new Date();
    const tokenFingerprint = this.refreshTokenFingerprint(dto.refreshToken);
    stageStartedAt = this.timestamp();
    let storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        userId: user.id,
        tokenFingerprint,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });

    // Rows created before tokenFingerprint was introduced still use the
    // bcrypt fallback, but only those legacy rows are scanned.
    if (!storedToken) {
      const legacyTokens = await this.prisma.refreshToken.findMany({
        where: {
          userId: user.id,
          tokenFingerprint: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true, tokenHash: true },
      });
      storedToken = await this.findMatchingRefreshToken(dto.refreshToken, legacyTokens);
    }
    this.logTiming('refresh:token_lookup_and_compare', stageStartedAt);
    if (!storedToken) {
      throw new UnauthorizedException('Invalid, expired, or revoked refresh token');
    }

    const tokenPair = await this.createTokenPair(user, 'refresh');
    stageStartedAt = this.timestamp();
    try {
      await this.prisma.$transaction(async (transaction) => {
        const revoked = await transaction.refreshToken.updateMany({
          where: { id: storedToken.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        if (revoked.count !== 1) {
          throw new UnauthorizedException('Refresh token has already been rotated');
        }

        await transaction.refreshToken.create({
          data: {
            tokenHash: tokenPair.refreshTokenHash,
            tokenFingerprint: tokenPair.tokenFingerprint,
            userId: user.id,
            expiresAt: tokenPair.refreshTokenExpiresAt,
          },
        });
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('Unable to rotate refresh token');
    }
    this.logTiming('refresh:rotation_persist', stageStartedAt);
    this.logTiming('refresh:end', startedAt);
    await this.securityAudit.recordUserAction(user.id, AuthSecurityAuditService.actions.REFRESH_SUCCEEDED);

    return {
      user: toPublicUser(user),
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    };
  }

  async logout(dto: RefreshTokenDto): Promise<{ message: string }> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const tokenFingerprint = this.refreshTokenFingerprint(dto.refreshToken);
    let storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        userId: payload.sub,
        tokenFingerprint,
        revokedAt: null,
      },
      select: { id: true },
    });

    if (!storedToken) {
      const legacyTokens = await this.prisma.refreshToken.findMany({
        where: { userId: payload.sub, tokenFingerprint: null, revokedAt: null },
        select: { id: true, tokenHash: true },
      });
      storedToken = await this.findMatchingRefreshToken(dto.refreshToken, legacyTokens);
    }
    if (!storedToken) {
      throw new UnauthorizedException('Invalid or already revoked refresh token');
    }

    await this.prisma.refreshToken.updateMany({
      where: { id: storedToken.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.securityAudit.recordUserAction(payload.sub, AuthSecurityAuditService.actions.LOGOUT_COMPLETED);

    return { message: 'Logged out successfully' };
  }

  async me(payload: JwtPayload): Promise<PublicUser> {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return user;
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{
    success: true;
    message: string;
    requiresRelogin: true;
  }> {
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const currentPasswordMatches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!currentPasswordMatches) {
      throw new BadRequestException('Joriy parol noto‘g‘ri');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Yangi parol eski parol bilan bir xil bo‘lmasin');
    }

    const newPasswordHash = await this.hashPassword(dto.newPassword);
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: userId },
          data: { passwordHash: newPasswordHash },
        });
        await transaction.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      });
    } catch {
      throw new InternalServerErrorException('Unable to change password');
    }
    await this.securityAudit.recordUserAction(userId, AuthSecurityAuditService.actions.PASSWORD_CHANGED);

    return {
      success: true,
      message: 'Parol muvaffaqiyatli o‘zgartirildi',
      requiresRelogin: true,
    };
  }

  private async issueAndPersistTokens(user: PublicUser, operation: 'register' | 'login', startedAt: bigint): Promise<AuthResponse> {
    const tokenStartedAt = this.timestamp();
    const tokenPair = await this.createTokenPair(user, operation);
    this.logTiming(`${operation}:token_create`, tokenStartedAt);

    const persistStartedAt = this.timestamp();
    try {
      await this.prisma.refreshToken.create({
        data: {
          tokenHash: tokenPair.refreshTokenHash,
          tokenFingerprint: tokenPair.tokenFingerprint,
          userId: user.id,
          expiresAt: tokenPair.refreshTokenExpiresAt,
        },
      });
    } catch {
      throw new InternalServerErrorException('Unable to create authentication session');
    }
    this.logTiming(`${operation}:refresh_token_persist`, persistStartedAt);
    this.logTiming(`${operation}:end`, startedAt);

    return {
      user,
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    };
  }

  private async createTokenPair(user: Pick<PublicUser, 'id' | 'role'> | User, operation: 'register' | 'login' | 'refresh'): Promise<TokenPair> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    let stageStartedAt = this.timestamp();
    const accessToken = await this.jwtService.signAsync(payload, this.jwtOptions(
      this.configService.getOrThrow<string>('jwt.accessSecret'),
      this.configService.getOrThrow<string>('jwt.accessExpiresIn'),
    ));
    this.logTiming(`${operation}:access_token_sign`, stageStartedAt);

    stageStartedAt = this.timestamp();
    const refreshToken = await this.jwtService.signAsync(payload, this.jwtOptions(
      this.configService.getOrThrow<string>('jwt.refreshSecret'),
      this.configService.getOrThrow<string>('jwt.refreshExpiresIn'),
    ));
    this.logTiming(`${operation}:refresh_token_sign`, stageStartedAt);
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    if (!decoded?.exp) {
      throw new InternalServerErrorException('Unable to calculate refresh token expiration');
    }

    const tokenFingerprint = this.refreshTokenFingerprint(refreshToken);
    stageStartedAt = this.timestamp();
    const refreshTokenHash = await bcrypt.hash(tokenFingerprint, this.saltRounds());
    this.logTiming(`${operation}:refresh_token_hash`, stageStartedAt);

    return {
      accessToken,
      refreshToken,
      refreshTokenHash,
      tokenFingerprint,
      refreshTokenExpiresAt: new Date(decoded.exp * 1000),
    };
  }

  private timestamp(): bigint {
    return process.hrtime.bigint();
  }

  private logTiming(label: string, startedAt: bigint): void {
    if (!this.configService.get<boolean>('authTimingLogs', false)) return;
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    this.logger.log(`${label} ${elapsedMs.toFixed(1)}ms`);
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      });
      if (!payload.sub || !payload.role) {
        throw new Error('Invalid token payload');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private async findMatchingRefreshToken(
    rawToken: string,
    storedTokens: Array<{ id: string; tokenHash: string }>,
  ): Promise<{ id: string } | null> {
    const tokenFingerprint = this.refreshTokenFingerprint(rawToken);
    for (const storedToken of storedTokens) {
      if (await bcrypt.compare(tokenFingerprint, storedToken.tokenHash)) {
        return { id: storedToken.id };
      }
    }
    return null;
  }

  private async hashPassword(password: string): Promise<string> {
    return hashPassword(password, this.saltRounds());
  }

  private refreshTokenFingerprint(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private saltRounds(): number {
    return this.configService.get<number>('bcryptSaltRounds', 12);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private jwtOptions(secret: string, expiresIn: string): JwtSignOptions {
    return {
      secret,
      expiresIn: expiresIn as JwtSignOptions['expiresIn'],
      jwtid: randomUUID(),
    };
  }
}
