import { Router } from 'express';
import { z } from 'zod';
import { firebaseAuthMiddleware, AuthenticatedRequest } from '../auth/firebase.middleware.js';
import { getFirebaseAdmin } from '../auth/firebase.service.js';

const subscriptionSchema = z.object({
  token: z.string(),
  event: z.enum(['dropbox:new-file', 'upload:complete', 'reports:weekly']),
});

export const notificationsRouter = Router();

notificationsRouter.use(firebaseAuthMiddleware);

notificationsRouter.post('/subscribe', async (req: AuthenticatedRequest, res) => {
  const payload = subscriptionSchema.parse(req.body);
  const topicMap: Record<typeof payload.event, string> = {
    'dropbox:new-file': 'smartops_dropbox',
    'upload:complete': 'smartops_uploads',
    'reports:weekly': 'smartops_reports',
  };
  const admin = getFirebaseAdmin();
  await admin.messaging().subscribeToTopic([payload.token], topicMap[payload.event]);
  res.json({ message: 'Subscribed' });
});
