import { Injectable } from '@nestjs/common';

@Injectable()
export class WarehouseService {
  summary() {
    return { module: 'warehouse', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
