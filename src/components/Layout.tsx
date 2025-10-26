import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Home,
  Folder,
  Upload,
  FileText,
  Settings,
  Zap,
  Menu,
  X,
  Shield,
  UserCog,
  Users2,
  Workflow,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import UserMenu from './UserMenu';
import type { UserRole } from '../types/auth';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile } = useAuth();

  const isManagerRole = (role?: UserRole) => role && ['Admin', 'CEO'].includes(role);

  const baseNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: Home },
    { path: '/dropbox', label: 'Dropbox', icon: Folder },
    { path: '/uploads', label: 'Uploads', icon: Upload },
    { path: '/reports', label: 'Reports', icon: FileText },
    { path: '/automations', label: 'Automations', icon: Workflow },
    { path: '/clients', label: 'Clients', icon: Users2 },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  const managementNavItems = isManagerRole(profile?.role)
    ? [{ path: '/user-management', label: 'User Management', icon: UserCog }]
    : [];

  const infoNavItems = [{ path: '/permissions', label: 'Permissions', icon: Shield }];

  const navItems = [...baseNavItems, ...managementNavItems, ...infoNavItems];

  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const formattedDate = currentDateTime.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const formattedTime = currentDateTime.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="min-h-screen bg-gray-50 transition-colors duration-300">
      <div className="lg:flex">
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 lg:translate-x-0 lg:static ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="p-6 border-b border-gray-200">
            <Link
              to="/dashboard"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 group"
            >
              <div className="bg-red-500 p-2 rounded-lg group-hover:bg-red-600 transition-colors">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-800 group-hover:text-red-600 transition-colors">SmartOps</h1>
            </Link>
          </div>

          <nav className="p-4 space-y-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
            <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-600">SmartOps v1.0.0</p>
              <p className="text-xs text-gray-500 mt-1">VPS Self-Hosted Edition</p>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex-1 min-h-screen">
          <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  {sidebarOpen ? (
                    <X className="w-6 h-6 text-gray-700" />
                  ) : (
                    <Menu className="w-6 h-6 text-gray-700" />
                  )}
                </button>

                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 rounded-lg px-2 py-1 text-gray-800 font-semibold hover:bg-red-50 hover:text-red-600 transition-colors lg:hidden"
                  onClick={() => setSidebarOpen(false)}
                >
                  <Zap className="w-5 h-5" />
                  <span>SmartOps</span>
                </Link>
              </div>

              <div className="flex-1 flex justify-end lg:justify-center">
                <div className="text-right lg:text-center">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Today</p>
                  <p className="text-sm font-semibold text-gray-800">{formattedDate}</p>
                  <p className="text-xs text-gray-500">{formattedTime}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <UserMenu />
              </div>
            </div>
          </header>

          <main className="p-6 lg:p-8">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
