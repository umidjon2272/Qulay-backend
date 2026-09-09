import { Injectable } from '@nestjs/common';

@Injectable()
export class SuppliersService {
  summary() {
    return { module: 'suppliers', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
