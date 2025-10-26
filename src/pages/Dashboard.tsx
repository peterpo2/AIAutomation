import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, Calendar, FileText, Users2, Video } from 'lucide-react';
import type { Client } from '../types/client';
import { fetchClients } from '../lib/clientsApi';
import { getClientEngagementMetrics } from '../utils/clientMetrics';

type TopClient = {
  client: Client;
  views: number;
  watchedVideos: number;
  watchRate: number;
};

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

  const [topClients, setTopClients] = useState<TopClient[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadClients = async () => {
      try {
        const data = await fetchClients();

        if (!isMounted) {
          return;
        }

        const ranked = data
          .map((client) => ({
            client,
            ...getClientEngagementMetrics(client),
          }))
          .sort((a, b) => b.views - a.views)
          .slice(0, 3);

        setTopClients(ranked);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('Unable to load clients for dashboard metrics:', error);
        }

        if (isMounted) {
          setTopClients([]);
        }
      }
    };

    loadClients();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-gray-100 bg-white p-5 text-gray-900 shadow-xl dark:border-gray-800 dark:bg-gray-900/80 dark:text-gray-100"
      >
        <div className="flex items-center justify-between text-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Team calendar</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Track campaign milestones and automation schedules at a glance.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-500 dark:bg-red-500/20 dark:text-red-200">
            <Calendar className="h-4 w-4" /> {monthLabel}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-[0.65rem] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
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
                className={`flex aspect-square items-center justify-center rounded-lg border text-xs font-medium transition-colors ${
                  dateNumber
                    ? isToday
                      ? 'border-red-500 bg-red-500 text-white shadow-lg shadow-red-500/30 dark:shadow-none'
                      : 'border-gray-200 bg-gray-50 text-gray-700 transition hover:border-red-400 hover:bg-red-50 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200 dark:hover:border-red-400/70 dark:hover:bg-red-500/10'
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
        className="rounded-2xl border border-gray-100 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900/80"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Notifications</h2>
          <Bell className="h-5 w-5 text-gray-400 dark:text-gray-500" />
        </div>
        <div className="space-y-3">
          {recentActivity.map((activity, index) => (
            <div
              key={index}
              className="flex items-start gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0 dark:border-gray-800"
            >
              <div className="rounded-lg bg-red-50 p-2 text-red-500 dark:bg-red-500/20 dark:text-red-200">
                <activity.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{activity.action}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top clients</h3>
            <Link
              to="/clients"
              className="text-xs font-medium text-red-600 transition-colors hover:text-red-500 dark:text-red-300 dark:hover:text-red-200"
            >
              View all
            </Link>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-gray-100 bg-gray-50/60 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-left text-sm dark:divide-gray-800">
                <thead className="bg-white/80 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/80 dark:text-gray-400">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Client</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Views</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Watched videos</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Watch rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {topClients.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400" colSpan={4}>
                        No client engagement data available yet.
                      </td>
                    </tr>
                  ) : (
                    topClients.map((entry) => (
                      <tr key={entry.client.id} className="transition-colors hover:bg-white/60 dark:hover:bg-gray-900/40">
                        <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-200">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-sm font-semibold text-red-500 dark:bg-red-500/20 dark:text-red-200">
                              {entry.client.name.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate">{entry.client.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {entry.client.tiktokHandle ? entry.client.tiktokHandle : 'TikTok pending'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800 dark:text-gray-100">
                          {entry.views.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800 dark:text-gray-100">
                          {entry.watchedVideos.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-300">
                          {(entry.watchRate * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="mt-6 rounded-xl bg-gray-50/60 p-4 dark:bg-gray-900/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Quick links</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/clients"
              className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-red-400/60 dark:hover:bg-red-500/10 dark:hover:text-red-200"
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
