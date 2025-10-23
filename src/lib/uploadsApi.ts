import { apiFetch } from './apiClient';
import { VIDEO_STATUSES, type VideoMetadata, type VideoStatus } from './supabase';

export type UploadResponse = {
  id: string;
  fileName?: string | null;
  folderPath?: string | null;
  dropboxId?: string | null;
  size?: string | number | null;
  status?: string | null;
  brand?: string | null;
  caption?: string | null;
  category?: string | null;
  createdAt?: string | null;
  userId?: string | null;
};

const parseStatus = (status: string | null | undefined): VideoStatus => {
  if (!status) return 'pending';
  const normalized = status.toLowerCase();
  if (normalized === 'scheduled') {
    return 'ready';
  }
  return VIDEO_STATUSES.includes(normalized as VideoStatus)
    ? (normalized as VideoStatus)
    : 'pending';
};

const parseSize = (size: UploadResponse['size']): number => {
  if (typeof size === 'number') {
    return Number.isFinite(size) ? size : 0;
  }
  if (typeof size === 'string') {
    const numeric = Number(size);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
};

const normalizeUpload = (upload: UploadResponse): VideoMetadata => ({
  id: upload.id,
  file_path: upload.folderPath ?? '',
  file_name: upload.fileName ?? 'Untitled video',
  file_size: parseSize(upload.size),
  brand: upload.brand ?? '',
  caption: upload.caption ?? '',
  category: upload.category ?? '',
  dropbox_id: upload.dropboxId ?? null,
  thumbnail_url: null,
  created_at: upload.createdAt ?? null,
  user_id: upload.userId ?? null,
  status: parseStatus(upload.status),
});

const buildAuthHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

export const fetchUploads = async (token: string): Promise<VideoMetadata[]> => {
  const response = await apiFetch('/uploads', {
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Failed to load uploads: ${response.status}`);
  }

  const data = (await response.json()) as UploadResponse[];
  return Array.isArray(data) ? data.map(normalizeUpload) : [];
};

export const createUpload = async (
  token: string,
  video: VideoMetadata,
): Promise<VideoMetadata> => {
  const response = await apiFetch('/uploads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(token),
    },
    body: JSON.stringify({
      fileName: video.file_name ?? 'Untitled video',
      folderPath: video.file_path ?? '',
      dropboxId: video.dropbox_id ?? undefined,
      size: video.file_size ?? 0,
      brand: video.brand ?? undefined,
      caption: video.caption ?? undefined,
      category: video.category ?? undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create upload: ${response.status}`);
  }

  const data = (await response.json()) as UploadResponse;
  return normalizeUpload(data);
};

export const updateUpload = async (
  token: string,
  id: string,
  video: VideoMetadata,
): Promise<VideoMetadata> => {
  const response = await apiFetch(`/uploads/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(token),
    },
    body: JSON.stringify({
      status: video.status ?? 'pending',
      brand: video.brand ?? undefined,
      caption: video.caption ?? undefined,
      category: video.category ?? undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update upload: ${response.status}`);
  }

  const data = (await response.json()) as UploadResponse;
  return normalizeUpload(data);
};

export const deleteUpload = async (token: string, id: string): Promise<void> => {
  const response = await apiFetch(`/uploads/${id}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete upload: ${response.status}`);
  }
};
