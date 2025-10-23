import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import RoleGuard from './components/RoleGuard';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DropboxPage from './pages/Dropbox';
import Uploads from './pages/Uploads';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Permissions from './pages/Permissions';
import UserManagement from './pages/UserManagement';

function App() {
  useEffect(() => {
    const storedDarkMode = localStorage.getItem('darkMode') === 'true';
    document.documentElement.classList.toggle('dark', storedDarkMode);
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dropbox-callback" element={<DropboxPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/dropbox" element={<DropboxPage />} />
                    <Route path="/uploads" element={<Uploads />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route
                      path="/user-management"
                      element={
                        <RoleGuard allowedRoles={['Admin', 'CEO']}>
                          <UserManagement />
                        </RoleGuard>
                      }
                    />
                    <Route path="/permissions" element={<Permissions />} />
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
