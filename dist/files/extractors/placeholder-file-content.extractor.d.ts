import { ExtractableFile, FileContentExtractor } from './file-content-extractor';
export declare class PlaceholderFileContentExtractor implements FileContentExtractor {
    supports(mimeType: string): boolean;
    extractText(_file: ExtractableFile): Promise<string>;
}
