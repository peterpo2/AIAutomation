import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileText, Calendar, Bell, Video } from 'lucide-react';

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

  const recentActivity = [
    { action: 'Video added from Dropbox', time: '2 hours ago', icon: Video },
    { action: 'Post scheduled for TikTok', time: '5 hours ago', icon: Calendar },
    { action: 'Weekly report generated', time: '1 day ago', icon: FileText },
  ];

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl shadow-xl p-8"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm uppercase tracking-wide text-white/70">
              <Calendar className="w-4 h-4" /> SmartOps Scheduler
            </p>
            <h1 className="text-3xl font-semibold mt-2">Plan your week with confidence</h1>
            <p className="text-white/70 mt-2 max-w-xl">
              Stay focused on the campaigns that matter. Your calendar and notifications are
              perfectly in sync so you never miss a milestone.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-white/60">Today</p>
            <p className="text-lg font-semibold">{todayLabel}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-6">
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100"
          >
            <div className="flex items-center justify-between text-gray-700 mb-4">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">Team calendar</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Track campaign milestones and automation schedules at a glance.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-500">
                <Calendar className="w-4 h-4" /> {monthLabel}
              </span>
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
                    className={`aspect-square rounded-xl border flex items-center justify-center text-sm font-medium ${
                      dateNumber
                        ? isToday
                          ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/30'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-red-400 hover:bg-red-50 transition'
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
            className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Notifications</h2>
              <Bell className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-3">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="bg-red-50 text-red-500 p-2 rounded-lg">
                    <activity.icon className="w-4 h-4" />
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
