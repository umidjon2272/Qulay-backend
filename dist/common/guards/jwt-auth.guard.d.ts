import { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
export declare class JwtAuthGuard implements CanActivate {
    private readonly jwtService;
    private readonly configService;
    private readonly prisma;
    constructor(jwtService: JwtService, configService: ConfigService, prisma: PrismaService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private extractBearerToken;
}
