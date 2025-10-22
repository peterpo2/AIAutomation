import { Dropbox, DropboxAuth } from 'dropbox';
import type { files } from 'dropbox';

const APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY;
const CODE_VERIFIER_STORAGE_KEY = 'dropbox_code_verifier';

type DropboxTokenResult = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

type ThumbnailResult = files.FileMetadata & { fileBlob?: Blob };

export const dropboxAuth = new DropboxAuth({ clientId: APP_KEY });

export const getAuthUrl = async (): Promise<string> => {
  const redirectUri = `${window.location.origin}/dropbox-callback`;

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
  const redirectUri = `${window.location.origin}/dropbox-callback`;

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
};

export const isDropboxConnected = (): boolean => {
  return !!localStorage.getItem('dropbox_access_token');
};

export interface DropboxFile {
  name: string;
  path: string;
  size: number;
  id: string;
  isFolder: boolean;
  thumbnailUrl?: string;
}

export const listFiles = async (path: string = ''): Promise<DropboxFile[]> => {
  const dbx = getDropboxClient();
  if (!dbx) throw new Error('Dropbox not connected');

  try {
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
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
};

export const getThumbnail = async (path: string): Promise<string | null> => {
  const dbx = getDropboxClient();
  if (!dbx) return null;

  try {
    const response = await dbx.filesGetThumbnail({
      path,
      format: { '.tag': 'jpeg' },
      size: { '.tag': 'w256h256' },
    });
    const { fileBlob } = response.result as ThumbnailResult;
    if (!fileBlob) {
      return null;
    }
    return URL.createObjectURL(fileBlob);
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
