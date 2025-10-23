import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Loader2, ShieldCheck, Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { PermissionMatrix, UserRole } from '../types/auth';

interface ManagedUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
  immutable: boolean;
  isCeo: boolean;
}

const roleLabels: Record<UserRole, string> = {
  Admin: 'Administrator',
  CEO: 'Executive (CEO)',
  Team: 'Marketing Team',
  Client: 'Client / Stakeholder',
};

export default function UserManagement() {
  const { user, profileLoading, refreshProfile } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [updatingEmail, setUpdatingEmail] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, UserRole>>({});

  const isSelf = useCallback((email: string) => user?.email === email, [user?.email]);

  const loadData = useCallback(async () => {
    if (!user) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const [usersResponse, permissionsResponse] = await Promise.all([
        fetch('/api/auth/users', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch('/api/auth/permissions', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      ]);

      if (!usersResponse.ok) {
        const data = (await usersResponse.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? 'Failed to load users');
      }
      if (!permissionsResponse.ok) {
        const data = (await permissionsResponse.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? 'Failed to load permissions');
      }

      const userData = (await usersResponse.json()) as { users: ManagedUser[] };
      const permissionData = (await permissionsResponse.json()) as PermissionMatrix;

      setUsers(userData.users);
      setMatrix(permissionData);
      setPendingRoles(
        userData.users.reduce<Record<string, UserRole>>((acc, current) => {
          acc[current.email] = current.role;
          return acc;
        }, {}),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load users';
      setError(message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const availableRoles = useMemo(() => {
    if (!matrix) return [] as UserRole[];
    return matrix.roles.map((role) => role.role);
  }, [matrix]);

  const handleRoleSelection = (email: string, role: UserRole) => {
    setPendingRoles((prev) => ({ ...prev, [email]: role }));
    setSuccess(null);
  };

  const applyRoleChange = async (email: string) => {
    const targetRole = pendingRoles[email];
    if (!targetRole) return;

    const currentUser = users.find((item) => item.email === email);
    if (!currentUser || currentUser.role === targetRole) {
      return;
    }

    setUpdatingEmail(email);
    setError(null);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error('Authentication required');

      const response = await fetch('/api/auth/role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email, role: targetRole }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? 'Unable to update role');
      }

      setUsers((prev) =>
        prev.map((item) => (item.email === email ? { ...item, role: targetRole } : item)),
      );
      setSuccess(`Updated ${email} to ${roleLabels[targetRole]}.`);

      if (isSelf(email)) {
        await refreshProfile();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update role';
      setError(message);
    } finally {
      setUpdatingEmail(null);
    }
  };

  const formatDate = (date: string) => new Date(date).toLocaleString();

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">User Management</h1>
          <p className="text-gray-600 mt-1">
            Assign roles and manage access for your SmartOps workspace.
          </p>
        </div>
        <button
          onClick={() => void loadData()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
        >
          Refresh data
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{success}</span>
        </div>
      )}

      {loading || profileLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-white border border-gray-100 rounded-xl shadow-sm divide-y divide-gray-100"
        >
          <div className="px-6 py-4 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-red-500" />
              <div>
                <p className="font-semibold text-gray-800">Workspace members</p>
                <p className="text-xs text-gray-500">{users.length} accounts</p>
              </div>
            </div>
            {matrix?.immutableAssignments.adminEmail && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <ShieldCheck className="w-4 h-4 text-red-500" />
                Primary admin: {matrix.immutableAssignments.adminEmail}
              </div>
            )}
          </div>

          {users.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-500">No users found.</div>
          ) : (
            users.map((managedUser) => {
              const pendingRole = pendingRoles[managedUser.email] ?? managedUser.role;
              const roleChanged = pendingRole !== managedUser.role;
              const canEdit = !managedUser.immutable;

              return (
                <div key={managedUser.id} className="px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800">{managedUser.email}</p>
                      {managedUser.immutable && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                          <ShieldCheck className="w-3.5 h-3.5" /> Admin
                        </span>
                      )}
                      {managedUser.isCeo && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <Crown className="w-3.5 h-3.5" /> CEO
                        </span>
                      )}
                      {isSelf(managedUser.email) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">Joined {formatDate(managedUser.createdAt)}</p>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative">
                      <select
                        value={pendingRole}
                        onChange={(event) => handleRoleSelection(managedUser.email, event.target.value as UserRole)}
                        disabled={!canEdit || updatingEmail === managedUser.email}
                        className="appearance-none w-48 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-60"
                      >
                        {availableRoles.map((role) => (
                          <option
                            key={role}
                            value={role}
                            disabled={
                              (role === 'Admin' &&
                                !!matrix?.immutableAssignments.adminEmail &&
                                matrix.immutableAssignments.adminEmail !== managedUser.email) ||
                              (role === 'CEO' &&
                                !!matrix?.immutableAssignments.ceoEmail &&
                                matrix.immutableAssignments.ceoEmail !== managedUser.email)
                            }
                          >
                            {roleLabels[role]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => void applyRoleChange(managedUser.email)}
                      disabled={!canEdit || !roleChanged || updatingEmail === managedUser.email}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {updatingEmail === managedUser.email ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Update role'
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </motion.div>
      )}
    </div>
  );
}
