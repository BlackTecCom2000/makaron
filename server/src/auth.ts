import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { serverDb, type ServerUser } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'makaron_secret_jwt_key_2026_enterprise_f_drive';

export interface AuthTokenPayload {
  sub: string;
  username: string;
  role: ServerUser['role'];
  fullName: string;
  pointId?: string;
  agentId?: string;
}

export function generateToken(user: ServerUser): string {
  const payload: AuthTokenPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    fullName: user.fullName,
    pointId: user.pointId,
    agentId: user.agentId
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // If no header, check if role simulation header exists for dev convenience (strictly non-production)
    if (process.env.NODE_ENV !== 'production') {
      const simRole = req.headers['x-simulate-role'] as string;
      if (simRole) {
        // DIRECTOR, ADMIN, AUDITOR — это 1 человек с едиными правами
        const isExec = ['DIRECTOR', 'ADMIN', 'AUDITOR'].includes(simRole);
        const u = serverDb.users.find(x => isExec ? ['DIRECTOR', 'ADMIN', 'AUDITOR'].includes(x.role) : x.role === simRole);
        if (u) {
          req.user = {
            sub: u.id,
            username: u.username,
            role: isExec ? 'ADMIN' : u.role,
            fullName: u.fullName,
            pointId: u.pointId,
            agentId: u.agentId
          };
          return next();
        }
      }
    }
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header', status: 401 }
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'JWT token expired or invalid', status: 401 }
    });
  }
}

export function requireRole(allowedRoles: ServerUser['role'][]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required', status: 401 }
      });
    }

    // DIRECTOR, ADMIN, AUDITOR — это 1 человек (единое руководство с полным суверенным доступом)
    const isExecutive = ['ADMIN', 'DIRECTOR', 'AUDITOR'].includes(req.user.role);
    const requiresExecutive = allowedRoles.some(r => ['ADMIN', 'DIRECTOR', 'AUDITOR'].includes(r));

    if (isExecutive && (requiresExecutive || req.user.role === 'ADMIN')) {
      return next();
    }

    if (!allowedRoles.includes(req.user.role) && !isExecutive) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Role ${req.user.role} does not have required permissions: [${allowedRoles.join(', ')}]`,
          status: 403
        }
      });
    }
    next();
  };
}
