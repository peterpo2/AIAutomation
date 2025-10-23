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
  category: z.string().optional(),
});

const updateSchema = z.object({
  status: z.enum(['pending', 'ready', 'uploaded']).optional(),
  brand: z.string().optional(),
  caption: z.string().optional(),
  category: z.string().optional(),
});

export const uploadsRouter = Router();

uploadsRouter.use(firebaseAuthMiddleware);

uploadsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  if (!req.user?.uid || !req.user.email) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const videos = await uploadsService.list(req.user.email);
  res.json(serializeBigInt(videos));
});

uploadsRouter.post('/', async (req: AuthenticatedRequest, res) => {
  if (!req.user?.uid || !req.user.email) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const payload = createSchema.parse(req.body);
  const video = await uploadsService.create(req.user.email, payload);
  res.status(201).json(serializeBigInt(video));
});

uploadsRouter.patch('/:id', async (req: AuthenticatedRequest, res) => {
  if (!req.user?.uid || !req.user.email) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const payload = updateSchema.parse(req.body);
  const video = await uploadsService.update(req.params.id, req.user.email, payload);
  if (!video) {
    return res.status(404).json({ message: 'Upload not found' });
  }
  res.json(serializeBigInt(video));
});

uploadsRouter.delete('/:id', async (req: AuthenticatedRequest, res) => {
  if (!req.user?.uid || !req.user.email) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const removed = await uploadsService.remove(req.params.id, req.user.email);
  if (!removed) {
    return res.status(404).json({ message: 'Upload not found' });
  }

  res.status(204).send();
});
