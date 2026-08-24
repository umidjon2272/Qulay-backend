"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const bcrypt = require("bcryptjs");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const users_service_1 = require("../users/users.service");
const public_user_type_1 = require("../users/types/public-user.type");
let AuthService = AuthService_1 = class AuthService {
    constructor(usersService, prisma, jwtService, configService) {
        this.usersService = usersService;
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.configService = configService;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    async register(dto) {
        const startedAt = this.timestamp();
        this.logTiming('register:start', startedAt);
        const email = this.normalizeEmail(dto.email);
        let stageStartedAt = this.timestamp();
        const existingUser = await this.usersService.findByEmail(email);
        this.logTiming('register:user_lookup', stageStartedAt);
        if (existingUser) {
            throw new common_1.ConflictException('Email is already registered');
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
        return this.issueAndPersistTokens(user, 'register', startedAt);
    }
    async login(dto) {
        const startedAt = this.timestamp();
        this.logTiming('login:start', startedAt);
        const email = this.normalizeEmail(dto.email);
        let stageStartedAt = this.timestamp();
        const user = await this.usersService.findByEmailWithPassword(email);
        this.logTiming('login:user_lookup', stageStartedAt);
        if (!user || user.status === client_1.UserStatus.BLOCKED) {
            if (user?.status === client_1.UserStatus.BLOCKED) {
                throw new common_1.ForbiddenException('User is blocked');
            }
            throw new common_1.UnauthorizedException('Invalid email or password');
        }
        stageStartedAt = this.timestamp();
        const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
        this.logTiming('login:bcrypt_compare', stageStartedAt);
        if (!passwordMatches) {
            throw new common_1.UnauthorizedException('Invalid email or password');
        }
        return this.issueAndPersistTokens((0, public_user_type_1.toPublicUser)(user), 'login', startedAt);
    }
    async refresh(dto) {
        const startedAt = this.timestamp();
        this.logTiming('refresh:start', startedAt);
        const payload = await this.verifyRefreshToken(dto.refreshToken);
        let stageStartedAt = this.timestamp();
        const user = await this.usersService.findByIdWithPassword(payload.sub);
        this.logTiming('refresh:user_lookup', stageStartedAt);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        if (user.status === client_1.UserStatus.BLOCKED) {
            throw new common_1.ForbiddenException('User is blocked');
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
            throw new common_1.UnauthorizedException('Invalid, expired, or revoked refresh token');
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
                    throw new common_1.UnauthorizedException('Refresh token has already been rotated');
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
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException) {
                throw error;
            }
            throw new common_1.InternalServerErrorException('Unable to rotate refresh token');
        }
        this.logTiming('refresh:rotation_persist', stageStartedAt);
        this.logTiming('refresh:end', startedAt);
        return {
            user: (0, public_user_type_1.toPublicUser)(user),
            accessToken: tokenPair.accessToken,
            refreshToken: tokenPair.refreshToken,
        };
    }
    async logout(dto) {
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
            throw new common_1.UnauthorizedException('Invalid or already revoked refresh token');
        }
        await this.prisma.refreshToken.updateMany({
            where: { id: storedToken.id, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        return { message: 'Logged out successfully' };
    }
    async me(payload) {
        const user = await this.usersService.findById(payload.sub);
        if (!user) {
            throw new common_1.UnauthorizedException('User no longer exists');
        }
        return user;
    }
    async issueAndPersistTokens(user, operation, startedAt) {
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
        }
        catch {
            throw new common_1.InternalServerErrorException('Unable to create authentication session');
        }
        this.logTiming(`${operation}:refresh_token_persist`, persistStartedAt);
        this.logTiming(`${operation}:end`, startedAt);
        return {
            user,
            accessToken: tokenPair.accessToken,
            refreshToken: tokenPair.refreshToken,
        };
    }
    async createTokenPair(user, operation) {
        const payload = { sub: user.id, role: user.role };
        let stageStartedAt = this.timestamp();
        const accessToken = await this.jwtService.signAsync(payload, this.jwtOptions(this.configService.getOrThrow('jwt.accessSecret'), this.configService.getOrThrow('jwt.accessExpiresIn')));
        this.logTiming(`${operation}:access_token_sign`, stageStartedAt);
        stageStartedAt = this.timestamp();
        const refreshToken = await this.jwtService.signAsync(payload, this.jwtOptions(this.configService.getOrThrow('jwt.refreshSecret'), this.configService.getOrThrow('jwt.refreshExpiresIn')));
        this.logTiming(`${operation}:refresh_token_sign`, stageStartedAt);
        const decoded = this.jwtService.decode(refreshToken);
        if (!decoded?.exp) {
            throw new common_1.InternalServerErrorException('Unable to calculate refresh token expiration');
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
    timestamp() {
        return process.hrtime.bigint();
    }
    logTiming(label, startedAt) {
        if (!this.configService.get('authTimingLogs', false))
            return;
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        this.logger.log(`${label} ${elapsedMs.toFixed(1)}ms`);
    }
    async verifyRefreshToken(token) {
        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: this.configService.getOrThrow('jwt.refreshSecret'),
            });
            if (!payload.sub || !payload.role) {
                throw new Error('Invalid token payload');
            }
            return payload;
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired refresh token');
        }
    }
    async findMatchingRefreshToken(rawToken, storedTokens) {
        const tokenFingerprint = this.refreshTokenFingerprint(rawToken);
        for (const storedToken of storedTokens) {
            if (await bcrypt.compare(tokenFingerprint, storedToken.tokenHash)) {
                return { id: storedToken.id };
            }
        }
        return null;
    }
    async hashPassword(password) {
        return bcrypt.hash(password, this.saltRounds());
    }
    refreshTokenFingerprint(token) {
        return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
    }
    saltRounds() {
        return this.configService.get('bcryptSaltRounds', 12);
    }
    normalizeEmail(email) {
        return email.trim().toLowerCase();
    }
    jwtOptions(secret, expiresIn) {
        return {
            secret,
            expiresIn: expiresIn,
            jwtid: (0, node_crypto_1.randomUUID)(),
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map