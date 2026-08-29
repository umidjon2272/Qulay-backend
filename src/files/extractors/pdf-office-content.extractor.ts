import { Injectable } from '@nestjs/common';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { ExtractableFile, FileContentExtractor } from './file-content-extractor';

const MAX_EXTRACTED_CHARS = 2_000_000;

@Injectable()
export class PdfOfficeContentExtractor implements FileContentExtractor {
  supports(mimeType: string): boolean {
    return mimeType === 'application/pdf'
      || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  async extractText(file: ExtractableFile): Promise<string> {
    if (file.mimeType === 'application/pdf') return extractPdfText(file.buffer);
    const entries = unzipEntries(file.buffer);
    if (file.mimeType.includes('wordprocessingml.document')) {
      const xml = [...entries.entries()]
        .filter(([name]) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(name))
        .map(([, data]) => data.toString('utf8'))
        .join('\n');
      return normalizeXmlText(xml);
    }
    const sharedStrings = entries.get('xl/sharedStrings.xml');
    const shared = sharedStrings ? xmlTextNodes(sharedStrings.toString('utf8')) : [];
    const sheets = [...entries.entries()]
      .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
      .sort(([left], [right]) => left.localeCompare(right));
    const lines: string[] = [];
    for (const [name, data] of sheets) {
      lines.push(`[${name.split('/').pop()}]`);
      const xml = data.toString('utf8');
      for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells: string[] = [];
        for (const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
          const type = /\bt="([^"]+)"/.exec(cell[1])?.[1];
          const value = /<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(cell[2])?.[1] ?? '';
          cells.push(type === 's' ? shared[Number(value)] ?? value : decodeXml(value));
        }
        if (cells.some(Boolean)) lines.push(cells.join('\t'));
      }
    }
    return limit(lines.join('\n'));
  }
}

function unzipEntries(buffer: Buffer): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  let eocd = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65_557); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error('Office ZIP directory was not found');
  const entries = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < entries; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid Office ZIP directory');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString('utf8');
    if (/^(word\/(document|header\d*|footer\d*)\.xml|xl\/sharedStrings\.xml|xl\/worksheets\/sheet\d+\.xml)$/.test(name)) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid Office ZIP entry');
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(start, start + compressedSize);
      const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
      if (data) result.set(name, data);
    }
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  return result;
}

function extractPdfText(buffer: Buffer): string {
  const binary = buffer.toString('latin1');
  const chunks: string[] = [];
  for (const match of binary.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content = Buffer.from(match[1], 'latin1');
    try { content = inflateSync(content); } catch { /* uncompressed or unsupported stream */ }
    const stream = content.toString('latin1');
    for (const block of stream.matchAll(/BT([\s\S]*?)ET/g)) {
      for (const text of block[1].matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) chunks.push(decodePdfString(text[1]));
      for (const array of block[1].matchAll(/\[((?:.|\n)*?)\]\s*TJ/g)) {
        const parts = [...array[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((item) => decodePdfString(item[1]));
        if (parts.length) chunks.push(parts.join(''));
      }
    }
  }
  const text = chunks.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('PDF ichidan o‘qiladigan matn topilmadi. Skan PDF uchun OCR kerak.');
  return limit(text);
}

function decodePdfString(value: string): string {
  return value.replace(/\\([nrtbf()\\])/g, (_match, code: string) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[code] ?? code))
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
}

function normalizeXmlText(xml: string): string {
  return limit(xml.replace(/<w:tab\/?\s*>/g, '\t').replace(/<w:br\/?\s*>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').split('\n').map((line) => decodeXml(line).trim()).filter(Boolean).join('\n'));
}

function xmlTextNodes(xml: string): string[] { return [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1])); }
function decodeXml(value: string): string { return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
function limit(value: string): string { return value.trim().slice(0, MAX_EXTRACTED_CHARS); }
