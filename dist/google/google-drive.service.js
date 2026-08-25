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
exports.GoogleDriveService = void 0;
const common_1 = require("@nestjs/common");
const google_api_client_service_1 = require("./google-api-client.service");
const google_auth_service_1 = require("./google-auth.service");
const google_errors_1 = require("./google.errors");
const DOCS_MIME = 'application/vnd.google-apps.document';
let GoogleDriveService = class GoogleDriveService {
    constructor(auth, api) {
        this.auth = auth;
        this.api = api;
    }
    async list(userId, query) {
        try {
            const token = await this.auth.getAccessToken(userId);
            const clauses = ["trashed = false"];
            if (query.q)
                clauses.push(`name contains '${escapeDriveQuery(query.q)}'`);
            if (query.mimeType)
                clauses.push(`mimeType = '${escapeDriveQuery(query.mimeType)}'`);
            const params = new URLSearchParams({ q: clauses.join(' and '), pageSize: String(query.limit ?? 50), fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink,owners(displayName,emailAddress,permissionId))', orderBy: 'modifiedTime desc' });
            if (query.pageToken)
                params.set('pageToken', query.pageToken);
            const result = await this.api.request(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, token, { resource: 'drive' });
            return { items: (result.files ?? []).map(normalizeFile), nextPageToken: result.nextPageToken ?? null };
        }
        catch (error) {
            throw (0, google_errors_1.mapGoogleError)(error);
        }
    }
    async metadata(userId, fileId) {
        try {
            const token = await this.auth.getAccessToken(userId);
            const params = new URLSearchParams({ fields: 'id,name,mimeType,modifiedTime,size,webViewLink,iconLink,owners(displayName,emailAddress,permissionId)' });
            return normalizeFile(await this.api.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`, token, { resource: 'drive' }));
        }
        catch (error) {
            throw (0, google_errors_1.mapGoogleError)(error);
        }
    }
    exportMetadata(file) {
        if (file.mimeType !== DOCS_MIME)
            return null;
        return { fileId: file.id ?? null, exportMimeType: 'application/pdf', endpoint: file.id ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export` : null, contentFetched: false };
    }
};
exports.GoogleDriveService = GoogleDriveService;
exports.GoogleDriveService = GoogleDriveService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [google_auth_service_1.GoogleAuthService, google_api_client_service_1.GoogleApiClientService])
], GoogleDriveService);
function normalizeFile(file) {
    return { id: file.id ?? '', name: file.name ?? '', mimeType: file.mimeType ?? '', modifiedTime: file.modifiedTime ?? null, size: file.size ? Number(file.size) : null, webViewLink: file.webViewLink ?? null, owners: (file.owners ?? []).map(({ displayName, emailAddress, permissionId }) => ({ displayName: displayName ?? null, emailAddress: emailAddress ?? null, permissionId: permissionId ?? null })), iconLink: file.iconLink ?? null };
}
function escapeDriveQuery(value) { return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
//# sourceMappingURL=google-drive.service.js.map