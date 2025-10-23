import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { Zap, Mail, Lock, AlertCircle } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const { signIn, signUp, resetPassword, configError, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (configError) {
      setError(configError);
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (showReset) {
        await resetPassword(email);
        setSuccess('Password reset email sent. Check your inbox.');
        setShowReset(false);
      } else if (isSignUp) {
        await signUp(email, password, rememberMe);
        navigate('/dashboard', { replace: true });
      } else {
        await signIn(email, password, rememberMe);
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (configError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center space-y-4"
        >
          <div className="flex items-center justify-center mb-4">
            <div className="bg-red-500 p-3 rounded-xl">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold ml-3 text-gray-800">SmartOps</h1>
          </div>
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-2xl font-semibold text-gray-800">Configuration required</h2>
          <p className="text-gray-600">
            {configError}. Please provide the Firebase credentials in your environment variables before attempting to sign in.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md"
      >
        <div className="flex items-center justify-center mb-8">
          <div className="bg-red-500 p-3 rounded-xl">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold ml-3 text-gray-800">SmartOps</h1>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">
            {showReset ? 'Reset Password' : isSignUp ? 'Create Account' : 'Welcome Back'}
          </h2>
          <p className="text-gray-600">
            {showReset
              ? 'Enter your email to receive reset instructions'
              : isSignUp
              ? 'Sign up to access SmartOps Dashboard'
              : 'Sign in to continue to your dashboard'}
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-2 text-red-700"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center gap-2 text-green-700"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{success}</p>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none"
                placeholder="your@email.com"
                required
              />
            </div>
          </div>

          {!showReset && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all outline-none"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
          )}

          {!showReset && !isSignUp && (
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="mr-2 h-4 w-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
                />
                Save credentials
              </label>

              <button
                type="button"
                onClick={() => {
                  setShowReset(true);
                  setError('');
                  setSuccess('');
                }}
                className="text-sm text-red-500 hover:text-red-600 transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            disabled={loading}
            className="w-full bg-red-500 text-white py-3 rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/30"
          >
            {loading
              ? 'Processing...'
              : showReset
              ? 'Send Reset Link'
              : isSignUp
              ? 'Sign Up'
              : 'Sign In'}
          </motion.button>
        </form>

        <div className="mt-6 text-center space-y-2">
          {!showReset && (
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setShowReset(false);
                setRememberMe(false);
              }}
              className="text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          )}

          {showReset && (
            <button
              onClick={() => {
                setShowReset(false);
                setError('');
                setSuccess('');
              }}
              className="block w-full text-sm text-red-500 hover:text-red-600 transition-colors"
            >
              Back to sign in
            </button>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500">
            Secure authentication powered by Firebase
          </p>
        </div>
      </motion.div>
    </div>
  );
}
