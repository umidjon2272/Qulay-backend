import { ConflictException, ForbiddenException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PublicUser, toPublicUser } from '../users/types/public-user.type';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.type';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  refreshTokenExpiresAt: Date;
};

type AuthResponse = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const user = await this.usersService.create({
      email,
      passwordHash,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      avatarUrl: dto.avatarUrl,
      timezone: dto.timezone?.trim(),
      language: dto.language?.trim(),
    });

    return this.issueAndPersistTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.usersService.findByEmailWithPassword(email);

    if (!user || user.status === UserStatus.BLOCKED) {
      if (user?.status === UserStatus.BLOCKED) {
        throw new ForbiddenException('User is blocked');
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueAndPersistTokens(toPublicUser(user));
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponse> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const user = await this.usersService.findByIdWithPassword(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException('User is blocked');
    }

    const now = new Date();
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });
    const storedToken = await this.findMatchingRefreshToken(dto.refreshToken, activeTokens);
    if (!storedToken) {
      throw new UnauthorizedException('Invalid, expired, or revoked refresh token');
    }

    const tokenPair = await this.createTokenPair(user);
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

    return {
      user: toPublicUser(user),
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    };
  }

  async logout(dto: RefreshTokenDto): Promise<{ message: string }> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, revokedAt: null },
    });
    const storedToken = await this.findMatchingRefreshToken(dto.refreshToken, activeTokens);
    if (!storedToken) {
      throw new UnauthorizedException('Invalid or already revoked refresh token');
    }

    await this.prisma.refreshToken.updateMany({
      where: { id: storedToken.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Logged out successfully' };
  }

  async me(payload: JwtPayload): Promise<PublicUser> {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return user;
  }

  private async issueAndPersistTokens(user: PublicUser): Promise<AuthResponse> {
    const tokenPair = await this.createTokenPair(user);
    try {
      await this.prisma.refreshToken.create({
        data: {
          tokenHash: tokenPair.refreshTokenHash,
          userId: user.id,
          expiresAt: tokenPair.refreshTokenExpiresAt,
        },
      });
    } catch {
      throw new InternalServerErrorException('Unable to create authentication session');
    }

    return {
      user,
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    };
  }

  private async createTokenPair(user: Pick<PublicUser, 'id' | 'role'> | User): Promise<TokenPair> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload, this.jwtOptions(
      this.configService.getOrThrow<string>('jwt.accessSecret'),
      this.configService.getOrThrow<string>('jwt.accessExpiresIn'),
    ));
    const refreshToken = await this.jwtService.signAsync(payload, this.jwtOptions(
      this.configService.getOrThrow<string>('jwt.refreshSecret'),
      this.configService.getOrThrow<string>('jwt.refreshExpiresIn'),
    ));
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    if (!decoded?.exp) {
      throw new InternalServerErrorException('Unable to calculate refresh token expiration');
    }

    return {
      accessToken,
      refreshToken,
      refreshTokenHash: await bcrypt.hash(this.refreshTokenFingerprint(refreshToken), this.saltRounds()),
      refreshTokenExpiresAt: new Date(decoded.exp * 1000),
    };
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
    return bcrypt.hash(password, this.saltRounds());
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
