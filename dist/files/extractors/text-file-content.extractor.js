"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextFileContentExtractor = void 0;
const common_1 = require("@nestjs/common");
let TextFileContentExtractor = class TextFileContentExtractor {
    supports(mimeType) { return mimeType === 'text/plain' || mimeType === 'text/csv'; }
    async extractText(file) { return file.buffer.toString('utf8'); }
};
exports.TextFileContentExtractor = TextFileContentExtractor;
exports.TextFileContentExtractor = TextFileContentExtractor = __decorate([
    (0, common_1.Injectable)()
], TextFileContentExtractor);
//# sourceMappingURL=text-file-content.extractor.js.map