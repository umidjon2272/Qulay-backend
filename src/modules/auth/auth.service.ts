import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  summary() {
    return { module: 'auth', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
