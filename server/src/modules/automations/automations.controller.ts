import { Router } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware, AuthenticatedRequest } from '../auth/firebase.middleware.js';
import { automationsService, AutomationError } from './automations.service.js';

const insightsSchema = z
  .object({
    focus: z
      .string()
      .min(1, 'Focus must not be empty')
      .max(280, 'Focus should be under 280 characters')
      .optional(),
  })
  .strict();

const runSchema = z
  .object({
    payload: z.unknown().optional(),
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

automationsRouter.post('/run/:code', async (req: AuthenticatedRequest, res) => {
  const parseResult = runSchema.safeParse(req.body ?? {});
  if (!parseResult.success) {
    return res.status(400).json({
      message: 'Invalid request body',
      issues: parseResult.error.issues.map((issue) => ({
        path: issue.path.join('.') || 'payload',
        message: issue.message,
      })),
    });
  }

  const code = req.params.code;

  if (!code) {
    return res.status(400).json({ message: 'Automation code is required.' });
  }

  try {
    const result = await automationsService.runNode({ code, payload: parseResult.data.payload });
    res.status(result.ok ? 200 : 502).json(result);
  } catch (error) {
    if (error instanceof AutomationError) {
      return res.status(error.status).json({
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    console.error('Failed to trigger automation node', error);
    res.status(500).json({ message: 'Failed to trigger automation node.' });
  }
});
