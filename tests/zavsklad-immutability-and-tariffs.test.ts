import { describe, it, expect, beforeEach } from 'vitest';

const BASE_URL = 'http://localhost:3001/api/v1';

describe('Zavsklad Work Log Immutability & Executive Tariff Sovereignty (User Request)', () => {
  it('1. Zavsklad records work log: volume is recorded, but tariff & sum are strictly enforced by Executive rates and locked', async () => {
    // Zavsklad submits 500 kg for Комплектация, attempting to claim an arbitrary rogue tariff of 9.99 TJS/kg
    const res = await fetch(`${BASE_URL}/production/piecework-logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'ZAVSKLAD'
      },
      body: JSON.stringify({
        workerId: 'usr-wrk-1',
        workerName: 'Даврон Мирзоев',
        operationType: 'Комплектация',
        volumeKg: 500,
        tariffPerKg: 9.99 // Rogue tariff attempted by client
      })
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    const log = json.data;

    // Verify Volume
    expect(log.volumeKg).toBe(500);

    // Verify Tariff: The rogue 9.99 tariff MUST be rejected. Enforced executive rate is 0.15 TJS/kg
    expect(log.tariffPerKg).toBe(0.15);

    // Verify Calculated Sum: 500 * 0.15 = 75.00 TJS
    expect(log.totalAmount).toBe(75.00);

    // Verify Immutability lock flags
    expect(log.isLocked).toBe(true);
    expect(log.lockedAt).toBeDefined();
  });

  it('2. Zavsklad is strictly FORBIDDEN from modifying a locked work log (HTTP 403 Forbidden)', async () => {
    // Create initial log
    const createRes = await fetch(`${BASE_URL}/production/piecework-logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'ZAVSKLAD'
      },
      body: JSON.stringify({
        workerId: 'usr-wrk-1',
        workerName: 'Даврон Мирзоев',
        operationType: 'Комплектация',
        volumeKg: 200
      })
    });
    const createJson = await createRes.json();
    const logId = createJson.data.id;

    // Zavsklad attempts to alter data
    const patchRes = await fetch(`${BASE_URL}/production/piecework-logs/${logId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'ZAVSKLAD'
      },
      body: JSON.stringify({
        volumeKg: 999,
        tariffPerKg: 5.0
      })
    });

    expect(patchRes.status).toBe(403);
    const patchJson = await patchRes.json();
    expect(patchJson.success).toBe(false);
    expect(patchJson.error.code).toBe('FORBIDDEN_IMMUTABLE_LOG');
  });

  it('3. Zavsklad is strictly FORBIDDEN from deleting a locked work log (HTTP 403 Forbidden)', async () => {
    // Create initial log
    const createRes = await fetch(`${BASE_URL}/production/piecework-logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'ZAVSKLAD'
      },
      body: JSON.stringify({
        workerId: 'usr-wrk-2',
        workerName: 'Искандар Каримов',
        operationType: 'Комплектация',
        volumeKg: 100
      })
    });
    const createJson = await createRes.json();
    const logId = createJson.data.id;

    // Zavsklad attempts to delete
    const deleteRes = await fetch(`${BASE_URL}/production/piecework-logs/${logId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'ZAVSKLAD'
      }
    });

    expect(deleteRes.status).toBe(403);
    const deleteJson = await deleteRes.json();
    expect(deleteJson.success).toBe(false);
    expect(deleteJson.error.code).toBe('FORBIDDEN_IMMUTABLE_LOG');
  });

  it('4. Chief Executive (DIRECTOR / ADMIN) CAN adjust volume, rate, recalculate sum, and write audit trail', async () => {
    // Create initial log by Zavsklad
    const createRes = await fetch(`${BASE_URL}/production/piecework-logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'ZAVSKLAD'
      },
      body: JSON.stringify({
        workerId: 'usr-wrk-1',
        workerName: 'Даврон Мирзоев',
        operationType: 'Комплектация',
        volumeKg: 300
      })
    });
    const createJson = await createRes.json();
    const logId = createJson.data.id;

    // Director adjusts volume and applies new executive rate
    const patchRes = await fetch(`${BASE_URL}/production/piecework-logs/${logId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'DIRECTOR'
      },
      body: JSON.stringify({
        volumeKg: 400,
        tariffPerKg: 0.20,
        reason: 'Пересчет партии по распоряжению Директора'
      })
    });

    expect(patchRes.status).toBe(200);
    const patchJson = await patchRes.json();
    expect(patchJson.success).toBe(true);
    const updated = patchJson.data;

    expect(updated.volumeKg).toBe(400);
    expect(updated.tariffPerKg).toBe(0.20);
    expect(updated.totalAmount).toBe(80.00); // 400 * 0.20
    expect(updated.modifiedBy).toBeDefined();
  });

  it('5. Chief Executive (DIRECTOR / ADMIN) CAN annul a record with audit logging', async () => {
    // Create initial log
    const createRes = await fetch(`${BASE_URL}/production/piecework-logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'ZAVSKLAD'
      },
      body: JSON.stringify({
        workerId: 'usr-wrk-3',
        workerName: 'Олим Рахимов',
        operationType: 'Комплектация',
        volumeKg: 150
      })
    });
    const createJson = await createRes.json();
    const logId = createJson.data.id;

    // Director annuls the record
    const deleteRes = await fetch(`${BASE_URL}/production/piecework-logs/${logId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulate-Role': 'DIRECTOR'
      },
      body: JSON.stringify({ reason: 'Ошибочная фиксация дублирующей партии' })
    });

    expect(deleteRes.status).toBe(200);
    const deleteJson = await deleteRes.json();
    expect(deleteJson.success).toBe(true);
  });
});
