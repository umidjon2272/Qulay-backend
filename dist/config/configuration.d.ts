declare const _default: () => {
    nodeEnv: string;
    trustProxy: boolean;
    requestBodyLimit: string;
    port: number;
    frontendUrl: string | undefined;
    jwt: {
        accessSecret: string | undefined;
        refreshSecret: string | undefined;
        accessExpiresIn: string;
        refreshExpiresIn: string;
    };
    bcryptSaltRounds: number;
    authTimingLogs: boolean;
    passwordResetExpiresMinutes: number;
    storage: {
        provider: string;
        localPath: string;
        maxSizeBytes: number;
        s3: {
            endpoint: string | undefined;
            region: string | undefined;
            bucket: string | undefined;
            accessKeyId: string | undefined;
            secretAccessKey: string | undefined;
        };
    };
    telegram: {
        configured: boolean;
        apiId: number | undefined;
        apiHash: string | undefined;
        sessionEncryptionKey: string | undefined;
    };
    google: {
        configured: boolean;
        clientId: string | undefined;
        clientSecret: string | undefined;
        redirectUri: string | undefined;
        tokenEncryptionKey: string | undefined;
    };
};
export default _default;
