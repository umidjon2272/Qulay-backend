import { Injectable } from '@nestjs/common';

@Injectable()
export class ReportsService {
  summary() {
    return { module: 'reports', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
