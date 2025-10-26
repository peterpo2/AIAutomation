import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Edit2,
  KeyRound,
  Link2,
  NotebookPen,
  Plus,
  Save,
  Search,
  Trash2,
  User2,
  X,
} from 'lucide-react';

import {
  createClient,
  deleteClient,
  fetchClients,
  sortClientsByUpdatedAt,
  updateClient,
  type ClientPayload,
} from '../lib/clientsApi';
import type { Client } from '../types/client';
import { formatClientDate, subscribeToClientChanges } from '../utils/clientStorage';

type ClientFormValues = ClientPayload;

const emptyForm: ClientFormValues = {
  name: '',
  startDate: '',
  notes: '',
  tiktokHandle: '',
  tiktokEmail: '',
  tiktokPassword: '',
};

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [formValues, setFormValues] = useState<ClientFormValues>(emptyForm);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);

  const refreshClients = useCallback(
    async (shouldUpdate?: () => boolean) => {
      try {
        const data = await fetchClients();
        if (shouldUpdate && !shouldUpdate()) {
          return;
        }
        setClients(data);
        setErrorMessage(null);
      } catch (error) {
        if (shouldUpdate && !shouldUpdate()) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load clients.');
        throw error;
      }
    },
    [],
  );

  useEffect(() => {
    let isActive = true;
    const checkActive = () => isActive;

    const load = async () => {
      setLoading(true);
      try {
        await refreshClients(checkActive);
      } catch {
        // errors handled inside refreshClients
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    load();

    const unsubscribe = subscribeToClientChanges(() => {
      refreshClients(checkActive).catch(() => {
        // errors handled inside refreshClients
      });
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [refreshClients]);

  const filteredClients = useMemo(() => {
    if (!searchTerm.trim()) {
      return clients;
    }
    const term = searchTerm.toLowerCase();
    return clients.filter((client) =>
      [client.name, client.notes, client.tiktokHandle, client.tiktokEmail].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [clients, searchTerm]);

  const totalClients = clients.length;
  const earliestClient = useMemo(() => {
    if (clients.length === 0) return null;
    const sorted = [...clients]
      .filter((client) => Boolean(client.startDate))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    return sorted[0] ?? null;
  }, [clients]);

  const latestUpdate = useMemo(() => {
    if (clients.length === 0) return null;
    const sorted = [...clients].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return sorted[0] ?? null;
  }, [clients]);

  const resetForm = () => {
    setFormValues(emptyForm);
    setEditingClientId(null);
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formValues.name.trim()) {
      setErrorMessage('Client name is required.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      if (editingClientId) {
        const updated = await updateClient(editingClientId, formValues);
        setClients((prev) =>
          sortClientsByUpdatedAt([
            updated,
            ...prev.filter((client) => client.id !== updated.id),
          ]),
        );
      } else {
        const created = await createClient(formValues);
        setClients((prev) =>
          sortClientsByUpdatedAt([
            created,
            ...prev.filter((client) => client.id !== created.id),
          ]),
        );
      }

      resetForm();
      setShowForm(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save client.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClient = async (id: string) => {
    setDeletingClientId(id);
    setErrorMessage(null);

    try {
      await deleteClient(id);
      setClients((prev) => prev.filter((client) => client.id !== id));
      if (editingClientId === id) {
        resetForm();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete client.');
    } finally {
      setDeletingClientId(null);
    }
  };

  const startEditClient = (client: Client) => {
    setEditingClientId(client.id);
    setFormValues({
      name: client.name,
      startDate: client.startDate,
      notes: client.notes,
      tiktokHandle: client.tiktokHandle,
      tiktokEmail: client.tiktokEmail,
      tiktokPassword: client.tiktokPassword,
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    resetForm();
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-600">
            Track onboarding details, TikTok credentials, and account connection status for every
            partner.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-red-600"
        >
          <Plus className="h-5 w-5" />
          Add client
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total clients</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">{totalClients}</p>
            </div>
            <User2 className="h-10 w-10 text-red-500" />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Earliest partnership</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">
                {earliestClient ? formatClientDate(earliestClient.startDate) : '—'}
              </p>
              {earliestClient ? (
                <p className="text-sm text-gray-500">{earliestClient.name}</p>
              ) : (
                <p className="text-sm text-gray-400">Add a start date to see history.</p>
              )}
            </div>
            <Calendar className="h-10 w-10 text-red-500" />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Last updated</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">
                {latestUpdate ? formatClientDate(latestUpdate.updatedAt) : '—'}
              </p>
              {latestUpdate ? (
                <p className="text-sm text-gray-500">{latestUpdate.name}</p>
              ) : (
                <p className="text-sm text-gray-400">Keep client records up to date.</p>
              )}
            </div>
            <NotebookPen className="h-10 w-10 text-red-500" />
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search clients"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-red-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100"
              disabled={loading}
            />
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"
          >
            <Link2 className="h-4 w-4" />
            Connect TikTok accounts
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center text-sm text-gray-500">
              Loading clients…
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
              <User2 className="h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-lg font-semibold text-gray-700">No clients found</h3>
              <p className="mt-2 max-w-sm text-sm text-gray-500">
                Start building relationships by adding your first client. You can manage notes,
                track onboarding dates, and store TikTok credentials securely.
              </p>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-600"
                disabled={isSaving}
              >
                <Plus className="h-4 w-4" />
                Create client
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredClients.map((client) => {
                const isDeleting = deletingClientId === client.id;
                return (
                  <article key={client.id} className="rounded-lg border border-gray-200 p-4 shadow-sm transition hover:border-red-200">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{client.name}</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Partner since {client.startDate ? formatClientDate(client.startDate) : '—'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditClient(client)}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-red-200 hover:text-red-600"
                          disabled={isSaving || isDeleting}
                        >
                          <Edit2 className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteClient(client.id)}
                          className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
                          disabled={isDeleting || isSaving}
                        >
                          <Trash2 className="h-4 w-4" />
                          {isDeleting ? 'Removing…' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                          <Calendar className="h-4 w-4" />
                          Start date
                        </dt>
                        <dd className="mt-1 text-sm text-gray-800">
                          {client.startDate ? formatClientDate(client.startDate) : 'Not provided'}
                        </dd>
                      </div>

                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                          <Link2 className="h-4 w-4" />
                          TikTok handle
                        </dt>
                        <dd className="mt-1 text-sm text-gray-800">{client.tiktokHandle || 'Not provided'}</dd>
                      </div>

                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                          <KeyRound className="h-4 w-4" />
                          TikTok credentials
                        </dt>
                        <dd className="mt-1 space-y-1 text-sm text-gray-800">
                          <div>Email: {client.tiktokEmail || '—'}</div>
                          <div>Password: {client.tiktokPassword ? '••••••••' : '—'}</div>
                        </dd>
                      </div>

                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 sm:col-span-2 lg:col-span-1">
                        <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                          <NotebookPen className="h-4 w-4" />
                          Notes
                        </dt>
                        <dd className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
                          {client.notes || 'Add notes about campaigns, KPIs, or deliverables.'}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={handleCancel}
              className="absolute right-4 top-4 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-semibold text-gray-900">
              {editingClientId ? 'Update client' : 'Add new client'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Capture onboarding details, account credentials, and collaboration notes.
            </p>

            <form onSubmit={handleFormSubmit} className="mt-6 grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="client-name">
                  Client name
                </label>
                <input
                  id="client-name"
                  type="text"
                  value={formValues.name}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="e.g. Kaufland"
                  required
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
                  disabled={isSaving}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="client-start-date">
                    Start date
                  </label>
                  <input
                    id="client-start-date"
                    type="date"
                    value={formValues.startDate}
                    onChange={(event) =>
                      setFormValues((prev) => ({ ...prev, startDate: event.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
                    disabled={isSaving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="client-tiktok-handle">
                    TikTok handle
                  </label>
                  <input
                    id="client-tiktok-handle"
                    type="text"
                    value={formValues.tiktokHandle}
                    onChange={(event) =>
                      setFormValues((prev) => ({ ...prev, tiktokHandle: event.target.value }))
                    }
                    placeholder="@brand.tiktok"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
                    disabled={isSaving}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="client-tiktok-email">
                    TikTok email
                  </label>
                  <input
                    id="client-tiktok-email"
                    type="email"
                    value={formValues.tiktokEmail}
                    onChange={(event) =>
                      setFormValues((prev) => ({ ...prev, tiktokEmail: event.target.value }))
                    }
                    placeholder="contact@brand.com"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
                    disabled={isSaving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="client-tiktok-password">
                    TikTok password
                  </label>
                  <input
                    id="client-tiktok-password"
                    type="text"
                    value={formValues.tiktokPassword}
                    onChange={(event) =>
                      setFormValues((prev) => ({ ...prev, tiktokPassword: event.target.value }))
                    }
                    placeholder="Secure password"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
                    disabled={isSaving}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="client-notes">
                  Notes
                </label>
                <textarea
                  id="client-notes"
                  value={formValues.notes}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, notes: event.target.value }))}
                  rows={4}
                  placeholder="Capture strategy notes, campaign KPIs, or platform access steps."
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
                  disabled={isSaving}
                />
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-700"
                  disabled={isSaving}
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isSaving}
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Saving…' : editingClientId ? 'Save changes' : 'Create client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
