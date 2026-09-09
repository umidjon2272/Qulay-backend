import { Injectable } from '@nestjs/common';

@Injectable()
export class ProductsService {
  summary() {
    return { module: 'products', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
