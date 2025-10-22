import { Router, Response } from 'express';
import crypto from 'crypto';
import { firebaseAuthMiddleware, AuthenticatedRequest } from '../auth/firebase.middleware.js';
import { dropboxService } from './dropbox.service.js';
import { scheduler } from '../scheduler/scheduler.service.js';

export const dropboxRouter = Router();

dropboxRouter.get('/webhook', (req, res) => {
  const challenge = req.query.challenge;
  if (typeof challenge === 'string') {
    return res.status(200).send(challenge);
  }
  return res.status(400).send('Missing challenge');
});

dropboxRouter.post('/webhook', (req, res) => {
  const secret = process.env.DROPBOX_APP_SECRET;
  const signature = req.header('X-Dropbox-Signature');
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  if (!secret || !signature) {
    return res.status(401).send('Unauthorized');
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  if (expected !== signature) {
    return res.status(403).send('Invalid signature');
  }
  scheduler.queueDropboxSync();
  return res.status(202).json({ message: 'Sync enqueued' });
});

dropboxRouter.use(firebaseAuthMiddleware);

const enqueueSync = (res: Response) => {
  scheduler.queueDropboxSync();
  res.status(202).json({ message: 'Dropbox sync scheduled' });
};

dropboxRouter.post('/refresh', async (_req: AuthenticatedRequest, res) => {
  enqueueSync(res);
});

dropboxRouter.post('/sync', async (_req: AuthenticatedRequest, res) => {
  enqueueSync(res);
});

dropboxRouter.get('/sync', async (_req: AuthenticatedRequest, res) => {
  scheduler.queueDropboxSync();
  res.status(202).json({ message: 'Dropbox sync scheduled' });
});

dropboxRouter.get('/temporary-link/:id', async (req: AuthenticatedRequest, res) => {
  const link = await dropboxService.getTemporaryLink(req.params.id);
  res.json({ link });
});
