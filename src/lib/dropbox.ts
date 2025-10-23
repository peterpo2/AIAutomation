import { Dropbox, DropboxAuth } from 'dropbox';
import type { files } from 'dropbox';
import { clearCacheByPrefix, withCache, type CacheOptions } from './cache';

const CODE_VERIFIER_STORAGE_KEY = 'dropbox_code_verifier';
const CACHE_PREFIX = 'dropbox:';
const LIST_CACHE_PREFIX = `${CACHE_PREFIX}list:`;
const THUMBNAIL_CACHE_PREFIX = `${CACHE_PREFIX}thumbnail:`;

const DEFAULT_LIST_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_THUMBNAIL_TTL_MS = 60 * 60 * 1000; // 1 hour

const getEnvValue = (...keys: (keyof ImportMetaEnv)[]): string | null => {
  for (const key of keys) {
    const value = import.meta.env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const { result } = reader;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Failed to read blob as data URL'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read blob as data URL'));
    };
    reader.readAsDataURL(blob);
  });

type DropboxTokenResult = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

type ThumbnailResult = files.FileMetadata & { fileBlob?: Blob };

let dropboxAuthInstance: DropboxAuth | null = null;

const getDropboxAppKey = (): string => {
  const key = getEnvValue('VITE_DROPBOX_APP_KEY', 'DROPBOX_APP_KEY');
  if (!key) {
    throw new Error('Dropbox integration is not configured. Please set VITE_DROPBOX_APP_KEY in your environment file.');
  }
  return key;
};

const getDropboxAppSecret = (): string | null => {
  return getEnvValue('VITE_DROPBOX_APP_SECRET', 'DROPBOX_APP_SECRET');
};

const getDropboxRefreshToken = (): string | null => {
  return getEnvValue('VITE_DROPBOX_REFRESH_TOKEN', 'DROPBOX_REFRESH_TOKEN');
};

const getDropboxAuthClient = (): DropboxAuth => {
  if (!dropboxAuthInstance) {
    dropboxAuthInstance = new DropboxAuth({ clientId: getDropboxAppKey() });
  }
  return dropboxAuthInstance;
};

const resolveRedirectUri = (): string => {
  if (typeof window === 'undefined') {
    throw new Error('Dropbox redirect resolution is only available in the browser.');
  }

  const configuredUri = getEnvValue('VITE_DROPBOX_REDIRECT_URI', 'DROPBOX_REDIRECT_URI');
  if (!configuredUri) {
    return `${window.location.origin}/auth/dropbox/callback`;
  }

  try {
    const resolved = new URL(configuredUri, window.location.origin);
    return resolved.toString();
  } catch (error) {
    console.error('Invalid Dropbox redirect URI configured:', error);
    throw new Error('Invalid Dropbox redirect URI configured. Update VITE_DROPBOX_REDIRECT_URI in your environment file.');
  }
};

export const getAuthUrl = async (): Promise<string> => {
  const dropboxAuth = getDropboxAuthClient();
  const redirectUri = resolveRedirectUri();

  const authUrl = await dropboxAuth.getAuthenticationUrl(
    redirectUri,
    undefined,
    'code',
    'offline',
    undefined,
    undefined,
    true,
  );

  const codeVerifier = dropboxAuth.getCodeVerifier();
  if (codeVerifier) {
    sessionStorage.setItem(CODE_VERIFIER_STORAGE_KEY, codeVerifier);
  }

  return authUrl.toString();
};

export const handleAuthCallback = async (code: string) => {
  const dropboxAuth = getDropboxAuthClient();
  const redirectUri = resolveRedirectUri();

  try {
    const storedVerifier = sessionStorage.getItem(CODE_VERIFIER_STORAGE_KEY);
    if (!storedVerifier) {
      throw new Error('Missing Dropbox authorization state. Please restart the connection flow.');
    }

    dropboxAuth.setCodeVerifier(storedVerifier);
    sessionStorage.removeItem(CODE_VERIFIER_STORAGE_KEY);

    const response = await dropboxAuth.getAccessTokenFromCode(redirectUri, code);
    const { access_token: accessToken } = response.result as DropboxTokenResult;
    localStorage.setItem('dropbox_access_token', accessToken);
    dropboxAuthInstance?.setAccessToken(accessToken);
    clearDropboxCache();
    return accessToken;
  } catch (error) {
    console.error('Error getting Dropbox access token:', error);
    throw error;
  }
};

