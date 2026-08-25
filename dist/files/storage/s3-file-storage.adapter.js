"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3FileStorageAdapter = void 0;
const common_1 = require("@nestjs/common");
let S3FileStorageAdapter = class S3FileStorageAdapter {
    unavailable() {
        return new common_1.ServiceUnavailableException('S3 storage adapter is not configured');
    }
    upload(_input) { return Promise.reject(this.unavailable()); }
    delete(_key) { return Promise.reject(this.unavailable()); }
    exists(_key) { return Promise.reject(this.unavailable()); }
    getMetadata(_key) { return Promise.reject(this.unavailable()); }
    getDownloadStream(_key) { return Promise.reject(this.unavailable()); }
};
exports.S3FileStorageAdapter = S3FileStorageAdapter;
exports.S3FileStorageAdapter = S3FileStorageAdapter = __decorate([
    (0, common_1.Injectable)()
], S3FileStorageAdapter);
//# sourceMappingURL=s3-file-storage.adapter.js.map