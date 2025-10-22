import { motion } from 'framer-motion';
import { FileDown, TrendingUp, Eye, Heart, MessageCircle, Share2 } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export default function Reports() {
  const viewsData = [
    { date: 'Mon', views: 2400, engagement: 800 },
    { date: 'Tue', views: 3200, engagement: 1200 },
    { date: 'Wed', views: 2800, engagement: 950 },
    { date: 'Thu', views: 4100, engagement: 1600 },
    { date: 'Fri', views: 3900, engagement: 1450 },
    { date: 'Sat', views: 5200, engagement: 2100 },
    { date: 'Sun', views: 4800, engagement: 1900 },
  ];

  const performanceData = [
    { video: 'Video 1', views: 5200, likes: 450, comments: 89, shares: 234 },
    { video: 'Video 2', views: 4100, likes: 380, comments: 67, shares: 189 },
    { video: 'Video 3', views: 3900, likes: 320, comments: 54, shares: 156 },
    { video: 'Video 4', views: 3200, likes: 290, comments: 41, shares: 123 },
    { video: 'Video 5', views: 2800, likes: 245, comments: 38, shares: 98 },
  ];

  const metrics = [
    { label: 'Total Views', value: '24.5K', change: '+12.5%', icon: Eye, color: 'bg-blue-500' },
    { label: 'Total Likes', value: '3.2K', change: '+8.3%', icon: Heart, color: 'bg-red-500' },
    { label: 'Comments', value: '894', change: '+15.2%', icon: MessageCircle, color: 'bg-green-500' },
    { label: 'Shares', value: '1.2K', change: '+21.8%', icon: Share2, color: 'bg-orange-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Analytics & Reports</h1>
          <p className="text-gray-600 mt-1">Track performance metrics</p>
        </div>
        <button className="bg-red-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30 flex items-center gap-2">
          <FileDown className="w-5 h-5" />
          Export PDF
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-xl shadow-lg p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`${metric.color} p-3 rounded-lg`}>
                <metric.icon className="w-6 h-6 text-white" />
              </div>
              <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                <TrendingUp className="w-4 h-4" />
                {metric.change}
              </span>
            </div>
            <p className="text-gray-600 text-sm font-medium">{metric.label}</p>
            <p className="text-3xl font-bold text-gray-800 mt-1">{metric.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-6">Weekly Performance</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={viewsData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="views"
              stroke="#ef4444"
              strokeWidth={3}
              dot={{ fill: '#ef4444', r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="engagement"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={{ fill: '#3b82f6', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-6">Top Performing Videos</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={performanceData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="video" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Bar dataKey="views" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            <Bar dataKey="likes" fill="#ef4444" radius={[8, 8, 0, 0]} />
            <Bar dataKey="comments" fill="#10b981" radius={[8, 8, 0, 0]} />
            <Bar dataKey="shares" fill="#f59e0b" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-4">Performance Summary</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Video</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Views</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Likes</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Comments</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Shares</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Engagement</th>
              </tr>
            </thead>
            <tbody>
              {performanceData.map((video) => {
                const engagement = ((video.likes + video.comments + video.shares) / video.views * 100).toFixed(1);
                return (
                  <tr key={video.video} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm text-gray-800">{video.video}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 text-right">{video.views.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 text-right">{video.likes}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 text-right">{video.comments}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 text-right">{video.shares}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 text-right">
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">
                        {engagement}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
