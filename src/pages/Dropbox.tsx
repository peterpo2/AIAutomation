import { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'lucide-react';
import {
  getAuthUrl,
  handleAuthCallback,
  isDropboxConnected,
  listFiles,
  getThumbnail,
  DropboxFile,
  type DropboxCacheOptions,
} from '../lib/dropbox';

export default function DropboxPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [connected, setConnected] = useState(isDropboxConnected());
  const [files, setFiles] = useState<DropboxFile[]>([]);
  const [pathStack, setPathStack] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

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
        setFiles(fileList);
        setThumbnails((prev) => {
          const next = new Map<string, string>();
          fileList.forEach((file) => {
            const existing = prev.get(file.path);
            if (existing) {
              next.set(file.path, existing);
            }
          });
          return next;
        });

        const videoFiles = fileList.filter((file) => !file.isFolder && isVideoFile(file.name));
        if (videoFiles.length > 0) {
          const results = await Promise.all(
            videoFiles.map(async (file) => {
              const thumb = await getThumbnail(file.path, options);
              return { path: file.path, thumb };
            }),
          );

          setThumbnails((prev) => {
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
    } else if (connected) {
      void loadFiles('');
    }
  }, [searchParams, connected, navigate, loadFiles]);

  const currentPath = useMemo(() => pathStack[pathStack.length - 1] ?? '', [pathStack]);

  const handleConnect = async () => {
    try {
      const authUrl = await getAuthUrl();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error starting Dropbox authentication:', error);
      setErrorMessage('Could not initiate Dropbox authentication. Please try again.');
    }
  };

  const openFolder = (path: string) => {
    setPathStack((prev) => [...prev, path]);
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

  const toggleFileSelection = (filePath: string) => {
    setSelectedFiles((prev) => {
      const updated = new Set(prev);
      if (updated.has(filePath)) {
        updated.delete(filePath);
      } else {
        updated.add(filePath);
      }
      return updated;
    });
  };

  const saveToQueue = () => {
    const selected = files.filter((f) => selectedFiles.has(f.path));
    localStorage.setItem('selected_videos', JSON.stringify(selected));
    navigate('/uploads');
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
            className="bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/30"
          >
            Connect to Dropbox
          </button>
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
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Dropbox Files</h1>
          <p className="text-gray-600 mt-1">Browse and select videos</p>
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
          {selectedFiles.size > 0 && (
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={saveToQueue}
              className="bg-red-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30"
            >
              Add to Queue ({selectedFiles.size})
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
                  toggleFileSelection(file.path);
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
