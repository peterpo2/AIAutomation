import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Cloud,
  Folder,
  Video,
  ChevronRight,
  Home,
  Check,
  Loader2,
  RefreshCcw,
  PlayCircle,
  X,
} from 'lucide-react';
import {
  getAuthUrl,
  handleAuthCallback,
  isDropboxConnected,
  listFiles,
  getThumbnail,
  getTemporaryLink,
  DropboxFile,
  type DropboxCacheOptions,
  connectUsingRefreshToken,
  hasEnvironmentDropboxCredentials,
} from '../lib/dropbox';
import { createUpload, fetchUploads } from '../lib/uploadsApi';
import type { VideoMetadata } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  buildVideoMetadataFromDropboxFile,
  extractDropboxPathInfo,
} from '../utils/dropboxMetadata';

export default function DropboxPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [connected, setConnected] = useState(isDropboxConnected());
  const [files, setFiles] = useState<DropboxFile[]>([]);
  const [pathStack, setPathStack] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Map<string, DropboxFile>>(new Map());
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [existingDropboxIds, setExistingDropboxIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<DropboxFile | null>(null);
  const [previewLink, setPreviewLink] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const envConnectAttemptedRef = useRef(false);
  const previewCacheRef = useRef<Map<string, string>>(new Map());

  const dropboxConfigured = useMemo(() => {
    const key = import.meta.env.VITE_DROPBOX_APP_KEY ?? import.meta.env.DROPBOX_APP_KEY;
    return typeof key === 'string' && key.trim().length > 0;
  }, []);

  const envAutoConnectReady = useMemo(() => hasEnvironmentDropboxCredentials(), []);

  const isVideoFile = useCallback((filename: string) => {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    return videoExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
  }, []);

  const loadFiles = useCallback(
    async (path: string, options?: DropboxCacheOptions) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const fileList = await listFiles(path, options);
        const sortedFiles = [...fileList].sort((a, b) => {
          if (a.isFolder !== b.isFolder) {
            return a.isFolder ? -1 : 1;
          }
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });
        setFiles(sortedFiles);
        setThumbnails((prev: Map<string, string>) => {
          const next = new Map<string, string>();
          sortedFiles.forEach((file) => {
            const existing = prev.get(file.path);
            if (existing) {
              next.set(file.path, existing);
            }
          });
          return next;
        });

        const videoFiles = sortedFiles.filter((file) => !file.isFolder && isVideoFile(file.name));
        if (videoFiles.length > 0) {
          const results = await Promise.all(
            videoFiles.map(async (file) => {
              const thumb = await getThumbnail(file.path, options);
              return { path: file.path, thumb };
            }),
          );

          setThumbnails((prev: Map<string, string>) => {
            const next = new Map(prev);
            results.forEach(({ path: filePath, thumb }) => {
              if (thumb) {
                next.set(filePath, thumb);
              }
            });
            return next;
          });
        }

        setLastUpdated(Date.now());
      } catch (error) {
        console.error('Error loading files:', error);
        setErrorMessage('Unable to load Dropbox files. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [isVideoFile],
  );

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      (async () => {
        try {
          await handleAuthCallback(code);
          setConnected(true);
          navigate('/dropbox', { replace: true });
          await loadFiles('', { forceRefresh: true });
        } catch (error) {
          console.error('Error completing Dropbox authentication:', error);
          setErrorMessage(error instanceof Error ? error.message : 'Failed to connect to Dropbox.');
        }
      })();
      return;
    }

    if (connected) {
      void loadFiles('');
      return;
    }

    if (!envConnectAttemptedRef.current && envAutoConnectReady) {
      envConnectAttemptedRef.current = true;
      (async () => {
        try {
          const success = await connectUsingRefreshToken();
          if (success) {
            setConnected(true);
            await loadFiles('', { forceRefresh: true });
          } else {
            setErrorMessage('Dropbox environment credentials are incomplete. Please verify your configuration.');
          }
        } catch (error) {
          console.error('Error connecting to Dropbox using environment credentials:', error);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Unable to connect using Dropbox environment credentials.',
          );
        }
      })();
    }
  }, [searchParams, connected, navigate, loadFiles, envAutoConnectReady]);

  const currentPath = useMemo(() => pathStack[pathStack.length - 1] ?? '', [pathStack]);

  const loadExistingUploads = useCallback(async () => {
    if (!user) {
      setExistingDropboxIds(new Set());
      return;
    }

    try {
      const token = await user.getIdToken();
      const uploads = await fetchUploads(token, user.uid);
      const dropboxIds = uploads
        .map((upload) => upload.dropbox_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      setExistingDropboxIds(new Set(dropboxIds));
    } catch (error) {
      console.error('Failed to load existing uploads for Dropbox browser', error);
    }
  }, [user]);

  useEffect(() => {
    void loadExistingUploads();
  }, [loadExistingUploads]);

  const handleConnect = async () => {
    try {
      if (!dropboxConfigured) {
        throw new Error('Dropbox integration is not configured. Please set VITE_DROPBOX_APP_KEY in your environment.');
      }
      const authUrl = await getAuthUrl();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error starting Dropbox authentication:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Could not initiate Dropbox authentication. Please try again.');
    }
  };

  const openFolder = (path: string) => {
    setPathStack((prev: string[]) => [...prev, path]);
    void loadFiles(path);
  };

  const navigateToPath = (index: number) => {
    const newStack = pathStack.slice(0, index + 1);
    setPathStack(newStack);
    void loadFiles(newStack[newStack.length - 1]);
  };

  const handleRefresh = useCallback(() => {
    void loadFiles(currentPath, { forceRefresh: true });
  }, [currentPath, loadFiles]);

  const toggleFileSelection = (file: DropboxFile) => {
    if (file.isFolder || !isVideoFile(file.name)) {
      return;
    }

    setSelectedFiles((prev: Map<string, DropboxFile>) => {
      const updated = new Map(prev);
      if (updated.has(file.path)) {
        updated.delete(file.path);
      } else {
        updated.set(file.path, file);
      }
      return updated;
    });
  };

  const buildVideoMetadata = useCallback(
    (file: DropboxFile): VideoMetadata => ({
      ...buildVideoMetadataFromDropboxFile(file),
    }),
    [],
  );

  const uploadSelected = useCallback(async () => {
    const selected = Array.from(selectedFiles.values()).filter((file) => !file.isFolder);
    if (selected.length === 0) {
      return;
    }

    if (!user) {
      localStorage.setItem('selected_videos', JSON.stringify(selected));
      setUploadFeedback('Videos queued locally. Sign in to sync them with Supabase.');
      setSelectedFiles(new Map());
      navigate('/uploads');
      return;
    }

    setUploading(true);
    setUploadFeedback(null);
    const alreadyUploaded = new Set(existingDropboxIds);
    let createdCount = 0;
    let skippedCount = 0;
    const failures: string[] = [];

    try {
      const token = await user.getIdToken();

      for (const file of selected) {
        if (alreadyUploaded.has(file.id)) {
          skippedCount += 1;
          continue;
        }

        try {
          await createUpload(token, buildVideoMetadata(file), user.uid);
          createdCount += 1;
          alreadyUploaded.add(file.id);
        } catch (error) {
          failures.push(file.name);
          console.error('Failed to upload Dropbox file to Supabase', error);
        }
      }

      setExistingDropboxIds(alreadyUploaded);
      setSelectedFiles(new Map());

      const summaryParts: string[] = [];
      if (createdCount > 0) {
        summaryParts.push(`Uploaded ${createdCount} video${createdCount === 1 ? '' : 's'} to Supabase.`);
      }
      if (skippedCount > 0) {
        summaryParts.push(`${skippedCount} duplicate${skippedCount === 1 ? '' : 's'} skipped.`);
      }
      if (failures.length > 0) {
        summaryParts.push(`Failed to upload: ${failures.join(', ')}.`);
      }

      if (failures.length === 0 && createdCount === 0 && skippedCount > 0) {
        setUploadFeedback('All selected videos already exist in Supabase.');
      } else if (summaryParts.length > 0) {
        setUploadFeedback(summaryParts.join(' '));
      } else {
        setUploadFeedback('No videos were uploaded.');
      }

      if (createdCount > 0 && failures.length === 0) {
        navigate('/uploads');
      }
    } finally {
      setUploading(false);
    }
  }, [
    selectedFiles,
    user,
    existingDropboxIds,
    navigate,
    buildVideoMetadata,
  ]);

  const selectedCount = selectedFiles.size;

  const uploadButtonLabel = useMemo(() => {
    if (selectedCount === 0) {
      return 'Upload Selected';
    }

    const suffix = selectedCount === 1 ? 'video' : 'videos';
    return user ? `Upload ${selectedCount} ${suffix}` : `Queue ${selectedCount} ${suffix}`;
  }, [selectedCount, user]);

  useEffect(() => {
    if (!user) {
      setUploadFeedback(null);
    }
  }, [user]);

  const isAlreadyUploaded = useCallback(
    (file: DropboxFile) => existingDropboxIds.has(file.id),
    [existingDropboxIds],
  );

  const renderUploadFeedback = () => {
    if (!uploadFeedback) {
      return null;
    }

    return (
      <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg">{uploadFeedback}</div>
    );
  };

  const openPreview = (file: DropboxFile) => {
    setPreviewError(null);
    setPreviewLink(null);
    setPreviewFile(file);
  };

  const closePreview = useCallback(() => {
    setPreviewFile(null);
    setPreviewLink(null);
    setPreviewError(null);
    setPreviewLoading(false);
  }, []);

  useEffect(() => {
    if (!previewFile) {
      return;
    }

    const cached = previewCacheRef.current.get(previewFile.path);
    if (cached) {
      setPreviewLink(cached);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);

    (async () => {
      try {
        const link = await getTemporaryLink(previewFile.path);
        if (cancelled) {
          return;
        }

        if (link) {
          previewCacheRef.current.set(previewFile.path, link);
          setPreviewLink(link);
        } else {
          setPreviewError('Unable to load preview for this video.');
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load Dropbox preview link', error);
          setPreviewError('Unable to load preview for this video.');
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewFile]);

  const renderPreviewModal = () => {
    if (!previewFile) {
      return null;
    }

    const { client, nestedPath } = extractDropboxPathInfo(previewFile.path);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl"
        >
          <button
            type="button"
            onClick={closePreview}
            className="absolute right-4 top-4 rounded-full bg-gray-100 p-2 text-gray-600 transition hover:bg-gray-200"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-500">
                {client || nestedPath ? `${client}${nestedPath ? ` / ${nestedPath}` : ''}` : 'Root'}
              </p>
              <h2 className="text-2xl font-semibold text-gray-800">{previewFile.name}</h2>
            </div>
            <div className="aspect-video overflow-hidden rounded-xl bg-black">
              {previewLoading && (
                <div className="flex h-full w-full items-center justify-center text-white">
                  <Loader2 className="h-10 w-10 animate-spin" />
                </div>
              )}
              {!previewLoading && previewError && (
                <div className="flex h-full w-full items-center justify-center bg-gray-900 text-center text-sm text-red-300">
                  {previewError}
                </div>
              )}
              {!previewLoading && !previewError && previewLink && (
                <video
                  controls
                  src={previewLink}
                  className="h-full w-full object-contain"
                  preload="metadata"
                />
              )}
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  if (!connected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center"
        >
          <div className="bg-blue-500 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Cloud className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Connect Dropbox</h2>
          <p className="text-gray-600 mb-6">
            Link your Dropbox account to browse and select videos for upload scheduling.
          </p>
          <button
            onClick={handleConnect}
            disabled={!dropboxConfigured}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Connect to Dropbox
          </button>
          {!dropboxConfigured && (
            <p className="text-sm text-red-500 mt-4">
              Dropbox integration is not configured. Update your environment variables and reload the page.
            </p>
          )}
          {errorMessage && (
            <p className="text-sm text-red-500 mt-4">{errorMessage}</p>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {errorMessage}
        </div>
      )}
      {renderUploadFeedback()}
      {renderPreviewModal()}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Dropbox Files</h1>
          <p className="text-gray-600 mt-1">Browse and select videos</p>
          {!user && (
            <p className="text-sm text-amber-600 mt-2">
              Sign in to upload Dropbox videos directly to Supabase. Without signing in, selections will be saved locally.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-sm text-gray-500">
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {selectedCount > 0 && (
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={uploadSelected}
              disabled={uploading}
              className="bg-red-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </span>
              ) : (
                uploadButtonLabel
              )}
            </motion.button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-4">
        <div className="flex items-center gap-2 text-sm text-gray-600 overflow-x-auto">
          <button
            onClick={() => navigateToPath(0)}
            className="hover:text-gray-800 transition-colors p-1"
          >
            <Home className="w-4 h-4" />
          </button>
          {pathStack.slice(1).map((path, index) => (
            <div key={path} className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4" />
              <button
                onClick={() => navigateToPath(index + 1)}
                className="hover:text-gray-800 transition-colors truncate max-w-[150px]"
              >
                {path.split('/').pop()}
              </button>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {files.map((file) => (
            <motion.div
              key={file.path}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => {
                if (file.isFolder) {
                  openFolder(file.path);
                } else if (isVideoFile(file.name)) {
                  toggleFileSelection(file);
                }
              }}
              className={`bg-white rounded-xl shadow-md hover:shadow-xl transition-all cursor-pointer overflow-hidden ${
                selectedFiles.has(file.path) ? 'ring-2 ring-red-500' : ''
              }`}
            >
              <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative">
                {file.isFolder ? (
                  <Folder className="w-12 h-12 text-gray-400" />
                ) : thumbnails.has(file.path) ? (
                  <img
                    src={thumbnails.get(file.path)}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Video className="w-12 h-12 text-gray-400" />
                )}
                {selectedFiles.has(file.path) && (
                  <div className="absolute top-2 right-2 bg-red-500 rounded-full p-1">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
                {!file.isFolder && isAlreadyUploaded(file) && (
                  <div className="absolute bottom-2 left-2 bg-green-500/90 text-white text-xs font-semibold px-2 py-1 rounded-full shadow-md">
                    Uploaded
                  </div>
                )}
                {!file.isFolder && isVideoFile(file.name) && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openPreview(file);
                    }}
                    className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-semibold text-gray-700 shadow hover:bg-white"
                  >
                    <PlayCircle className="h-4 w-4" />
                    Preview
                  </button>
                )}
              </div>
              <div className="p-3">
                <p className="font-medium text-gray-800 truncate">{file.name}</p>
                {!file.isFolder && (
                  <p className="text-sm text-gray-500 mt-1">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {files.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          <Folder className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p>This folder is empty</p>
        </div>
      )}
    </div>
  );
}
