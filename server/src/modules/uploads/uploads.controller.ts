import { Router } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware, AuthenticatedRequest } from '../auth/firebase.middleware.js';
import { uploadsService } from './uploads.service.js';
import { serializeBigInt } from '../auth/json.utils.js';

const createSchema = z.object({
  fileName: z.string(),
  folderPath: z.string().optional(),
  dropboxId: z.string().optional(),
  size: z.number().optional(),
  brand: z.string().optional(),
  caption: z.string().optional(),
});

const updateSchema = z.object({
  status: z.enum(['pending', 'ready', 'uploaded']).optional(),
  brand: z.string().optional(),
  caption: z.string().optional(),
});

export const uploadsRouter = Router();

uploadsRouter.use(firebaseAuthMiddleware);

uploadsRouter.get('/', async (_req: AuthenticatedRequest, res) => {
  const videos = await uploadsService.list();
  res.json(serializeBigInt(videos));
});

uploadsRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const payload = createSchema.parse(req.body);
  const video = await uploadsService.create(payload);
  res.status(201).json(serializeBigInt(video));
});

uploadsRouter.patch('/:id', async (req: AuthenticatedRequest, res) => {
  const payload = updateSchema.parse(req.body);
  const video = await uploadsService.update(req.params.id, payload);
  res.json(serializeBigInt(video));
});
