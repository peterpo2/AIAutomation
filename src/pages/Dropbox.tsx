import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import {
  getAuthUrl,
  handleAuthCallback,
  isDropboxConnected,
  listFiles,
  getThumbnail,
  DropboxFile,
} from '../lib/dropbox';

export default function DropboxPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [connected, setConnected] = useState(isDropboxConnected());
  const [files, setFiles] = useState<DropboxFile[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [pathStack, setPathStack] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      handleAuthCallback(code).then(() => {
        setConnected(true);
        navigate('/dropbox', { replace: true });
        loadFiles('');
      });
    } else if (connected) {
      loadFiles('');
    }
  }, [searchParams, connected, navigate]);

  const loadFiles = async (path: string) => {
    setLoading(true);
    try {
      const fileList = await listFiles(path);
      setFiles(fileList);
      setCurrentPath(path);

      fileList.forEach(async (file) => {
        if (!file.isFolder && isVideoFile(file.name)) {
          const thumb = await getThumbnail(file.path);
          if (thumb) {
            setThumbnails((prev) => new Map(prev).set(file.path, thumb));
          }
        }
      });
    } catch (error) {
      console.error('Error loading files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    const authUrl = getAuthUrl();
    window.location.href = authUrl;
  };

  const openFolder = (path: string) => {
    setPathStack([...pathStack, path]);
    loadFiles(path);
  };

  const navigateUp = () => {
    if (pathStack.length > 1) {
      const newStack = pathStack.slice(0, -1);
      setPathStack(newStack);
      loadFiles(newStack[newStack.length - 1]);
    }
  };

  const navigateToPath = (index: number) => {
    const newStack = pathStack.slice(0, index + 1);
    setPathStack(newStack);
    loadFiles(newStack[newStack.length - 1]);
  };

  const toggleFileSelection = (filePath: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(filePath)) {
      newSelected.delete(filePath);
    } else {
      newSelected.add(filePath);
    }
    setSelectedFiles(newSelected);
  };

  const isVideoFile = (filename: string) => {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    return videoExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
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
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Dropbox Files</h1>
          <p className="text-gray-600 mt-1">Browse and select videos</p>
        </div>
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
