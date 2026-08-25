import { Injectable } from '@nestjs/common';
import { GoogleApiClientService } from './google-api-client.service';
import { GoogleAuthService } from './google-auth.service';
import { DriveFilesQueryDto } from './dto/google.dto';
import { mapGoogleError } from './google.errors';

type GoogleFile = { id?: string; name?: string; mimeType?: string; modifiedTime?: string; size?: string; webViewLink?: string; iconLink?: string; owners?: Array<{ displayName?: string; emailAddress?: string; permissionId?: string }> };

const DOCS_MIME = 'application/vnd.google-apps.document';

@Injectable()
export class GoogleDriveService {
  constructor(private readonly auth: GoogleAuthService, private readonly api: GoogleApiClientService) {}

  async list(userId: string, query: DriveFilesQueryDto) {
    try {
      const token = await this.auth.getAccessToken(userId);
      const clauses = ["trashed = false"];
      if (query.q) clauses.push(`name contains '${escapeDriveQuery(query.q)}'`);
      if (query.mimeType) clauses.push(`mimeType = '${escapeDriveQuery(query.mimeType)}'`);
      const params = new URLSearchParams({ q: clauses.join(' and '), pageSize: String(query.limit ?? 50), fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink,owners(displayName,emailAddress,permissionId))', orderBy: 'modifiedTime desc' });
      if (query.pageToken) params.set('pageToken', query.pageToken);
      const result = await this.api.request<{ files?: GoogleFile[]; nextPageToken?: string }>(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, token, { resource: 'drive' });
      return { items: (result.files ?? []).map(normalizeFile), nextPageToken: result.nextPageToken ?? null };
    } catch (error) { throw mapGoogleError(error); }
  }

  async metadata(userId: string, fileId: string) {
    try {
      const token = await this.auth.getAccessToken(userId);
      const params = new URLSearchParams({ fields: 'id,name,mimeType,modifiedTime,size,webViewLink,iconLink,owners(displayName,emailAddress,permissionId)' });
      return normalizeFile(await this.api.request<GoogleFile>(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`, token, { resource: 'drive' }));
    } catch (error) { throw mapGoogleError(error); }
  }

  exportMetadata(file: { id?: string; name?: string; mimeType?: string }) {
    if (file.mimeType !== DOCS_MIME) return null;
    return { fileId: file.id ?? null, exportMimeType: 'application/pdf', endpoint: file.id ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export` : null, contentFetched: false };
  }
}

function normalizeFile(file: GoogleFile) {
  return { id: file.id ?? '', name: file.name ?? '', mimeType: file.mimeType ?? '', modifiedTime: file.modifiedTime ?? null, size: file.size ? Number(file.size) : null, webViewLink: file.webViewLink ?? null, owners: (file.owners ?? []).map(({ displayName, emailAddress, permissionId }) => ({ displayName: displayName ?? null, emailAddress: emailAddress ?? null, permissionId: permissionId ?? null })), iconLink: file.iconLink ?? null };
}

function escapeDriveQuery(value: string): string { return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

