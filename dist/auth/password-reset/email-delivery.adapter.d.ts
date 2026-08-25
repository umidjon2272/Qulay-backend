export declare const EMAIL_DELIVERY_ADAPTER: unique symbol;
export type PasswordResetEmail = {
    to: string;
    resetUrl: string;
    expiresInMinutes: number;
};
export interface EmailDeliveryAdapter {
    sendPasswordResetEmail(input: PasswordResetEmail): Promise<void>;
}
