import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { createServer } from 'http';

import { authRouter } from './modules/auth/auth.controller.js';
import { dropboxRouter } from './modules/dropbox/dropbox.controller.js';
import { uploadsRouter } from './modules/uploads/uploads.controller.js';
import { reportsRouter } from './modules/reports/reports.controller.js';
import { notificationsRouter } from './modules/notifications/notifications.controller.js';
import { scheduler } from './modules/scheduler/scheduler.service.js';
import { swaggerSpec } from './swagger.js';
import { errorHandler } from './modules/auth/error.middleware.js';
import { captionGeneratorRouter } from './modules/caption-generator/caption-generator.controller.js';
import { bootstrapWorkspaceUsers } from './modules/auth/user.bootstrap.js';

dotenv.config();

const app = express();

void bootstrapWorkspaceUsers().then((result) => {
  if (!result) return;
  if (result.createdFirebase > 0 || result.ensuredDatabase > 0) {
    console.log(
      `Workspace bootstrap complete: ${result.createdFirebase} Firebase accounts ensured, ${result.ensuredDatabase} database records aligned.`,
    );
  }
});

const allowedOrigins = (process.env.CORS_WHITELIST || '').split(',').filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }),
);

app.use('/api/dropbox/webhook', express.raw({ type: '*/*' }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRouter);
app.use('/api/dropbox', dropboxRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/captions', captionGeneratorRouter);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

const port = process.env.PORT || 8080;

const server = createServer(app);
server.listen(port, () => {
  console.log(`SmartOps backend listening on port ${port}`);
});

scheduler
  .init()
  .then(() => console.log('Scheduler initialized'))
  .catch((err) => console.error('Scheduler initialization failed', err));

export default app;
