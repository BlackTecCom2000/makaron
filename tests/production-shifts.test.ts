import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { MasterDatabase } from '../server/src/db';
import path from 'node:path';
import fs from 'node:fs';

const testDbPath = path.resolve(process.cwd(), 'server', 'data', 'test-prod-db.json');

describe('Production Operations & Shifts Subsystem (BR-PROD-001, BR-PROD-002, BR-PROD-003)', () => {
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

  it('BR-PROD-001: Correctly calculates total weight: Quantity * PackageWeightKg', () => {
    const batch = db.recordProductionBatch({
      date: '2026-09-23',
      shift: 'SHIFT_1',
      lineId: 'LINE-01',
      productPackageId: 'prod-03',
      productName: 'Вермишель Тонкая 23кг',
      packageWeightKg: 23.00,
      quantity: 40,
      workerIds: ['usr-wrk-1'],
      workerNames: ['Даврон Мирзоев'],
      createdByUserId: 'usr-admin',
      createdByName: 'Ином Султонов'
    });

    expect(batch.totalWeightKg).toBe(920.00); // 40 * 23 = 920 kg
    expect(batch.quantity).toBe(40);
    expect(batch.status).toBe('COMPLETED');
  });

  it('BR-PROD-002: Distinguishes between Day (SHIFT_1) and Night (SHIFT_2) shifts', () => {
    const dayBatch = db.recordProductionBatch({
      date: '2026-09-23',
      shift: 'SHIFT_1',
      lineId: 'LINE-01',
      productPackageId: 'prod-04',
      productName: 'Макароны Перо 23кг',
      packageWeightKg: 23.00,
      quantity: 50,
      workerIds: ['usr-wrk-1'],
      workerNames: ['Даврон Мирзоев'],
      createdByUserId: 'usr-admin',
      createdByName: 'Ином Султонов'
    });

    const nightBatch = db.recordProductionBatch({
      date: '2026-09-23',
      shift: 'SHIFT_2',
      lineId: 'LINE-01',
      productPackageId: 'prod-04',
      productName: 'Макароны Перо 23кг',
      packageWeightKg: 23.00,
      quantity: 30,
      workerIds: ['usr-pck-1'],
      workerNames: ['Собир Комплектовщик'],
      createdByUserId: 'usr-admin',
      createdByName: 'Ином Султонов'
    });

    expect(dayBatch.shift).toBe('SHIFT_1');
    expect(nightBatch.shift).toBe('SHIFT_2');

    const dayOps = db.productionOperations.filter(o => o.date === '2026-09-23' && o.shift === 'SHIFT_1');
    const nightOps = db.productionOperations.filter(o => o.date === '2026-09-23' && o.shift === 'SHIFT_2');

    expect(dayOps.length).toBeGreaterThanOrEqual(1);
    expect(nightOps.length).toBeGreaterThanOrEqual(1);
  });

  it('BR-PROD-003: Automatically receipts finished goods into stock and creates StockMovement', () => {
    const initialStockItem = db.stock.find(s => s.productPackageId === 'prod-03');
    const initialQty = initialStockItem ? initialStockItem.quantityPhysical : 0;

    const batch = db.recordProductionBatch({
      date: '2026-09-23',
      shift: 'SHIFT_1',
      lineId: 'LINE-01',
      productPackageId: 'prod-03',
      productName: 'Вермишель Тонкая 23кг',
      packageWeightKg: 23.00,
      quantity: 100,
      workerIds: ['usr-wrk-1'],
      workerNames: ['Даврон Мирзоев'],
      createdByUserId: 'usr-admin',
      createdByName: 'Ином Султонов'
    });

    const updatedStock = db.stock.find(s => s.productPackageId === 'prod-03');
    expect(updatedStock).toBeDefined();
    expect(updatedStock!.quantityPhysical).toBe(initialQty + 100);
    expect(updatedStock!.availableQuantity).toBe(updatedStock!.quantityPhysical - updatedStock!.quantityReserved);

    // Verify StockMovement entry
    const movement = db.stockMovements.find(m => m.referenceId === batch.id);
    expect(movement).toBeDefined();
    expect(movement!.type).toBe('PRODUCTION_RECEIPT');
    expect(movement!.deltaQuantity).toBe(100);
  });
});
