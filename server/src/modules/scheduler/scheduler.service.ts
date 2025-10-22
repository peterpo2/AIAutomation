import { Queue, Worker, JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { dropboxService } from '../dropbox/dropbox.service.js';
import { uploadsService } from '../uploads/uploads.service.js';
import { prisma } from '../auth/prisma.client.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { reportsService } from '../reports/reports.service.js';
import { captionGeneratorService } from '../caption-generator/caption-generator.service.js';

const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

const connection = new IORedis(redisUrl);

class SchedulerService {
  private dropboxQueue = new Queue('dropbox-sync', { connection });
  private uploadQueue = new Queue('upload-automation', { connection });
  private reportQueue = new Queue('weekly-report', { connection });
  private captionQueue = new Queue('caption-refresh', { connection });
  private initialized = false;

  async init() {
    if (this.initialized) return;

    new Worker(
      'dropbox-sync',
      async () => {
        try {
          const result = await dropboxService.syncFolders();
          await this.logJob('dropbox-sync', 'success');
          return result;
        } catch (error) {
          await this.logJob('dropbox-sync', 'failed');
          throw error;
        }
      },
      { connection },
    );

    new Worker(
      'upload-automation',
      async () => {
        try {
          const uploads = await uploadsService.list();
          console.log('Auto-upload placeholder for videos', uploads.length);
          await this.logJob('upload-automation', 'success');
        } catch (error) {
          await this.logJob('upload-automation', 'failed');
          throw error;
        }
      },
      { connection },
    );

    new Worker(
      'weekly-report',
      async () => {
        try {
          const metrics = {
            views: 15432,
            likes: 3421,
            comments: 421,
          };
          const summary = await reportsService.generateSummary(metrics);
          await notificationsService.sendPush(
            'reports:weekly',
            'Weekly Performance Ready',
            summary,
          );
          await this.logJob('weekly-report', 'success');
        } catch (error) {
          await this.logJob('weekly-report', 'failed');
          throw error;
        }
      },
      { connection },
    );

    new Worker(
      'caption-refresh',
      async () => {
        try {
          await captionGeneratorService.refreshStaleCaptions();
          await this.logJob('caption-refresh', 'success');
        } catch (error) {
          await this.logJob('caption-refresh', 'failed');
          throw error;
        }
      },
      { connection },
    );

    await this.ensureRecurringJobs();

    this.initialized = true;
  }

  async ensureRecurringJobs() {
    const dropboxJob: JobsOptions = {
      repeat: { every: 1000 * 60 * 60 * 6 },
      removeOnComplete: true,
    };
    await this.dropboxQueue.add('scheduled-sync', {}, { ...dropboxJob, jobId: 'dropbox-recurring' });

    await this.uploadQueue.add(
      'monday-upload',
      {},
      {
        repeat: {
          pattern: '0 10 * * 1',
        },
        removeOnComplete: true,
        jobId: 'upload-recurring',
      },
    );

    await this.reportQueue.add(
      'weekly-summary',
      {},
      {
        repeat: {
          pattern: '0 18 * * 0',
        },
        removeOnComplete: true,
        jobId: 'report-recurring',
      },
    );

    await this.captionQueue.add(
      'weekly-caption-refresh',
      {},
      {
        repeat: {
          pattern: '0 12 * * 0',
        },
        removeOnComplete: true,
        jobId: 'caption-recurring',
      },
    );
  }

  async queueDropboxSync() {
    await this.dropboxQueue.add('manual-sync', {});
  }

  private async logJob(jobName: string, status: string) {
    await prisma.jobsLog.create({
      data: {
        jobName,
        status,
      },
    });
  }
}

export const scheduler = new SchedulerService();
