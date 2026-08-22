"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const prisma_service_1 = require("./prisma/prisma.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const frontendOrigins = configService
        .getOrThrow('frontendUrl')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.enableCors({
        credentials: true,
        origin: (origin, callback) => {
            if (!origin || frontendOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error('Origin is not allowed by CORS'));
        },
    });
    await app.get(prisma_service_1.PrismaService).enableShutdownHooks(app);
    await app.listen(configService.getOrThrow('port'));
}
void bootstrap();
//# sourceMappingURL=main.js.map