import { Dropbox, type files } from 'dropbox';
import axios, { AxiosError } from 'axios';
import { prisma } from '../auth/prisma.client.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { captionGeneratorService } from '../caption-generator/caption-generator.service.js';
import type { Video } from '@prisma/client';

/** ---- Access Token Cache (avoid frequent refreshes) ---- */
let cachedAccessToken: string | null = null;
let cachedAtMs = 0;
const TOKEN_CACHE_TTL_MS = 3.5 * 60 * 60 * 1000; // ~3.5h

/** ---- Helpers ---- */
const isAxiosError = (e: unknown): e is AxiosError => (e as AxiosError)?.isAxiosError === true;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(action: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> {
  try {
    return await action();
  } catch (err) {
    if (retries <= 0) throw err;
    await wait(delayMs);
    return withRetry(action, retries - 1, delayMs);
  }
}

/** ---- Dropbox Client Factory (handles refresh_token) ---- */
async function getDropboxClient(): Promise<Dropbox> {
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  const clientId = process.env.DROPBOX_APP_KEY;
  const clientSecret = process.env.DROPBOX_APP_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Dropbox credentials missing (DROPBOX_REFRESH_TOKEN / DROPBOX_APP_KEY / DROPBOX_APP_SECRET)');
  }

  // Use cached token when still fresh
  if (cachedAccessToken && Date.now() - cachedAtMs < TOKEN_CACHE_TTL_MS) {
    return new Dropbox({ accessToken: cachedAccessToken });
  }

  try {
    const resp = await axios.post(
      'https://api.dropboxapi.com/oauth2/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      {
        auth: { username: clientId, password: clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    const accessToken = resp.data?.access_token as string | undefined;
    if (!accessToken) throw new Error('Dropbox token refresh returned no access_token');

    cachedAccessToken = accessToken;
    cachedAtMs = Date.now();

    return new Dropbox({ accessToken });
  } catch (err) {
    if (isAxiosError(err)) {
      console.error('Dropbox token refresh failed:', {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
      });
    } else {
      console.error('Dropbox token refresh failed:', err);
    }
    throw new Error('Dropbox token refresh failed');
  }
}

/** ---- Optional: allow clearing the cache (e.g., tests) ---- */
function clearTokenCache() {
  cachedAccessToken = null;
  cachedAtMs = 0;
}

/** ---- Main Service ---- */
export const dropboxService = {
  async verifyConnection(): Promise<void> {
    const client = await getDropboxClient();
    await client.usersGetCurrentAccount();
  },

  /**
   * Recursively scans Dropbox (starting at `path`) and inserts any new files into DB.
   * Triggers AI caption generation and sends a push summary for newly found videos.
   */
  async syncFolders(path = ''): Promise<{ newFiles: number; created: Video[] }> {
    const client = await getDropboxClient();
    let cursor: string | undefined;
    let hasMore = true;
    const newVideos: string[] = [];
    const createdRecords: Video[] = [];

    try {
      while (hasMore) {
        const resp = await withRetry(() =>
          cursor
            ? client.filesListFolderContinue({ cursor })
            : client.filesListFolder({ path, recursive: true }),
        );

        cursor = resp.result.cursor;
        hasMore = resp.result.has_more;

        for (const entry of resp.result.entries) {
          if (!isFileEntry(entry)) continue;

          // Optional: only accept common video extensions
          const lower = entry.name.toLowerCase();
          const looksLikeVideo = /\.(mp4|mov|m4v|avi|webm|mkv)$/.test(lower);
          if (!looksLikeVideo) continue;

          const exists = await prisma.video.findFirst({
            where: { dropboxId: entry.id },
            select: { id: true },
          });
          if (exists) continue;

          const created = await prisma.video.create({
            data: {
              fileName: entry.name,
              folderPath: entry.path_display ?? '',
              dropboxId: entry.id,
              size: BigInt(getEntrySize(entry)),
              status: 'pending',
            },
          });

          newVideos.push(entry.name);
          createdRecords.push(created);

          // Fire-and-forget AI caption generation
          captionGeneratorService
            .generateForVideo(created, { notify: true })
            .catch((e: unknown) => {
              if (isAxiosError(e)) {
                console.error('Caption generation failed (axios):', e.message, e.response?.status, e.response?.data);
              } else {
                console.error('Caption generation failed:', e);
              }
            });
        }
      }

      if (newVideos.length > 0) {
        await notificationsService.sendPush(
          'dropbox:new-file',
          'New Dropbox Videos Ready',
          `${newVideos.length} new video(s) detected in Dropbox.`,
        );
      }

      console.log(`Dropbox sync complete — ${newVideos.length} new video(s).`);
      return { newFiles: newVideos.length, created: createdRecords };
    } catch (err) {
      if (isAxiosError(err)) {
        console.error('Dropbox sync error (axios):', err.message, err.response?.status, err.response?.data);
      } else {
        console.error('Dropbox sync error:', err);
      }
      throw err;
    }
  },

  /**
   * Returns a short-lived link for preview/download.
   */
  async getTemporaryLink(dropboxId: string): Promise<string> {
    const client = await getDropboxClient();
    const result = await withRetry(() => client.filesGetTemporaryLink({ path: dropboxId }));
    return result.result.link;
  },

  async downloadFile(dropboxId: string): Promise<{ buffer: Buffer; size: number }> {
    const client = await getDropboxClient();
    const response = await withRetry(() => client.filesDownload({ path: dropboxId }));

    const binary = (response.result as files.FileMetadataReference & { fileBinary?: unknown })
      .fileBinary;

    if (!binary) {
      throw new Error('Dropbox download response did not include file data');
    }

    if (binary instanceof ArrayBuffer) {
      return { buffer: Buffer.from(binary), size: binary.byteLength };
    }

    if (ArrayBuffer.isView(binary)) {
      const view = binary as ArrayBufferView;
      return { buffer: Buffer.from(view.buffer), size: view.byteLength };
    }

    if (typeof binary === 'string') {
      const buffer = Buffer.from(binary, 'binary');
      return { buffer, size: buffer.byteLength };
    }

    throw new Error('Unsupported Dropbox download payload type');
  },

  /** Testing/ops helper */
  _clearTokenCache: clearTokenCache,
};

function isFileEntry(entry: files.MetadataReference): entry is files.FileMetadataReference {
  return entry['.tag'] === 'file';
}

function getEntrySize(entry: files.FileMetadataReference): number {
  return typeof entry.size === 'number' ? entry.size : 0;
}