export const getDropboxClient = (): Dropbox | null => {
  const accessToken = localStorage.getItem('dropbox_access_token');
  if (!accessToken) return null;
  return new Dropbox({ accessToken });
};

export const disconnectDropbox = () => {
  localStorage.removeItem('dropbox_access_token');
  sessionStorage.removeItem(CODE_VERIFIER_STORAGE_KEY);
  clearDropboxCache();
};

export const isDropboxConnected = (): boolean => {
  return !!localStorage.getItem('dropbox_access_token');
};

export const hasEnvironmentDropboxCredentials = (): boolean => {
  return !!(getDropboxAppSecret() && getDropboxRefreshToken());
};

export const connectUsingRefreshToken = async (): Promise<boolean> => {
  if (isDropboxConnected()) {
    return true;
  }

  const refreshToken = getDropboxRefreshToken();
  const appSecret = getDropboxAppSecret();
  if (!refreshToken || !appSecret) {
    return false;
  }

  const appKey = getDropboxAppKey();
  const requestBody = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${appKey}:${appSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: requestBody.toString(),
  });

  const data = (await response.json()) as DropboxTokenResult & {
    error_description?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error_description ?? data.error ?? 'Failed to refresh Dropbox access token.');
  }

  const { access_token: accessToken } = data;
  if (!accessToken) {
    throw new Error('Dropbox token response did not include an access token.');
  }

  localStorage.setItem('dropbox_access_token', accessToken);
  dropboxAuthInstance?.setAccessToken(accessToken);
  clearDropboxCache();
  return true;
};

export interface DropboxFile {
  name: string;
  path: string;
  size: number;
  id: string;
  isFolder: boolean;
  thumbnailUrl?: string;
}

const getListCacheKey = (path: string) => `${LIST_CACHE_PREFIX}${path || 'root'}`;
const getThumbnailCacheKey = (path: string) => `${THUMBNAIL_CACHE_PREFIX}${path || 'root'}`;

export type DropboxCacheOptions = CacheOptions;

export const listFiles = async (path: string = '', options?: DropboxCacheOptions): Promise<DropboxFile[]> => {
  const dbx = getDropboxClient();
  if (!dbx) throw new Error('Dropbox not connected');

  const cacheOptions: CacheOptions = {
    ttlMs: options?.ttlMs ?? DEFAULT_LIST_TTL_MS,
    forceRefresh: options?.forceRefresh,
  };

  try {
    return await withCache(getListCacheKey(path), async () => {
      const response = await dbx.filesListFolder({ path });
      const entries = response.result.entries.filter(
        (entry): entry is files.FileMetadataReference | files.FolderMetadataReference =>
          entry['.tag'] === 'file' || entry['.tag'] === 'folder',
      );

      const mappedFiles: DropboxFile[] = entries.map((entry) => ({
        name: entry.name,
        path: entry.path_lower ?? entry.path_display ?? entry.name,
        size: entry['.tag'] === 'file' ? entry.size : 0,
        id: entry.id,
        isFolder: entry['.tag'] === 'folder',
      }));
      return mappedFiles;
    }, cacheOptions);
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
};

export const getThumbnail = async (path: string, options?: DropboxCacheOptions): Promise<string | null> => {
  const dbx = getDropboxClient();
  if (!dbx) return null;

  const cacheOptions: CacheOptions = {
    ttlMs: options?.ttlMs ?? DEFAULT_THUMBNAIL_TTL_MS,
    forceRefresh: options?.forceRefresh,
  };

  try {
    return await withCache(getThumbnailCacheKey(path), async () => {
      const response = await dbx.filesGetThumbnail({
        path,
        format: { '.tag': 'jpeg' },
        size: { '.tag': 'w256h256' },
      });
      const { fileBlob } = response.result as ThumbnailResult;
      if (!fileBlob) {
        return null;
      }
      return await blobToDataUrl(fileBlob);
    }, cacheOptions);
  } catch (error) {
    console.error('Error getting thumbnail:', error);
    return null;
  }
};

export const getTemporaryLink = async (path: string): Promise<string | null> => {
  const dbx = getDropboxClient();
  if (!dbx) return null;

  try {
    const response = await dbx.filesGetTemporaryLink({ path });
    return response.result.link;
  } catch (error) {
    console.error('Error getting temporary link:', error);
    return null;
  }
};

export const clearDropboxCache = () => {
  clearCacheByPrefix(CACHE_PREFIX);
};
