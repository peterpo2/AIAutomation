import { Router } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware, AuthenticatedRequest } from '../auth/firebase.middleware.js';
import { automationsService } from './automations.service.js';

const insightsSchema = z
  .object({
    focus: z
      .string()
      .min(1, 'Focus must not be empty')
      .max(280, 'Focus should be under 280 characters')
      .optional(),
  })
  .strict();

export const automationsRouter = Router();

automationsRouter.use(firebaseAuthMiddleware);

automationsRouter.get('/', async (_req: AuthenticatedRequest, res) => {
  const nodes = automationsService.listNodes();
  res.json({ nodes });
});

automationsRouter.post('/insights', async (req: AuthenticatedRequest, res) => {
  const parseResult = insightsSchema.safeParse(req.body ?? {});
  if (!parseResult.success) {
    return res.status(400).json({
      message: 'Invalid request body',
      issues: parseResult.error.issues.map((issue) => ({
        path: issue.path.join('.') || 'focus',
        message: issue.message,
      })),
    });
  }

  const insights = await automationsService.generateInsights({ focus: parseResult.data.focus });
  res.json({ insights });
});
