import { Router } from 'express';
import { firebaseAuthMiddleware, AuthenticatedRequest } from '../auth/firebase.middleware.js';
import { reportsService } from './reports.service.js';

export const reportsRouter = Router();

reportsRouter.use(firebaseAuthMiddleware);

reportsRouter.get('/', async (_req: AuthenticatedRequest, res) => {
  const mockMetrics = {
    views: 15432,
    likes: 3421,
    comments: 421,
    shares: 183,
    best_performing_video: 'Spring Campaign - Video 3',
  };
  const summary = await reportsService.generateSummary(mockMetrics);
  res.json({ metrics: mockMetrics, summary });
});
