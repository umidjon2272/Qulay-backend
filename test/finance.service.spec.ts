import { BadRequestException } from '@nestjs/common';
import { FinanceService } from '../src/finance/finance.service';

describe('FinanceService', () => {
  const prisma = {
    financeTransaction: { findMany: jest.fn(), groupBy: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
    financeCategory: { findMany: jest.fn(), findFirst: jest.fn() },
  } as any;
  const activityLog = { record: jest.fn() } as any;
  let service: FinanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinanceService(prisma, activityLog);
  });

  it('rejects mixed currencies before calculating a combined summary', async () => {
    prisma.financeTransaction.findMany.mockResolvedValue([{ currency: 'UZS' }, { currency: 'USD' }]);
    await expect(service.getPeriodSummary('user-a', new Date('2026-08-01Z'), new Date('2026-09-01Z')))
      .rejects.toThrow(BadRequestException);
    expect(prisma.financeTransaction.groupBy).not.toHaveBeenCalled();
  });

  it('calculates period comparison differences and percentage changes with Decimal arithmetic', async () => {
    prisma.financeTransaction.groupBy
      .mockResolvedValueOnce([
        { type: 'INCOME', _sum: { amount: '150.00' }, _count: { _all: 1 } },
        { type: 'EXPENSE', _sum: { amount: '50.00' }, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { type: 'INCOME', _sum: { amount: '100.00' }, _count: { _all: 1 } },
        { type: 'EXPENSE', _sum: { amount: '40.00' }, _count: { _all: 1 } },
      ]);
    const result = await service.comparePeriods(
      'user-a',
      new Date('2026-08-01Z'), new Date('2026-09-01Z'),
      new Date('2026-07-01Z'), new Date('2026-08-01Z'),
      'USD' as any,
    );
    expect(result.incomeDifference).toBe('50.00');
    expect(result.expenseDifference).toBe('10.00');
    expect(result.profitDifference).toBe('40.00');
    expect(result.percentageChange).toEqual({ income: '50.00', expense: '25.00', profit: '66.67' });
  });
});
