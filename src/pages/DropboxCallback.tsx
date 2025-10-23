import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { handleAuthCallback } from '../lib/dropbox';

export default function DropboxCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('Dropbox did not return an authorization code. Please restart the connection flow.');
      return;
    }

    void (async () => {
      try {
        await handleAuthCallback(code);
        navigate('/dropbox', { replace: true });
      } catch (err) {
        console.error('Error completing Dropbox authentication:', err);
        setError(err instanceof Error ? err.message : 'Failed to complete Dropbox authentication.');
      }
    })();
  }, [navigate, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        {error ? (
          <>
            <h2 className="mb-4 text-2xl font-semibold text-red-600">Dropbox Connection Failed</h2>
            <p className="mb-6 text-gray-600">{error}</p>
            <button
              type="button"
              onClick={() => navigate('/dropbox', { replace: true })}
              className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-5 py-3 font-medium text-white shadow-lg shadow-blue-500/30 transition-colors hover:bg-blue-600"
            >
              Return to Dropbox
            </button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-blue-500" />
            <h2 className="mb-2 text-2xl font-semibold text-gray-800">Connecting to Dropbox</h2>
            <p className="text-gray-600">Please wait while we complete the authentication process.</p>
          </>
        )}
      </div>
    </div>
  );
}
