import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Users,
  Plus,
  Search,
  Pencil,
  Trash2,
  BadgeCheck,
  Building2,
  MapPin,
  BarChart3,
  LockKeyhole,
  Eye,
  EyeOff,
  ClipboardList,
  CalendarClock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { ClientFormValues, ClientRecord, ClientStatus } from '../types/clients';

const defaultForm: ClientFormValues = {
  name: '',
  industry: '',
  region: '',
  status: 'Prospect',
  notes: '',
  handle: '',
  username: '',
  password: '',
  followers: 0,
  totalViews: 0,
  engagementRate: 0,
  completionRate: 0,
  postsPerWeek: 0,
  lastPosted: null,
};

const initialClients: ClientRecord[] = [];

const statusLabels: Record<ClientStatus, string> = {
  Active: 'Active',
  Paused: 'Paused',
  Prospect: 'Prospect',
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 11);
};

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

const formatDate = (value: string | null) => {
  if (!value) return 'No posts yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const mapClientToForm = (client: ClientRecord): ClientFormValues => ({
  name: client.name,
  industry: client.industry,
  region: client.region,
  status: client.status,
  notes: client.notes,
  handle: client.account.handle,
  username: client.account.username,
  password: client.account.password,
  followers: client.account.followers,
  totalViews: client.metrics.totalViews,
  engagementRate: client.metrics.engagementRate,
  completionRate: client.metrics.completionRate,
  postsPerWeek: client.metrics.postsPerWeek,
  lastPosted: client.account.lastPosted,
});

