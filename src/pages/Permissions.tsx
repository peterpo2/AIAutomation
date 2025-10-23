import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, CircleDashed, Loader2, ShieldCheck, Crown, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { PermissionMatrix, UserRole } from '../types/auth';

const roleAccent: Record<UserRole, string> = {
  Admin: 'bg-red-500',
  CEO: 'bg-amber-500',
  Team: 'bg-blue-500',
  Client: 'bg-gray-500',
};

export default function Permissions() {
  const { user, profile } = useAuth();
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/auth/permissions', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(data?.message ?? 'Unable to load permissions');
        }

        const data = (await response.json()) as PermissionMatrix;
        if (active) {
          setMatrix(data);
        }
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Unable to load permissions';
        setError(message);
        setMatrix(null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [user]);

  const renderBadge = (role: UserRole) => {
    if (!matrix) return null;
    if (role === 'Admin' && matrix.immutableAssignments.adminEmail) {
      return (
        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
          <ShieldCheck className="h-3.5 w-3.5" /> Primary admin
        </span>
      );
    }
    if (role === 'CEO' && matrix.immutableAssignments.ceoEmail) {
      return (
        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
          <Crown className="h-3.5 w-3.5" /> Executive account
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Roles & Permissions</h1>
        <p className="text-gray-600 mt-1">
          Review what each role can do inside SmartOps. Your current role is{' '}
          <span className="font-semibold text-gray-800">{profile?.role ?? 'loading…'}</span>.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
        </div>
      ) : matrix ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {matrix.roles.map((role) => (
              <motion.div
                key={role.role}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-semibold ${roleAccent[role.role]}`}>
                    {role.role.slice(0, 2)}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                      {role.label}
                      {renderBadge(role.role)}
                    </h3>
                    <p className="text-sm text-gray-500">{role.summary}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  {matrix.rolePermissions[role.role].length} permissions granted
                </p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 bg-gray-50">
              <Info className="w-5 h-5 text-red-500" />
              <span className="font-semibold text-gray-800">Permission matrix</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Permission
                    </th>
                    {matrix.roles.map((role) => (
                      <th
                        key={role.role}
                        className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {role.role}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {matrix.permissions.map((permission) => (
                    <tr key={permission.key}>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <p className="font-medium text-gray-800">{permission.label}</p>
                        <p className="text-xs text-gray-500 mt-1">{permission.description}</p>
                      </td>
                      {matrix.roles.map((role) => {
                        const allowed = matrix.rolePermissions[role.role].includes(permission.key);
                        return (
                          <td key={role.role} className="px-6 py-4 text-center">
                            {allowed ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 inline" />
                            ) : (
                              <CircleDashed className="w-5 h-5 text-gray-300 inline" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
          <ShieldCheck className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-gray-600">No permission data available.</p>
        </div>
      )}
    </div>
  );
}
