import { Injectable } from '@nestjs/common';
import { FileContentExtractor } from './file-content-extractor';
import { PdfOfficeContentExtractor } from './pdf-office-content.extractor';
import { TextFileContentExtractor } from './text-file-content.extractor';

@Injectable()
export class FileContentExtractionService {
  private readonly extractors: FileContentExtractor[];

  constructor(text: TextFileContentExtractor, office: PdfOfficeContentExtractor) {
    this.extractors = [text, office];
  }

  supports(mimeType: string): boolean { return this.extractors.some((item) => item.supports(mimeType)); }

  async extract(mimeType: string, buffer: Buffer): Promise<string> {
    const extractor = this.extractors.find((item) => item.supports(mimeType));
    if (!extractor) throw new Error('Fayl matnini ajratish qo‘llab-quvvatlanmaydi');
    return (await extractor.extractText({ mimeType, buffer })).trim();
  }
}
