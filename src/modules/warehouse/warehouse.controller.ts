import { Controller, Get } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';

@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly service: WarehouseService) {}
  @Get()
  getSummary() { return this.service.summary(); }
}
