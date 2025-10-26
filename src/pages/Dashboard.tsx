import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, Calendar, FileText, NotebookPen, Users2, Video } from 'lucide-react';

import { fetchClients } from '../lib/clientsApi';
import type { Client } from '../types/client';
import { formatClientDate, subscribeToClientChanges } from '../utils/clientStorage';

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

  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const data = await fetchClients();
        if (!isMounted) return;
        setClients(data);
        setClientsError(null);
      } catch (error) {
        if (!isMounted) return;
        setClientsError(error instanceof Error ? error.message : 'Failed to load clients.');
      } finally {
        if (isMounted) {
          setClientsLoaded(true);
        }
      }
    };

    load();

    const unsubscribe = subscribeToClientChanges(() => {
      fetchClients()
        .then((data) => {
          if (!isMounted) return;
          setClients(data);
          setClientsError(null);
        })
        .catch((error) => {
          if (!isMounted) return;
          setClientsError(error instanceof Error ? error.message : 'Failed to load clients.');
        });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const totalClients = clients.length;

  const earliestClient = useMemo(() => {
    if (clients.length === 0) return null;
    const sorted = [...clients]
      .filter((client) => Boolean(client.startDate))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    return sorted[0] ?? null;
  }, [clients]);

  const latestUpdate = useMemo(() => {
    if (clients.length === 0) return null;
    const sorted = [...clients].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return sorted[0] ?? null;
  }, [clients]);

  const recentClients = useMemo(() => {
    return [...clients]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [clients]);

  const earliestStartLabel = earliestClient ? formatClientDate(earliestClient.startDate) : '—';

  const lastUpdatedLabel = latestUpdate
    ? new Date(latestUpdate.updatedAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white text-gray-900 dark:bg-white dark:text-gray-900 rounded-2xl shadow-xl p-5 border border-gray-100"
        >
          <div className="flex items-center justify-between text-gray-700 dark:text-gray-200">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Team calendar</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Track campaign milestones and automation schedules at a glance.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-500">
              <Calendar className="w-4 h-4" /> {monthLabel}
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
                  transition={{ delay: 0.3 + index * 0.015 }}
                  className={`aspect-square rounded-lg border flex items-center justify-center text-xs font-medium ${
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl shadow-xl p-5 border border-gray-100"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">Notifications</h2>
            <Bell className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-3">
            {recentActivity.map((activity, index) => (
              <div
                key={index}
                className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0"
              >
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

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-white rounded-2xl shadow-xl p-5 border border-gray-100"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Clients overview</h2>
            <p className="text-sm text-gray-500 mt-1">
              Keep track of active partnerships and their latest updates in one place.
            </p>
          </div>
          <Link
            to="/clients"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition hover:border-red-200 hover:bg-red-100"
          >
            Manage clients
          </Link>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total clients</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{totalClients}</p>
              </div>
              <span className="rounded-lg bg-white p-2 text-red-500 shadow-sm shadow-red-500/10">
                <Users2 className="h-5 w-5" />
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Earliest start date
                </p>
                <p className="mt-2 text-lg font-semibold text-gray-900">{earliestStartLabel}</p>
              </div>
              <span className="rounded-lg bg-white p-2 text-red-500 shadow-sm shadow-red-500/10">
                <Calendar className="h-5 w-5" />
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Latest update</p>
                <p className="mt-2 text-lg font-semibold text-gray-900">{lastUpdatedLabel}</p>
              </div>
              <span className="rounded-lg bg-white p-2 text-red-500 shadow-sm shadow-red-500/10">
                <NotebookPen className="h-5 w-5" />
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6">
          {clientsError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {clientsError}
            </div>
          ) : !clientsLoaded ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-center text-sm text-gray-500">
              Loading clients…
            </div>
          ) : recentClients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
              <p className="text-sm font-medium text-gray-700">No clients added yet.</p>
              <p className="mt-1 text-xs text-gray-500">
                Create your first client profile to start tracking TikTok credentials and notes.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentClients.map((client) => (
                <li key={client.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{client.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {client.notes ? client.notes : 'No notes added yet.'}
                    </p>
                    <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Started {client.startDate ? formatClientDate(client.startDate) : 'Not set'}
                      {client.tiktokHandle ? ` · ${client.tiktokHandle}` : ''}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500">
                    <p className="font-medium text-gray-600">Updated</p>
                    <p>
                      {new Date(client.updatedAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  );
}
