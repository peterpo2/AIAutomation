import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, TrendingUp, Calendar, Bell, Video } from 'lucide-react';

export default function Dashboard() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const dayOfMonth = today.getDate();

  const calendarDays = useMemo(() => {
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = endOfMonth.getDate();
    const leadingEmptyDays = startOfMonth.getDay();
    const totalCells = Math.ceil((leadingEmptyDays + daysInMonth) / 7) * 7;

    return Array.from({ length: totalCells }, (_, index) => {
      const dateNumber = index - leadingEmptyDays + 1;
      if (dateNumber < 1 || dateNumber > daysInMonth) {
        return null;
      }
      return dateNumber;
    });
  }, [month, year]);

  const monthLabel = today.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const todayLabel = today.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const stats = [
    { label: 'Posts Scheduled', value: '12', icon: Calendar, color: 'bg-blue-500' },
    { label: 'Pending Uploads', value: '5', icon: Upload, color: 'bg-orange-500' },
    { label: 'Total Videos', value: '47', icon: Video, color: 'bg-green-500' },
    { label: 'Weekly Views', value: '24.5K', icon: TrendingUp, color: 'bg-red-500' },
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Team calendar</h2>
                <p className="text-sm text-gray-600">Track campaign milestones and automation schedules.</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500">Today</p>
                <p className="text-sm font-semibold text-red-600">{todayLabel}</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-gray-700 mb-4">
              <h3 className="text-lg font-semibold">{monthLabel}</h3>
            </div>

            <div className="grid grid-cols-7 gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {weekdayLabels.map((label) => (
                <div key={label} className="text-center">{label}</div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2">
              {calendarDays.map((dateNumber, index) => {
                const isToday = dateNumber === dayOfMonth;
                return (
                  <motion.div
                    key={`${dateNumber ?? 'empty'}-${index}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.45 + index * 0.02 }}
                    className={`aspect-square rounded-lg border flex items-center justify-center text-sm font-medium ${
                      dateNumber
                        ? isToday
                          ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20'
                          : 'bg-white text-gray-700 border-gray-200'
                        : 'border-transparent'
                    }`}
                  >
                    {dateNumber ?? ''}
                  </motion.div>
                );
              })}
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
        </div>
      </div>
    </div>
  );
}
