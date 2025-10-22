import { getFirebaseAdmin } from '../auth/firebase.service.js';

const topicMap: Record<string, string> = {
  'dropbox:new-file': 'smartops_dropbox',
  'upload:complete': 'smartops_uploads',
  'reports:weekly': 'smartops_reports',
  'caption:generated': 'caption_updates',
};

export const notificationsService = {
  async sendPush(event: keyof typeof topicMap, title: string, body: string) {
    try {
      const admin = getFirebaseAdmin();
      await admin.messaging().send({
        topic: topicMap[event],
        notification: { title, body },
        data: { event },
      });
    } catch (error) {
      console.error('FCM notification failed', error);
    }
  },
};
