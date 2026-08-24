declare const _default: () => {
    port: number;
    frontendUrl: string;
    jwt: {
        accessSecret: string | undefined;
        refreshSecret: string | undefined;
        accessExpiresIn: string;
        refreshExpiresIn: string;
    };
    bcryptSaltRounds: number;
    authTimingLogs: boolean;
};
export default _default;
