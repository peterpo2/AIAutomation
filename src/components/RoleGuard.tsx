import { ReactNode } from 'react';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types/auth';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: ReactNode;
}

export default function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { profile, profileLoading } = useAuth();

  if (profileLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
      </div>
    );
  }

  if (!profile || !allowedRoles.includes(profile.role)) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="bg-white border border-red-100 rounded-xl shadow-sm p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800">Access restricted</h2>
          <p className="text-gray-600 mt-2">
            You need elevated permissions to view this section. Contact your administrator if you believe this is a mistake.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
