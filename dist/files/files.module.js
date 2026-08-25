"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilesModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const activity_log_module_1 = require("../activity-log/activity-log.module");
const common_module_1 = require("../common/common.module");
const prisma_module_1 = require("../prisma/prisma.module");
const placeholder_file_content_extractor_1 = require("./extractors/placeholder-file-content.extractor");
const text_file_content_extractor_1 = require("./extractors/text-file-content.extractor");
const files_controller_1 = require("./files.controller");
const files_service_1 = require("./files.service");
const file_storage_adapter_1 = require("./storage/file-storage-adapter");
const local_file_storage_adapter_1 = require("./storage/local-file-storage.adapter");
const s3_file_storage_adapter_1 = require("./storage/s3-file-storage.adapter");
let FilesModule = class FilesModule {
};
exports.FilesModule = FilesModule;
exports.FilesModule = FilesModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, prisma_module_1.PrismaModule, common_module_1.CommonModule, activity_log_module_1.ActivityLogModule],
        controllers: [files_controller_1.FilesController],
        providers: [
            local_file_storage_adapter_1.LocalFileStorageAdapter, s3_file_storage_adapter_1.S3FileStorageAdapter, text_file_content_extractor_1.TextFileContentExtractor, placeholder_file_content_extractor_1.PlaceholderFileContentExtractor,
            {
                provide: file_storage_adapter_1.FILE_STORAGE_ADAPTER,
                inject: [config_1.ConfigService, local_file_storage_adapter_1.LocalFileStorageAdapter, s3_file_storage_adapter_1.S3FileStorageAdapter],
                useFactory: (config, local, s3) => config.get('storage.provider') === 'S3' ? s3 : local,
            },
            files_service_1.FilesService,
        ],
        exports: [files_service_1.FilesService, text_file_content_extractor_1.TextFileContentExtractor, placeholder_file_content_extractor_1.PlaceholderFileContentExtractor],
    })
], FilesModule);
//# sourceMappingURL=files.module.js.map