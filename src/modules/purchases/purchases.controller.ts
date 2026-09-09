import { Controller, Get } from '@nestjs/common';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly service: PurchasesService) {}
  @Get()
  getSummary() { return this.service.summary(); }
}
