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
let AuthService = class AuthService {
    constructor(usersService, prisma, jwtService, configService) {
        this.usersService = usersService;
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.configService = configService;
    }
    async register(dto) {
        const email = this.normalizeEmail(dto.email);
        const existingUser = await this.usersService.findByEmail(email);
        if (existingUser) {
            throw new common_1.ConflictException('Email is already registered');
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
    async login(dto) {
        const email = this.normalizeEmail(dto.email);
        const user = await this.usersService.findByEmailWithPassword(email);
        if (!user || user.status === client_1.UserStatus.BLOCKED) {
            if (user?.status === client_1.UserStatus.BLOCKED) {
                throw new common_1.ForbiddenException('User is blocked');
            }
            throw new common_1.UnauthorizedException('Invalid email or password');
        }
        const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
        if (!passwordMatches) {
            throw new common_1.UnauthorizedException('Invalid email or password');
        }
        return this.issueAndPersistTokens((0, public_user_type_1.toPublicUser)(user));
    }
    async refresh(dto) {
        const payload = await this.verifyRefreshToken(dto.refreshToken);
        const user = await this.usersService.findByIdWithPassword(payload.sub);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        if (user.status === client_1.UserStatus.BLOCKED) {
            throw new common_1.ForbiddenException('User is blocked');
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
            throw new common_1.UnauthorizedException('Invalid, expired, or revoked refresh token');
        }
        const tokenPair = await this.createTokenPair(user);
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
        return {
            user: (0, public_user_type_1.toPublicUser)(user),
            accessToken: tokenPair.accessToken,
            refreshToken: tokenPair.refreshToken,
        };
    }
    async logout(dto) {
        const payload = await this.verifyRefreshToken(dto.refreshToken);
        const activeTokens = await this.prisma.refreshToken.findMany({
            where: { userId: payload.sub, revokedAt: null },
        });
        const storedToken = await this.findMatchingRefreshToken(dto.refreshToken, activeTokens);
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
    async issueAndPersistTokens(user) {
        const tokenPair = await this.createTokenPair(user);
        try {
            await this.prisma.refreshToken.create({
                data: {
                    tokenHash: tokenPair.refreshTokenHash,
                    userId: user.id,
                    expiresAt: tokenPair.refreshTokenExpiresAt,
                },
            });
        }
        catch {
            throw new common_1.InternalServerErrorException('Unable to create authentication session');
        }
        return {
            user,
            accessToken: tokenPair.accessToken,
            refreshToken: tokenPair.refreshToken,
        };
    }
    async createTokenPair(user) {
        const payload = { sub: user.id, role: user.role };
        const accessToken = await this.jwtService.signAsync(payload, this.jwtOptions(this.configService.getOrThrow('jwt.accessSecret'), this.configService.getOrThrow('jwt.accessExpiresIn')));
        const refreshToken = await this.jwtService.signAsync(payload, this.jwtOptions(this.configService.getOrThrow('jwt.refreshSecret'), this.configService.getOrThrow('jwt.refreshExpiresIn')));
        const decoded = this.jwtService.decode(refreshToken);
        if (!decoded?.exp) {
            throw new common_1.InternalServerErrorException('Unable to calculate refresh token expiration');
        }
        return {
            accessToken,
            refreshToken,
            refreshTokenHash: await bcrypt.hash(this.refreshTokenFingerprint(refreshToken), this.saltRounds()),
            refreshTokenExpiresAt: new Date(decoded.exp * 1000),
        };
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
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map