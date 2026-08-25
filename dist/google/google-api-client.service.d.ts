type GoogleRequestOptions = {
    method?: string;
    body?: unknown;
    resource: 'calendar' | 'drive' | 'oauth';
};
export declare class GoogleApiClientService {
    request<T>(url: string, accessToken: string, options: GoogleRequestOptions): Promise<T>;
}
export {};
