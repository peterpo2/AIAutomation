import { apiFetch } from './apiClient';
import { supabase, VIDEO_STATUSES, type VideoMetadata, type VideoStatus } from './supabase';

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

type SupabaseVideoRow = {
  id: string;
  file_path: string | null;
  file_name: string | null;
  file_size: number | string | null;
  dropbox_id: string | null;
  thumbnail_url: string | null;
  brand: string | null;
  caption: string | null;
  category: string | null;
  status: string | null;
  created_at: string | null;
  user_id: string | null;
};

const normalizeSupabaseUpload = (upload: SupabaseVideoRow): VideoMetadata => ({
  id: upload.id,
  file_path: upload.file_path ?? '',
  file_name: upload.file_name ?? 'Untitled video',
  file_size: parseSize(upload.file_size),
  brand: upload.brand ?? '',
  caption: upload.caption ?? '',
  category: upload.category ?? '',
  dropbox_id: upload.dropbox_id ?? null,
  thumbnail_url: upload.thumbnail_url ?? null,
  created_at: upload.created_at ?? null,
  user_id: upload.user_id ?? null,
  status: parseStatus(upload.status),
});

const ensureSupabaseClient = () => {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }
  return supabase;
};

const fetchSupabaseUploads = async (userId: string): Promise<VideoMetadata[]> => {
  const client = ensureSupabaseClient();
  const { data, error } = await client
    .from('videos')
    .select(
      'id,file_path,file_name,file_size,dropbox_id,thumbnail_url,brand,caption,category,status,created_at,user_id',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Supabase fetch failed: ${error.message}`);
  }

  return Array.isArray(data) ? data.map((upload) => normalizeSupabaseUpload(upload)) : [];
};

const createSupabaseUpload = async (video: VideoMetadata, userId: string): Promise<VideoMetadata> => {
  const client = ensureSupabaseClient();
  const { data, error } = await client
    .from('videos')
    .insert({
      user_id: userId,
      file_path: video.file_path ?? '',
      file_name: video.file_name ?? 'Untitled video',
      file_size: video.file_size ?? 0,
      dropbox_id: video.dropbox_id ?? null,
      thumbnail_url: video.thumbnail_url ?? null,
      brand: video.brand ?? null,
      caption: video.caption ?? null,
      category: video.category ?? null,
      status: video.status ?? 'pending',
    })
    .select(
      'id,file_path,file_name,file_size,dropbox_id,thumbnail_url,brand,caption,category,status,created_at,user_id',
    )
    .single();

  if (error) {
    throw new Error(`Supabase create failed: ${error.message}`);
  }

  if (!data) {
    throw new Error('Supabase create failed: missing response payload.');
  }

  return normalizeSupabaseUpload(data as SupabaseVideoRow);
};

const updateSupabaseUpload = async (
  id: string,
  video: VideoMetadata,
  userId: string,
): Promise<VideoMetadata> => {
  const client = ensureSupabaseClient();
  const { data, error } = await client
    .from('videos')
    .update({
      status: video.status ?? 'pending',
      brand: video.brand ?? null,
      caption: video.caption ?? null,
      category: video.category ?? null,
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select(
      'id,file_path,file_name,file_size,dropbox_id,thumbnail_url,brand,caption,category,status,created_at,user_id',
    )
    .single();

  if (error) {
    throw new Error(`Supabase update failed: ${error.message}`);
  }

  if (!data) {
    throw new Error('Supabase update failed: missing response payload.');
  }

  return normalizeSupabaseUpload(data as SupabaseVideoRow);
};

const deleteSupabaseUpload = async (id: string, userId: string): Promise<void> => {
  const client = ensureSupabaseClient();
  const { error } = await client.from('videos').delete().eq('id', id).eq('user_id', userId);

  if (error) {
    throw new Error(`Supabase delete failed: ${error.message}`);
  }
};

const withSupabaseFallback = async <T>(
  action: string,
  userId: string | undefined,
  execute: () => Promise<T>,
  fallback: (() => Promise<T>) | null,
): Promise<T> => {
  try {
    return await execute();
  } catch (error) {
    console.warn(`Failed to ${action} via SmartOps API`, error);
    if (!userId || !fallback) {
      throw error instanceof Error ? error : new Error(`Failed to ${action}`);
    }

    try {
      return await fallback();
    } catch (fallbackError) {
      console.error(`Supabase fallback failed to ${action}`, fallbackError);
      if (fallbackError instanceof Error) {
        throw fallbackError;
      }
      throw new Error(`Supabase fallback failed to ${action}`);
    }
  }
};

export const fetchUploads = async (token: string, userId?: string): Promise<VideoMetadata[]> =>
  withSupabaseFallback(
    'load uploads',
    userId,
    async () => {
      const response = await apiFetch('/uploads', {
        headers: buildAuthHeaders(token),
      });

      if (!response.ok) {
        throw new Error(`Failed to load uploads: ${response.status}`);
      }

      const data = (await response.json()) as UploadResponse[];
      return Array.isArray(data) ? data.map(normalizeUpload) : [];
    },
    userId
      ? () => fetchSupabaseUploads(userId)
      : null,
  );

export const createUpload = async (
  token: string,
  video: VideoMetadata,
  userId?: string,
): Promise<VideoMetadata> =>
  withSupabaseFallback(
    'create upload',
    userId,
    async () => {
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
    },
    userId ? () => createSupabaseUpload(video, userId) : null,
  );

export const updateUpload = async (
  token: string,
  id: string,
  video: VideoMetadata,
  userId?: string,
): Promise<VideoMetadata> =>
  withSupabaseFallback(
    'update upload',
    userId,
    async () => {
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
    },
    userId ? () => updateSupabaseUpload(id, video, userId) : null,
  );

export const deleteUpload = async (token: string, id: string, userId?: string): Promise<void> =>
  withSupabaseFallback(
    'delete upload',
    userId,
    async () => {
      const response = await apiFetch(`/uploads/${id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(token),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete upload: ${response.status}`);
      }
    },
    userId ? () => deleteSupabaseUpload(id, userId) : null,
  );
