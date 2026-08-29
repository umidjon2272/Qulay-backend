import { createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStorageAdapter, StorageMetadata, StorageUploadInput } from './file-storage-adapter';

@Injectable()
export class S3FileStorageAdapter implements FileStorageAdapter {
  private readonly endpoint?: string;
  private readonly region: string;
  private readonly bucket?: string;
  private readonly accessKeyId?: string;
  private readonly secretAccessKey?: string;

  constructor(config: ConfigService) {
    this.endpoint = config.get<string>('storage.s3.endpoint')?.replace(/\/$/, '');
    this.region = config.get<string>('storage.s3.region') || 'auto';
    this.bucket = config.get<string>('storage.s3.bucket');
    this.accessKeyId = config.get<string>('storage.s3.accessKeyId');
    this.secretAccessKey = config.get<string>('storage.s3.secretAccessKey');
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException('S3 storage adapter is not configured');
  }

  async upload(input: StorageUploadInput): Promise<void> {
    const response = await this.request('PUT', input.key, input.body, { 'content-type': input.contentType });
    if (!response.ok) throw new ServiceUnavailableException(`S3 upload failed (${response.status})`);
  }

  async delete(key: string): Promise<void> {
    const response = await this.request('DELETE', key);
    if (!response.ok && response.status !== 404) throw new ServiceUnavailableException(`S3 delete failed (${response.status})`);
  }

  async exists(key: string): Promise<boolean> { return (await this.getMetadata(key)) !== null; }

  async getMetadata(key: string): Promise<StorageMetadata | null> {
    const response = await this.request('HEAD', key);
    if (response.status === 404) return null;
    if (!response.ok) throw new ServiceUnavailableException(`S3 metadata failed (${response.status})`);
    const modified = response.headers.get('last-modified');
    return { sizeBytes: Number(response.headers.get('content-length') ?? 0), contentType: response.headers.get('content-type') ?? undefined, modifiedAt: modified ? new Date(modified) : undefined };
  }

  async getDownloadStream(key: string): Promise<Readable> {
    const response = await this.request('GET', key);
    if (!response.ok || !response.body) throw new ServiceUnavailableException(response.status === 404 ? 'Storage object was not found' : `S3 download failed (${response.status})`);
    return Readable.fromWeb(response.body as never);
  }

  private async request(method: string, key: string, body: Buffer = Buffer.alloc(0), extraHeaders: Record<string, string> = {}): Promise<Response> {
    if (!this.endpoint || !this.bucket || !this.accessKeyId || !this.secretAccessKey) throw this.unavailable();
    const path = `/${encodeURIComponent(this.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const url = new URL(path, this.endpoint);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256').update(body).digest('hex');
    const headers: Record<string, string> = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...extraHeaders };
    const signedHeaderNames = Object.keys(headers).map((item) => item.toLowerCase()).sort();
    const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim()}\n`).join('');
    const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaderNames.join(';'), payloadHash].join('\n');
    const scope = `${date}/${this.region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;
    const dateKey = createHmac('sha256', `AWS4${this.secretAccessKey}`).update(date).digest();
    const regionKey = createHmac('sha256', dateKey).update(this.region).digest();
    const serviceKey = createHmac('sha256', regionKey).update('s3').digest();
    const signingKey = createHmac('sha256', serviceKey).update('aws4_request').digest();
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`;
    delete headers.host;
    return fetch(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : new Uint8Array(body) });
  }
}
