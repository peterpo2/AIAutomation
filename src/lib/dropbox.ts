import { Dropbox, DropboxAuth } from 'dropbox';

const APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY;

export const dropboxAuth = new DropboxAuth({ clientId: APP_KEY });

export const getAuthUrl = () => {
  const redirectUri = `${window.location.origin}/dropbox-callback`;
  dropboxAuth.setCodeVerifier();
  return dropboxAuth.getAuthenticationUrl(redirectUri, undefined, 'code', 'offline', undefined, undefined, true);
};

export const handleAuthCallback = async (code: string) => {
  const redirectUri = `${window.location.origin}/dropbox-callback`;
  try {
    await dropboxAuth.setCodeVerifier();
    const response = await dropboxAuth.getAccessTokenFromCode(redirectUri, code);
    const accessToken = (response.result as any).access_token;
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
    const files: DropboxFile[] = response.result.entries.map((entry: any) => ({
      name: entry.name,
      path: entry.path_lower,
      size: entry.size || 0,
      id: entry.id,
      isFolder: entry['.tag'] === 'folder',
    }));
    return files;
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
      format: 'jpeg',
      size: 'w256h256',
    });
    const blob = (response.result as any).fileBlob;
    return URL.createObjectURL(blob);
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
