import { Request, Response, NextFunction } from 'express';
import { getFirebaseAdmin } from './firebase.service.js';
import { prisma } from './prisma.client.js';
import { DEFAULT_ROLE, USER_ROLES, type UserRole } from './permissions.js';

export interface AuthenticatedRequest extends Request {
  user?: {
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

    let user = await prisma.user.findUnique({ where: { email } });
    const envAdminEmail = process.env.FIREBASE_ADMIN_EMAIL;
    const envAdminUid = process.env.FIREBASE_ADMIN_UID;
    const envCeoEmail = process.env.FIREBASE_CEO_EMAIL;
    const envCeoUid = process.env.FIREBASE_CEO_UID;

    const isEnvAdmin = email === envAdminEmail || (!!envAdminUid && decoded.uid === envAdminUid);
    const isEnvCeo = email === envCeoEmail || (!!envCeoUid && decoded.uid === envCeoUid);

    const resolvedRole: UserRole = isEnvAdmin ? 'Admin' : isEnvCeo ? 'CEO' : DEFAULT_ROLE;
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
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
          where: { email },
          data: { role: nextRole },
        });
      }
    }

    const role = USER_ROLES.includes(user.role as UserRole) ? (user.role as UserRole) : DEFAULT_ROLE;

    req.user = { uid: decoded.uid, email, role };
    return next();
  } catch (error) {
    console.error('Auth error', error);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};
