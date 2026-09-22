import { describe, it, expect } from 'vitest';
import { requireRole, authenticate, type AuthenticatedRequest } from '../server/src/auth';
import { serverDb } from '../server/src/db';

describe('Executive Role Merger Tests (Director + Admin + Auditor)', () => {
  it('identifies Director, Admin, and Auditor as unified executive personnel in seed data', () => {
    const admin = serverDb.users.find(u => u.role === 'ADMIN');
    const director = serverDb.users.find(u => u.role === 'DIRECTOR');
    const auditor = serverDb.users.find(u => u.role === 'AUDITOR');

    expect(admin).toBeDefined();
    expect(director).toBeDefined();
    expect(auditor).toBeDefined();

    // All three accounts point to the same enterprise leader
    expect(admin?.fullName).toContain('Саидов Бахром');
    expect(director?.fullName).toContain('Саидов Бахром');
    expect(auditor?.fullName).toContain('Саидов Бахром');
    expect(admin?.phone).toBe(director?.phone);
  });

  it('allows DIRECTOR to access ADMIN-restricted endpoints via unified executive permissions', () => {
    const middleware = requireRole(['ADMIN']);
    let nextCalled = false;
    const req: AuthenticatedRequest = {
      user: {
        sub: 'usr-dir-1',
        username: 'director',
        role: 'DIRECTOR',
        fullName: 'Саидов Бахром'
      }
    } as any;
    const res: any = {
      status: () => ({ json: () => {} })
    };

    middleware(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('allows AUDITOR to access DIRECTOR-restricted endpoints via unified executive permissions', () => {
    const middleware = requireRole(['DIRECTOR']);
    let nextCalled = false;
    const req: AuthenticatedRequest = {
      user: {
        sub: 'usr-aud-1',
        username: 'auditor',
        role: 'AUDITOR',
        fullName: 'Саидов Бахром'
      }
    } as any;
    const res: any = {
      status: () => ({ json: () => {} })
    };

    middleware(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('blocks non-executive role (e.g. WORKER) from executive-only endpoints', () => {
    const middleware = requireRole(['ADMIN', 'DIRECTOR', 'AUDITOR']);
    let nextCalled = false;
    let statusCode = 0;
    let errorJson: any = null;

    const req: AuthenticatedRequest = {
      user: {
        sub: 'usr-wrk-1',
        username: 'worker_davron',
        role: 'WORKER',
        fullName: 'Даврон Мирзоев'
      }
    } as any;
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            errorJson = data;
          }
        };
      }
    };

    middleware(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(statusCode).toBe(403);
    expect(errorJson.error.code).toBe('FORBIDDEN');
  });

  it('secures role simulation in production mode (SEC-01 remediation check)', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      let statusCode = 0;
      let errorJson: any = null;
      let nextCalled = false;

      const req: AuthenticatedRequest = {
        headers: {
          'x-simulate-role': 'ADMIN'
        }
      } as any;

      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (data: any) => {
              errorJson = data;
            }
          };
        }
      };

      authenticate(req, res, () => {
        nextCalled = true;
      });

      // Must be rejected in production with HTTP 401
      expect(nextCalled).toBe(false);
      expect(statusCode).toBe(401);
      expect(errorJson.error.code).toBe('UNAUTHORIZED');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
