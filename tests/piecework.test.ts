import { describe, it, expect } from 'vitest';

describe('Worker Piecework & Tariff Calculation Tests (FTD Chapter 18)', () => {
  interface PieceworkEntry {
    volumeKg: number;
    tariffPerKg: number;
  }

  function calculatePieceworkWage(entry: PieceworkEntry): number {
    return Math.round(entry.volumeKg * entry.tariffPerKg * 100) / 100;
  }

  it('calculates individual piecework wage according to formula Volume * Tariff', () => {
    // 650.00 kg * 0.35 TJS/kg = 227.50 TJS
    const wage1 = calculatePieceworkWage({ volumeKg: 650.00, tariffPerKg: 0.35 });
    expect(wage1).toBe(227.50);

    // 1200.00 kg * 0.40 TJS/kg = 480.00 TJS
    const wage2 = calculatePieceworkWage({ volumeKg: 1200.00, tariffPerKg: 0.40 });
    expect(wage2).toBe(480.00);

    // Edge cases: fractional grams and roundings
    const wage3 = calculatePieceworkWage({ volumeKg: 333.33, tariffPerKg: 0.35 });
    expect(wage3).toBe(116.67);
  });

  it('correctly aggregates payroll for multiple operations in shift', () => {
    const shiftOperations = [
      { operation: 'PACKING', volumeKg: 500, tariffPerKg: 0.35 },
      { operation: 'SORTING', volumeKg: 300, tariffPerKg: 0.25 },
      { operation: 'PALLETIZING', volumeKg: 800, tariffPerKg: 0.15 }
    ];

    const totalShiftEarnings = shiftOperations.reduce((sum, op) => {
      return sum + calculatePieceworkWage(op);
    }, 0);

    // 500 * 0.35 = 175
    // 300 * 0.25 = 75
    // 800 * 0.15 = 120
    // Total = 370.00 TJS
    expect(totalShiftEarnings).toBe(370.00);
  });
});
