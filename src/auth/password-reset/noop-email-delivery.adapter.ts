import { Injectable } from '@nestjs/common';
import { EmailDeliveryAdapter, PasswordResetEmail } from './email-delivery.adapter';

/** Safe default until an SMTP/provider adapter is configured. Never logs the URL or recipient. */
@Injectable()
export class NoopEmailDeliveryAdapter implements EmailDeliveryAdapter {
  async sendPasswordResetEmail(_input: PasswordResetEmail): Promise<void> {
    return Promise.resolve();
  }
}
