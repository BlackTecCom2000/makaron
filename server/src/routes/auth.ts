import { Router } from 'express';
import { serverDb } from '../db';
import { generateToken, authenticate, type AuthenticatedRequest } from '../auth';

const router = Router();

// POST /api/v1/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Username and password are required', status: 400 }
    });
  }

  const user = serverDb.users.find(u => u.username === username);
  if (!user || user.passwordHash !== password) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Неверное имя пользователя или пароль', status: 401 }
    });
  }

  const token = generateToken(user);
  serverDb.logAudit(user.id, user.fullName, user.role, 'USER', user.id, 'LOGIN', `User logged in from ${req.ip}`);

  res.json({
    success: true,
    data: {
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        pointId: user.pointId,
        agentId: user.agentId,
        phone: user.phone
      }
    }
  });
});

// GET /api/v1/auth/me
router.get('/me', authenticate, (req: AuthenticatedRequest, res) => {
  const user = serverDb.users.find(u => u.id === req.user?.sub);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found', status: 404 }
    });
  }

  res.json({
    success: true,
    data: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      pointId: user.pointId,
      agentId: user.agentId,
      phone: user.phone
    }
  });
});

// GET /api/v1/auth/users (Admin / Supervisor)
router.get('/users', authenticate, (req: AuthenticatedRequest, res) => {
  const safeUsers = serverDb.users.map(u => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    pointId: u.pointId,
    agentId: u.agentId,
    phone: u.phone
  }));

  res.json({
    success: true,
    data: safeUsers
  });
});

export default router;
