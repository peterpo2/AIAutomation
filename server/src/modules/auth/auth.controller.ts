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
import { getImmutableAssignments, getAdminEmail, getCeoEmail } from './reserved-users.js';
import { getFirebaseAdmin } from './firebase.service.js';

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const toRole = (role: string | null | undefined): UserRole =>
  USER_ROLES.includes(role as UserRole) ? (role as UserRole) : DEFAULT_ROLE;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const ensureReservedRoleCompliance = (
  requesterRole: UserRole,
  email: string,
  targetRole: UserRole,
) => {
  const adminEmail = getAdminEmail()?.toLowerCase();
  const ceoEmail = getCeoEmail()?.toLowerCase();
  const normalized = email.toLowerCase();

  if (targetRole === 'Admin' && normalized !== adminEmail) {
    throw new HttpError(400, 'Only the configured administrator account can hold the Admin role.');
  }

  if (targetRole === 'CEO' && ceoEmail && normalized !== ceoEmail) {
    throw new HttpError(400, 'Only the configured executive account can hold the CEO role.');
  }

  if (adminEmail && normalized === adminEmail) {
    if (targetRole !== 'Admin') {
      throw new HttpError(400, 'The primary administrator cannot be reassigned.');
    }
    if (requesterRole !== 'Admin') {
      throw new HttpError(403, 'Only the administrator can manage the primary admin account.');
    }
  }

  if (ceoEmail && normalized === ceoEmail && targetRole !== 'CEO') {
    throw new HttpError(400, 'The executive account cannot be reassigned to a non-CEO role.');
  }
};

const mapManagedUser = (
  user: { id: string; email: string; role: string; createdAt: Date },
  requesterRole: UserRole,
) => {
  const assignments = getImmutableAssignments();
  const role = toRole(user.role);
  const isPrimaryAdmin = user.email === assignments.adminEmail;
  const isExecutive = user.email === assignments.ceoEmail;

  const editable = requesterRole === 'Admin' || requesterRole === 'CEO';

  return {
    id: user.id,
    email: user.email,
    role,
    createdAt: user.createdAt,
    isPrimaryAdmin,
    isCeo: isExecutive,
    editable,
  };
};

type ManagedUser = Parameters<typeof mapManagedUser>[0];

const assertPrivileged = (role: UserRole | undefined): role is UserRole => !!role && ['Admin', 'CEO'].includes(role);

export const authRouter = Router();

authRouter.get('/permissions', (_req, res) => {
  const immutableAssignments = getImmutableAssignments();
  return res.json({
    roles: ROLE_DEFINITIONS,
    permissions: PERMISSION_DEFINITIONS,
    rolePermissions: ROLE_PERMISSIONS,
    immutableAssignments,
  });
});

authRouter.use(firebaseAuthMiddleware);

