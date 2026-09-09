import { Injectable } from '@nestjs/common';

@Injectable()
export class SalesService {
  summary() {
    return { module: 'sales', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
