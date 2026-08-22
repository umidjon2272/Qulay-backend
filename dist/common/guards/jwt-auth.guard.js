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
exports.JwtAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../prisma/prisma.service");
let JwtAuthGuard = class JwtAuthGuard {
    constructor(jwtService, configService, prisma) {
        this.jwtService = jwtService;
        this.configService = configService;
        this.prisma = prisma;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const token = this.extractBearerToken(request.headers.authorization);
        if (!token) {
            throw new common_1.UnauthorizedException('Bearer access token is required');
        }
        let payload;
        try {
            payload = await this.jwtService.verifyAsync(token, {
                secret: this.configService.getOrThrow('jwt.accessSecret'),
            });
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired access token');
        }
        if (!payload.sub || !payload.role) {
            throw new common_1.UnauthorizedException('Invalid access token');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, role: true, status: true },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('User no longer exists');
        }
        if (user.status === client_1.UserStatus.BLOCKED) {
            throw new common_1.ForbiddenException('User is blocked');
        }
        request.user = { sub: user.id, role: user.role };
        return true;
    }
    extractBearerToken(authorization) {
        if (!authorization) {
            return null;
        }
        const [scheme, token] = authorization.split(' ');
        return scheme?.toLowerCase() === 'bearer' && token ? token : null;
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        config_1.ConfigService,
        prisma_service_1.PrismaService])
], JwtAuthGuard);
//# sourceMappingURL=jwt-auth.guard.js.map