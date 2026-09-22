import { db } from '../db/database';
import type { User, RoleCode, AuditLog } from '../types';

export async function logAudit(
  user: User | { id: string; fullName: string; role: RoleCode },
  actionType: string,
  entityName: string,
  entityId: string,
  diffSummary: string,
  reason?: string,
  oldValuesJson?: any,
  newValuesJson?: any,
  geoLat?: number,
  geoLng?: number
): Promise<string> {
  const auditId = 'audit-' + Math.random().toString(36).substring(2, 9);
  const log: AuditLog = {
    id: auditId,
    userId: user.id,
    userName: user.fullName,
    roleCode: user.role,
    actionType,
    entityName,
    entityId,
    oldValuesJson,
    newValuesJson,
    diffSummary,
    reason: reason || undefined,
    ipAddress: '192.168.1.' + Math.floor(Math.random() * 200 + 10),
    deviceInfo: navigator.userAgent.substring(0, 30),
    geoLat,
    geoLng,
    timestamp: new Date().toISOString()
  };

  await db.auditLogs.add(log);
  return auditId;
}
