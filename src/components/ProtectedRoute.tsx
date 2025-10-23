import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, configError, diagnosticMode, enableDiagnostics } = useAuth();

  if (configError && !diagnosticMode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="max-w-lg w-full bg-white border border-red-100 rounded-2xl shadow-sm p-8 text-center space-y-5">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-800">Configuration required</h1>
          <p className="text-gray-600">
            {configError}. Update your <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">.env</code> file or Docker
            environment with the missing Firebase credentials and rebuild the frontend.
          </p>
          <button
            type="button"
            onClick={enableDiagnostics}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium text-amber-700 bg-amber-100 border border-amber-200 hover:bg-amber-200 transition-colors"
          >
            View dashboard in diagnostics mode
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
