import { Controller, Get } from '@nestjs/common';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly service: SalesService) {}
  @Get()
  getSummary() { return this.service.summary(); }
}
