import { FinanceBudgetService } from '../src/finance/finance-budget.service';

describe('FinanceBudgetService', () => {
  const prisma = {
    financeBudget: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    financeTransaction: { findMany: jest.fn() },
  } as any;
  const financeService = {
    getCategoryBreakdown: jest.fn(),
    getPeriodSummary: jest.fn(),
  } as any;
  const activityLog = { record: jest.fn() } as any;
  let service: FinanceBudgetService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinanceBudgetService(prisma, financeService, activityLog);
  });

  describe('getCashflowForecast', () => {
    it('returns insufficientData when fewer than 3 distinct transaction days exist this month', async () => {
      prisma.financeTransaction.findMany.mockResolvedValue([
        { transactionDate: new Date('2026-08-01T10:00:00Z') },
        { transactionDate: new Date('2026-08-01T18:00:00Z') },
        { transactionDate: new Date('2026-08-02T10:00:00Z') },
      ]);
      const result = await service.getCashflowForecast('user-a', 'UZS' as any);
      expect(result.insufficientData).toBe(true);
      expect(financeService.getPeriodSummary).not.toHaveBeenCalled();
    });

    it('computes a linear forecast once at least 3 distinct days have activity', async () => {
      prisma.financeTransaction.findMany.mockResolvedValue([
        { transactionDate: new Date('2026-08-01T10:00:00Z') },
        { transactionDate: new Date('2026-08-02T10:00:00Z') },
        { transactionDate: new Date('2026-08-03T10:00:00Z') },
      ]);
      financeService.getPeriodSummary.mockResolvedValue({ netProfit: '300.00' });
      const result = await service.getCashflowForecast('user-a', 'UZS' as any);
      expect(result.insufficientData).toBe(false);
      expect(result.isForecast).toBe(true);
      expect(result.currency).toBe('UZS');
      expect(typeof result.forecastEndOfMonth).toBe('string');
    });
  });

  describe('getBudgetStatus', () => {
    it('flags a category budget as over-budget using the category breakdown total', async () => {
      prisma.financeBudget.findMany.mockResolvedValue([
        { id: 'budget-1', categoryId: 'cat-1', category: { id: 'cat-1', name: 'Reklama' }, amount: '100.00' },
      ]);
      financeService.getCategoryBreakdown.mockResolvedValue([
        { category: { id: 'cat-1', name: 'Reklama' }, total: '150.00' },
      ]);
      financeService.getPeriodSummary.mockResolvedValue({ totalExpense: '150.00' });
      const result = await service.getBudgetStatus('user-a', '2026-08', 'UZS' as any);
      expect(result.items[0]).toMatchObject({ budgeted: '100.00', spent: '150.00', isOverBudget: true });
    });

    it('uses the total expense summary for an overall (categoryless) budget', async () => {
      prisma.financeBudget.findMany.mockResolvedValue([
        { id: 'budget-2', categoryId: null, category: null, amount: '500.00' },
      ]);
      financeService.getCategoryBreakdown.mockResolvedValue([]);
      financeService.getPeriodSummary.mockResolvedValue({ totalExpense: '460.00' });
      const result = await service.getBudgetStatus('user-a', '2026-08', 'UZS' as any);
      expect(result.items[0]).toMatchObject({ spent: '460.00', isOverBudget: false, isNearLimit: true });
    });

    it('returns no items without querying finance data when there are no budgets for the month', async () => {
      prisma.financeBudget.findMany.mockResolvedValue([]);
      const result = await service.getBudgetStatus('user-a', '2026-08', 'UZS' as any);
      expect(result.items).toEqual([]);
      expect(financeService.getCategoryBreakdown).not.toHaveBeenCalled();
    });
  });
});
