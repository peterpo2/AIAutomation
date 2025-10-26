import type { Client } from '../types/client';

export const CLIENTS_STORAGE_KEY = 'smartops-clients';
export const CLIENTS_UPDATED_EVENT = 'clients:updated';

export function formatClientDate(value: string) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function loadClients(): Client[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CLIENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Client[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((client) => ({
      ...client,
      createdAt: client.createdAt ?? new Date().toISOString(),
      updatedAt: client.updatedAt ?? new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Failed to parse stored clients', error);
    return [];
  }
}

export function persistClients(clients: Client[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const serialized = JSON.stringify(clients);
    const existing = window.localStorage.getItem(CLIENTS_STORAGE_KEY);
    if (existing === serialized) {
      return;
    }
    window.localStorage.setItem(CLIENTS_STORAGE_KEY, serialized);
    window.dispatchEvent(new CustomEvent(CLIENTS_UPDATED_EVENT));
  } catch (error) {
    console.error('Failed to persist clients', error);
  }
}

export function subscribeToClientChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleCustomEvent = () => {
    callback();
  };

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === CLIENTS_STORAGE_KEY) {
      callback();
    }
  };

  window.addEventListener(CLIENTS_UPDATED_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(CLIENTS_UPDATED_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
}
