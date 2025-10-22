import { Router } from 'express';
import { z } from 'zod';

import { firebaseAuthMiddleware, AuthenticatedRequest } from '../auth/firebase.middleware.js';
import { captionGeneratorService } from './caption-generator.service.js';

const rateLimitWindowMs = 60 * 1000;
const rateLimitMax = 10;
const rateLimitStore = new Map<string, { windowStart: number; count: number }>();

const manualGenerateSchema = z.object({
  keywords: z
    .union([z.array(z.string().min(1).max(60)), z.string().min(1).max(200)])
    .optional()
    .transform((value) => {
      if (!value) return [] as string[];
      if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }),
});

const checkRateLimit = (uid: string) => {
  const now = Date.now();
  const bucket = rateLimitStore.get(uid);
  if (!bucket || now - bucket.windowStart > rateLimitWindowMs) {
    rateLimitStore.set(uid, { windowStart: now, count: 1 });
    return true;
  }
  if (bucket.count >= rateLimitMax) {
    return false;
  }
  bucket.count += 1;
  return true;
};

export const captionGeneratorRouter = Router();

captionGeneratorRouter.use(firebaseAuthMiddleware);

captionGeneratorRouter.post('/generate/:videoId', async (req: AuthenticatedRequest, res) => {
  const user = req.user;
  if (!user || (user.role !== 'Admin' && user.role !== 'Team')) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  if (!checkRateLimit(user.uid)) {
    return res.status(429).json({ message: 'Too many caption requests. Try again soon.' });
  }

  const { keywords } = manualGenerateSchema.parse(req.body ?? {});

  try {
    const result = await captionGeneratorService.generateForVideoId(req.params.videoId, {
      keywords,
      force: true,
      notify: true,
    });

    return res.json({
      videoId: result.videoId,
      caption: result.caption,
      hashtags: result.hashtags,
      timestamp: result.generatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Manual caption generation failed', error);
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ message: 'Video not found' });
    }
    return res.status(500).json({ message: 'Failed to generate caption' });
  }
});