const createClientRecord = (input: ClientFormValues): ClientRecord => {
  const timestamp = new Date().toISOString();
  return {
    id: generateId(),
    name: input.name.trim(),
    industry: input.industry.trim(),
    region: input.region.trim(),
    status: input.status,
    notes: input.notes.trim(),
    account: {
      handle: input.handle.trim(),
      username: input.username.trim(),
      password: input.password,
      followers: Number.isFinite(input.followers) ? input.followers : 0,
      lastPosted: input.lastPosted,
    },
    metrics: {
      totalViews: Number.isFinite(input.totalViews) ? input.totalViews : 0,
      engagementRate: Number.isFinite(input.engagementRate) ? input.engagementRate : 0,
      completionRate: Number.isFinite(input.completionRate) ? input.completionRate : 0,
      postsPerWeek: Number.isFinite(input.postsPerWeek) ? input.postsPerWeek : 0,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
};

export default function Clients() {
  const { profile } = useAuth();
  const role = profile?.role ?? 'Team';
  const isPrivileged = role === 'Admin' || role === 'CEO';

  const [clients, setClients] = useState<ClientRecord[]>(initialClients);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClients[0]?.id ?? null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formState, setFormState] = useState<ClientFormValues>(defaultForm);
  const [showPassword, setShowPassword] = useState(false);
  const archivedClientsRef = useRef<ClientRecord[]>([]);

  useEffect(() => {
    if (!selectedClientId && clients.length > 0) {
      setSelectedClientId(clients[0].id);
    }
    if (selectedClientId && !clients.some((client) => client.id === selectedClientId)) {
      setSelectedClientId(clients[0]?.id ?? null);
    }
  }, [clients, selectedClientId]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  useEffect(() => {
    if (!isCreating) {
      if (selectedClient) {
        setFormState(mapClientToForm(selectedClient));
      } else {
        setFormState(defaultForm);
      }
      setIsEditing(false);
    }
  }, [selectedClient, isCreating]);

  const filteredClients = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
    if (!normalized) {
      return sorted;
    }
    return sorted.filter((client) => {
      const haystack = `${client.name} ${client.industry} ${client.account.handle} ${client.account.username}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [clients, searchTerm]);

  const handleFieldChange = <Key extends keyof ClientFormValues>(field: Key, value: ClientFormValues[Key]) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleNumberFieldChange = (
    field: 'followers' | 'totalViews' | 'engagementRate' | 'completionRate' | 'postsPerWeek',
    value: string,
  ) => {
    const numericValue = value === '' ? 0 : Number(value);
    handleFieldChange(field, Number.isNaN(numericValue) ? 0 : numericValue);
  };

  const handleStartCreate = () => {
    if (!isPrivileged) return;
    setSelectedClientId(null);
    setIsCreating(true);
    setIsEditing(true);
    setFormState(defaultForm);
  };

  const handleStartEdit = () => {
    if (!isPrivileged || !selectedClient) return;
    setIsEditing(true);
    setIsCreating(false);
    setFormState(mapClientToForm(selectedClient));
  };

  const handleCancel = () => {
    if (isCreating) {
      setIsCreating(false);
      setIsEditing(false);
      setFormState(defaultForm);
      setSelectedClientId(clients[0]?.id ?? null);
      return;
    }
    if (selectedClient) {
      setFormState(mapClientToForm(selectedClient));
    } else {
      setFormState(defaultForm);
    }
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!isPrivileged) return;
    if (isCreating) {
      const newClient = createClientRecord(formState);
      setClients((prev) => [...prev, newClient]);
      setSelectedClientId(newClient.id);
      setIsCreating(false);
      setIsEditing(false);
      setFormState(mapClientToForm(newClient));
      return;
    }
    if (!selectedClient) return;
    const timestamp = new Date().toISOString();
    setClients((prev) =>
      prev.map((client) =>
        client.id === selectedClient.id
          ? {
              ...client,
              name: formState.name.trim(),
              industry: formState.industry.trim(),
              region: formState.region.trim(),
              status: formState.status,
              notes: formState.notes.trim(),
              account: {
                handle: formState.handle.trim(),
                username: formState.username.trim(),
                password: formState.password,
                followers: formState.followers,
                lastPosted: formState.lastPosted,
              },
              metrics: {
                totalViews: formState.totalViews,
                engagementRate: formState.engagementRate,
                completionRate: formState.completionRate,
                postsPerWeek: formState.postsPerWeek,
              },
              updatedAt: timestamp,
            }
          : client,
      ),
    );
    setIsEditing(false);
  };

  const handleDelete = (clientId: string) => {
    if (!isPrivileged) return;
    const confirmed = window.confirm('This client will be archived and removed from the list. Continue?');
    if (!confirmed) return;
    setClients((prev) => {
      const target = prev.find((client) => client.id === clientId);
      if (!target) return prev;
      const deletedAt = new Date().toISOString();
      archivedClientsRef.current = [{ ...target, deletedAt }, ...archivedClientsRef.current];
      const remaining = prev.filter((client) => client.id !== clientId);
      if (selectedClientId === clientId) {
        setSelectedClientId(remaining[0]?.id ?? null);
        setIsEditing(false);
        setIsCreating(false);
        setFormState(defaultForm);
      }
      return remaining;
    });
  };

  const credentialField = (
    label: string,
    value: string,
    type: 'text' | 'password',
    onChange: (next: string) => void,
  ) => (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      {isEditing ? (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
        />
      ) : (
        <span className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800">
          {value || '—'}
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Clients</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Manage every TikTok partnership in one place. Select a client from the list to review activity, credentials, and
            performance history.
          </p>
        </div>
        {isPrivileged && (
          <button
            type="button"
            onClick={handleStartCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition hover:bg-red-600"
          >
            <Plus className="h-4 w-4" />
            New client
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <motion.section
          layout
          className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-1"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Workspace clients</h2>
              <p className="text-sm text-gray-500">{clients.length} total | {filteredClients.length} shown</p>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name or handle"
              className="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
            />
          </div>

          <div className="mt-4 h-96 space-y-2 overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {filteredClients.map((client) => {
                const isSelected = client.id === selectedClientId;
                return (
                  <motion.button
                    key={client.id}
                    layout
                    onClick={() => {
                      setSelectedClientId(client.id);
                      setIsCreating(false);
                      setIsEditing(false);
                    }}
                    className={`flex w-full flex-col gap-1 rounded-xl border px-4 py-3 text-left transition ${
                      isSelected
                        ? 'border-red-500 bg-red-50 shadow-inner'
                        : 'border-gray-200 bg-white hover:border-red-200 hover:bg-red-50/60'
                    }`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                  >
                    <span className="text-sm font-semibold text-gray-800">{client.name || 'Untitled client'}</span>
                    <span className="text-xs text-gray-500">{client.account.handle || 'No handle assigned'}</span>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <BadgeCheck className="h-3.5 w-3.5 text-red-400" />
                      <span>{statusLabels[client.status]}</span>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
            {clients.length === 0 && !isCreating && (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-6 text-center">
                <ClipboardList className="mb-3 h-8 w-8 text-gray-400" />
                <p className="text-sm font-medium text-gray-600">No clients tracked yet</p>
                <p className="mt-1 text-xs text-gray-500">
                  {isPrivileged ? 'Add your first TikTok partner to get started.' : 'Your workspace has not onboarded any clients yet.'}
                </p>
              </div>
            )}
          </div>
        </motion.section>

        <section className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {isCreating ? (
              <motion.div
                key="create"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="rounded-2xl border border-dashed border-red-200 bg-white/60 p-6 shadow-inner"
              >
                <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-800">Create new client</h2>
                    <p className="text-sm text-gray-500">Capture the essentials so the team can collaborate with zero guesswork.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-600"
                      disabled={!isPrivileged}
                    >
                      Save client
                    </button>
                  </div>
                </header>

                <ClientFormContent
                  formState={formState}
                  onFieldChange={handleFieldChange}
                  onNumberFieldChange={handleNumberFieldChange}
                />
              </motion.div>
            ) : selectedClient ? (
              <motion.div
                key={selectedClient.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="space-y-6"
              >
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <h2 className="text-2xl font-semibold text-gray-800">{selectedClient.name || 'Untitled client'}</h2>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
                          <BadgeCheck className="h-3.5 w-3.5" /> {statusLabels[selectedClient.status]}
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-gray-400" />
                          {selectedClient.industry || 'Industry not set'}
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          {selectedClient.region || 'Region not set'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={handleCancel}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSave}
                            className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-600"
                            disabled={!isPrivileged}
                          >
                            Save changes
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={handleStartEdit}
                            disabled={!isPrivileged}
                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                              isPrivileged
                                ? 'border-gray-200 text-gray-700 hover:border-red-200 hover:text-red-600'
                                : 'cursor-not-allowed border-gray-200 text-gray-400'
                            }`}
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(selectedClient.id)}
                            disabled={!isPrivileged}
                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                              isPrivileged
                                ? 'border-transparent bg-red-50 text-red-600 hover:bg-red-100'
                                : 'cursor-not-allowed border-gray-200 text-gray-400'
                            }`}
                          >
                            <Trash2 className="h-4 w-4" />
                            Archive
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {!isPrivileged && (
                    <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50/80 p-4 text-xs text-yellow-700">
                      This workspace role is read only. Contact an administrator if client information needs to change.
                    </div>
                  )}

                  <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Client name</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={formState.name}
                            onChange={(event) => handleFieldChange('name', event.target.value)}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
                          />
                        ) : (
                          <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                            {selectedClient.name || 'Untitled client'}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Industry</label>
                          {isEditing ? (
                            <input
                              type="text"
                              value={formState.industry}
                              onChange={(event) => handleFieldChange('industry', event.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
                            />
                          ) : (
                            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                              {selectedClient.industry || 'Not provided'}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Region</label>
                          {isEditing ? (
                            <input
                              type="text"
                              value={formState.region}
                              onChange={(event) => handleFieldChange('region', event.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
                            />
                          ) : (
                            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                              {selectedClient.region || 'Not provided'}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</label>
                        {isEditing ? (
                          <select
                            value={formState.status}
                            onChange={(event) => handleFieldChange('status', event.target.value as ClientStatus)}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
                          >
                            {Object.entries(statusLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                            {statusLabels[selectedClient.status]}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Notes</label>
                        {isEditing ? (
                          <textarea
                            value={formState.notes}
                            onChange={(event) => handleFieldChange('notes', event.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
                          />
                        ) : (
                          <p className="min-h-[3.5rem] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                            {selectedClient.notes || 'No internal notes yet.'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                          <LockKeyhole className="h-4 w-4 text-red-500" /> TikTok credentials
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          All workspace members can view credentials. Only CEO &amp; Admin roles can update them.
                        </p>
                        <div className="mt-4 grid grid-cols-1 gap-3">
                          {credentialField('Handle', formState.handle, 'text', (value) => handleFieldChange('handle', value))}
                          {credentialField('Username', formState.username, 'text', (value) => handleFieldChange('username', value))}
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Password</span>
                            <div className="flex items-center gap-2">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={formState.password}
                                  onChange={(event) => handleFieldChange('password', event.target.value)}
                                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
                                />
                              ) : (
                                <span className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800">
                                  {showPassword ? formState.password || '—' : formState.password ? '••••••••' : '—'}
                                </span>
                              )}
                              {!isEditing && (
                                <button
                                  type="button"
                                  onClick={() => setShowPassword((prev) => !prev)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:text-red-500"
                                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                          <BarChart3 className="h-4 w-4 text-red-500" /> Performance snapshot
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                          <MetricCard
                            label="Followers"
                            value={`${formatNumber(formState.followers)}`}
                            editing={isEditing}
                            inputValue={formState.followers}
                            onChange={(value) => handleNumberFieldChange('followers', value)}
                          />
                          <MetricCard
                            label="Total views"
                            value={`${formatNumber(formState.totalViews)}`}
                            editing={isEditing}
                            inputValue={formState.totalViews}
                            onChange={(value) => handleNumberFieldChange('totalViews', value)}
                          />
                          <MetricCard
                            label="Engagement rate (%)"
                            value={`${formState.engagementRate.toFixed(2)}%`}
                            editing={isEditing}
                            inputValue={formState.engagementRate}
                            onChange={(value) => handleNumberFieldChange('engagementRate', value)}
                            step="0.1"
                          />
                          <MetricCard
                            label="Completion rate (%)"
                            value={`${formState.completionRate.toFixed(2)}%`}
                            editing={isEditing}
                            inputValue={formState.completionRate}
                            onChange={(value) => handleNumberFieldChange('completionRate', value)}
                            step="0.1"
                          />
                          <MetricCard
                            label="Posts per week"
                            value={`${formState.postsPerWeek.toFixed(0)}`}
                            editing={isEditing}
                            inputValue={formState.postsPerWeek}
                            onChange={(value) => handleNumberFieldChange('postsPerWeek', value)}
                          />
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Last posted</span>
                            {isEditing ? (
                              <input
                                type="date"
                                value={formState.lastPosted ?? ''}
                                onChange={(event) =>
                                  handleFieldChange('lastPosted', event.target.value ? event.target.value : null)
                                }
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
                              />
                            ) : (
                              <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                                {formatDate(selectedClient.account.lastPosted)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
                        <div className="flex items-center gap-2 font-medium text-gray-600">
                          <CalendarClock className="h-4 w-4 text-red-500" />
                          Record timeline
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <span className="block text-[11px] uppercase tracking-wide text-gray-400">Created</span>
                            <span className="text-sm text-gray-700">
                              {new Date(selectedClient.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] uppercase tracking-wide text-gray-400">Last updated</span>
                            <span className="text-sm text-gray-700">
                              {new Date(selectedClient.updatedAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="flex h-full min-h-[24rem] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center"
              >
                <ClipboardList className="h-12 w-12 text-gray-400" />
                <h2 className="mt-4 text-xl font-semibold text-gray-700">Select a client to view their workspace</h2>
                <p className="mt-2 max-w-md text-sm text-gray-500">
                  Choose a record from the list to the left to see TikTok credentials, performance metrics, and internal notes.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}

interface ClientFormContentProps {
  formState: ClientFormValues;
  onFieldChange: <Key extends keyof ClientFormValues>(field: Key, value: ClientFormValues[Key]) => void;
  onNumberFieldChange: (field: 'followers' | 'totalViews' | 'engagementRate' | 'completionRate' | 'postsPerWeek', value: string) => void;
}

function ClientFormContent({ formState, onFieldChange, onNumberFieldChange }: ClientFormContentProps) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Client name</label>
          <input
            type="text"
            value={formState.name}
            onChange={(event) => onFieldChange('name', event.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Industry</label>
            <input
              type="text"
              value={formState.industry}
              onChange={(event) => onFieldChange('industry', event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Region</label>
            <input
              type="text"
              value={formState.region}
              onChange={(event) => onFieldChange('region', event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</label>
          <select
            value={formState.status}
            onChange={(event) => onFieldChange('status', event.target.value as ClientStatus)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
          >
            {(['Active', 'Paused', 'Prospect'] satisfies ClientStatus[]).map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Notes</label>
          <textarea
            value={formState.notes}
            onChange={(event) => onFieldChange('notes', event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <LockKeyhole className="h-4 w-4 text-red-500" /> TikTok credentials
          </div>
          <p className="mt-1 text-xs text-gray-500">These fields stay visible to every workspace member.</p>
          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Handle</span>
              <input
                type="text"
                value={formState.handle}
                onChange={(event) => onFieldChange('handle', event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Username</span>
              <input
                type="text"
                value={formState.username}
                onChange={(event) => onFieldChange('username', event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Password</span>
              <input
                type="text"
                value={formState.password}
                onChange={(event) => onFieldChange('password', event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <BarChart3 className="h-4 w-4 text-red-500" /> Performance snapshot
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <MetricCard
              label="Followers"
              value={`${formState.followers}`}
              editing
              inputValue={formState.followers}
              onChange={(value) => onNumberFieldChange('followers', value)}
            />
            <MetricCard
              label="Total views"
              value={`${formState.totalViews}`}
              editing
              inputValue={formState.totalViews}
              onChange={(value) => onNumberFieldChange('totalViews', value)}
            />
            <MetricCard
              label="Engagement rate (%)"
              value={`${formState.engagementRate}`}
              editing
              inputValue={formState.engagementRate}
              onChange={(value) => onNumberFieldChange('engagementRate', value)}
              step="0.1"
            />
            <MetricCard
              label="Completion rate (%)"
              value={`${formState.completionRate}`}
              editing
              inputValue={formState.completionRate}
              onChange={(value) => onNumberFieldChange('completionRate', value)}
              step="0.1"
            />
            <MetricCard
              label="Posts per week"
              value={`${formState.postsPerWeek}`}
              editing
              inputValue={formState.postsPerWeek}
              onChange={(value) => onNumberFieldChange('postsPerWeek', value)}
            />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Last posted</span>
              <input
                type="date"
                value={formState.lastPosted ?? ''}
                onChange={(event) => onFieldChange('lastPosted', event.target.value ? event.target.value : null)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  editing?: boolean;
  inputValue: number;
  onChange: (value: string) => void;
  step?: string;
}

function MetricCard({ label, value, editing = false, inputValue, onChange, step }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      {editing ? (
        <input
          type="number"
          value={Number.isNaN(inputValue) ? '' : inputValue}
          step={step ?? '1'}
          min="0"
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-100"
        />
      ) : (
        <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">{value}</span>
      )}
    </div>
  );
}
