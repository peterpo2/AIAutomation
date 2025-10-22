import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isDropboxConnected, disconnectDropbox, getAuthUrl } from '../lib/dropbox';
import { requestNotificationPermission } from '../lib/firebase';

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [dropboxConnected, setDropboxConnected] = useState(isDropboxConnected());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const darkModeStored = localStorage.getItem('darkMode') === 'true';
    setDarkMode(darkModeStored);
  }, []);

  const toggleDarkMode = () => {
    const newValue = !darkMode;
    setDarkMode(newValue);
    localStorage.setItem('darkMode', String(newValue));
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

  const handleDropboxToggle = () => {
    if (dropboxConnected) {
      disconnectDropbox();
      setDropboxConnected(false);
    } else {
      const authUrl = getAuthUrl();
      window.location.href = authUrl;
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
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
