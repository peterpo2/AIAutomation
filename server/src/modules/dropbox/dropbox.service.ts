import { Dropbox } from 'dropbox';
import axios from 'axios';
import { prisma } from '../auth/prisma.client.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { captionGeneratorService } from '../caption-generator/caption-generator.service.js';

const getDropboxClient = async () => {
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  const clientId = process.env.DROPBOX_APP_KEY;
  const clientSecret = process.env.DROPBOX_APP_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Dropbox credentials missing');
  }

  const response = await axios.post(
    'https://api.dropbox.com/oauth2/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    {
      auth: {
        username: clientId,
        password: clientSecret,
      },
    },
  );

  const { access_token: accessToken } = response.data;
  if (!accessToken) {
    throw new Error('Unable to refresh Dropbox access token');
  }

  return new Dropbox({ accessToken });
};

export const dropboxService = {
  async syncFolders(path = '') {
    const client = await getDropboxClient();
    let hasMore = true;
    let cursor: string | undefined;
    const newVideos = [] as string[];

    while (hasMore) {
      const response = cursor
        ? await client.filesListFolderContinue({ cursor })
        : await client.filesListFolder({ path, recursive: true });
      cursor = response.result.cursor;
      hasMore = response.result.has_more;

      for (const entry of response.result.entries) {
        if (entry['.tag'] === 'file') {
          const exists = await prisma.video.findFirst({
            where: {
              dropboxId: entry.id,
            },
          });
          if (!exists) {
            const video = await prisma.video.create({
              data: {
                fileName: entry.name,
                folderPath: entry.path_display ?? '',
                dropboxId: entry.id,
                size: BigInt(entry.size ?? 0),
                status: 'pending',
              },
            });
            newVideos.push(entry.name);
            captionGeneratorService
              .generateForVideo(video, { notify: true })
              .catch((error) => console.error(`Auto caption generation failed for ${video.id}`, error));
          }
        }
      }
    }

    if (newVideos.length > 0) {
      await notificationsService.sendPush(
        'dropbox:new-file',
        'New Dropbox Videos Ready',
        `${newVideos.length} new video(s) detected in Dropbox`,
      );
    }

    return { newFiles: newVideos.length };
  },

  async getTemporaryLink(dropboxId: string) {
    const client = await getDropboxClient();
    const result = await client.filesGetTemporaryLink({ path: dropboxId });
    return result.result.link;
  },
};
