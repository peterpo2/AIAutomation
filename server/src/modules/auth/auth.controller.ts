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
import { normalizeEmail } from './email.utils.js';
import { findUserByEmailInsensitive, ensureNormalizedEmail, isUniqueConstraintError } from './user.repository.js';

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const toRole = (role: string | null | undefined): UserRole =>
  USER_ROLES.includes(role as UserRole) ? (role as UserRole) : DEFAULT_ROLE;

const ensureReservedRoleCompliance = (
  requesterRole: UserRole,
  email: string,
  targetRole: UserRole,
) => {
  const adminEmail = getAdminEmail();
  const ceoEmail = getCeoEmail();
  const normalizedAdminEmail = adminEmail ? normalizeEmail(adminEmail) : null;
  const normalizedCeoEmail = ceoEmail ? normalizeEmail(ceoEmail) : null;
  const normalized = normalizeEmail(email);

  if (targetRole === 'Admin' && normalized !== normalizedAdminEmail) {
    throw new HttpError(400, 'Only the configured administrator account can hold the Admin role.');
  }

  if (targetRole === 'CEO' && normalizedCeoEmail && normalized !== normalizedCeoEmail) {
    throw new HttpError(400, 'Only the configured executive account can hold the CEO role.');
  }

  if (normalizedAdminEmail && normalized === normalizedAdminEmail) {
    if (targetRole !== 'Admin') {
      throw new HttpError(400, 'The primary administrator cannot be reassigned.');
    }
    if (requesterRole !== 'Admin') {
      throw new HttpError(403, 'Only the administrator can manage the primary admin account.');
    }
  }

  if (normalizedCeoEmail && normalized === normalizedCeoEmail && targetRole !== 'CEO') {
    throw new HttpError(400, 'The executive account cannot be reassigned to a non-CEO role.');
  }
};

