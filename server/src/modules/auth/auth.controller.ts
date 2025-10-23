import { Router } from 'express';
import { firebaseAuthMiddleware, AuthenticatedRequest } from './firebase.middleware.js';
import { prisma } from './prisma.client.js';
import {
  DEFAULT_ROLE,
  PERMISSION_DEFINITIONS,
  ROLE_DEFINITIONS,
  ROLE_PERMISSIONS,
  USER_ROLES,
  type UserRole,
} from './permissions.js';

const MAX_USER_SEATS = Number(process.env.SMARTOPS_MAX_USERS ?? '5');
const RESERVED_ROLES: UserRole[] = ['Admin', 'CEO'];
const MAX_STANDARD_USERS = Math.max(MAX_USER_SEATS - RESERVED_ROLES.length, 0);

export const authRouter = Router();

authRouter.use(firebaseAuthMiddleware);

authRouter.get('/me', async (req: AuthenticatedRequest, res) => {
  const email = req.user?.email;
  if (!email) {
    return res.status(404).json({ message: 'User not found' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const role = USER_ROLES.includes(user?.role as UserRole) ? (user?.role as UserRole) : DEFAULT_ROLE;

  return res.json({
    email: user?.email ?? email,
    role,
    createdAt: user?.createdAt ?? null,
    permissions: ROLE_PERMISSIONS[role],
    immutableRole: email === process.env.FIREBASE_ADMIN_EMAIL,
  });
});

authRouter.get('/users', async (req: AuthenticatedRequest, res) => {
  const requesterRole = req.user?.role;
  if (!requesterRole || !['Admin', 'CEO'].includes(requesterRole)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const [users, totalUsers, standardUsers] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count(),
    prisma.user.count({
      where: {
        role: {
          notIn: RESERVED_ROLES,
        },
      },
    }),
  ]);

  return res.json({
    users: users.map((user: { id: string; email: string; role: string; createdAt: Date }) => {
      const role = USER_ROLES.includes(user.role as UserRole) ? (user.role as UserRole) : DEFAULT_ROLE;
      return {
        id: user.id,
        email: user.email,
        role,
        createdAt: user.createdAt,
        immutable: user.email === process.env.FIREBASE_ADMIN_EMAIL,
        isCeo: user.email === process.env.FIREBASE_CEO_EMAIL,
      };
    }),
    seats: {
      limit: MAX_USER_SEATS,
      reservedRoles: RESERVED_ROLES,
      totalUsed: totalUsers,
      remainingTotal: Math.max(MAX_USER_SEATS - totalUsers, 0),
      standardLimit: MAX_STANDARD_USERS,
      standardUsed: standardUsers,
      remainingStandard: Math.max(MAX_STANDARD_USERS - standardUsers, 0),
    },
  });
});

authRouter.get('/permissions', (_req, res) => {
  return res.json({
    roles: ROLE_DEFINITIONS,
    permissions: PERMISSION_DEFINITIONS,
    rolePermissions: ROLE_PERMISSIONS,
    immutableAssignments: {
      adminEmail: process.env.FIREBASE_ADMIN_EMAIL ?? null,
      ceoEmail: process.env.FIREBASE_CEO_EMAIL ?? null,
    },
  });
});

authRouter.post('/role', async (req: AuthenticatedRequest, res) => {
  const requester = req.user;
  if (!requester?.role || !['Admin', 'CEO'].includes(requester.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { email, role } = req.body as { email?: string; role?: UserRole };
  if (!email || !role) {
    return res.status(400).json({ message: 'Email and role required' });
  }

  if (!USER_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  const adminEmail = process.env.FIREBASE_ADMIN_EMAIL;
  const ceoEmail = process.env.FIREBASE_CEO_EMAIL;

  if (adminEmail && email === adminEmail && role !== 'Admin') {
    return res.status(400).json({ message: 'The primary administrator cannot be reassigned.' });
  }

  if (role === 'Admin' && (!adminEmail || email !== adminEmail)) {
    return res
      .status(400)
      .json({ message: 'Only the configured administrator account can hold the Admin role.' });
  }

  if (role === 'CEO' && ceoEmail && email !== ceoEmail) {
    return res
      .status(400)
      .json({ message: 'Only the configured executive account can hold the CEO role.' });
  }

  if (email === adminEmail && requester.role !== 'Admin') {
    return res.status(403).json({ message: 'Only the administrator can manage the primary admin account.' });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (!existingUser) {
    const [totalUsers, standardUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          role: {
            notIn: RESERVED_ROLES,
          },
        },
      }),
    ]);

    if (totalUsers >= MAX_USER_SEATS) {
      return res.status(400).json({ message: `Maximum user capacity of ${MAX_USER_SEATS} has been reached.` });
    }

    if (!RESERVED_ROLES.includes(role) && standardUsers >= MAX_STANDARD_USERS) {
      return res
        .status(400)
        .json({ message: `All ${MAX_STANDARD_USERS} standard seats are in use. Remove a member before inviting another.` });
    }
  } else if (!RESERVED_ROLES.includes(role)) {
    const currentRole = USER_ROLES.includes(existingUser.role as UserRole)
      ? (existingUser.role as UserRole)
      : DEFAULT_ROLE;
    const currentlyStandard = !RESERVED_ROLES.includes(currentRole);

    if (!currentlyStandard) {
      const standardUsers = await prisma.user.count({
        where: {
          role: {
            notIn: RESERVED_ROLES,
          },
        },
      });

      if (standardUsers >= MAX_STANDARD_USERS) {
        return res
          .status(400)
          .json({ message: `All ${MAX_STANDARD_USERS} standard seats are in use. Remove a member before inviting another.` });
      }
    }
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { role },
    create: { email, role },
  });

  return res.json({ email: user.email, role: user.role });
});