authRouter.get('/me', async (req: AuthenticatedRequest, res) => {
  const email = req.user?.email;
  if (!email) {
    return res.status(404).json({ message: 'User not found' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const role = USER_ROLES.includes(user?.role as UserRole) ? (user?.role as UserRole) : DEFAULT_ROLE;

  const immutableAssignments = getImmutableAssignments();

  return res.json({
    email: user?.email ?? email,
    role,
    createdAt: user?.createdAt ?? null,
    permissions: ROLE_PERMISSIONS[role],
    immutableRole:
      (immutableAssignments.adminEmail && email === immutableAssignments.adminEmail) ||
      (immutableAssignments.ceoEmail && email === immutableAssignments.ceoEmail),
  });
});

authRouter.get('/users', async (req: AuthenticatedRequest, res) => {
  const requesterRole = req.user?.role as UserRole | undefined;
  if (!assertPrivileged(requesterRole)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return res.json({
    users: users.map((user: ManagedUser) => mapManagedUser(user, requesterRole)),
  });
});

authRouter.post('/role', async (req: AuthenticatedRequest, res) => {
  const requester = req.user;
  const requesterRole = requester?.role as UserRole | undefined;
  if (!assertPrivileged(requesterRole)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { email, role } = req.body as { email?: string; role?: UserRole };
  if (!email || !role) {
    return res.status(400).json({ message: 'Email and role required' });
  }

  if (!USER_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  try {
    ensureReservedRoleCompliance(requesterRole, email, role);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { role },
    create: { email, role },
  });

  return res.json({ email: user.email, role: user.role });
});

authRouter.post('/users', async (req: AuthenticatedRequest, res) => {
  const requesterRole = req.user?.role as UserRole | undefined;
  if (!assertPrivileged(requesterRole)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { email, password, role, displayName } = req.body as {
    email?: string;
    password?: string;
    role?: UserRole;
    displayName?: string;
  };

  if (!email || !password || !role) {
    return res.status(400).json({ message: 'Email, password, and role are required.' });
  }

  if (!USER_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Invalid role provided.' });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    ensureReservedRoleCompliance(requesterRole, normalizedEmail, role);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    return res.status(409).json({ message: 'A user with this email already exists.' });
  }

  const firebaseAdmin = getFirebaseAdmin();
  try {
    await firebaseAdmin.auth().createUser({
      email: normalizedEmail,
      password,
      displayName,
      emailVerified: true,
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/email-already-exists') {
      return res.status(409).json({ message: 'A Firebase account with this email already exists.' });
    }
    console.error('Failed to create Firebase user', error);
    return res.status(500).json({ message: 'Unable to create user at this time.' });
  }

  const created = await prisma.user.create({
    data: {
      email: normalizedEmail,
      role,
    },
  });

  return res.status(201).json(mapManagedUser(created, requesterRole));
});

authRouter.patch('/users/:id', async (req: AuthenticatedRequest, res) => {
  const requesterRole = req.user?.role as UserRole | undefined;
  if (!assertPrivileged(requesterRole)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id } = req.params;
  const { email, role, password, displayName } = req.body as {
    email?: string;
    role?: UserRole;
    password?: string;
    displayName?: string;
  };

  const userRecord = await prisma.user.findUnique({ where: { id } });
  if (!userRecord) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const currentRole = toRole(userRecord.role);
  const nextRole = role ? (USER_ROLES.includes(role) ? role : null) : currentRole;
  if (role && !nextRole) {
    return res.status(400).json({ message: 'Invalid role provided.' });
  }

  const adminEmail = getAdminEmail()?.toLowerCase();
  const ceoEmail = getCeoEmail()?.toLowerCase();
  const existingEmailNormalized = userRecord.email.toLowerCase();

  if (email && normalizeEmail(email) !== existingEmailNormalized) {
    if (existingEmailNormalized === adminEmail || existingEmailNormalized === ceoEmail) {
      return res.status(400).json({ message: 'This account email is reserved and cannot be changed.' });
    }

    const emailConflict = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (emailConflict && emailConflict.id !== id) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }
  }

  if (nextRole) {
    try {
      ensureReservedRoleCompliance(requesterRole, email ? normalizeEmail(email) : userRecord.email, nextRole);
    } catch (error) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({ message: error.message });
      }
      throw error;
    }
  }

  const firebaseAdmin = getFirebaseAdmin();
  let firebaseUser;
  try {
    firebaseUser = await firebaseAdmin.auth().getUserByEmail(userRecord.email);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'auth/user-not-found') {
      console.error('Failed to load Firebase user for update', error);
      return res.status(500).json({ message: 'Unable to update user profile.' });
    }
    firebaseUser = null;
  }

  const updatePayload: { email?: string; password?: string; displayName?: string } = {};
  if (email && normalizeEmail(email) !== existingEmailNormalized) {
    updatePayload.email = normalizeEmail(email);
  }
  if (password) {
    updatePayload.password = password;
  }
  if (displayName) {
    updatePayload.displayName = displayName;
  }

  if (firebaseUser && Object.keys(updatePayload).length > 0) {
    try {
      await firebaseAdmin.auth().updateUser(firebaseUser.uid, updatePayload);
    } catch (error) {
      console.error('Failed to update Firebase user', error);
      return res.status(500).json({ message: 'Unable to update user profile.' });
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      email: updatePayload.email ?? userRecord.email,
      role: nextRole ?? currentRole,
    },
  });

  return res.json(mapManagedUser(updated, requesterRole));
});

authRouter.delete('/users/:id', async (req: AuthenticatedRequest, res) => {
  const requesterRole = req.user?.role as UserRole | undefined;
  if (!assertPrivileged(requesterRole)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id } = req.params;
  const userRecord = await prisma.user.findUnique({ where: { id } });
  if (!userRecord) {
    return res.status(404).json({ message: 'User not found.' });
  }

  if (req.user?.email && normalizeEmail(req.user.email) === normalizeEmail(userRecord.email)) {
    return res.status(400).json({ message: 'You cannot delete your own account.' });
  }

  const adminEmail = getAdminEmail()?.toLowerCase();
  const ceoEmail = getCeoEmail()?.toLowerCase();
  const normalized = userRecord.email.toLowerCase();
  if (normalized === adminEmail || normalized === ceoEmail) {
    return res.status(400).json({ message: 'Reserved workspace accounts cannot be deleted.' });
  }

  const firebaseAdmin = getFirebaseAdmin();
  try {
    const firebaseUser = await firebaseAdmin.auth().getUserByEmail(userRecord.email);
    await firebaseAdmin.auth().deleteUser(firebaseUser.uid);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'auth/user-not-found') {
      console.error('Failed to delete Firebase user', error);
      return res.status(500).json({ message: 'Unable to delete user at this time.' });
    }
  }

  await prisma.user.delete({ where: { id } });

  return res.status(204).send();
});

authRouter.patch('/me', async (req: AuthenticatedRequest, res) => {
  const requester = req.user;
  if (!requester?.email || !requester.uid) {
    return res.status(404).json({ message: 'User not found' });
  }

  const { email, password, displayName } = req.body as {
    email?: string;
    password?: string;
    displayName?: string;
  };

  if (!email && !password && !displayName) {
    return res.status(400).json({ message: 'No updates provided.' });
  }

  const firebaseAdmin = getFirebaseAdmin();
  const updatePayload: { email?: string; password?: string; displayName?: string } = {};

  const adminEmail = getAdminEmail()?.toLowerCase();
  const ceoEmail = getCeoEmail()?.toLowerCase();
  const normalizedCurrentEmail = requester.email.toLowerCase();

  if (email && normalizeEmail(email) !== normalizedCurrentEmail) {
    if (
      normalizedCurrentEmail === adminEmail ||
      normalizedCurrentEmail === ceoEmail ||
      normalizeEmail(email) === adminEmail ||
      normalizeEmail(email) === ceoEmail
    ) {
      return res.status(400).json({ message: 'Reserved workspace emails cannot be reassigned.' });
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (existing) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }

    updatePayload.email = normalizeEmail(email);
  }

  if (password) {
    updatePayload.password = password;
  }
  if (displayName) {
    updatePayload.displayName = displayName;
  }

  try {
    await firebaseAdmin.auth().updateUser(requester.uid, updatePayload);
  } catch (error) {
    console.error('Failed to update Firebase user', error);
    return res.status(500).json({ message: 'Unable to update profile.' });
  }

  if (updatePayload.email) {
    await prisma.user.updateMany({
      where: { email: requester.email },
      data: { email: updatePayload.email },
    });
  }

  const updatedProfile = await prisma.user.findUnique({
    where: { email: updatePayload.email ?? requester.email },
  });

  const role = toRole(updatedProfile?.role ?? null);
  return res.json({
    email: updatePayload.email ?? requester.email,
    role,
    createdAt: updatedProfile?.createdAt ?? null,
    permissions: ROLE_PERMISSIONS[role],
    immutableRole: false,
  });
});
