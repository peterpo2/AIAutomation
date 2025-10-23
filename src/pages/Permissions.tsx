import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Crown,
  Info,
  Loader2,
  Mail,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/apiClient';
import type { PermissionMatrix, SeatSummary, UserRole } from '../types/auth';

interface ManagedUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
  isPrimaryAdmin: boolean;
  isCeo: boolean;
  editable: boolean;
}

const roleAccent: Record<UserRole, string> = {
  Admin: 'bg-red-500',
  CEO: 'bg-amber-500',
  Team: 'bg-blue-500',
};

const formatRole = (role: UserRole) => {
  switch (role) {
    case 'Admin':
      return 'Administrator';
    case 'CEO':
      return 'Executive (CEO)';
    case 'Team':
      return 'Marketing Team';
    default:
      return role;
  }
};

export default function Permissions() {
  const { user, profile, profileLoading, refreshProfile } = useAuth();
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [matrixError, setMatrixError] = useState<string | null>(null);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [seats, setSeats] = useState<SeatSummary | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [roleDrafts, setRoleDrafts] = useState<Record<string, UserRole>>({});
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    role: 'Team' as UserRole,
    displayName: '',
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isPrivileged = profile?.role === 'Admin' || profile?.role === 'CEO';

  useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;
    const loadMatrix = async () => {
      setMatrixLoading(true);
      setMatrixError(null);
      try {
        const token = await user.getIdToken();
        const response = await apiFetch('/auth/permissions', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { message?: string } | null;
          const defaultMessage =
            response.status === 401
              ? 'Please sign in again to review the permission catalogue.'
              : 'Unable to load permissions';
          throw new Error(data?.message ?? defaultMessage);
        }

        const data = (await response.json()) as PermissionMatrix;
        if (active) {
          setMatrix(data);
        }
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Unable to load permissions';
        setMatrixError(message);
        setMatrix(null);
      } finally {
        if (active) {
          setMatrixLoading(false);
        }
      }
    };

    void loadMatrix();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user || profile || profileLoading) {
      return;
    }

    void refreshProfile();
  }, [user, profile, profileLoading, refreshProfile]);

  const loadUsers = useCallback(async () => {
    if (!user || !isPrivileged) {
      return;
    }

    setUsersLoading(true);
    setUsersError(null);
    try {
      const token = await user.getIdToken();
      const response = await apiFetch('/auth/users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? 'Unable to load workspace users.');
      }

      const data = (await response.json()) as { users: ManagedUser[]; seats?: SeatSummary };
      setUsers(data.users);
      setSeats(data.seats ?? null);
      setEmailDrafts(
        data.users.reduce<Record<string, string>>((acc, item) => {
          acc[item.id] = item.email;
          return acc;
        }, {}),
      );
      setRoleDrafts(
        data.users.reduce<Record<string, UserRole>>((acc, item) => {
          acc[item.id] = item.role;
          return acc;
        }, {}),
      );
      setSelectedUserId((prev) => {
        if (prev && data.users.some((userItem) => userItem.id === prev)) {
          return prev;
        }
        return data.users[0]?.id ?? null;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load workspace users.';
      setUsersError(message);
      setUsers([]);
      setSeats(null);
    } finally {
      setUsersLoading(false);
    }
  }, [user, isPrivileged]);

  useEffect(() => {
    if (!isPrivileged) {
      return;
    }
    void loadUsers();
  }, [isPrivileged, loadUsers]);

  const permissionLookup = useMemo(() => {
    if (!matrix) return new Map<string, PermissionMatrix['permissions'][number]>();
    return new Map(matrix.permissions.map((permission) => [permission.key, permission]));
  }, [matrix]);

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const normalized = search.trim().toLowerCase();
    return users.filter((userItem) =>
      [userItem.email, userItem.role, formatRole(userItem.role)]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [users, search]);

  const selectedRole = selectedUser && roleDrafts[selectedUser.id] ? roleDrafts[selectedUser.id] : selectedUser?.role;

  const selectedPermissions = useMemo(() => {
    if (!matrix || !selectedRole) return [];
    return matrix.rolePermissions[selectedRole]
      .map((permissionKey) => permissionLookup.get(permissionKey))
      .filter((permission): permission is PermissionMatrix['permissions'][number] => Boolean(permission));
  }, [matrix, selectedRole, permissionLookup]);

  const ownPermissions = useMemo(() => {
    if (!matrix || !profile) return [] as PermissionMatrix['permissions'];
    return profile.permissions
      .map((permissionKey) => permissionLookup.get(permissionKey))
      .filter((permission): permission is PermissionMatrix['permissions'][number] => Boolean(permission));
  }, [matrix, profile, permissionLookup]);

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    setCreateLoading(true);
    setCreateError(null);
    setActionMessage(null);
    try {
      const token = await user.getIdToken();
      const response = await apiFetch('/auth/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(createForm),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? 'Unable to create user.');
      }

      const created = (await response.json()) as ManagedUser;
      setCreateForm({ email: '', password: '', role: 'Team', displayName: '' });
      setCreateOpen(false);
      setActionMessage({ type: 'success', text: `Created workspace member ${created.email}.` });
      await loadUsers();
      setSelectedUserId(created.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create user.';
      setCreateError(message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSaveUser = async () => {
    if (!user || !selectedUser) return;

    const nextEmail = emailDrafts[selectedUser.id] ?? selectedUser.email;
    const nextRole = roleDrafts[selectedUser.id] ?? selectedUser.role;

    const hasChanges = nextEmail !== selectedUser.email || nextRole !== selectedUser.role;
    if (!hasChanges) {
      setActionMessage({ type: 'error', text: 'No changes to save for this member.' });
      return;
    }

    setSavingUserId(selectedUser.id);
    setActionMessage(null);
    try {
      const token = await user.getIdToken();
      const response = await apiFetch(`/auth/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: nextEmail, role: nextRole }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? 'Unable to update user.');
      }

      const updated = (await response.json()) as ManagedUser;
      setUsers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEmailDrafts((prev) => ({ ...prev, [updated.id]: updated.email }));
      setRoleDrafts((prev) => ({ ...prev, [updated.id]: updated.role }));
      setActionMessage({ type: 'success', text: `Updated ${updated.email}.` });

      if (user.email?.toLowerCase() === selectedUser.email.toLowerCase()) {
        await user.reload();
        await refreshProfile();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update user.';
      setActionMessage({ type: 'error', text: message });
    } finally {
      setSavingUserId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!user || !selectedUser) return;
    if (!window.confirm(`Remove ${selectedUser.email} from SmartOps? This action cannot be undone.`)) {
      return;
    }

    setDeletingUserId(selectedUser.id);
    setActionMessage(null);
    try {
      const token = await user.getIdToken();
      const response = await apiFetch(`/auth/users/${selectedUser.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? 'Unable to delete user.');
      }

      setUsers((prev) => prev.filter((item) => item.id !== selectedUser.id));
      setEmailDrafts((prev) => {
        const next = { ...prev };
        delete next[selectedUser.id];
        return next;
      });
      setRoleDrafts((prev) => {
        const next = { ...prev };
        delete next[selectedUser.id];
        return next;
      });
      setSelectedUserId((prev) => {
        if (prev !== selectedUser.id) return prev;
        return users.find((item) => item.id !== selectedUser.id)?.id ?? null;
      });
      setActionMessage({ type: 'success', text: `Removed ${selectedUser.email} from the workspace.` });
      await loadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete user.';
      setActionMessage({ type: 'error', text: message });
    } finally {
      setDeletingUserId(null);
    }
  };

  const primaryAdminEmail = matrix?.immutableAssignments.adminEmail;
  const ceoEmail = matrix?.immutableAssignments.ceoEmail;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Roles &amp; Permissions</h1>
        <p className="text-gray-600 mt-1">
          Manage how your workspace operates. Your current role is{' '}
          <span className="font-semibold text-gray-800">
            {profile?.role ?? (profileLoading ? 'loading…' : 'unknown')}
          </span>
          .
        </p>
      </div>

      {actionMessage && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${
            actionMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{actionMessage.text}</span>
        </div>
      )}

      {matrixError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{matrixError}</div>
      )}

      {matrixLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
        </div>
      ) : !matrix ? (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
          <ShieldAlert className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-gray-600">No permission data available.</p>
        </div>
      ) : isPrivileged ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {[{ role: 'Admin' as const, label: 'Administrator', email: primaryAdminEmail }, { role: 'CEO' as const, label: 'Executive (CEO)', email: ceoEmail }].map(
              (entry) => (
                <div key={entry.role} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 ${entry.role === 'Admin' ? 'text-red-600' : 'text-amber-600'}`}>
                      {entry.role === 'Admin' ? <ShieldCheck className="h-5 w-5" /> : <Crown className="h-5 w-5" />}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{entry.label}</p>
                      <p className="text-xs text-gray-500">{entry.email ?? 'No account reserved yet'}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    {entry.role === 'Admin'
                      ? 'Holds full system control including automations, integrations, and policy enforcement.'
                      : 'Provides executive oversight with approvals, reporting access, and escalation alerts.'}
                  </p>
                </div>
              ),
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 space-y-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Workspace members</h2>
                  <p className="text-sm text-gray-500">Select a member to review and adjust their access.</p>
                </div>
                <button
                  onClick={() => {
                    setCreateOpen((prev) => !prev);
                    setCreateError(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Plus className="w-4 h-4" />
                  {createOpen ? 'Close' : 'Create'}
                </button>
              </div>

              {seats && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Seat utilisation</p>
                  <div className="mt-2">
                    <p className="text-sm text-gray-700 font-medium">
                      Total seats:{' '}
                      <span className="font-semibold text-gray-900">
                        {seats.totalUsed} / {seats.limit}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Standard members:{' '}
                      <span className="font-medium text-gray-700">
                        {seats.standardUsed} / {seats.standardLimit}
                      </span>
                    </p>
                  </div>
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by email or role"
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                />
              </div>

              {createOpen && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-800">Create a new member</h3>
                  {createError && <p className="text-xs text-red-600">{createError}</p>}
                  <form className="space-y-3" onSubmit={handleCreateUser}>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Email</label>
                      <input
                        type="email"
                        required
                        value={createForm.email}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Temporary password</label>
                      <input
                        type="password"
                        required
                        value={createForm.password}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Display name (optional)</label>
                      <input
                        type="text"
                        value={createForm.displayName}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, displayName: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Role</label>
                      <select
                        value={createForm.role}
                        onChange={(event) =>
                          setCreateForm((prev) => ({ ...prev, role: event.target.value as UserRole }))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                      >
                        {matrix.roles
                          .filter((role) => role.role !== 'Admin' && role.role !== 'CEO')
                          .map((role) => (
                            <option key={role.role} value={role.role}>
                              {role.label}
                            </option>
                          ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={createLoading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
                    >
                      {createLoading && <Loader2 className="w-4 h-4 animate-spin" />}Create member
                    </button>
                  </form>
                </div>
              )}

              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {usersLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
                  </div>
                ) : usersError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{usersError}</div>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-sm text-gray-500">No members match your search.</p>
                ) : (
                  filteredUsers.map((member) => {
                    const isActive = member.id === selectedUserId;
                    return (
                      <button
                        key={member.id}
                        onClick={() => setSelectedUserId(member.id)}
                        className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                          isActive
                            ? 'border-red-200 bg-red-50 shadow-sm'
                            : 'border-gray-200 hover:border-red-200 hover:bg-red-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{member.email}</p>
                            <p className="text-xs text-gray-500">{formatRole(member.role)}</p>
                          </div>
                          <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-white ${roleAccent[member.role]}`}>
                            {member.role.slice(0, 2)}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-white border border-gray-100 rounded-xl shadow-sm p-6"
            >
              {selectedUser ? (
                <div className="space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-800">{selectedUser.email}</h2>
                      <p className="text-sm text-gray-500">Added {new Date(selectedUser.createdAt).toLocaleString()}</p>
                    </div>
                    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-white ${roleAccent[selectedRole ?? selectedUser.role]}`}>
                      {formatRole(selectedRole ?? selectedUser.role)}
                    </div>
                  </div>

                  {!selectedUser.editable && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      This account is protected. Only the workspace administrator can adjust its details.
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-gray-600">Email</label>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="relative flex-1">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="email"
                            value={emailDrafts[selectedUser.id] ?? selectedUser.email}
                            onChange={(event) =>
                              setEmailDrafts((prev) => ({ ...prev, [selectedUser.id]: event.target.value }))
                            }
                            disabled={!selectedUser.editable}
                            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:bg-gray-100 disabled:text-gray-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600">Role</label>
                      <select
                        value={roleDrafts[selectedUser.id] ?? selectedUser.role}
                        onChange={(event) =>
                          setRoleDrafts((prev) => ({ ...prev, [selectedUser.id]: event.target.value as UserRole }))
                        }
                        disabled={!selectedUser.editable}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:bg-gray-100 disabled:text-gray-500"
                      >
                        {matrix.roles.map((role) => (
                          <option key={role.role} value={role.role}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleSaveUser}
                      disabled={!selectedUser.editable || savingUserId === selectedUser.id}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      {savingUserId === selectedUser.id && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save changes
                    </button>
                    <button
                      onClick={handleDeleteUser}
                      disabled={
                        !selectedUser.editable ||
                        selectedUser.isPrimaryAdmin ||
                        selectedUser.isCeo ||
                        deletingUserId === selectedUser.id ||
                        user?.email?.toLowerCase() === selectedUser.email.toLowerCase()
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                    >
                      {deletingUserId === selectedUser.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      Delete member
                    </button>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">Permissions preview</h3>
                    <p className="text-xs text-gray-500 mb-3">
                      {selectedRole && selectedRole !== selectedUser.role
                        ? 'Showing permissions for the pending role change.'
                        : 'Current capabilities for this member.'}
                    </p>
                    <div className="space-y-3">
                      {selectedPermissions.map((permission) => (
                        <div key={permission.key} className="flex gap-3">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{permission.label}</p>
                            <p className="text-xs text-gray-500">{permission.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-sm text-gray-500">
                  <ShieldAlert className="w-10 h-10 text-red-500 mb-3" />
                  <p>Select a workspace member to review their permissions.</p>
                </div>
              )}
            </motion.div>
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
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-white border border-gray-100 rounded-xl shadow-sm p-6"
        >
          <h2 className="text-xl font-semibold text-gray-800">Your permissions</h2>
          <p className="text-sm text-gray-500 mt-1">
            You can update your personal details in the settings area, but only administrators can modify access levels.
          </p>
          <div className="mt-6 space-y-3">
            {ownPermissions.length === 0 ? (
              <p className="text-sm text-gray-500">No permissions assigned to your role.</p>
            ) : (
              ownPermissions.map((permission) => (
                <div key={permission.key} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{permission.label}</p>
                    <p className="text-xs text-gray-500">{permission.description}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
