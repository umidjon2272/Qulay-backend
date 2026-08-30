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
import { FinanceBudgetService } from './finance-budget.service';
import { CreateFinanceBudgetDto, UpdateFinanceBudgetDto } from './dto/finance-budget.dto';
import { CreateFinanceAccountDto, UpdateFinanceAccountDto } from './dto/finance-account.dto';
import { BadRequestException } from '@nestjs/common';
import { FinanceCurrency } from '@prisma/client';

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly financeBudgetService: FinanceBudgetService,
  ) {}

  @Get('budgets')
  listBudgets(@CurrentUser() user: AuthenticatedUser, @Query('monthKey') monthKey?: string) {
    return this.financeBudgetService.listForUser(user.sub, monthKey);
  }

  @Post('budgets')
  createBudget(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFinanceBudgetDto) {
    return this.financeBudgetService.createForUser(user.sub, dto);
  }

  @Patch('budgets/:id')
  updateBudget(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateFinanceBudgetDto) {
    return this.financeBudgetService.updateForUser(user.sub, id, dto);
  }

  @Delete('budgets/:id')
  deleteBudget(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.financeBudgetService.deleteForUser(user.sub, id);
  }

  @Get('budgets/status')
  budgetStatus(@CurrentUser() user: AuthenticatedUser, @Query('currency') currency?: FinanceCurrency, @Query('monthKey') monthKey?: string) {
    if (!currency) throw new BadRequestException('currency query is required');
    return this.financeBudgetService.getBudgetStatus(user.sub, monthKey, currency);
  }

  @Get('forecast')
  forecast(@CurrentUser() user: AuthenticatedUser, @Query('currency') currency?: FinanceCurrency) {
    if (!currency) throw new BadRequestException('currency query is required');
    return this.financeBudgetService.getCashflowForecast(user.sub, currency);
  }

  @Get('transactions')
  listTransactions(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceTransactionQueryDto) {
    return this.financeService.listTransactionsForUser(user.sub, query);
  }

  @Get('accounts')
  listAccounts(@CurrentUser() user: AuthenticatedUser, @Query('currency') currency?: FinanceCurrency) {
    return this.financeService.listAccountsForUser(user.sub, currency);
  }

  @Post('accounts')
  createAccount(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFinanceAccountDto) {
    return this.financeService.createAccountForUser(user.sub, dto);
  }

  @Patch('accounts/:id')
  updateAccount(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateFinanceAccountDto) {
    return this.financeService.updateAccountForUser(user.sub, id, dto);
  }

  @Delete('accounts/:id')
  archiveAccount(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.financeService.archiveAccountForUser(user.sub, id);
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
