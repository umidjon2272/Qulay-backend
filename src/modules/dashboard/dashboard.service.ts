import { Injectable } from '@nestjs/common';

@Injectable()
export class DashboardService {
  summary() {
    return { module: 'dashboard', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
