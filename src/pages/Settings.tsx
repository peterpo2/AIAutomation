import { FormEvent, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Bell,
  Cloud,
  Moon,
  Sun,
  LogOut,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isDropboxConnected, disconnectDropbox, getAuthUrl } from '../lib/dropbox';
import { requestNotificationPermission } from '../lib/firebase';
import { apiFetch } from '../lib/apiClient';

export default function Settings() {
  const { user, signOut, profile, profileLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [dropboxConnected, setDropboxConnected] = useState(isDropboxConnected());
  const [loading, setLoading] = useState(false);
  const [emailDraft, setEmailDraft] = useState(user?.email ?? '');
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [profileUpdating, setProfileUpdating] = useState(false);

  useEffect(() => {
    const darkModeStored = localStorage.getItem('darkMode') === 'true';
    setDarkMode(darkModeStored);
    document.documentElement.classList.toggle('dark', darkModeStored);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    setEmailDraft(user?.email ?? '');
  }, [user?.email]);

  const toggleDarkMode = () => {
    const newValue = !darkMode;
    setDarkMode(newValue);
    localStorage.setItem('darkMode', String(newValue));
    document.documentElement.classList.toggle('dark', newValue);
  };

  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      setLoading(true);
      const token = await requestNotificationPermission();
      setLoading(false);
      if (token) {
        setNotificationsEnabled(true);
      }
    } else {
      setNotificationsEnabled(false);
    }
  };

  const handleDropboxToggle = async () => {
    if (dropboxConnected) {
      disconnectDropbox();
      setDropboxConnected(false);
    } else {
      try {
        const authUrl = await getAuthUrl();
        window.location.href = authUrl;
      } catch (error) {
        console.error('Error starting Dropbox authentication:', error);
      }
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleProfileUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    const trimmed = emailDraft.trim();
    if (!trimmed) {
      setProfileMessage({ type: 'error', text: 'Provide a valid email address before saving.' });
      return;
    }

    if (trimmed === user.email) {
      setProfileMessage({ type: 'error', text: 'Update your email before saving changes.' });
      return;
    }

    setProfileUpdating(true);
    setProfileMessage(null);
    try {
      const token = await user.getIdToken();
      const response = await apiFetch('/auth/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: trimmed }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? 'Unable to update your profile right now.');
      }

      await user.reload();
      await refreshProfile();
      setEmailDraft(trimmed);
      setProfileMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update your profile right now.';
      setProfileMessage({ type: 'error', text: message });
    } finally {
      setProfileUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account and preferences</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-red-500 w-16 h-16 rounded-full flex items-center justify-center">
            <User className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">User Information</h2>
            <p className="text-gray-600">{user?.email}</p>
            <p className="text-sm text-gray-500 mt-1">
              Role:{' '}
              <span className="font-medium text-gray-700">
                {profileLoading ? 'Loading…' : profile?.role ?? 'Team'}
              </span>
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-600">
            <span className="font-medium">User ID:</span> {user?.uid}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            <span className="font-medium">Account created:</span>{' '}
            {user?.metadata?.creationTime
              ? new Date(user.metadata.creationTime).toLocaleDateString()
              : 'N/A'}
          </p>
          {profile && profile.permissions.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Highlighted permissions</p>
              <div className="flex flex-wrap gap-2">
                {profile.permissions.slice(0, 4).map((permission) => {
                  const spaced = permission.replace(/([A-Z])/g, ' $1').trim();
                  const formatted = spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
                  return (
                    <span
                      key={permission}
                      className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600"
                    >
                      {formatted}
                    </span>
                  );
                })}
                {profile.permissions.length > 4 && (
                  <span className="text-xs text-gray-500">+{profile.permissions.length - 4} more</span>
                )}
              </div>
            </div>
          )}
          <form
            onSubmit={handleProfileUpdate}
            className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">Update your email</p>
                <p className="text-xs text-gray-500">Only administrators can change role-based permissions.</p>
              </div>
            </div>
            {profileMessage && (
              <div
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                  profileMessage.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <span>{profileMessage.text}</span>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600">Email address</label>
              <input
                type="email"
                value={emailDraft}
                onChange={(event) => setEmailDraft(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={profileUpdating}
                className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
              >
                {profileUpdating && <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />}Save email
              </button>
            </div>
          </form>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-4">Integrations</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500 p-2 rounded-lg">
                <Cloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-800">Dropbox</p>
                <p className="text-sm text-gray-600">
                  {dropboxConnected ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </div>
            <button
              onClick={handleDropboxToggle}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                dropboxConnected
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {dropboxConnected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-4">Preferences</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="bg-orange-500 p-2 rounded-lg">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-800">Push Notifications</p>
                <p className="text-sm text-gray-600">
                  Receive alerts about uploads and reports
                </p>
              </div>
            </div>
            <button
              onClick={toggleNotifications}
              disabled={loading}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
              style={{ backgroundColor: notificationsEnabled ? '#ef4444' : '#d1d5db' }}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="bg-gray-700 p-2 rounded-lg">
                {darkMode ? (
                  <Moon className="w-5 h-5 text-white" />
                ) : (
                  <Sun className="w-5 h-5 text-white" />
                )}
              </div>
              <div>
                <p className="font-medium text-gray-800">Dark Mode</p>
                <p className="text-sm text-gray-600">
                  Toggle dark theme appearance
                </p>
              </div>
            </div>
            <button
              onClick={toggleDarkMode}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{ backgroundColor: darkMode ? '#ef4444' : '#d1d5db' }}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  darkMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-4">Connection Status</h2>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Firebase Authentication</span>
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Connected</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Supabase Database</span>
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Connected</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Dropbox Integration</span>
            <div className={`flex items-center gap-2 ${dropboxConnected ? 'text-green-600' : 'text-gray-400'}`}>
              {dropboxConnected ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Connected</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Not Connected</span>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-4">Account Actions</h2>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 bg-red-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </motion.div>
    </div>
  );
}
