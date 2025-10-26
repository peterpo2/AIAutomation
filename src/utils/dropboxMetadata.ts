import type { DropboxFile } from '../lib/dropbox';
import type { VideoMetadata } from '../lib/supabase';

export type DropboxPathInfo = {
  /** Full display path, mirroring Dropbox's path_display (includes file name). */
  fullPath: string;
  /** Folder path without the trailing file segment. */
  folderPath: string;
  /** Individual path segments, excluding a leading slash. */
  segments: string[];
  /** Individual folder path segments (excludes the file name). */
  folderSegments: string[];
  /** Top-level folder, typically the client identifier. */
  client: string;
  /** Remaining nested path after the client folder. */
  nestedPath: string;
};

const normalizeDropboxPath = (path: string): { cleaned: string; hasLeadingSlash: boolean } => {
  if (!path) {
    return { cleaned: '', hasLeadingSlash: false };
  }

  const trimmed = path.trim();
  const hasLeadingSlash = trimmed.startsWith('/');
  const parts = trimmed
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment.length > 0);

  return { cleaned: parts.join('/'), hasLeadingSlash };
};

export const extractDropboxPathInfo = (path: string): DropboxPathInfo => {
  const { cleaned, hasLeadingSlash } = normalizeDropboxPath(path);
  const segments = cleaned.length > 0 ? cleaned.split('/').filter(Boolean) : [];
  const folderSegments = segments.slice(0, Math.max(segments.length - 1, 0));
  const folderPathSegments = folderSegments.join('/');
  const fullPathSegments = segments.join('/');

  const nestedSegments = folderSegments.slice(1);

  return {
    fullPath: fullPathSegments ? `${hasLeadingSlash ? '/' : ''}${fullPathSegments}` : '',
    folderPath: folderPathSegments ? `${hasLeadingSlash ? '/' : ''}${folderPathSegments}` : '',
    segments,
    folderSegments,
    client: folderSegments[0] ?? '',
    nestedPath: nestedSegments.join('/'),
  };
};

export const buildVideoMetadataFromDropboxFile = (file: DropboxFile): VideoMetadata => {
  const info = extractDropboxPathInfo(file.path);
  return {
    file_path: info.fullPath || file.path,
    file_name: file.name,
    file_size: file.size,
    dropbox_id: file.id,
    status: 'pending',
    brand: info.client,
    caption: '',
    category: info.nestedPath,
  };
};

