import type { AutomationRunResult } from '../types/automations';

export type ScheduleFrequency = 'hourly' | 'daily' | 'weekly';

export interface AutomationScheduleSettings {
  enabled: boolean;
  frequency: ScheduleFrequency;
  timeOfDay: string;
  dayOfWeek: string;
  timezone: string;
}

export const getDefaultSchedule = (): AutomationScheduleSettings => ({
  enabled: false,
  frequency: 'daily',
  timeOfDay: '09:00',
  dayOfWeek: 'monday',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
});

const sanitizeTimeInternal = (value: string): string => {
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    return '09:00';
  }

  const hours = Math.min(23, Math.max(0, Number.parseInt(match[1] ?? '0', 10)));
  const minutes = Math.min(59, Math.max(0, Number.parseInt(match[2] ?? '0', 10)));

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

export const sanitizeTime = (value: string): string => sanitizeTimeInternal(value);

export const normalizeSchedule = (payload: unknown): AutomationScheduleSettings => {
  const defaultSchedule = getDefaultSchedule();

  if (!payload || typeof payload !== 'object') {
    return { ...defaultSchedule };
  }

  const source = payload as Record<string, unknown>;

  const enabledCandidate = source.enabled ?? source.active ?? source.auto ?? source.automatic;
  const enabled = typeof enabledCandidate === 'boolean' ? enabledCandidate : defaultSchedule.enabled;

  const rawFrequency = source.frequency ?? source.interval ?? source.cadence;
  const frequency =
    typeof rawFrequency === 'string'
      ? (['hourly', 'daily', 'weekly'].includes(rawFrequency.toLowerCase())
          ? (rawFrequency.toLowerCase() as ScheduleFrequency)
          : defaultSchedule.frequency)
      : defaultSchedule.frequency;

  const rawTime = source.timeOfDay ?? source.time ?? source.at;
  const timeOfDay = typeof rawTime === 'string' ? sanitizeTimeInternal(rawTime) : defaultSchedule.timeOfDay;

  const rawDay = source.dayOfWeek ?? source.weekday ?? source.day ?? defaultSchedule.dayOfWeek;
  const dayOfWeek = typeof rawDay === 'string' ? rawDay.toLowerCase() : defaultSchedule.dayOfWeek;

  const rawTimezone = source.timezone ?? source.tz ?? defaultSchedule.timezone;
  const timezone =
    typeof rawTimezone === 'string' && rawTimezone.trim().length > 0 ? rawTimezone : defaultSchedule.timezone;

  return {
    enabled,
    frequency,
    timeOfDay,
    dayOfWeek,
    timezone,
  };
};

const coerceRunArray = (value: unknown): AutomationRunResult[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is AutomationRunResult => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.finishedAt === 'string';
    });
  }

  if (typeof value === 'object') {
    const container = value as Record<string, unknown>;
    const keys = ['runs', 'history', 'items', 'data'];

    for (const key of keys) {
      if (Array.isArray(container[key])) {
        return coerceRunArray(container[key]);
      }
    }

    if ('lastRun' in container && container.lastRun && typeof container.lastRun === 'object') {
      return coerceRunArray([container.lastRun]);
    }

    if ('code' in container && 'finishedAt' in container) {
      return coerceRunArray([value]);
    }
  }

  return [];
};

export interface NormalizedRunHistory {
  lastRun: AutomationRunResult | null;
  runs: AutomationRunResult[];
}

export const normalizeRunHistory = (payload: unknown): NormalizedRunHistory => {
  const runs = coerceRunArray(payload);
  const sorted = [...runs].sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime());

  const lastRunCandidate =
    payload && typeof payload === 'object' && 'lastRun' in (payload as Record<string, unknown>)
      ? (payload as Record<string, unknown>).lastRun
      : null;

  const lastRun =
    lastRunCandidate && typeof lastRunCandidate === 'object'
      ? (lastRunCandidate as AutomationRunResult)
      : sorted[0] ?? null;

  return {
    lastRun: lastRun ?? null,
    runs: sorted,
  };
};

export const formatTimestamp = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export const formatDuration = (ms?: number | null): string => {
  if (!Number.isFinite(ms ?? null) || ms == null) {
    return '—';
  }

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  return `${(ms / 60_000).toFixed(1)}m`;
};
