"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleApiClientService = void 0;
const common_1 = require("@nestjs/common");
const google_errors_1 = require("./google.errors");
let GoogleApiClientService = class GoogleApiClientService {
    async request(url, accessToken, options) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const response = await fetch(url, {
                    method: options.method ?? 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                    },
                    body: options.body ? JSON.stringify(options.body) : undefined,
                });
                const text = await response.text();
                let payload = null;
                try {
                    payload = text ? JSON.parse(text) : null;
                }
                catch {
                    payload = text;
                }
                if (response.ok)
                    return payload;
                if ((0, google_errors_1.isRetryableGoogleStatus)(response.status) && attempt < 2) {
                    await new Promise((resolve) => setTimeout(resolve, (0, google_errors_1.retryAfterMs)(attempt)));
                    continue;
                }
                throw (0, google_errors_1.classifyGoogleHttpError)(response.status, payload, options.resource);
            }
            catch (error) {
                if (error instanceof google_errors_1.GoogleAdapterError)
                    throw error;
                if (attempt < 2) {
                    await new Promise((resolve) => setTimeout(resolve, (0, google_errors_1.retryAfterMs)(attempt)));
                    continue;
                }
                throw new google_errors_1.GoogleAdapterError('UNAVAILABLE');
            }
        }
        throw new google_errors_1.GoogleAdapterError('UNAVAILABLE');
    }
};
exports.GoogleApiClientService = GoogleApiClientService;
exports.GoogleApiClientService = GoogleApiClientService = __decorate([
    (0, common_1.Injectable)()
], GoogleApiClientService);
//# sourceMappingURL=google-api-client.service.js.map