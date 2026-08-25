import { EmailDeliveryAdapter, PasswordResetEmail } from './email-delivery.adapter';
export declare class NoopEmailDeliveryAdapter implements EmailDeliveryAdapter {
    sendPasswordResetEmail(_input: PasswordResetEmail): Promise<void>;
}
