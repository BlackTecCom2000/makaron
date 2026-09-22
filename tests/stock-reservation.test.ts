import { describe, it, expect } from 'vitest';

describe('Inventory, Stock Reservation & Overdraft Protection Tests (FTD & TZ Chapters 58, 59, 115, 116, 117)', () => {
  interface StockItem {
    id: string;
    productName: string;
    quantityPhysical: number;
    quantityReserved: number;
  }

  function getAvailable(item: StockItem): number {
    return item.quantityPhysical - item.quantityReserved;
  }

  function reserveStock(item: StockItem, qty: number): void {
    const available = getAvailable(item);
    if (available < qty) {
      throw new Error(`INSUFFICIENT_STOCK: Доступно: ${available}, запрошено: ${qty}`);
    }
    item.quantityReserved += qty;
  }

  function dispatchStock(item: StockItem, qty: number): void {
    item.quantityPhysical = Math.max(0, item.quantityPhysical - qty);
    item.quantityReserved = Math.max(0, item.quantityReserved - qty);
  }

  it('correctly calculates Available = Physical - Reserved', () => {
    const stock: StockItem = {
      id: 'stk-1',
      productName: 'Вермишель 23кг',
      quantityPhysical: 1000,
      quantityReserved: 300
    };

    expect(getAvailable(stock)).toBe(700);
  });

  it('reserves stock successfully when available quantity is sufficient', () => {
    const stock: StockItem = {
      id: 'stk-2',
      productName: 'Макароны 23кг',
      quantityPhysical: 500,
      quantityReserved: 100
    };

    // Available is 400. Reserving 250
    reserveStock(stock, 250);
    expect(stock.quantityReserved).toBe(350);
    expect(getAvailable(stock)).toBe(150);
  });

  it('BLOCKS reservation and protects from overdraft when requested > available (INSUFFICIENT_STOCK)', () => {
    const stock: StockItem = {
      id: 'stk-3',
      productName: 'Лапша 23кг',
      quantityPhysical: 200,
      quantityReserved: 150
    };

    // Available is 50. Requesting 60 MUST throw
    expect(() => reserveStock(stock, 60)).toThrowError(/INSUFFICIENT_STOCK/);
    // Values must remain intact
    expect(stock.quantityReserved).toBe(150);
    expect(getAvailable(stock)).toBe(50);
  });

  it('deducts from physical and reserved stock upon physical dispatch', () => {
    const stock: StockItem = {
      id: 'stk-4',
      productName: 'Рожки 1кг',
      quantityPhysical: 1000,
      quantityReserved: 400
    };

    dispatchStock(stock, 400);
    expect(stock.quantityPhysical).toBe(600);
    expect(stock.quantityReserved).toBe(0);
    expect(getAvailable(stock)).toBe(600);
  });
});
