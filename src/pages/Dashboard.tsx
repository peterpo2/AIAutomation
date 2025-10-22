import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Upload,
  Folder,
  FileText,
  TrendingUp,
  Calendar,
  Bell,
  Cloud,
  Video,
} from 'lucide-react';
import { isDropboxConnected } from '../lib/dropbox';

export default function Dashboard() {
  const dropboxConnected = isDropboxConnected();

  const stats = [
    { label: 'Posts Scheduled', value: '12', icon: Calendar, color: 'bg-blue-500' },
    { label: 'Pending Uploads', value: '5', icon: Upload, color: 'bg-orange-500' },
    { label: 'Total Videos', value: '47', icon: Video, color: 'bg-green-500' },
    { label: 'Weekly Views', value: '24.5K', icon: TrendingUp, color: 'bg-red-500' },
  ];

  const quickActions = [
    {
      title: 'Connect Dropbox',
      description: 'Link your Dropbox account to browse videos',
      icon: Cloud,
      link: '/dropbox',
      color: 'bg-blue-500',
      enabled: !dropboxConnected,
    },
    {
      title: 'Browse Files',
      description: 'Select videos from your Dropbox folders',
      icon: Folder,
      link: '/dropbox',
      color: 'bg-green-500',
      enabled: dropboxConnected,
    },
    {
      title: 'Upload Queue',
      description: 'Manage videos ready for scheduling',
      icon: Upload,
      link: '/uploads',
      color: 'bg-orange-500',
      enabled: true,
    },
    {
      title: 'View Reports',
      description: 'Check analytics and performance metrics',
      icon: FileText,
      link: '/reports',
      color: 'bg-red-500',
      enabled: true,
    },
  ];

  const recentActivity = [
    { action: 'Video added from Dropbox', time: '2 hours ago', icon: Video },
    { action: 'Post scheduled for TikTok', time: '5 hours ago', icon: Calendar },
    { action: 'Weekly report generated', time: '1 day ago', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome back to SmartOps</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-xl shadow-lg p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-800 mt-2">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-xl shadow-lg p-6"
          >
            <h2 className="text-xl font-bold text-gray-800 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quickActions.map((action, index) => (
                <Link
                  key={action.title}
                  to={action.link}
                  className={`${
                    action.enabled ? 'hover:shadow-xl' : 'opacity-50 cursor-not-allowed pointer-events-none'
                  } transition-all`}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-all"
                  >
                    <div className={`${action.color} w-12 h-12 rounded-lg flex items-center justify-center mb-3`}>
                      <action.icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="font-semibold text-gray-800 mb-1">{action.title}</h3>
                    <p className="text-sm text-gray-600">{action.description}</p>
                  </motion.div>
                </Link>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white rounded-xl shadow-lg p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Notifications</h2>
              <Bell className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-3">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="bg-gray-100 p-2 rounded-lg">
                    <activity.icon className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 font-medium">{activity.action}</p>
                    <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-6 text-white"
          >
            <h3 className="font-bold text-lg mb-2">Need Help?</h3>
            <p className="text-red-100 text-sm mb-4">
              Check our documentation or contact support for assistance.
            </p>
            <button className="bg-white text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
              Get Support
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
