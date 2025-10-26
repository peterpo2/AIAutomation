import type { Client } from '../types/client';
import { loadClients, persistClients } from '../utils/clientStorage';
import { supabase } from './supabase';

export type ClientPayload = Omit<Client, 'id' | 'createdAt' | 'updatedAt'>;

type SupabaseClientRow = {
  id: string;
  name: string | null;
  start_date: string | null;
  notes: string | null;
  tiktok_handle: string | null;
  tiktok_email: string | null;
  tiktok_password: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const toClient = (row: SupabaseClientRow): Client => {
  const createdAt = row.created_at ?? new Date().toISOString();
  const updatedAt = row.updated_at ?? createdAt;

  return {
    id: row.id,
    name: row.name ?? 'Unnamed client',
    startDate: row.start_date ?? '',
    notes: row.notes ?? '',
    tiktokHandle: row.tiktok_handle ?? '',
    tiktokEmail: row.tiktok_email ?? '',
    tiktokPassword: row.tiktok_password ?? '',
    createdAt,
    updatedAt,
  };
};

export const sortClientsByUpdatedAt = (clients: Client[]) =>
  [...clients].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

const cacheClients = (clients: Client[]) => {
  const sorted = sortClientsByUpdatedAt(clients);
  persistClients(sorted);
  return sorted;
};

const generateClientId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client_${Math.random().toString(36).slice(2)}${Date.now()}`;
};

const normalizePayload = (payload: ClientPayload): ClientPayload => ({
  name: payload.name.trim(),
  startDate: payload.startDate.trim(),
  notes: payload.notes,
  tiktokHandle: payload.tiktokHandle.trim(),
  tiktokEmail: payload.tiktokEmail.trim(),
  tiktokPassword: payload.tiktokPassword,
});

const fallbackCreateClient = (payload: ClientPayload): Client => {
  const timestamp = new Date().toISOString();
  const newClient: Client = {
    id: generateClientId(),
    ...normalizePayload(payload),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  cacheClients([newClient, ...loadClients().filter((client) => client.id !== newClient.id)]);
  return newClient;
};

export async function fetchClients(): Promise<Client[]> {
  const fallbackClients = () => sortClientsByUpdatedAt(loadClients());

  if (!supabase) {
    return fallbackClients();
  }

  try {
    const { data, error } = await supabase
      .from('clients')
      .select(
        'id,name,start_date,notes,tiktok_handle,tiktok_email,tiktok_password,created_at,updated_at',
      )
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    const clients = Array.isArray(data)
      ? data.map((row) => toClient(row as SupabaseClientRow))
      : [];

    return cacheClients(clients);
  } catch (error) {
    const cachedClients = fallbackClients();
    if (cachedClients.length > 0) {
      if (import.meta.env.DEV) {
        console.warn('Falling back to cached clients due to fetch error:', error);
      }
      return cachedClients;
    }

    console.error('Failed to fetch clients from Supabase:', error);
    return [];
  }
}

export async function createClient(payload: ClientPayload): Promise<Client> {
  if (!payload.name.trim()) {
    throw new Error('Client name is required.');
  }

  if (!supabase) {
    return fallbackCreateClient(payload);
  }

  const normalized = normalizePayload(payload);

  try {
    const { data, error } = await supabase
      .from('clients')
      .insert({
        name: normalized.name,
        start_date: normalized.startDate || null,
        notes: normalized.notes || null,
        tiktok_handle: normalized.tiktokHandle || null,
        tiktok_email: normalized.tiktokEmail || null,
        tiktok_password: normalized.tiktokPassword || null,
      })
      .select(
        'id,name,start_date,notes,tiktok_handle,tiktok_email,tiktok_password,created_at,updated_at',
      )
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Failed to create client: missing response payload.');
    }

    const client = toClient(data as SupabaseClientRow);

    cacheClients([client, ...loadClients().filter((existing) => existing.id !== client.id)]);

    return client;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Falling back to local client creation due to error:', error);
    }
    return fallbackCreateClient(payload);
  }
}

const fallbackUpdateClient = (id: string, payload: ClientPayload): Client => {
  const timestamp = new Date().toISOString();
  let updatedClient: Client | null = null;

  const nextClients = loadClients().map((client) => {
    if (client.id !== id) {
      return client;
    }

    updatedClient = {
      ...client,
      ...normalizePayload(payload),
      updatedAt: timestamp,
    };

    return updatedClient;
  });

  if (!updatedClient) {
    throw new Error('Client not found.');
  }

  cacheClients(nextClients);

  return updatedClient;
};

export async function updateClient(id: string, payload: ClientPayload): Promise<Client> {
  if (!payload.name.trim()) {
    throw new Error('Client name is required.');
  }

  if (!supabase) {
    return fallbackUpdateClient(id, payload);
  }

  const normalized = normalizePayload(payload);

  try {
    const { data, error } = await supabase
      .from('clients')
      .update({
        name: normalized.name,
        start_date: normalized.startDate || null,
        notes: normalized.notes || null,
        tiktok_handle: normalized.tiktokHandle || null,
        tiktok_email: normalized.tiktokEmail || null,
        tiktok_password: normalized.tiktokPassword || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        'id,name,start_date,notes,tiktok_handle,tiktok_email,tiktok_password,created_at,updated_at',
      )
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Failed to update client: missing response payload.');
    }

    const client = toClient(data as SupabaseClientRow);

    cacheClients([client, ...loadClients().filter((existing) => existing.id !== id)]);

    return client;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Falling back to local client update due to error:', error);
    }
    return fallbackUpdateClient(id, payload);
  }
}

const fallbackDeleteClient = (id: string) => {
  const nextClients = loadClients().filter((client) => client.id !== id);
  cacheClients(nextClients);
};

export async function deleteClient(id: string): Promise<void> {
  if (!supabase) {
    fallbackDeleteClient(id);
    return;
  }

  try {
    const { error } = await supabase.from('clients').delete().eq('id', id);

    if (error) {
      throw error;
    }

    cacheClients(loadClients().filter((client) => client.id !== id));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Falling back to local client deletion due to error:', error);
    }
    fallbackDeleteClient(id);
  }
}
