const DEFAULT_API_BASE = '/api';

const resolveBaseUrl = (): string => {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (!raw || raw.trim().length === 0) {
    return DEFAULT_API_BASE;
  }

  let sanitized = raw.trim().replace(/\/+$/, '');

  if (sanitized.length === 0) {
    return DEFAULT_API_BASE;
  }

  if (!/^https?:\/\//i.test(sanitized) && !sanitized.startsWith('/')) {
    sanitized = `/${sanitized}`;
  }

  return sanitized;
};

const API_BASE_URL = resolveBaseUrl();

const normalizePath = (path: string): string => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const trimmed = path.trim();
  if (trimmed.length === 0) {
    return API_BASE_URL;
  }
  return `${API_BASE_URL}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
};

export const resolveApiUrl = (path: string): string => normalizePath(path);

export const apiFetch = (path: string, init?: RequestInit) => {
  const url = resolveApiUrl(path);
  return fetch(url, init);
};

export const apiBaseUrl = API_BASE_URL;
