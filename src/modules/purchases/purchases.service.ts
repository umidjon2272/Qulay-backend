import { Injectable } from '@nestjs/common';

@Injectable()
export class PurchasesService {
  summary() {
    return { module: 'purchases', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
