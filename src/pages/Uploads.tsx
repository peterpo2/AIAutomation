import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Video, Save, Trash2, Edit2 } from 'lucide-react';
import { supabase, VideoMetadata } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function Uploads() {
  const { user } = useAuth();
  const [videos, setVideos] = useState<VideoMetadata[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadVideos();
    const stored = localStorage.getItem('selected_videos');
    if (stored) {
      const selected = JSON.parse(stored);
      const newVideos = selected.map((file: any) => ({
        file_path: file.path,
        file_name: file.name,
        file_size: file.size,
        dropbox_id: file.id,
        brand: '',
        caption: '',
        category: '',
        status: 'pending' as const,
      }));
      setVideos((prev) => [...prev, ...newVideos]);
      localStorage.removeItem('selected_videos');
    }
  }, []);

  const loadVideos = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('user_id', user.uid)
      .order('created_at', { ascending: false });

    if (data && !error) {
      setVideos(data);
    }
  };

  const handleSave = async (video: VideoMetadata, index: number) => {
    if (!user) return;

    const videoData = {
      ...video,
      user_id: user.uid,
    };

    if (video.id) {
      const { error } = await supabase
        .from('videos')
        .update(videoData)
        .eq('id', video.id);

      if (!error) {
        setEditingId(null);
      }
    } else {
      const { data, error } = await supabase
        .from('videos')
        .insert([videoData])
        .select();

      if (data && !error) {
        const newVideos = [...videos];
        newVideos[index] = data[0];
        setVideos(newVideos);
        setEditingId(null);
      }
    }
  };

  const handleDelete = async (video: VideoMetadata, index: number) => {
    if (video.id) {
      await supabase.from('videos').delete().eq('id', video.id);
    }
    setVideos(videos.filter((_, i) => i !== index));
  };

  const updateVideo = (index: number, field: keyof VideoMetadata, value: string) => {
    const newVideos = [...videos];
    newVideos[index] = { ...newVideos[index], [field]: value };
    setVideos(newVideos);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Upload Queue</h1>
        <p className="text-gray-600 mt-1">Manage videos ready for scheduling</p>
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
          {videos.map((video, index) => (
            <motion.div
              key={video.id || index}
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
                    <h3 className="font-semibold text-gray-800">{video.file_name}</h3>
                    <p className="text-sm text-gray-500">
                      {(video.file_size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Brand
                      </label>
                      <input
                        type="text"
                        value={video.brand || ''}
                        onChange={(e) => updateVideo(index, 'brand', e.target.value)}
                        placeholder="e.g., Kaufland, Lidl, TikTok"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none text-sm"
                        disabled={editingId !== video.id && video.id !== undefined}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Category
                      </label>
                      <select
                        value={video.category || ''}
                        onChange={(e) => updateVideo(index, 'category', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none text-sm"
                        disabled={editingId !== video.id && video.id !== undefined}
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
                        value={video.status || 'pending'}
                        onChange={(e) => updateVideo(index, 'status', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none text-sm"
                        disabled={editingId !== video.id && video.id !== undefined}
                      >
                        <option value="pending">Pending</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="uploaded">Uploaded</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Caption
                    </label>
                    <textarea
                      value={video.caption || ''}
                      onChange={(e) => updateVideo(index, 'caption', e.target.value)}
                      placeholder="Write a caption for this video..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none text-sm resize-none"
                      disabled={editingId !== video.id && video.id !== undefined}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {editingId === video.id || !video.id ? (
                    <button
                      onClick={() => handleSave(video, index)}
                      className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                      title="Save"
                    >
                      <Save className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditingId(video.id || null)}
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
          ))}
        </div>
      )}
    </div>
  );
}
