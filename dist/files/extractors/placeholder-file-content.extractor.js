"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaceholderFileContentExtractor = void 0;
const common_1 = require("@nestjs/common");
let PlaceholderFileContentExtractor = class PlaceholderFileContentExtractor {
    supports(mimeType) {
        return mimeType === 'application/pdf'
            || mimeType === 'application/msword'
            || mimeType.includes('wordprocessingml.document')
            || mimeType === 'application/vnd.ms-excel'
            || mimeType.includes('spreadsheetml.sheet');
    }
    extractText(_file) {
        return Promise.reject(new common_1.NotImplementedException('PDF and Office text extraction is not enabled yet'));
    }
};
exports.PlaceholderFileContentExtractor = PlaceholderFileContentExtractor;
exports.PlaceholderFileContentExtractor = PlaceholderFileContentExtractor = __decorate([
    (0, common_1.Injectable)()
], PlaceholderFileContentExtractor);
//# sourceMappingURL=placeholder-file-content.extractor.js.map