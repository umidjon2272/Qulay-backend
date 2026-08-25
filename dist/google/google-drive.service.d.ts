import { GoogleApiClientService } from './google-api-client.service';
import { GoogleAuthService } from './google-auth.service';
import { DriveFilesQueryDto } from './dto/google.dto';
export declare class GoogleDriveService {
    private readonly auth;
    private readonly api;
    constructor(auth: GoogleAuthService, api: GoogleApiClientService);
    list(userId: string, query: DriveFilesQueryDto): Promise<{
        items: {
            id: string;
            name: string;
            mimeType: string;
            modifiedTime: string | null;
            size: number | null;
            webViewLink: string | null;
            owners: {
                displayName: string | null;
                emailAddress: string | null;
                permissionId: string | null;
            }[];
            iconLink: string | null;
        }[];
        nextPageToken: string | null;
    }>;
    metadata(userId: string, fileId: string): Promise<{
        id: string;
        name: string;
        mimeType: string;
        modifiedTime: string | null;
        size: number | null;
        webViewLink: string | null;
        owners: {
            displayName: string | null;
            emailAddress: string | null;
            permissionId: string | null;
        }[];
        iconLink: string | null;
    }>;
    exportMetadata(file: {
        id?: string;
        name?: string;
        mimeType?: string;
    }): {
        fileId: string | null;
        exportMimeType: string;
        endpoint: string | null;
        contentFetched: boolean;
    } | null;
}