const mapManagedUser = (
  user: { id: string; email: string; role: string; createdAt: Date },
  requesterRole: UserRole,
) => {
  const assignments = getImmutableAssignments();
  const role = toRole(user.role);
  const normalizedAdminEmail = assignments.adminEmail ? normalizeEmail(assignments.adminEmail) : null;
  const normalizedCeoEmail = assignments.ceoEmail ? normalizeEmail(assignments.ceoEmail) : null;
  const normalizedUserEmail = normalizeEmail(user.email);
  const isPrimaryAdmin = normalizedAdminEmail ? normalizedUserEmail === normalizedAdminEmail : false;
  const isExecutive = normalizedCeoEmail ? normalizedUserEmail === normalizedCeoEmail : false;

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

  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmailInsensitive(normalizedEmail);
  const role = USER_ROLES.includes(user?.role as UserRole) ? (user?.role as UserRole) : DEFAULT_ROLE;

  const immutableAssignments = getImmutableAssignments();
  const normalizedAdminEmail = immutableAssignments.adminEmail
    ? normalizeEmail(immutableAssignments.adminEmail)
    : null;
  const normalizedCeoEmail = immutableAssignments.ceoEmail ? normalizeEmail(immutableAssignments.ceoEmail) : null;

  return res.json({
    email: user?.email ?? normalizedEmail,
    role,
    createdAt: user?.createdAt ?? null,
    permissions: ROLE_PERMISSIONS[role],
    immutableRole:
      (normalizedAdminEmail && normalizedEmail === normalizedAdminEmail) ||
      (normalizedCeoEmail && normalizedEmail === normalizedCeoEmail),
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

  const normalizedEmail = normalizeEmail(email);
  try {
    ensureReservedRoleCompliance(requesterRole, normalizedEmail, role);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }

  let user = await findUserByEmailInsensitive(normalizedEmail);
  if (!user) {
    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        role,
      },
    });
    return res.json({ email: created.email, role: created.role });
  }

  if (user.email !== normalizedEmail) {
    user = await ensureNormalizedEmail(user, normalizedEmail);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role },
  });

  return res.json({ email: updated.email, role: updated.role });
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
    displayName?: string | null;
  };

  if (!email || !password || !role) {
    return res.status(400).json({ message: 'Email, password, and role are required.' });
  }

  if (!USER_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Invalid role provided.' });
  }

  const normalizedEmail = normalizeEmail(email);
  const sanitizedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';

  try {
    ensureReservedRoleCompliance(requesterRole, normalizedEmail, role);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }

  const existingUser = await findUserByEmailInsensitive(normalizedEmail);
  if (existingUser) {
    return res.status(409).json({ message: 'A user with this email already exists.' });
  }

  const firebaseAdmin = getFirebaseAdmin();
  try {
    const createPayload: {
      email: string;
      password: string;
      emailVerified: true;
      displayName?: string;
    } = {
      email: normalizedEmail,
      password,
      emailVerified: true,
    };

    if (sanitizedDisplayName.length > 0) {
      createPayload.displayName = sanitizedDisplayName;
    }

    await firebaseAdmin.auth().createUser(createPayload);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/email-already-exists') {
      return res.status(409).json({ message: 'A Firebase account with this email already exists.' });
    }
    console.error('Failed to create Firebase user', error);
    return res.status(500).json({ message: 'Unable to create user at this time.' });
  }

  try {
    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        role,
      },
    });

    return res.status(201).json(mapManagedUser(created, requesterRole));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }
    throw error;
  }
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
    displayName?: string | null;
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

  const adminEmail = getAdminEmail();
  const ceoEmail = getCeoEmail();
  const normalizedAdminEmail = adminEmail ? normalizeEmail(adminEmail) : null;
  const normalizedCeoEmail = ceoEmail ? normalizeEmail(ceoEmail) : null;
  const existingEmailNormalized = normalizeEmail(userRecord.email);

  if (email && normalizeEmail(email) !== existingEmailNormalized) {
    if (existingEmailNormalized === normalizedAdminEmail || existingEmailNormalized === normalizedCeoEmail) {
      return res.status(400).json({ message: 'This account email is reserved and cannot be changed.' });
    }

    const emailConflict = await findUserByEmailInsensitive(email, id);
    if (emailConflict) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }
  }

  if (nextRole) {
    try {
      const targetEmail = email ? normalizeEmail(email) : existingEmailNormalized;
      ensureReservedRoleCompliance(requesterRole, targetEmail, nextRole);
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
    firebaseUser = await firebaseAdmin.auth().getUserByEmail(existingEmailNormalized);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'auth/user-not-found') {
      console.error('Failed to load Firebase user for update', error);
      return res.status(500).json({ message: 'Unable to update user profile.' });
    }
    firebaseUser = null;
  }

  const updatePayload: { email?: string; password?: string; displayName?: string | null } = {};
  if (email && normalizeEmail(email) !== existingEmailNormalized) {
    updatePayload.email = normalizeEmail(email);
  }
  if (password) {
    updatePayload.password = password;
  }
  if (displayName !== undefined) {
    if (displayName === null) {
      updatePayload.displayName = null;
    } else {
      const trimmedDisplayName = displayName.trim();
      updatePayload.displayName = trimmedDisplayName.length > 0 ? trimmedDisplayName : null;
    }
  }

  if (firebaseUser && Object.keys(updatePayload).length > 0) {
    try {
      await firebaseAdmin.auth().updateUser(firebaseUser.uid, updatePayload);
    } catch (error) {
      console.error('Failed to update Firebase user', error);
      return res.status(500).json({ message: 'Unable to update user profile.' });
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        email: updatePayload.email ?? userRecord.email,
        role: nextRole ?? currentRole,
      },
    });

    return res.json(mapManagedUser(updated, requesterRole));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }
    throw error;
  }
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

  const adminEmail = getAdminEmail();
  const ceoEmail = getCeoEmail();
  const normalizedAdminEmail = adminEmail ? normalizeEmail(adminEmail) : null;
  const normalizedCeoEmail = ceoEmail ? normalizeEmail(ceoEmail) : null;
  const normalized = normalizeEmail(userRecord.email);
  if (normalized === normalizedAdminEmail || normalized === normalizedCeoEmail) {
    return res.status(400).json({ message: 'Reserved workspace accounts cannot be deleted.' });
  }

  const firebaseAdmin = getFirebaseAdmin();
  try {
    const firebaseUser = await firebaseAdmin.auth().getUserByEmail(normalized);
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
    displayName?: string | null;
  };

  if (!email && !password && displayName === undefined) {
    return res.status(400).json({ message: 'No updates provided.' });
  }

  const firebaseAdmin = getFirebaseAdmin();
  const updatePayload: { email?: string; password?: string; displayName?: string | null } = {};

  const adminEmail = getAdminEmail();
  const ceoEmail = getCeoEmail();
  const normalizedAdminEmail = adminEmail ? normalizeEmail(adminEmail) : null;
  const normalizedCeoEmail = ceoEmail ? normalizeEmail(ceoEmail) : null;
  const normalizedCurrentEmail = normalizeEmail(requester.email);
  const currentRecord = await findUserByEmailInsensitive(requester.email);

  if (email && normalizeEmail(email) !== normalizedCurrentEmail) {
    if (
      normalizedCurrentEmail === normalizedAdminEmail ||
      normalizedCurrentEmail === normalizedCeoEmail ||
      normalizeEmail(email) === normalizedAdminEmail ||
      normalizeEmail(email) === normalizedCeoEmail
    ) {
      return res.status(400).json({ message: 'Reserved workspace emails cannot be reassigned.' });
    }

    const existing = await findUserByEmailInsensitive(email);
    if (existing && (!currentRecord || existing.id !== currentRecord.id)) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }

    updatePayload.email = normalizeEmail(email);
  }

  if (password) {
    updatePayload.password = password;
  }
  if (displayName !== undefined) {
    if (displayName === null) {
      updatePayload.displayName = null;
    } else {
      const trimmedDisplayName = displayName.trim();
      updatePayload.displayName = trimmedDisplayName.length > 0 ? trimmedDisplayName : null;
    }
  }

  try {
    await firebaseAdmin.auth().updateUser(requester.uid, updatePayload);
  } catch (error) {
    console.error('Failed to update Firebase user', error);
    return res.status(500).json({ message: 'Unable to update profile.' });
  }

  if (updatePayload.email) {
    if (currentRecord) {
      try {
        await prisma.user.update({
          where: { id: currentRecord.id },
          data: { email: updatePayload.email },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return res.status(409).json({ message: 'A user with this email already exists.' });
        }
        throw error;
      }
    } else {
      await prisma.user.updateMany({
        where: { email: normalizedCurrentEmail },
        data: { email: updatePayload.email },
      });
    }
  }

  const lookupEmail = normalizeEmail(updatePayload.email ?? requester.email);
  const updatedProfile = await findUserByEmailInsensitive(lookupEmail);

  const role = toRole(updatedProfile?.role ?? null);
  return res.json({
    email: updatedProfile?.email ?? normalizeEmail(requester.email),
    role,
    createdAt: updatedProfile?.createdAt ?? null,
    permissions: ROLE_PERMISSIONS[role],
    immutableRole: false,
  });
});
