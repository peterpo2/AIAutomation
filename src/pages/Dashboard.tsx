import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, Calendar, FileText, Users2, Video } from 'lucide-react';

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

  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const recentActivity = [
    { action: 'Video added from Dropbox', time: '2 hours ago', icon: Video },
    { action: 'Post scheduled for TikTok', time: '5 hours ago', icon: Calendar },
    { action: 'Weekly report generated', time: '1 day ago', icon: FileText },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-gray-100 bg-white p-5 text-gray-900 shadow-xl"
      >
        <div className="flex items-center justify-between text-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Team calendar</h2>
            <p className="mt-1 text-xs text-gray-500">
              Track campaign milestones and automation schedules at a glance.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-500">
            <Calendar className="h-4 w-4" /> {monthLabel}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500">
          {weekdayLabels.map((label) => (
            <div key={label} className="text-center">
              {label}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1">
          {calendarDays.map((dateNumber, index) => {
            const isToday = dateNumber === dayOfMonth;
            return (
              <motion.div
                key={`${dateNumber ?? 'empty'}-${index}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + index * 0.015 }}
                className={`flex aspect-square items-center justify-center rounded-lg border text-xs font-medium ${
                  dateNumber
                    ? isToday
                      ? 'border-red-500 bg-red-500 text-white shadow-lg shadow-red-500/30'
                      : 'border-gray-200 bg-gray-50 text-gray-700 transition hover:border-red-400 hover:bg-red-50'
                    : 'border-transparent'
                }`}
              >
                {dateNumber ?? ''}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl border border-gray-100 bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">Notifications</h2>
          <Bell className="h-5 w-5 text-gray-400" />
        </div>
        <div className="space-y-3">
          {recentActivity.map((activity, index) => (
            <div
              key={index}
              className="flex items-start gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0"
            >
              <div className="rounded-lg bg-red-50 p-2 text-red-500">
                <activity.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800">{activity.action}</p>
                <p className="mt-1 text-xs text-gray-500">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-xl bg-gray-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quick links</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/clients"
              className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <Users2 className="h-4 w-4" />
              Manage clients
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
