const CACHE_PREFIX = 'smartops-cache:';

type CacheEntry<T> = {
  value: T;
  expiresAt: number | null;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

let storage: Storage | null | undefined;

const getStorage = (): Storage | null => {
  if (storage !== undefined) {
    return storage;
  }
  if (typeof window === 'undefined' || !('sessionStorage' in window)) {
    storage = null;
    return storage;
  }
  try {
    const testKey = `${CACHE_PREFIX}__test__`;
    window.sessionStorage.setItem(testKey, '1');
    window.sessionStorage.removeItem(testKey);
    storage = window.sessionStorage;
  } catch (error) {
    console.warn('Session storage is not available for caching:', error);
    storage = null;
  }
  return storage;
};

const buildKey = (key: string) => `${CACHE_PREFIX}${key}`;

const isExpired = (entry: CacheEntry<unknown> | undefined) => {
  if (!entry) {
    return true;
  }
  if (entry.expiresAt === null) {
    return false;
  }
  return entry.expiresAt <= Date.now();
};

const readFromStorage = <T>(key: string): CacheEntry<T> | undefined => {
  const store = getStorage();
  if (!store) {
    return undefined;
  }
  try {
    const raw = store.getItem(buildKey(key));
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    return parsed;
  } catch (error) {
    store.removeItem(buildKey(key));
    console.warn(`Failed to read cache key "${key}" from sessionStorage`, error);
    return undefined;
  }
};

const writeToStorage = <T>(key: string, entry: CacheEntry<T>) => {
  const store = getStorage();
  if (!store) {
    return;
  }
  try {
    store.setItem(buildKey(key), JSON.stringify(entry));
  } catch (error) {
    console.warn(`Failed to persist cache key "${key}" to sessionStorage`, error);
  }
};

const removeFromStorage = (key: string) => {
  const store = getStorage();
  if (!store) {
    return;
  }
  try {
    store.removeItem(buildKey(key));
  } catch (error) {
    console.warn(`Failed to remove cache key "${key}" from sessionStorage`, error);
  }
};

const resolveEntry = <T>(key: string): CacheEntry<T> | undefined => {
  const memoryEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (!isExpired(memoryEntry)) {
    return memoryEntry;
  }

  const storageEntry = readFromStorage<T>(key);
  if (isExpired(storageEntry)) {
    memoryCache.delete(key);
    removeFromStorage(key);
    return undefined;
  }

  if (storageEntry) {
    memoryCache.set(key, storageEntry);
  }
  return storageEntry;
};

const calculateExpiry = (ttlMs?: number) => {
  if (typeof ttlMs !== 'number') {
    return null;
  }
  return Date.now() + Math.max(ttlMs, 0);
};

export interface CacheOptions {
  ttlMs?: number;
  forceRefresh?: boolean;
}

export const getCacheValue = <T>(key: string): T | undefined => {
  const entry = resolveEntry<T>(key);
  return entry?.value;
};

export const setCacheValue = <T>(key: string, value: T, ttlMs?: number) => {
  const entry: CacheEntry<T> = {
    value,
    expiresAt: calculateExpiry(ttlMs),
  };
  memoryCache.set(key, entry);
  writeToStorage(key, entry);
};

export const deleteCacheValue = (key: string) => {
  memoryCache.delete(key);
  removeFromStorage(key);
};

export const clearCacheByPrefix = (prefix: string) => {
  Array.from(memoryCache.keys())
    .filter((key) => key.startsWith(prefix))
    .forEach((key) => memoryCache.delete(key));

  const store = getStorage();
  if (!store) {
    return;
  }

  const keysToRemove: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const storageKey = store.key(i);
    if (storageKey && storageKey.startsWith(CACHE_PREFIX + prefix)) {
      keysToRemove.push(storageKey);
    }
  }
  keysToRemove.forEach((storageKey) => store.removeItem(storageKey));
};

export const withCache = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: CacheOptions,
): Promise<T> => {
  const { ttlMs, forceRefresh } = options ?? {};
  if (!forceRefresh) {
    const cachedValue = getCacheValue<T>(key);
    if (cachedValue !== undefined) {
      return cachedValue;
    }
  }

  const freshValue = await fetcher();
  setCacheValue(key, freshValue, ttlMs);
  return freshValue;
};
