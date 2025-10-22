import { Request, Response, NextFunction } from 'express';
import { getFirebaseAdmin } from './firebase.service.js';
import { prisma } from './prisma.client.js';

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
    const isEnvAdmin =
      email === process.env.FIREBASE_ADMIN_EMAIL || decoded.uid === process.env.FIREBASE_ADMIN_UID;
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          role: isEnvAdmin ? 'Admin' : 'Client',
        },
      });
    } else if (isEnvAdmin && user.role !== 'Admin') {
      user = await prisma.user.update({
        where: { email },
        data: { role: 'Admin' },
      });
    }

    req.user = { uid: decoded.uid, email, role: user.role };
    return next();
  } catch (error) {
    console.error('Auth error', error);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};
