import type { UserRecord } from 'firebase-admin/auth';
import { prisma } from './prisma.client.js';
import { getFirebaseAdmin } from './firebase.service.js';
import { DEFAULT_ROLE, USER_ROLES, type UserRole } from './permissions.js';
import { normalizeEmail } from './email.utils.js';
import { ensureNormalizedEmail, findUserByEmailInsensitive } from './user.repository.js';
import {
  getSeedUsers,
  getImmutableAssignments,
  getAdminUid,
  getCeoUid,
  type SeedUserDefinition,
} from './reserved-users.js';

interface BootstrapResult {
  createdFirebase: number;
  ensuredDatabase: number;
}

const isRole = (role: string): role is UserRole => USER_ROLES.includes(role as UserRole);

const ensureDatabaseUser = async (seed: SeedUserDefinition) => {
  const role = isRole(seed.role) ? seed.role : DEFAULT_ROLE;
  const normalizedEmail = normalizeEmail(seed.email);
  const existing = await findUserByEmailInsensitive(seed.email);
  if (existing) {
    const target = await ensureNormalizedEmail(existing, normalizedEmail);
    await prisma.user.update({
      where: { id: target.id },
      data: { role },
    });
    return;
  }

  await prisma.user.create({
    data: { email: normalizedEmail, role },
  });
};

const ensureFirebaseUser = async (
  admin: ReturnType<typeof getFirebaseAdmin>,
  seed: SeedUserDefinition,
): Promise<boolean> => {
  let userRecord: UserRecord | null = null;

  try {
    userRecord = await admin.auth().getUserByEmail(normalizeEmail(seed.email));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'auth/user-not-found') {
      console.warn(`Skipping bootstrap for ${seed.email}:`, error);
      return false;
    }
  }

  if (!userRecord) {
    if (!seed.password) {
      console.warn(`Cannot create Firebase account for ${seed.email} without a password.`);
      return false;
    }

    await admin.auth().createUser({
      email: normalizeEmail(seed.email),
      password: seed.password,
      displayName: seed.displayName,
      emailVerified: true,
    });
    return true;
  }

  return false;
};

export const bootstrapWorkspaceUsers = async (): Promise<BootstrapResult | null> => {
  try {
    const seeds = getSeedUsers();
    if (seeds.length === 0) {
      return { createdFirebase: 0, ensuredDatabase: 0 };
    }

    const assignments = getImmutableAssignments();
    const adminUid = getAdminUid();
    const ceoUid = getCeoUid();
    const firebaseAdmin = getFirebaseAdmin();

    let createdFirebase = 0;
    let ensuredDatabase = 0;

    for (const seed of seeds) {
      const created = await ensureFirebaseUser(firebaseAdmin, seed);
      if (created) {
        createdFirebase += 1;
      }

      await ensureDatabaseUser(seed);
      ensuredDatabase += 1;

      // Ensure immutable roles remain aligned with environment overrides.
      if (seed.role === 'Admin' && assignments.adminEmail) {
        await prisma.user.update({
          where: { email: assignments.adminEmail },
          data: { role: 'Admin' },
        });
      }
      if (seed.role === 'CEO' && assignments.ceoEmail) {
        await prisma.user.update({
          where: { email: assignments.ceoEmail },
          data: { role: 'CEO' },
        });
      }

      if (seed.role === 'Admin' && adminUid && assignments.adminEmail) {
        try {
          await firebaseAdmin.auth().updateUser(adminUid, { email: assignments.adminEmail });
        } catch (error) {
          console.warn('Unable to enforce admin email for configured UID', error);
        }
      }
      if (seed.role === 'CEO' && ceoUid && assignments.ceoEmail) {
        try {
          await firebaseAdmin.auth().updateUser(ceoUid, { email: assignments.ceoEmail });
        } catch (error) {
          console.warn('Unable to enforce CEO email for configured UID', error);
        }
      }
    }

    return { createdFirebase, ensuredDatabase };
  } catch (error) {
    console.warn('Failed to bootstrap workspace users', error);
    return null;
  }
};
