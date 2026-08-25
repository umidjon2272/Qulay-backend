import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateFinanceCategoryDto } from './dto/create-finance-category.dto';
import { FinanceCategoryQueryDto } from './dto/finance-category-query.dto';
import { FinanceSummaryQueryDto } from './dto/finance-summary-query.dto';
import { FinanceTransactionQueryDto } from './dto/transaction-query.dto';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto';
import { UpdateFinanceCategoryDto } from './dto/update-finance-category.dto';
import { UpdateFinanceTransactionDto } from './dto/update-finance-transaction.dto';
import { FinanceService } from './finance.service';

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('transactions')
  listTransactions(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceTransactionQueryDto) {
    return this.financeService.listTransactionsForUser(user.sub, query);
  }

  @Get('transactions/:id')
  getTransaction(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.financeService.getTransactionForUser(user.sub, id);
  }

  @Post('transactions')
  createTransaction(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFinanceTransactionDto) {
    return this.financeService.createForUser(user.sub, dto);
  }

  @Patch('transactions/:id')
  updateTransaction(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateFinanceTransactionDto) {
    return this.financeService.updateForUser(user.sub, id, dto);
  }

  @Delete('transactions/:id')
  deleteTransaction(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.financeService.deleteForUser(user.sub, id);
  }

  @Get('categories')
  listCategories(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceCategoryQueryDto) {
    return this.financeService.listCategoriesForUser(user.sub, query);
  }

  @Post('categories')
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFinanceCategoryDto) {
    return this.financeService.createCategoryForUser(user.sub, dto);
  }

  @Patch('categories/:id')
  updateCategory(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateFinanceCategoryDto) {
    return this.financeService.updateCategoryForUser(user.sub, id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.financeService.deleteCategoryForUser(user.sub, id);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceSummaryQueryDto) {
    return this.financeService.getSummaryForUser(user.sub, query);
  }

  @Get('today')
  today(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceSummaryQueryDto) {
    return this.financeService.getTodayForUser(user.sub, query.currency);
  }
}
