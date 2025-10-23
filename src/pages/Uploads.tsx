import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Video, Save, Trash2, Edit2, AlertTriangle } from 'lucide-react';
import { supabase, supabaseInitError, VideoMetadata, VIDEO_STATUSES } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { DropboxFile } from '../lib/dropbox';

const LOCAL_QUEUE_KEY = 'upload_queue_local_drafts';

type VideoInput = Partial<VideoMetadata> | VideoMetadata;

type VideoStatus = (typeof VIDEO_STATUSES)[number];

const sanitizeVideoMetadata = (video: VideoInput): VideoMetadata => {
  const rawSize = typeof video.file_size === 'string' ? Number(video.file_size) : video.file_size;
  const numericSize = Number.isFinite(rawSize ?? NaN) ? Number(rawSize) : 0;
  const allowedStatuses = new Set<VideoStatus>(VIDEO_STATUSES);
  const statusValue =
    typeof video.status === 'string' && allowedStatuses.has(video.status as VideoStatus)
      ? (video.status as VideoStatus)
      : 'pending';

  return {
    id: video.id ?? null,
    file_path: video.file_path ?? '',
    file_name: video.file_name ?? 'Untitled video',
    file_size: numericSize,
    brand: video.brand ?? '',
    caption: video.caption ?? '',
    category: video.category ?? '',
    dropbox_id: video.dropbox_id ?? null,
    thumbnail_url: video.thumbnail_url ?? null,
    created_at: video.created_at ?? null,
    user_id: video.user_id ?? null,
    status: statusValue,
  };
};

const mergeVideoLists = (...lists: VideoInput[][]): VideoMetadata[] => {
  const merged = new Map<string, VideoMetadata>();

  for (const list of lists) {
    for (const item of list) {
      const sanitized = sanitizeVideoMetadata(item);
      const key =
        sanitized.id !== null && sanitized.id !== undefined
          ? `id:${sanitized.id}`
          : sanitized.dropbox_id
          ? `dropbox:${sanitized.dropbox_id}`
          : null;

      if (!key) {
        continue;
      }

      const existing = merged.get(key);
      if (existing) {
        merged.set(key, {
          ...existing,
          ...sanitized,
          id: sanitized.id ?? existing.id,
          dropbox_id: sanitized.dropbox_id ?? existing.dropbox_id,
          created_at: sanitized.created_at ?? existing.created_at,
          thumbnail_url: sanitized.thumbnail_url ?? existing.thumbnail_url,
          user_id: sanitized.user_id ?? existing.user_id,
        });
      } else {
        merged.set(key, sanitized);
      }
    }
  }

  return Array.from(merged.values());
};

const readLocalDrafts = (): VideoMetadata[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(LOCAL_QUEUE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as VideoInput[];
    if (!Array.isArray(parsed)) return [];
    return mergeVideoLists(parsed);
  } catch (error) {
    console.error('Failed to read locally queued uploads', error);
    return [];
  }
};

const persistLocalDrafts = (videos: VideoMetadata[]) => {
  if (typeof window === 'undefined') return;
  const drafts = videos.filter((video) => !video.id);
  if (drafts.length === 0) {
    localStorage.removeItem(LOCAL_QUEUE_KEY);
    return;
  }
  try {
    localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(drafts));
  } catch (error) {
    console.error('Failed to persist locally queued uploads', error);
  }
};

const formatFileSize = (size?: number | null) => {
  const numeric = typeof size === 'number' ? size : Number(size ?? 0);
  if (!numeric || Number.isNaN(numeric)) {
    return '0.00 MB';
  }
  return `${(numeric / (1024 * 1024)).toFixed(2)} MB`;
};

const getVideoKey = (video: VideoMetadata, fallback: number) => video.id ?? video.dropbox_id ?? fallback;

