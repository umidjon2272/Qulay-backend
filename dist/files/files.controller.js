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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilesController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const folder_dto_1 = require("./dto/folder.dto");
const file_query_dto_1 = require("./dto/file-query.dto");
const upload_file_dto_1 = require("./dto/upload-file.dto");
const files_service_1 = require("./files.service");
let FilesController = class FilesController {
    constructor(files) {
        this.files = files;
    }
    upload(user, file, dto) {
        return this.files.uploadForUser(user.sub, file, dto.folderId, dto.label ?? dto.title);
    }
    list(user, query) { return this.files.listForUser(user.sub, query); }
    listFolders(user) { return this.files.listFoldersForUser(user.sub); }
    createFolder(user, dto) { return this.files.createFolderForUser(user.sub, dto); }
    updateFolder(user, id, dto) { return this.files.updateFolderForUser(user.sub, id, dto); }
    deleteFolder(user, id) { return this.files.deleteFolderForUser(user.sub, id); }
    async download(user, id, response) {
        const file = await this.files.getDownloadForUser(user.sub, id);
        response.setHeader('Content-Disposition', contentDisposition(file.originalName));
        return new common_1.StreamableFile(file.stream, { type: file.mimeType, length: file.sizeBytes });
    }
    get(user, id) { return this.files.getForUser(user.sub, id); }
    delete(user, id) { return this.files.deleteForUser(user.sub, id); }
};
exports.FilesController = FilesController;
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, upload_file_dto_1.UploadFileDto]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, file_query_dto_1.FileQueryDto]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('folders'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "listFolders", null);
__decorate([
    (0, common_1.Post)('folders'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, folder_dto_1.CreateFolderDto]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "createFolder", null);
__decorate([
    (0, common_1.Patch)('folders/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, folder_dto_1.UpdateFolderDto]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "updateFolder", null);
__decorate([
    (0, common_1.Delete)('folders/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "deleteFolder", null);
__decorate([
    (0, common_1.Get)(':id/download'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], FilesController.prototype, "download", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "get", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "delete", null);
exports.FilesController = FilesController = __decorate([
    (0, common_1.Controller)('files'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [files_service_1.FilesService])
], FilesController);
function contentDisposition(originalName) {
    const fallback = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'download';
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
}
//# sourceMappingURL=files.controller.js.map