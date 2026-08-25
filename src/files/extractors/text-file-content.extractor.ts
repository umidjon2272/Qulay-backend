import { Injectable } from '@nestjs/common';
import { ExtractableFile, FileContentExtractor } from './file-content-extractor';

@Injectable()
export class TextFileContentExtractor implements FileContentExtractor {
  supports(mimeType: string): boolean { return mimeType === 'text/plain' || mimeType === 'text/csv'; }
  async extractText(file: ExtractableFile): Promise<string> { return file.buffer.toString('utf8'); }
}
