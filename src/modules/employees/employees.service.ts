import { Injectable } from '@nestjs/common';

@Injectable()
export class EmployeesService {
  summary() {
    return { module: 'employees', version: '2.0.0', status: 'ready-for-v2x' };
  }
}
