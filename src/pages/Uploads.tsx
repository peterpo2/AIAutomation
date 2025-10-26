import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Video, Save, Trash2, Edit2, Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { VIDEO_STATUSES, type VideoMetadata, type VideoStatus } from '../lib/supabase';
import { fetchUploads, createUpload, updateUpload, deleteUpload } from '../lib/uploadsApi';
import { useAuth } from '../context/AuthContext';
import type { DropboxFile } from '../lib/dropbox';
import { buildVideoMetadataFromDropboxFile, extractDropboxPathInfo } from '../utils/dropboxMetadata';

const LOCAL_QUEUE_KEY = 'upload_queue_local_drafts';
const DEFAULT_LOCAL_DRAFT_TTL_DAYS = 60;

const resolveDraftTtlDays = () => {
  const candidates = [
    import.meta.env.VITE_UPLOAD_DRAFT_TTL_DAYS,
    import.meta.env.VITE_LOCAL_DRAFT_TTL_DAYS,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return DEFAULT_LOCAL_DRAFT_TTL_DAYS;
};

const LOCAL_DRAFT_TTL_MS = resolveDraftTtlDays() * 24 * 60 * 60 * 1000;

type VideoInput = Partial<VideoMetadata> | VideoMetadata;

type StoredDraft = {
  video: VideoMetadata;
  queuedAt: number;
};

const isStoredDraft = (value: unknown): value is StoredDraft => {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  return typeof draft.video === 'object' && draft.video !== null && typeof draft.queuedAt !== 'undefined';
};

const sanitizeVideoMetadata = (video: VideoInput): VideoMetadata => {
  const rawSize = typeof video.file_size === 'string' ? Number(video.file_size) : video.file_size;
  const numericSize = Number.isFinite(rawSize ?? NaN) ? Number(rawSize) : 0;
  const allowedStatuses = new Set<VideoStatus>(VIDEO_STATUSES);
  const rawStatus = typeof video.status === 'string' ? video.status.toLowerCase() : null;
  const normalizedStatus = rawStatus === 'scheduled' ? 'ready' : rawStatus;
  const statusValue =
    normalizedStatus && allowedStatuses.has(normalizedStatus as VideoStatus)
      ? (normalizedStatus as VideoStatus)
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

const getDraftKey = (video: VideoMetadata): string => {
  if (video.dropbox_id) {
    return `dropbox:${video.dropbox_id}`;
  }
  if (video.file_path) {
    return `path:${video.file_path}`;
  }
  return `name:${video.file_name ?? 'untitled'}:${video.created_at ?? ''}`;
};

const readStoredDrafts = (): StoredDraft[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(LOCAL_QUEUE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    return parsed.reduce<StoredDraft[]>((accumulator, entry) => {
      if (isStoredDraft(entry)) {
        const queuedAt = Number(entry.queuedAt);
        accumulator.push({
          video: sanitizeVideoMetadata(entry.video),
          queuedAt: Number.isFinite(queuedAt) ? queuedAt : now,
        });
      } else if (entry && typeof entry === 'object') {
        accumulator.push({
          video: sanitizeVideoMetadata(entry as VideoInput),
          queuedAt: now,
        });
      }
      return accumulator;
    }, []);
  } catch (error) {
    console.error('Failed to read locally queued uploads', error);
    return [];
  }
};

const writeStoredDrafts = (drafts: StoredDraft[]) => {
  if (typeof window === 'undefined') return;
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

const readLocalDrafts = (): VideoMetadata[] => {
  const drafts = readStoredDrafts();
  if (drafts.length === 0) {
    return [];
  }

  const now = Date.now();
  const filtered = drafts.filter((draft) => now - draft.queuedAt <= LOCAL_DRAFT_TTL_MS);

  if (filtered.length !== drafts.length) {
    writeStoredDrafts(filtered);
  }

  return filtered.map((draft) => draft.video);
};

const persistLocalDrafts = (videos: VideoMetadata[]) => {
  if (typeof window === 'undefined') return;
  const drafts = videos.filter((video) => !video.id);
  if (drafts.length === 0) {
    localStorage.removeItem(LOCAL_QUEUE_KEY);
    return;
  }

  const now = Date.now();
  const existingDrafts = readStoredDrafts().filter((draft) => now - draft.queuedAt <= LOCAL_DRAFT_TTL_MS);
  const draftMap = new Map<string, StoredDraft>();

  existingDrafts.forEach((draft) => {
    draftMap.set(getDraftKey(draft.video), draft);
  });

  drafts.forEach((video) => {
    const key = getDraftKey(video);
    const sanitized = sanitizeVideoMetadata(video);
    const existing = draftMap.get(key);
    draftMap.set(key, {
      video: sanitized,
      queuedAt: existing?.queuedAt ?? now,
    });
  });

  writeStoredDrafts(Array.from(draftMap.values()));
};

const formatFileSize = (size?: number | null) => {
  const numeric = typeof size === 'number' ? size : Number(size ?? 0);
  if (!numeric || Number.isNaN(numeric)) {
    return '0.00 MB';
  }
  return `${(numeric / (1024 * 1024)).toFixed(2)} MB`;
};

const getVideoKey = (video: VideoMetadata, fallback: number) => video.id ?? video.dropbox_id ?? fallback;

type UploadTreeVideo = {
  video: VideoMetadata;
  index: number;
  key: string | number;
};

type UploadTreeNode = {
  name: string;
  path: string;
  videos: UploadTreeVideo[];
  children: Map<string, UploadTreeNode>;
};

const sanitizeSegments = (value: string | null | undefined): string[] => {
  if (!value) return [];
  return value
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
};

const getVideoFolderSegments = (video: VideoMetadata): string[] => {
  const segments: string[] = [];
  const brand = (video.brand ?? '').trim();
  if (brand) {
    segments.push(brand);
  }

  const categorySegments = sanitizeSegments(video.category);
  if (categorySegments.length > 0) {
    segments.push(...categorySegments);
  }

  if (segments.length > 0) {
    return segments;
  }

  const info = extractDropboxPathInfo(video.file_path ?? '');
  if (info.folderSegments.length > 0) {
    return info.folderSegments;
  }

  if (info.segments.length > 0) {
    return info.segments;
  }

  return [];
};

const buildUploadTree = (videos: VideoMetadata[]): UploadTreeNode => {
  const root: UploadTreeNode = {
    name: '',
    path: '',
    videos: [],
    children: new Map(),
  };

  videos.forEach((video, index) => {
    const key = getVideoKey(video, index);
    const segments = getVideoFolderSegments(video);

    if (segments.length === 0) {
      root.videos.push({ video, index, key });
      return;
    }

    let currentNode = root;
    let currentPath = '';

    segments.forEach((segment) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = currentNode.children.get(segment);
      if (existing) {
        currentNode = existing;
        return;
      }

      const nextNode: UploadTreeNode = {
        name: segment,
        path: currentPath,
        videos: [],
        children: new Map(),
      };
      currentNode.children.set(segment, nextNode);
      currentNode = nextNode;
    });

    currentNode.videos.push({ video, index, key });
  });

  return root;
};

export default function Uploads() {
  const { user } = useAuth();
  const [videos, setVideos] = useState<VideoMetadata[]>([]);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(['']));
  const knownFoldersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const drafts = readLocalDrafts();
    if (drafts.length > 0) {
      setVideos((prev) => mergeVideoLists(prev, drafts));
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setErrorMessage('Sign in to sync uploads with the SmartOps backend. Drafts stay on this device until you reconnect.');
    }
  }, [user]);

  const loadVideos = useCallback(async () => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const remoteVideos = await fetchUploads(token, user.uid);

      setVideos((prev) => {
        const drafts = prev.filter((video) => !video.id);
        return mergeVideoLists(remoteVideos, drafts);
      });
      setErrorMessage(null);
    } catch (error) {
      console.error('Failed to load videos from backend', error);
      setErrorMessage(
        'Unable to reach the uploads service. Any new uploads will be kept locally until the connection is restored.',
      );
    }
  }, [user]);

  useEffect(() => {
    void loadVideos();
    const stored = typeof window !== 'undefined' ? localStorage.getItem('selected_videos') : null;
    if (stored) {
      try {
        const selected: DropboxFile[] = JSON.parse(stored);
        const newVideos = selected.map((file) => sanitizeVideoMetadata(buildVideoMetadataFromDropboxFile(file)));
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

  const updateVideo = useCallback(
    (index: number, field: keyof VideoMetadata, value: string) => {
      setVideos((prev) => {
        const next = [...prev];
        const updated = { ...next[index], [field]: value };
        next[index] = sanitizeVideoMetadata(updated);
        return next;
      });
    },
    [],
  );

  const uploadTree = useMemo(() => buildUploadTree(videos), [videos]);

  useEffect(() => {
    const collectFolderPaths = (node: UploadTreeNode): string[] => {
      const paths: string[] = [];
      node.children.forEach((child) => {
        paths.push(child.path);
        paths.push(...collectFolderPaths(child));
      });
      return paths;
    };

    const paths = collectFolderPaths(uploadTree);
    if (paths.length === 0) {
      return;
    }

    setExpandedFolders((prev) => {
      const next = new Set(prev);
      let changed = false;
      paths.forEach((path) => {
        if (!knownFoldersRef.current.has(path)) {
          knownFoldersRef.current.add(path);
          next.add(path);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [uploadTree]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const isFolderExpanded = useCallback(
    (path: string) => {
      if (!path) return true;
      return expandedFolders.has(path);
    },
    [expandedFolders],
  );

  const renderVideoCard = ({ video, index, key }: UploadTreeVideo) => {
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Caption</label>
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
  };

  const renderFolder = (node: UploadTreeNode): JSX.Element => {
    const isRoot = node.path.length === 0;
    const childFolders = Array.from(node.children.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
    const sortedVideos = [...node.videos].sort((a, b) =>
      (a.video.file_name ?? '').localeCompare(b.video.file_name ?? '', undefined, { sensitivity: 'base' }),
    );

    const expanded = isFolderExpanded(node.path);

    return (
      <div key={node.path || '__root'} className="space-y-3">
        {!isRoot && (
          <button
            type="button"
            onClick={() => toggleFolder(node.path)}
            className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 text-left shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              {expanded ? (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-500" />
              )}
              <Folder className="w-5 h-5 text-gray-600" />
              <span className="font-semibold text-gray-800">{node.name}</span>
            </div>
            <span className="text-sm text-gray-500">{`${childFolders.length} folders · ${sortedVideos.length} videos`}</span>
          </button>
        )}

        {(isRoot || expanded) && (
          <div className={`${isRoot ? '' : 'pl-6 border-l border-gray-200'} space-y-4`}>
            {childFolders.map((child) => renderFolder(child))}
            {sortedVideos.map((item) => renderVideoCard(item))}
          </div>
        )}
      </div>
    );
  };

  const handleSave = async (video: VideoMetadata, index: number) => {
    const sanitized = sanitizeVideoMetadata(video);

    if (!user) {
      setVideos((prev) => {
        const next = [...prev];
        next[index] = sanitized;
        return next;
      });
      setEditingId(null);
      setErrorMessage((prev) => prev ?? 'Sign in to sync uploads with the SmartOps backend. Changes were saved locally.');
      return;
    }

    try {
      const token = await user.getIdToken();
      const persisted = sanitized.id
        ? await updateUpload(token, String(sanitized.id), sanitized, user.uid)
        : await createUpload(token, sanitized, user.uid);

      setVideos((prev) => {
        const next = [...prev];
        next[index] = sanitizeVideoMetadata(persisted);
        return next;
      });
      setEditingId(null);
      setErrorMessage(null);
    } catch (error) {
      console.error('Failed to save video metadata', error);
      setVideos((prev) => {
        const next = [...prev];
        next[index] = sanitized;
        return next;
      });
      setErrorMessage(
        'Failed to sync with the SmartOps backend. The latest changes were saved locally and will retry when available.',
      );
    }
  };

  const handleDelete = async (video: VideoMetadata, index: number) => {
    setVideos((prev) => prev.filter((_, i) => i !== index));

    if (video.id && user) {
      try {
        const token = await user.getIdToken();
        await deleteUpload(token, String(video.id), user.uid);
      } catch (error) {
        console.error('Failed to delete video from backend', error);
        setErrorMessage('Could not remove the video from the SmartOps backend. It has been removed locally.');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Upload Queue</h1>
        <p className="text-gray-600 mt-1">Manage videos ready for scheduling</p>
      </div>

      <div className="space-y-4">
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
        <div className="space-y-4">{renderFolder(uploadTree)}</div>
      )}
    </div>
  );
}
