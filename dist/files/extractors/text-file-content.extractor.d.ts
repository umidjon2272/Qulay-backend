import { ExtractableFile, FileContentExtractor } from './file-content-extractor';
export declare class TextFileContentExtractor implements FileContentExtractor {
    supports(mimeType: string): boolean;
    extractText(file: ExtractableFile): Promise<string>;
}
