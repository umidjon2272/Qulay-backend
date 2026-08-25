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
exports.LocalFileStorageAdapter = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let LocalFileStorageAdapter = class LocalFileStorageAdapter {
    constructor(config) {
        const configuredPath = config.get('storage.localPath') ?? './uploads';
        this.rootPath = (0, node_path_1.resolve)(process.cwd(), configuredPath);
    }
    async upload(input) {
        const path = this.safePath(input.key);
        await node_fs_1.promises.mkdir((0, node_path_1.dirname)(path), { recursive: true });
        await node_fs_1.promises.writeFile(path, input.body, { flag: 'wx' });
    }
    async delete(key) {
        const path = this.safePath(key);
        try {
            await node_fs_1.promises.unlink(path);
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    async exists(key) {
        try {
            await node_fs_1.promises.access(this.safePath(key));
            return true;
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return false;
            throw error;
        }
    }
    async getMetadata(key) {
        try {
            const stats = await node_fs_1.promises.stat(this.safePath(key));
            return { sizeBytes: stats.size, modifiedAt: stats.mtime };
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return null;
            throw error;
        }
    }
    async getDownloadStream(key) {
        const path = this.safePath(key);
        if (!(await this.exists(key)))
            throw new Error('Storage object was not found');
        return (0, node_fs_1.createReadStream)(path);
    }
    safePath(key) {
        if (!key || (0, node_path_1.isAbsolute)(key))
            throw new Error('Invalid storage key');
        const path = (0, node_path_1.resolve)((0, node_path_1.join)(this.rootPath, key));
        const relativePath = (0, node_path_1.relative)(this.rootPath, path);
        if (!relativePath || relativePath.startsWith('..') || (0, node_path_1.isAbsolute)(relativePath)) {
            throw new Error('Invalid storage key');
        }
        return path;
    }
};
exports.LocalFileStorageAdapter = LocalFileStorageAdapter;
exports.LocalFileStorageAdapter = LocalFileStorageAdapter = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], LocalFileStorageAdapter);
//# sourceMappingURL=local-file-storage.adapter.js.map