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

automationsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const nodes = await automationsService.listNodes(req.user?.id ?? null);
  res.json({ nodes });
});

automationsRouter.get('/status', async (_req: AuthenticatedRequest, res) => {
  const nodes = await automationsService.getStatuses();
  res.json({ nodes });
});

const positionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

automationsRouter.post('/:code/position', async (req: AuthenticatedRequest, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parseResult = positionSchema.safeParse(req.body ?? {});
  if (!parseResult.success) {
    return res.status(400).json({
      message: 'Invalid position payload',
      issues: parseResult.error.issues.map((issue) => ({
        path: issue.path.join('.') || 'position',
        message: issue.message,
      })),
    });
  }

  const code = req.params.code;
  if (!code) {
    return res.status(400).json({ message: 'Automation code is required.' });
  }

  try {
    await automationsService.saveNodePosition({
      userId: req.user.id,
      code,
      position: { x: parseResult.data.x, y: parseResult.data.y },
    });
    res.status(204).send();
  } catch (error) {
    if (error instanceof AutomationError) {
      return res.status(error.status).json({
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    console.error('Failed to save automation node position', error);
    res.status(500).json({ message: 'Failed to save automation node position.' });
  }
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
    res.status(200).json(result);
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

automationsRouter.get('/:code', async (req: AuthenticatedRequest, res) => {
  const code = req.params.code;
  if (!code) {
    return res.status(400).json({ message: 'Automation code is required.' });
  }

  try {
    const node = await automationsService.getNode(code, req.user?.id ?? null);
    res.json({ node });
  } catch (error) {
    if (error instanceof AutomationError) {
      return res.status(error.status).json({
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    console.error('Failed to load automation node details', error);
    res.status(500).json({ message: 'Failed to load automation node details.' });
  }
});
