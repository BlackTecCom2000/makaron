import { describe, it, expect } from 'vitest';

describe('2-Step Loading Reconciliation & Mismatch Blocking Tests (FTD Chapters 20, 26)', () => {
  interface LoadingSheet {
    id: string;
    totalPackagesWarehouse: number;
    totalWeightWarehouseKg: number;
    totalPackagesDriver: number;
    totalWeightDriverKg: number;
    status: 'WAREHOUSE_VERIFIED' | 'DRIVER_VERIFIED' | 'MATCH' | 'MISMATCH' | 'DISPATCHED';
    weightDeltaKg: number;
    packageDelta: number;
    canStartRoute: boolean;
    discrepancyReason?: string;
  }

  function reconcileLoading(loading: LoadingSheet): LoadingSheet {
    const weightDelta = Math.abs(loading.totalWeightWarehouseKg - loading.totalWeightDriverKg);
    const pkgDelta = Math.abs(loading.totalPackagesWarehouse - loading.totalPackagesDriver);
    const weightRounded = Math.round(weightDelta * 100) / 100;

    const isMatch = (weightRounded <= 0.5) && (pkgDelta === 0);

    return {
      ...loading,
      weightDeltaKg: weightRounded,
      packageDelta: pkgDelta,
      status: isMatch ? 'MATCH' : 'MISMATCH',
      canStartRoute: isMatch,
      discrepancyReason: isMatch
        ? undefined
        : `Расхождение погрузки: склад ${loading.totalWeightWarehouseKg} кг vs водитель ${loading.totalWeightDriverKg} кг (дельта ${weightRounded} кг)`
    };
  }

  function attemptStartRoute(loading: LoadingSheet) {
    if (loading.status !== 'MATCH' || !loading.canStartRoute) {
      throw new Error(`START_ROUTE_BLOCKED: ${loading.discrepancyReason || 'Loading not verified'}`);
    }
    return { ...loading, status: 'DISPATCHED' as const };
  }

  it('approves route start when warehouse and driver weights and packages match', () => {
    const sheet: LoadingSheet = {
      id: 'load-01',
      totalPackagesWarehouse: 800,
      totalWeightWarehouseKg: 500.00,
      totalPackagesDriver: 800,
      totalWeightDriverKg: 500.00,
      status: 'DRIVER_VERIFIED',
      weightDeltaKg: 0,
      packageDelta: 0,
      canStartRoute: false
    };

    const reconciled = reconcileLoading(sheet);
    expect(reconciled.status).toBe('MATCH');
    expect(reconciled.canStartRoute).toBe(true);
    expect(reconciled.weightDeltaKg).toBe(0);

    const dispatched = attemptStartRoute(reconciled);
    expect(dispatched.status).toBe('DISPATCHED');
  });

  it('BLOCKS route start when driver weight is 480 kg vs warehouse 500 kg (MISMATCH)', () => {
    const sheet: LoadingSheet = {
      id: 'load-02',
      totalPackagesWarehouse: 800,
      totalWeightWarehouseKg: 500.00,
      totalPackagesDriver: 780,
      totalWeightDriverKg: 480.00,
      status: 'DRIVER_VERIFIED',
      weightDeltaKg: 0,
      packageDelta: 0,
      canStartRoute: false
    };

    const reconciled = reconcileLoading(sheet);
    expect(reconciled.status).toBe('MISMATCH');
    expect(reconciled.canStartRoute).toBe(false);
    expect(reconciled.weightDeltaKg).toBe(20.00);
    expect(reconciled.packageDelta).toBe(20);

    // Starting route MUST throw blocking exception
    expect(() => attemptStartRoute(reconciled)).toThrowError(/START_ROUTE_BLOCKED/);
  });

  it('allows supervisor override to resolve discrepancy and unblock route start', () => {
    const sheet: LoadingSheet = {
      id: 'load-03',
      totalPackagesWarehouse: 800,
      totalWeightWarehouseKg: 500.00,
      totalPackagesDriver: 780,
      totalWeightDriverKg: 480.00,
      status: 'MISMATCH',
      weightDeltaKg: 20.00,
      packageDelta: 20,
      canStartRoute: false,
      discrepancyReason: 'Расхождение веса'
    };

    // Supervisor resolves discrepancy: reloads missing 20 packages
    const overrideResolution = (current: LoadingSheet, note: string): LoadingSheet => {
      if (!note) throw new Error('NOTE_REQUIRED');
      return {
        ...current,
        totalPackagesDriver: current.totalPackagesWarehouse,
        totalWeightDriverKg: current.totalWeightWarehouseKg,
        weightDeltaKg: 0,
        packageDelta: 0,
        status: 'MATCH',
        canStartRoute: true,
        discrepancyReason: undefined
      };
    };

    const resolved = overrideResolution(sheet, 'Догружено 20 упаковок со склада');
    expect(resolved.status).toBe('MATCH');
    expect(resolved.canStartRoute).toBe(true);

    const dispatched = attemptStartRoute(resolved);
    expect(dispatched.status).toBe('DISPATCHED');
  });
});
