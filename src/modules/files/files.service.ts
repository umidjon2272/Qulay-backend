import { Injectable } from '@nestjs/common';

@Injectable()
export class FilesService {
  summary() {
    return { module: 'files', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
