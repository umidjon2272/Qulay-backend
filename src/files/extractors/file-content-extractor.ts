export type ExtractableFile = {
  mimeType: string;
  buffer: Buffer;
};

export interface FileContentExtractor {
  supports(mimeType: string): boolean;
  extractText(file: ExtractableFile): Promise<string>;
}
