import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PublicUser } from '../users/types/public-user.type';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.type';
type AuthResponse = {
    user: PublicUser;
    accessToken: string;
    refreshToken: string;
};
export declare class AuthService {
    private readonly usersService;
    private readonly prisma;
    private readonly jwtService;
    private readonly configService;
    constructor(usersService: UsersService, prisma: PrismaService, jwtService: JwtService, configService: ConfigService);
    register(dto: RegisterDto): Promise<AuthResponse>;
    login(dto: LoginDto): Promise<AuthResponse>;
    refresh(dto: RefreshTokenDto): Promise<AuthResponse>;
    logout(dto: RefreshTokenDto): Promise<{
        message: string;
    }>;
    me(payload: JwtPayload): Promise<PublicUser>;
    private issueAndPersistTokens;
    private createTokenPair;
    private verifyRefreshToken;
    private findMatchingRefreshToken;
    private hashPassword;
    private refreshTokenFingerprint;
    private saltRounds;
    private normalizeEmail;
    private jwtOptions;
}
export {};