const buildSupabasePayload = (video: VideoMetadata, userId: string) => ({
  file_path: video.file_path ?? '',
  file_name: video.file_name ?? 'Untitled video',
  file_size: video.file_size ?? 0,
  brand: video.brand ?? '',
  caption: video.caption ?? '',
  category: video.category ?? '',
  dropbox_id: video.dropbox_id,
  thumbnail_url: video.thumbnail_url,
  status: video.status ?? 'pending',
  user_id: userId,
});

export default function Uploads() {
  const { user } = useAuth();
  const [videos, setVideos] = useState<VideoMetadata[]>([]);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const supabaseConfigMessage =
    supabaseInitError?.message ??
    (!supabase
      ? 'Supabase client is not configured. Please define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before building the front end.'
      : '');

  useEffect(() => {
    const drafts = readLocalDrafts();
    if (drafts.length > 0) {
      setVideos((prev) => mergeVideoLists(prev, drafts));
    }
  }, []);

  const loadVideos = useCallback(async () => {
    if (!user || !supabase) return;
    try {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', user.uid)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const supabaseVideos = mergeVideoLists(Array.isArray(data) ? (data as VideoInput[]) : []);
      setVideos((prev) => {
        const drafts = prev.filter((video) => !video.id);
        return mergeVideoLists(supabaseVideos, drafts);
      });
      setErrorMessage(null);
    } catch (error) {
      console.error('Failed to load videos from Supabase', error);
      setErrorMessage('Unable to reach Supabase. Any new uploads will be kept locally until the connection is restored.');
    }
  }, [user]);

  useEffect(() => {
    void loadVideos();
    const stored = typeof window !== 'undefined' ? localStorage.getItem('selected_videos') : null;
    if (stored) {
      try {
        const selected: DropboxFile[] = JSON.parse(stored);
        const newVideos = selected.map((file) =>
          sanitizeVideoMetadata({
            file_path: file.path,
            file_name: file.name,
            file_size: file.size,
            dropbox_id: file.id,
            brand: '',
            caption: '',
            category: '',
            status: 'pending',
          }),
        );
        setVideos((prev) => mergeVideoLists(prev, newVideos));
      } catch (error) {
        console.error('Failed to process selected Dropbox videos', error);
        setErrorMessage('Could not load the videos selected in Dropbox. Please try selecting them again.');
      } finally {
        localStorage.removeItem('selected_videos');
      }
    }
  }, [loadVideos]);

  useEffect(() => {
    persistLocalDrafts(videos);
  }, [videos]);

  const handleSave = async (video: VideoMetadata, index: number) => {
    const sanitized = sanitizeVideoMetadata(video);

    if (!user || !supabase) {
      setVideos((prev) => {
        const next = [...prev];
        next[index] = sanitized;
        return next;
      });
      setEditingId(null);
      setErrorMessage((prev) => prev ?? 'Supabase is not configured. Changes were saved locally.');
      return;
    }

    try {
      if (sanitized.id) {
        const { data, error } = await supabase
          .from('videos')
          .update(buildSupabasePayload(sanitized, user.uid))
          .eq('id', sanitized.id)
          .select();

        if (error) {
          throw error;
        }

        const updated = data?.[0] ? sanitizeVideoMetadata(data[0] as VideoInput) : sanitized;
        setVideos((prev) => {
          const next = [...prev];
          next[index] = updated;
          return next;
        });
      } else {
        const { data, error } = await supabase
          .from('videos')
          .insert([buildSupabasePayload(sanitized, user.uid)])
          .select();

        if (error) {
          throw error;
        }

        const inserted = data?.[0] ? sanitizeVideoMetadata(data[0] as VideoInput) : sanitized;
        setVideos((prev) => {
          const next = [...prev];
          next[index] = inserted;
          return next;
        });
      }

      setEditingId(null);
      setErrorMessage(null);
    } catch (error) {
      console.error('Failed to save video metadata', error);
      setVideos((prev) => {
        const next = [...prev];
        next[index] = sanitized;
        return next;
      });
      setErrorMessage('Failed to sync with Supabase. The latest changes were saved locally and will retry when available.');
    }
  };

  const handleDelete = async (video: VideoMetadata, index: number) => {
    setVideos((prev) => prev.filter((_, i) => i !== index));

    if (video.id && supabase && user) {
      try {
        const { error } = await supabase.from('videos').delete().eq('id', video.id);
        if (error) {
          throw error;
        }
      } catch (error) {
        console.error('Failed to delete video from Supabase', error);
        setErrorMessage('Could not remove the video from Supabase. It has been removed locally.');
      }
    }
  };

  const updateVideo = (index: number, field: keyof VideoMetadata, value: string) => {
    setVideos((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      next[index] = sanitizeVideoMetadata(updated);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Upload Queue</h1>
        <p className="text-gray-600 mt-1">Manage videos ready for scheduling</p>
      </div>

      <div className="space-y-4">
        {!supabase && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0" />
            <div className="text-sm text-yellow-800 space-y-2">
              <div className="font-semibold">Supabase configuration required</div>
              <p>
                {supabaseConfigMessage ||
                  'The Supabase client could not be initialized because required environment variables are missing.'}
              </p>
              <div>
                Ensure the following variables are defined before building the frontend (see <code>.env.example</code>):
                <ul className="list-disc list-inside mt-1">
                  <li>
                    <code>VITE_SUPABASE_URL</code>
                  </li>
                  <li>
                    <code>VITE_SUPABASE_ANON_KEY</code>
                  </li>
                </ul>
                <p className="mt-2">
                  After updating your environment, rebuild the Docker images or restart the Vite dev server so the new variables are picked up.
                </p>
                <p className="mt-2">
                  You can continue adding uploads—they will stay in your browser until the connection is configured.
                </p>
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {errorMessage}
          </div>
        )}
      </div>

      {videos.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white rounded-xl shadow-lg p-12 text-center"
        >
          <Video className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-800 mb-2">No videos in queue</h3>
          <p className="text-gray-600">Select videos from Dropbox to get started</p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {videos.map((video, index) => {
            const key = getVideoKey(video, index);
            const isSaved = Boolean(video.id);
            const isEditing = !isSaved || editingId === key;

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl shadow-lg p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="bg-gradient-to-br from-gray-100 to-gray-200 w-32 h-20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Video className="w-8 h-8 text-gray-400" />
                  </div>

                  <div className="flex-1 space-y-4">
                    <div>
                      <h3 className="font-semibold text-gray-800">{video.file_name ?? 'Untitled video'}</h3>
                      <p className="text-sm text-gray-500">{formatFileSize(video.file_size)}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Brand
                        </label>
                        <input
                          type="text"
                          value={video.brand ?? ''}
                          onChange={(e) => updateVideo(index, 'brand', e.target.value)}
                          placeholder="e.g., Kaufland, Lidl, TikTok"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none text-sm"
                          disabled={!isEditing}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Category
                        </label>
                        <select
                          value={video.category ?? ''}
                          onChange={(e) => updateVideo(index, 'category', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none text-sm"
                          disabled={!isEditing}
                        >
                          <option value="">Select category</option>
                          <option value="promotional">Promotional</option>
                          <option value="product">Product</option>
                          <option value="educational">Educational</option>
                          <option value="entertainment">Entertainment</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Status
                        </label>
                        <select
                          value={video.status ?? 'pending'}
                          onChange={(e) => updateVideo(index, 'status', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none text-sm"
                          disabled={!isEditing}
                        >
                          {VIDEO_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Caption
                      </label>
                      <textarea
                        value={video.caption ?? ''}
                        onChange={(e) => updateVideo(index, 'caption', e.target.value)}
                        placeholder="Write a caption for this video..."
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none text-sm resize-none"
                        disabled={!isEditing}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {isEditing ? (
                      <button
                        onClick={() => handleSave(video, index)}
                        className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                        title="Save"
                      >
                        <Save className="w-5 h-5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setEditingId(key)}
                        className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(video, index)}
                      className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
