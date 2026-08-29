import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailDeliveryAdapter, PasswordResetEmail } from './email-delivery.adapter';

@Injectable()
export class ResendEmailDeliveryAdapter implements EmailDeliveryAdapter {
  constructor(private readonly config: ConfigService) {}

  async sendPasswordResetEmail(input: PasswordResetEmail): Promise<void> {
    const apiKey = this.config.get<string>('email.apiKey');
    const from = this.config.get<string>('email.from');
    if (!apiKey || !from) throw new ServiceUnavailableException('Email delivery is not configured');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: 'Qulay AI — parolni tiklash',
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>Parolni tiklash</h2><p>Qulay AI akkauntingiz uchun yangi parol o‘rnatish tugmasini bosing.</p><p><a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;padding:12px 20px;background:#7655df;color:#fff;text-decoration:none;border-radius:10px">Parolni tiklash</a></p><p>Havola ${input.expiresInMinutes} daqiqa amal qiladi. Agar bu so‘rovni siz yubormagan bo‘lsangiz, xatni e’tiborsiz qoldiring.</p></div>`,
      }),
    });
    if (!response.ok) throw new ServiceUnavailableException(`Email delivery failed (${response.status})`);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
