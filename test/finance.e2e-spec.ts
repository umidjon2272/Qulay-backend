import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Finance API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerId: string;
  let otherUserId: string;
  let ownerToken: string;
  let otherToken: string;
  let incomeId: string;
  let expenseId: string;
  let expenseCategoryId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    prisma = app.get(PrismaService);
    await app.init();

    const password = 'StrongPassword123!';
    const owner = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: `finance-owner-${Date.now()}@example.com`, password, firstName: 'Finance', lastName: 'Owner' })
      .expect(201);
    const other = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: `finance-other-${Date.now()}@example.com`, password, firstName: 'Finance', lastName: 'Other' })
      .expect(201);
    ownerId = owner.body.user.id;
    otherUserId = other.body.user.id;
    ownerToken = owner.body.accessToken;
    otherToken = other.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: ownerId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: otherUserId } }).catch(() => undefined);
    await app.close();
  });

  it('creates default categories and scopes category ownership', async () => {
    const categories = await request(app.getHttpServer())
      .get('/api/finance/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(categories.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Savdo', type: 'INCOME' }),
      expect.objectContaining({ name: 'Reklama', type: 'EXPENSE' }),
    ]));
    expenseCategoryId = categories.body.find((category: { name: string; type: string }) => category.name === 'Reklama' && category.type === 'EXPENSE').id;

    const created = await request(app.getHttpServer())
      .post('/api/finance/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Custom expense', type: 'EXPENSE', color: '#ff0000' })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/finance/categories/' + created.body.id)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Custom expense updated' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/finance/categories/' + created.body.id)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });

  it('creates income and expense with Decimal amounts and protects transactions', async () => {
    const contact = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ firstName: 'Aziz', displayName: 'Aziz Supplier' })
      .expect(201);
    const income = await request(app.getHttpServer())
      .post('/api/finance/transactions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'INCOME', amount: '1000.50', currency: 'USD', title: 'Service payment', transactionDate: '2026-08-15T10:00:00Z', contactId: contact.body.id })
      .expect(201);
    incomeId = income.body.id;
    expect(income.body.amount).toBe('1000.50');

    const expense = await request(app.getHttpServer())
      .post('/api/finance/transactions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'EXPENSE', amount: '250.25', currency: 'USD', title: 'Ad campaign', transactionDate: '2026-08-16T10:00:00Z', categoryId: expenseCategoryId })
      .expect(201);
    expenseId = expense.body.id;

    await request(app.getHttpServer())
      .get('/api/finance/transactions')
      .query({ type: 'EXPENSE', categoryId: expenseCategoryId, from: '2026-08-01', to: '2026-09-01', minAmount: '200' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0].id).toBe(expenseId);
        expect(response.body.meta.total).toBe(1);
      });

    await request(app.getHttpServer())
      .get('/api/finance/transactions/' + incomeId)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/finance/transactions')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ type: 'EXPENSE', amount: '10', currency: 'USD', title: 'Foreign category', transactionDate: '2026-08-16T10:00:00Z', categoryId: expenseCategoryId })
      .expect(404);
  });

  it('updates and deletes transactions, and logs safe activity metadata', async () => {
    await request(app.getHttpServer())
      .patch('/api/finance/transactions/' + expenseId)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: '300.00', title: 'Updated campaign' })
      .expect(200)
      .expect((response) => expect(response.body.amount).toBe('300.00'));

    await request(app.getHttpServer())
      .delete('/api/finance/transactions/' + expenseId)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete('/api/finance/transactions/' + expenseId)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const logs = await prisma.activityLog.findMany({ where: { userId: ownerId, entityType: 'FINANCE_TRANSACTION' } });
    expect(logs.map((log) => log.action)).toEqual(expect.arrayContaining([
      'FINANCE_TRANSACTION_CREATED',
      'FINANCE_TRANSACTION_UPDATED',
      'FINANCE_TRANSACTION_DELETED',
    ]));
    expect(logs.some((log) => JSON.stringify(log.metadata).includes('1000.50'))).toBe(false);
  });

  it('calculates exact summary and refuses mixed-currency totals without a currency', async () => {
    await request(app.getHttpServer())
      .post('/api/finance/transactions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'EXPENSE', amount: '100', currency: 'UZS', title: 'Office', transactionDate: '2026-08-17T10:00:00Z' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/finance/summary')
      .query({ from: '2026-08-01', to: '2026-09-01' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/finance/summary')
      .query({ from: '2026-08-01', to: '2026-09-01', currency: 'USD' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.totalIncome).toBe('1000.50');
        expect(response.body.totalExpense).toBe('0.00');
        expect(response.body.netProfit).toBe('1000.50');
        expect(response.body.incomeCount).toBe(1);
        expect(response.body.expenseCount).toBe(0);
      });
  });

  it('uncategorizes transactions when a category is deleted and returns today data', async () => {
    const category = await request(app.getHttpServer())
      .post('/api/finance/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Delete me', type: 'EXPENSE' })
      .expect(201);
    const transaction = await request(app.getHttpServer())
      .post('/api/finance/transactions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'EXPENSE', amount: '5', currency: 'UZS', title: 'Categorized', transactionDate: '2026-08-20T10:00:00Z', categoryId: category.body.id })
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/finance/categories/' + category.body.id)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const stored = await prisma.financeTransaction.findUnique({ where: { id: transaction.body.id } });
    expect(stored?.categoryId).toBeNull();

    const todayTransaction = await request(app.getHttpServer())
      .post('/api/finance/transactions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'INCOME', amount: '7', currency: 'UZS', title: 'Today', transactionDate: new Date().toISOString() })
      .expect(201);
    expect(todayTransaction.body.id).toBeDefined();
    await request(app.getHttpServer())
      .get('/api/finance/today')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.todayIncome).toBe('7.00');
        expect(response.body.recentTransactions.map((item: { id: string }) => item.id)).toContain(todayTransaction.body.id);
      });
  });
});
