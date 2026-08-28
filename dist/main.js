"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureApp = configureApp;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const helmet_1 = require("helmet");
const express_1 = require("express");
const app_module_1 = require("./app.module");
const production_exception_filter_1 = require("./common/security/production-exception.filter");
const security_rate_limit_service_1 = require("./common/security/security-rate-limit.service");
const security_limits_constants_1 = require("./common/security/security-limits.constants");
const prisma_service_1 = require("./prisma/prisma.service");
function configureApp(app) {
    const configService = app.get(config_1.ConfigService);
    const frontendOrigins = configService
        .getOrThrow('frontendUrl')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    const httpServer = app.getHttpAdapter().getInstance();
    httpServer.set('trust proxy', configService.get('trustProxy', false));
    app.setGlobalPrefix('api');
    httpServer.disable('x-powered-by');
    app.use((0, helmet_1.default)({ contentSecurityPolicy: false }));
    app.use((0, express_1.json)({ limit: configService.get('requestBodyLimit', '1mb') }));
    app.use((0, express_1.urlencoded)({ extended: true, limit: configService.get('requestBodyLimit', '1mb') }));
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalFilters(new production_exception_filter_1.ProductionExceptionFilter());
    app.enableCors({
        credentials: true,
        origin: (origin, callback) => {
            if (!origin || frontendOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(null, false);
        },
    });
    const rateLimiter = app.get(security_rate_limit_service_1.SecurityRateLimitService);
    app.use((request, response, next) => {
        const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
        if (!rateLimiter.isAllowed('global-ip', ip, security_limits_constants_1.SECURITY_LIMITS.globalPerIp.max, security_limits_constants_1.SECURITY_LIMITS.globalPerIp.windowMs)) {
            response.status(429).json({ statusCode: 429, message: 'Too many requests. Try again later.' });
            return;
        }
        next();
    });
}
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { bodyParser: false });
    configureApp(app);
    await app.get(prisma_service_1.PrismaService).enableShutdownHooks(app);
    const configService = app.get(config_1.ConfigService);
    const port = configService.getOrThrow('port');
    await app.listen(port, '0.0.0.0');
    new common_1.Logger('Bootstrap').log(`Qulay AI backend running on port ${port}`);
}
if (require.main === module) {
    void bootstrap();
}
//# sourceMappingURL=main.js.map