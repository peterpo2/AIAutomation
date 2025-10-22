import { Router } from 'express';
import { firebaseAuthMiddleware, AuthenticatedRequest } from './firebase.middleware.js';
import { prisma } from './prisma.client.js';

export const authRouter = Router();

authRouter.use(firebaseAuthMiddleware);

authRouter.get('/me', async (req: AuthenticatedRequest, res) => {
  const email = req.user?.email;
  if (!email) {
    return res.status(404).json({ message: 'User not found' });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  return res.json({
    email: user?.email,
    role: user?.role,
    createdAt: user?.createdAt,
  });
});

authRouter.post('/role', async (req: AuthenticatedRequest, res) => {
  const requester = req.user;
  if (requester?.role !== 'Admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const { email, role } = req.body as { email?: string; role?: string };
  if (!email || !role) {
    return res.status(400).json({ message: 'Email and role required' });
  }
  const validRoles = ['Admin', 'Team', 'Client'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }
  const user = await prisma.user.upsert({
    where: { email },
    update: { role },
    create: { email, role },
  });
  return res.json({ email: user.email, role: user.role });
});
