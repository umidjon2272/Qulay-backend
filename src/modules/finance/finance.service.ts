import { Injectable } from '@nestjs/common';

@Injectable()
export class FinanceService {
  summary() {
    return { module: 'finance', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
