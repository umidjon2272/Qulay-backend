import { Injectable } from '@nestjs/common';

@Injectable()
export class BillingService {
  summary() {
    return { module: 'billing', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
