import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { MasterDatabase } from '../server/src/db';
import path from 'node:path';
import fs from 'node:fs';

const testDbPath = path.resolve(process.cwd(), 'server', 'data', 'test-cash-db.json');

describe('Cash Operations Subsystem (BR-CASH-001)', () => {
  let db: MasterDatabase;

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
    db = new MasterDatabase(testDbPath);
  });

  afterAll(() => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  });

  it('BR-CASH-001: Correctly updates balance on income: Closing = Opening + Income', () => {
    const account = db.cashAccounts[0];
    const initialBalance = account.currentBalance;

    const tx = db.recordCashTransaction({
      accountId: account.id,
      type: 'INCOME',
      category: 'POINT_CASH_COLLECTION',
      amount: 3500.00,
      description: 'Инкассация Точки №1',
      authorUserId: 'usr-admin',
      authorName: 'Ином Султонов'
    });

    expect(tx.balanceAfter).toBe(Number((initialBalance + 3500.00).toFixed(2)));
    expect(account.currentBalance).toBe(tx.balanceAfter);
    expect(tx.type).toBe('INCOME');
  });

  it('BR-CASH-001: Correctly deducts on expense: Closing = Balance - Expense', () => {
    const account = db.cashAccounts[0];
    const initialBalance = account.currentBalance;

    const tx = db.recordCashTransaction({
      accountId: account.id,
      type: 'EXPENSE',
      category: 'DRIVER_FUEL_EXPENSE',
      amount: 450.00,
      description: 'Компенсация ГСМ водителю',
      authorUserId: 'usr-admin',
      authorName: 'Ином Султонов'
    });

    expect(tx.balanceAfter).toBe(Number((initialBalance - 450.00).toFixed(2)));
    expect(account.currentBalance).toBe(tx.balanceAfter);
    expect(tx.type).toBe('EXPENSE');
  });

  it('BR-CASH-001: Strictly prevents overdraft when expense exceeds balance', () => {
    const account = db.cashAccounts[0];
    const excessiveAmount = account.currentBalance + 100000;

    expect(() => {
      db.recordCashTransaction({
        accountId: account.id,
        type: 'EXPENSE',
        category: 'LARGE_UNAUTHORIZED_EXPENSE',
        amount: excessiveAmount,
        description: 'Попытка перерасхода кассы',
        authorUserId: 'usr-admin',
        authorName: 'Ином Султонов'
      });
    }).toThrow(/INSUFFICIENT_FUNDS/);
  });

  it('BR-CASH-001: Validates that transaction amounts must be strictly positive', () => {
    const account = db.cashAccounts[0];

    expect(() => {
      db.recordCashTransaction({
        accountId: account.id,
        type: 'INCOME',
        category: 'INVALID',
        amount: -500,
        description: 'Отрицательная сумма',
        authorUserId: 'usr-admin',
        authorName: 'Ином Султонов'
      });
    }).toThrow();

    expect(() => {
      db.recordCashTransaction({
        accountId: account.id,
        type: 'EXPENSE',
        category: 'INVALID',
        amount: 0,
        description: 'Нулевая сумма',
        authorUserId: 'usr-admin',
        authorName: 'Ином Султонов'
      });
    }).toThrow();
  });
});
