import { Injectable } from '@nestjs/common';

@Injectable()
export class CustomersService {
  summary() {
    return { module: 'customers', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
