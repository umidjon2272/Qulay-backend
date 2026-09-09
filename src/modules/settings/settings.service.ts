import { Injectable } from '@nestjs/common';

@Injectable()
export class SettingsService {
  summary() {
    return { module: 'settings', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
