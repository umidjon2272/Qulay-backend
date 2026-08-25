import { Injectable, NotImplementedException } from '@nestjs/common';
import { ExtractableFile, FileContentExtractor } from './file-content-extractor';

@Injectable()
export class PlaceholderFileContentExtractor implements FileContentExtractor {
  supports(mimeType: string): boolean {
    return mimeType === 'application/pdf'
      || mimeType === 'application/msword'
      || mimeType.includes('wordprocessingml.document')
      || mimeType === 'application/vnd.ms-excel'
      || mimeType.includes('spreadsheetml.sheet');
  }
  extractText(_file: ExtractableFile): Promise<string> {
    return Promise.reject(new NotImplementedException('PDF and Office text extraction is not enabled yet'));
  }
}
