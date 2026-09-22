import { describe, it, expect } from 'vitest';

describe('Order Calculation & Business Logic Tests (FTD Chapters 14, 15)', () => {
  interface OrderItem {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    weightPerUnitKg: number;
  }

  function calculateOrderTotals(items: OrderItem[]) {
    let totalWeightKg = 0;
    let totalSum = 0;
    for (const item of items) {
      totalWeightKg += item.quantity * item.weightPerUnitKg;
      totalSum += item.quantity * item.price;
    }
    return {
      totalWeightKg: Math.round(totalWeightKg * 100) / 100,
      totalSum: Math.round(totalSum * 100) / 100
    };
  }

  it('calculates order total sum and weight correctly for multi-item orders', () => {
    const items: OrderItem[] = [
      { productId: 'p1', productName: 'Спагетти 400г', quantity: 500, price: 6.50, weightPerUnitKg: 0.40 },
      { productId: 'p2', productName: 'Рожки 1кг', quantity: 300, price: 12.00, weightPerUnitKg: 1.00 }
    ];

    const totals = calculateOrderTotals(items);
    // 500 * 0.40 + 300 * 1.00 = 200 + 300 = 500 kg
    expect(totals.totalWeightKg).toBe(500.00);
    // 500 * 6.50 + 300 * 12.00 = 3250 + 3600 = 6850 TJS
    expect(totals.totalSum).toBe(6850.00);
  });

  it('enforces Supply Mode 1 vs Mode 2 invariants', () => {
    function validateOrderMode(order: { supplyMode: string; pointId?: string; shopId?: string }) {
      if (order.supplyMode === 'MODE_1_POINT') {
        if (!order.pointId) throw new Error('POINT_REQUIRED');
      } else if (order.supplyMode === 'MODE_2_SHOP') {
        if (!order.shopId) throw new Error('SHOP_REQUIRED');
      } else {
        throw new Error('INVALID_MODE');
      }
      return true;
    }

    expect(() => validateOrderMode({ supplyMode: 'MODE_1_POINT' })).toThrow('POINT_REQUIRED');
    expect(validateOrderMode({ supplyMode: 'MODE_1_POINT', pointId: 'pt-01' })).toBe(true);

    expect(() => validateOrderMode({ supplyMode: 'MODE_2_SHOP' })).toThrow('SHOP_REQUIRED');
    expect(validateOrderMode({ supplyMode: 'MODE_2_SHOP', shopId: 'shp-101' })).toBe(true);
  });

  it('validates 3 delivery confirmation methods and required metadata', () => {
    function validateDeliveryConfirmation(method: string, payload: any) {
      if (!['E_BUTTON', 'CANVAS_SIGNATURE', 'PHOTO_PROOF'].includes(method)) {
        throw new Error('INVALID_METHOD');
      }
      if (method === 'CANVAS_SIGNATURE' && !payload.signatureData) {
        throw new Error('SIGNATURE_REQUIRED');
      }
      if (method === 'PHOTO_PROOF' && !payload.photoUrl) {
        throw new Error('PHOTO_REQUIRED');
      }
      return true;
    }

    expect(validateDeliveryConfirmation('E_BUTTON', {})).toBe(true);
    expect(() => validateDeliveryConfirmation('CANVAS_SIGNATURE', {})).toThrow('SIGNATURE_REQUIRED');
    expect(validateDeliveryConfirmation('CANVAS_SIGNATURE', { signatureData: 'data:image/png;base64,abc' })).toBe(true);
    expect(() => validateDeliveryConfirmation('PHOTO_PROOF', {})).toThrow('PHOTO_REQUIRED');
    expect(validateDeliveryConfirmation('PHOTO_PROOF', { photoUrl: 'https://proofs.internal/1.jpg' })).toBe(true);
  });
});
