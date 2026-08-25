export const EMAIL_DELIVERY_ADAPTER = Symbol('EMAIL_DELIVERY_ADAPTER');

export type PasswordResetEmail = {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export interface EmailDeliveryAdapter {
  sendPasswordResetEmail(input: PasswordResetEmail): Promise<void>;
}
