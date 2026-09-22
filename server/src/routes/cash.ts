import { Router } from 'express';
import { serverDb } from '../db.js';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth.js';
import { broadcastWsEvent } from '../websocket.js';

export const cashRouter = Router();

// GET /api/v1/cash/balance - получить текущий остаток кассы
cashRouter.get('/balance', authenticate, (req: AuthenticatedRequest, res) => {
  const account = serverDb.cashAccounts.find(a => a.isDefault) || serverDb.cashAccounts[0];
  if (!account) {
    return res.status(404).json({ error: 'Операционная касса не инициализирована' });
  }

  // Расчет оборотов за текущий период
  const txs = serverDb.cashTransactions.filter(t => t.accountId === account.id);
  const totalIncome = Number(txs.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0).toFixed(2));
  const totalExpense = Number(txs.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0).toFixed(2));

  res.json({
    success: true,
    data: {
      accountId: account.id,
      code: account.code,
      name: account.name,
      openingBalance: account.openingBalance,
      currentBalance: account.currentBalance,
      totalIncome,
      totalExpense,
      currency: account.currency,
      updatedAt: account.updatedAt
    }
  });
});

// GET /api/v1/cash/transactions - журнал кассовых проводок
cashRouter.get('/transactions', authenticate, (req: AuthenticatedRequest, res) => {
  const { type, limit = 50 } = req.query;
  let txs = serverDb.cashTransactions;
  if (type) {
    txs = txs.filter(t => t.type === String(type).toUpperCase());
  }
  res.json({
    success: true,
    data: txs.slice(0, Number(limit))
  });
});

// POST /api/v1/cash/transactions - проведение приходного / расходного ордера
cashRouter.post('/transactions', authenticate, requireRole(['ADMIN', 'DIRECTOR', 'ZAVSKLAD', 'POINT']), (req: AuthenticatedRequest, res) => {
  const { accountId, type, category, amount, referenceEntity, referenceId, description } = req.body;

  if (!type || !['INCOME', 'EXPENSE'].includes(type)) {
    return res.status(400).json({ error: 'Тип операции должен быть INCOME или EXPENSE' });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Сумма операции должна быть положительным числом' });
  }

  if (!category || !description) {
    return res.status(400).json({ error: 'Категория и назначение платежа обязательны' });
  }

  try {
    const actorUser = req.user;
    const tx = serverDb.recordCashTransaction({
      accountId,
      type,
      category,
      amount,
      referenceEntity,
      referenceId,
      description,
      authorUserId: actorUser?.sub || 'usr-admin',
      authorName: actorUser?.fullName || 'Администратор'
    });

    broadcastWsEvent('cash', 'CASH_TRANSACTION_RECORDED', {
      transactionId: tx.id,
      type: tx.type,
      amount: tx.amount,
      balanceAfter: tx.balanceAfter
    });

    res.status(201).json({
      success: true,
      data: tx
    });
  } catch (err: any) {
    const isOverdraft = err.message?.includes('INSUFFICIENT_FUNDS');
    res.status(isOverdraft ? 422 : 400).json({
      error: err.message || 'Ошибка кассовой проводки'
    });
  }
});

export default cashRouter;
