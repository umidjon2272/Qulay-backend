import { Request } from 'express';
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
export declare class AuthController {
    private readonly authService;
    private readonly passwordResetService;
    private readonly rateLimiter;
    constructor(authService: AuthService, passwordResetService: PasswordResetService, rateLimiter: SecurityRateLimitService);
    forgotPassword(dto: ForgotPasswordDto, request: Request): Promise<{
        readonly success: true;
        readonly message: "Agar bu email ro‘yxatdan o‘tgan bo‘lsa, parolni tiklash ko‘rsatmasi yuboriladi.";
    }>;
    resetPassword(dto: ResetPasswordDto, request: Request): Promise<{
        success: true;
        message: string;
    }>;
    register(dto: RegisterDto, request: Request): Promise<{
        user: import("../users/types/public-user.type").PublicUser;
        accessToken: string;
        refreshToken: string;
    }>;
    login(dto: LoginDto, request: Request): Promise<{
        user: import("../users/types/public-user.type").PublicUser;
        accessToken: string;
        refreshToken: string;
    }>;
    refresh(dto: RefreshTokenDto): Promise<{
        user: import("../users/types/public-user.type").PublicUser;
        accessToken: string;
        refreshToken: string;
    }>;
    logout(dto: RefreshTokenDto): Promise<{
        message: string;
    }>;
    me(user: JwtPayload): Promise<import("../users/types/public-user.type").PublicUser>;
    changePassword(user: JwtPayload, dto: ChangePasswordDto): Promise<{
        success: true;
        message: string;
        requiresRelogin: true;
    }>;
}
