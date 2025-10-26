import { Request, Response, NextFunction } from 'express';
import { getFirebaseAdmin } from './firebase.service.js';
import { prisma } from './prisma.client.js';
import { DEFAULT_ROLE, USER_ROLES, type UserRole } from './permissions.js';
import { normalizeEmail } from './email.utils.js';
import {
  getAdminEmail,
  getAdminUid,
  getCeoEmail,
  getCeoUid,
} from './reserved-users.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    uid: string;
    email?: string;
    role?: string;
  };
}

export const firebaseAuthMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'Authorization header missing' });
  }

  const [, token] = authHeader.split(' ');
  if (!token) {
    return res.status(401).json({ message: 'Invalid authorization header' });
  }

  try {
    const admin = getFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(token);
    const email = decoded.email;
    if (!email) {
      return res.status(403).json({ message: 'Email missing from token' });
    }

    const normalizedEmail = normalizeEmail(email);
    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    const adminEmail = getAdminEmail();
    const adminUid = getAdminUid();
    const ceoEmail = getCeoEmail();
    const ceoUid = getCeoUid();
    const normalizedAdminEmail = adminEmail ? normalizeEmail(adminEmail) : null;
    const normalizedCeoEmail = ceoEmail ? normalizeEmail(ceoEmail) : null;

    const isEnvAdmin = (!!normalizedAdminEmail && normalizedEmail === normalizedAdminEmail) || (!!adminUid && decoded.uid === adminUid);
    const isEnvCeo = (!!normalizedCeoEmail && normalizedEmail === normalizedCeoEmail) || (!!ceoUid && decoded.uid === ceoUid);

    const resolvedRole: UserRole = isEnvAdmin ? 'Admin' : isEnvCeo ? 'CEO' : DEFAULT_ROLE;
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          role: resolvedRole,
        },
      });
    } else {
      const normalizedRole = USER_ROLES.includes(user.role as UserRole) ? (user.role as UserRole) : DEFAULT_ROLE;
      let nextRole = normalizedRole;

      if (isEnvAdmin && normalizedRole !== 'Admin') {
        nextRole = 'Admin';
      } else if (isEnvCeo && normalizedRole !== 'CEO') {
        nextRole = 'CEO';
      }

      if (nextRole !== normalizedRole) {
        user = await prisma.user.update({
          where: { email: normalizedEmail },
          data: { role: nextRole },
        });
      }
    }

    const role = USER_ROLES.includes(user.role as UserRole) ? (user.role as UserRole) : DEFAULT_ROLE;

    req.user = { id: user.id, uid: decoded.uid, email: normalizedEmail, role };
    return next();
  } catch (error) {
    console.error('Auth error', error);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};
