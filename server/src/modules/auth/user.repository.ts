import { Prisma, type User } from '@prisma/client';
import { prisma } from './prisma.client.js';
import { normalizeEmail } from './email.utils.js';

export const isUniqueConstraintError = (
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export const findUserByEmailInsensitive = async (email: string, excludeUserId?: string) => {
  const normalizedEmail = normalizeEmail(email);
  const where: Prisma.UserWhereInput = {
    email: {
      equals: normalizedEmail,
      mode: 'insensitive',
    },
  };

  if (excludeUserId) {
    where.NOT = { id: excludeUserId };
  }

  return prisma.user.findFirst({ where });
};

export const ensureNormalizedEmail = async (user: User, email: string): Promise<User> => {
  const normalizedEmail = normalizeEmail(email);
  if (user.email === normalizedEmail) {
    return user;
  }

  try {
    return await prisma.user.update({
      where: { id: user.id },
      data: { email: normalizedEmail },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
};
