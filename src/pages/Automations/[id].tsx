import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, History, Loader2, Play, Settings2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import type {
  AutomationNode,
  AutomationRunResult,
  AutomationRunState,
} from '../../types/automations';

const formatTimestamp = (value?: string | null) => {
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

const formatDuration = (ms?: number | null) => {
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

type ScheduleFrequency = 'hourly' | 'daily' | 'weekly';

interface AutomationScheduleSettings {
  enabled: boolean;
  frequency: ScheduleFrequency;
  timeOfDay: string;
  dayOfWeek: string;
  timezone: string;
}

const sanitizeTime = (value: string): string => {
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    return '09:00';
  }

  const hours = Math.min(23, Math.max(0, Number.parseInt(match[1] ?? '0', 10)));
  const minutes = Math.min(59, Math.max(0, Number.parseInt(match[2] ?? '0', 10)));

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const DEFAULT_SCHEDULE: AutomationScheduleSettings = {
  enabled: false,
  frequency: 'daily',
  timeOfDay: '09:00',
  dayOfWeek: 'monday',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
};

const HISTORY_LIMIT = 25;

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

const normalizeRunHistory = (
  payload: unknown,
): { lastRun: AutomationRunResult | null; runs: AutomationRunResult[] } => {
  const runs = coerceRunArray(payload);
  const sorted = [...runs].sort(
    (a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime(),
  );

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

const normalizeSchedule = (payload: unknown): AutomationScheduleSettings => {
  if (!payload || typeof payload !== 'object') {
    return { ...DEFAULT_SCHEDULE };
  }

  const source = payload as Record<string, unknown>;

  const enabledCandidate = source.enabled ?? source.active ?? source.auto ?? source.automatic;
  const enabled = typeof enabledCandidate === 'boolean' ? enabledCandidate : DEFAULT_SCHEDULE.enabled;

  const rawFrequency = source.frequency ?? source.interval ?? source.cadence;
  const frequency =
    typeof rawFrequency === 'string'
      ? (['hourly', 'daily', 'weekly'].includes(rawFrequency.toLowerCase())
          ? (rawFrequency.toLowerCase() as ScheduleFrequency)
          : DEFAULT_SCHEDULE.frequency)
      : DEFAULT_SCHEDULE.frequency;

  const rawTime = source.timeOfDay ?? source.time ?? source.at;
  const timeOfDay = typeof rawTime === 'string' ? sanitizeTime(rawTime) : DEFAULT_SCHEDULE.timeOfDay;

  const rawDay = source.dayOfWeek ?? source.weekday ?? source.day ?? DEFAULT_SCHEDULE.dayOfWeek;
  const dayOfWeek = typeof rawDay === 'string' ? rawDay.toLowerCase() : DEFAULT_SCHEDULE.dayOfWeek;

  const rawTimezone = source.timezone ?? source.tz ?? DEFAULT_SCHEDULE.timezone;
  const timezone =
    typeof rawTimezone === 'string' && rawTimezone.trim().length > 0
      ? rawTimezone
      : DEFAULT_SCHEDULE.timezone;

  return {
    enabled,
    frequency,
    timeOfDay,
    dayOfWeek,
    timezone,
  };
};

export default function AutomationDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [automation, setAutomation] = useState<AutomationNode | null>(null);
  const [lastRun, setLastRun] = useState<AutomationRunResult | null>(null);
  const [runHistory, setRunHistory] = useState<AutomationRunResult[]>([]);
  const [runState, setRunState] = useState<AutomationRunState>({ status: 'idle' });
  const [runFeedback, setRunFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runHistoryLoading, setRunHistoryLoading] = useState(false);
  const [schedule, setSchedule] = useState<AutomationScheduleSettings>({ ...DEFAULT_SCHEDULE });
  const [savedSchedule, setSavedSchedule] = useState<AutomationScheduleSettings>({ ...DEFAULT_SCHEDULE });
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleFeedback, setScheduleFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchRunHistory = async (token: string) => {
      setRunHistoryLoading(true);
      try {
        const response = await apiFetch(`/automations/runs/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!active) return;

        if (response.ok) {
          const payload = await response.json().catch(() => null);
          if (!active) return;
          const normalized = normalizeRunHistory(payload);
          setLastRun(normalized.lastRun);
          setRunHistory(normalized.runs);
        } else {
          setLastRun(null);
          setRunHistory([]);
        }
      } catch (runError) {
        if (!active) return;
        console.warn('Unable to load automation run history', runError);
        setLastRun(null);
        setRunHistory([]);
      } finally {
        if (active) {
          setRunHistoryLoading(false);
        }
      }
    };

    const fetchScheduleSettings = async (token: string) => {
      setScheduleLoading(true);
      setScheduleError(null);
      try {
        const response = await apiFetch(`/automations/${id}/schedule`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!active) return;

        if (response.ok) {
          const payload = await response.json().catch(() => null);
          if (!active) return;
          const normalized = normalizeSchedule(payload);
          setSchedule({ ...normalized });
          setSavedSchedule({ ...normalized });
        } else if (response.status === 404) {
          setSchedule({ ...DEFAULT_SCHEDULE });
          setSavedSchedule({ ...DEFAULT_SCHEDULE });
        } else {
          const data = (await response.json().catch(() => null)) as { message?: string } | null;
          setScheduleError(data?.message ?? 'Unable to load automation schedule.');
          setSchedule({ ...DEFAULT_SCHEDULE });
          setSavedSchedule({ ...DEFAULT_SCHEDULE });
        }
      } catch (scheduleLoadError) {
        if (!active) return;
        console.warn('Unable to load automation schedule', scheduleLoadError);
        setScheduleError('Unable to load automation schedule.');
        setSchedule({ ...DEFAULT_SCHEDULE });
        setSavedSchedule({ ...DEFAULT_SCHEDULE });
      } finally {
        if (active) {
          setScheduleLoading(false);
        }
      }
    };

    const loadDetails = async () => {
      if (!user) {
        setAutomation(null);
        setLastRun(null);
        setRunHistory([]);
        setError('You need to be logged in to view this automation.');
        setSchedule({ ...DEFAULT_SCHEDULE });
        setSavedSchedule({ ...DEFAULT_SCHEDULE });
        setScheduleLoading(false);
        setRunHistoryLoading(false);
        setLoading(false);
        return;
      }

      if (!id) {
        setError('Automation not found.');
        setAutomation(null);
        setLastRun(null);
        setRunHistory([]);
        setSchedule({ ...DEFAULT_SCHEDULE });
        setSavedSchedule({ ...DEFAULT_SCHEDULE });
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const token = await user.getIdToken();
        const response = await apiFetch('/automations', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(data?.message ?? 'Unable to load automations.');
        }

        const data = (await response.json()) as { nodes: AutomationNode[] };
        if (!active) return;

        const match = data.nodes.find((node) => node.code === id);
        if (!match || match.code === 'VPE') {
          setError('Automation not found.');
          setAutomation(null);
          setLastRun(null);
          setRunHistory([]);
          setSchedule({ ...DEFAULT_SCHEDULE });
          setSavedSchedule({ ...DEFAULT_SCHEDULE });
          setLoading(false);
          return;
        }

        setAutomation(match);

        await Promise.all([fetchRunHistory(token), fetchScheduleSettings(token)]);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Unable to load automation.';
        console.error('Failed to load automation details', err);
        setError(message);
        setAutomation(null);
        setLastRun(null);
        setRunHistory([]);
        setSchedule({ ...DEFAULT_SCHEDULE });
        setSavedSchedule({ ...DEFAULT_SCHEDULE });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadDetails();

    return () => {
      active = false;
    };
  }, [id, user]);

  const statusPill = useMemo(() => {
    if (!automation) return null;
    if (automation.connected) {
      return (
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-sm text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-current" />Connected
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
        <span className="h-2 w-2 rounded-full bg-current" />Not Connected
      </span>
    );
  }, [automation]);

  useEffect(() => {
    if (!runFeedback) return;
    if (typeof window === 'undefined') return;
    const timeout = window.setTimeout(() => setRunFeedback(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [runFeedback]);

  useEffect(() => {
    if (!scheduleFeedback) return;
    if (typeof window === 'undefined') return;
    const timeout = window.setTimeout(() => setScheduleFeedback(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [scheduleFeedback]);

  const handleRunAutomation = async () => {
    if (!user || !automation) {
      return;
    }

    setRunFeedback(null);
    setRunState((prev) => ({
      ...prev,
      status: 'running',
    }));

    try {
      const token = await user.getIdToken();
      const response = await apiFetch(`/automations/run/${automation.code}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = (await response
        .clone()
        .json()
        .catch(() => null)) as AutomationRunResult | null;

      let result: AutomationRunResult;

      if (payload) {
        result = payload;
      } else {
        const rawBody = await response.text().catch(() => null);
        const headersRecord = Object.fromEntries(response.headers.entries()) as Record<string, string>;
        const now = new Date().toISOString();

        result = {
          code: automation.code,
          ok: response.ok,
          httpStatus: Number.isFinite(response.status) ? response.status : null,
          statusText: response.statusText || null,
          webhookUrl: automation.webhookUrl ?? null,
          startedAt: now,
          finishedAt: now,
          durationMs: 0,
          requestPayload: null,
          responseBody: rawBody && rawBody.length > 0 ? rawBody : null,
          responseHeaders: headersRecord,
          ...(response.ok
            ? {}
            : { error: rawBody && rawBody.length > 0 ? rawBody : 'Unexpected response from n8n bridge.' }),
        };
      }

      setRunState({
        status: response.ok && result.ok ? 'success' : 'error',
        result,
      });

      setLastRun(result);
      setRunHistory((prev) => {
        const filtered = prev.filter(
          (entry) => !(entry.code === result.code && entry.finishedAt === result.finishedAt),
        );
        const next = [result, ...filtered];
        return next
          .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())
          .slice(0, HISTORY_LIMIT);
      });

      setRunFeedback({
        type: response.ok && result.ok ? 'success' : 'error',
        message:
          response.ok && result.ok
            ? 'Automation triggered successfully.'
            : 'The automation reported an issue. Review the response for details.',
      });
    } catch (runError) {
      const message =
        runError instanceof Error ? runError.message : 'Unable to trigger automation run.';
      const now = new Date().toISOString();
      const fallback: AutomationRunResult = {
        code: automation.code,
        ok: false,
        httpStatus: null,
        statusText: 'CLIENT_ERROR',
        webhookUrl: automation.webhookUrl ?? null,
        startedAt: now,
        finishedAt: now,
        durationMs: 0,
        requestPayload: null,
        responseBody: null,
        responseHeaders: {},
        error: message,
      };

      setRunState({
        status: 'error',
        result: fallback,
      });

      setLastRun(fallback);
      setRunHistory((prev) => {
        const next = [fallback, ...prev];
        return next
          .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())
          .slice(0, HISTORY_LIMIT);
      });
      setRunFeedback({ type: 'error', message });
    }
  };

  const handleScheduleChange = (updates: Partial<AutomationScheduleSettings>) => {
    setSchedule((prev) => ({
      ...prev,
      ...updates,
    }));
    setScheduleError(null);
  };

  const handleScheduleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!user || !automation) {
      return;
    }

    setScheduleSaving(true);
    setScheduleFeedback(null);

    try {
      const token = await user.getIdToken();
      const payload = schedule.enabled
        ? {
            enabled: true,
            frequency: schedule.frequency,
            timeOfDay: schedule.timeOfDay,
            dayOfWeek: schedule.dayOfWeek,
            timezone: schedule.timezone,
          }
        : { enabled: false };

      const response = await apiFetch(`/automations/${automation.code}/schedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? 'Unable to update automation schedule.');
      }

      const updatedPayload = await response.json().catch(() => payload);
      const normalized = normalizeSchedule(updatedPayload);
      setSchedule({ ...normalized });
      setSavedSchedule({ ...normalized });
      setScheduleFeedback('Schedule saved');
    } catch (scheduleSaveError) {
      const message =
        scheduleSaveError instanceof Error
          ? scheduleSaveError.message
          : 'Unable to update automation schedule.';
      setScheduleError(message);
    } finally {
      setScheduleSaving(false);
    }
  };

  const scheduleFrequencyLabel: Record<ScheduleFrequency, string> = {
    hourly: 'Hourly',
    daily: 'Daily',
    weekly: 'Weekly',
  };

  const dayOptions = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];

  return (
    <div className="space-y-8 text-slate-100">
      <button
        type="button"
        onClick={() => navigate('/automations')}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to automations
      </button>

      {loading ? (
        <div className="flex items-center justify-center rounded-3xl border border-slate-800 bg-slate-950/60 py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-900/80 bg-rose-950/40 p-6 text-sm text-rose-200">{error}</div>
      ) : !automation ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">
          Automation details unavailable.
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-8"
        >
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">{automation.title}</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-400">{automation.description}</p>
              </div>
              {statusPill}
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 shadow-lg shadow-black/30">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Why it matters</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{automation.function}</p>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950/60 p-6 shadow-lg shadow-black/30">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                <Settings2 className="h-4 w-4" />
                Webhook URL
              </h2>
              <p className="break-words text-sm text-slate-300">
                {automation.webhookUrl ? (
                  <span className="font-mono text-xs text-slate-200">{automation.webhookUrl}</span>
                ) : (
                  'Webhook has not been configured yet.'
                )}
              </p>
            </div>
            <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950/60 p-6 shadow-lg shadow-black/30">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                <Play className="h-4 w-4" />
                Run automation
              </h2>
              <p className="text-sm text-slate-400">
                Trigger this workflow on demand to verify integrations or push the latest data live.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => void handleRunAutomation()}
                  disabled={runState.status === 'running'}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:bg-red-500/50"
                >
                  {runState.status === 'running' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {runState.status === 'running' ? 'Running…' : 'Run automation'}
                </button>
                {runState.result && (
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      runState.status === 'success'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : runState.status === 'error'
                          ? 'bg-amber-500/15 text-amber-200'
                          : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {runState.status === 'running'
                      ? 'Running'
                      : runState.status === 'success'
                        ? 'Success'
                        : runState.status === 'error'
                          ? 'Needs attention'
                          : 'Idle'}
                  </span>
                )}
              </div>
              {runFeedback && (
                <p
                  className={`text-xs ${
                    runFeedback.type === 'success' ? 'text-emerald-300' : 'text-amber-200'
                  }`}
                >
                  {runFeedback.message}
                </p>
              )}
            </div>
            <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950/60 p-6 shadow-lg shadow-black/30">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                <Clock className="h-4 w-4" />
                Last run
              </h2>
              {lastRun ? (
                <div className="space-y-2 text-sm text-slate-300">
                  <p>
                    <span className="text-slate-400">Completed:</span> {formatTimestamp(lastRun.finishedAt)}
                  </p>
                  <p>
                    <span className="text-slate-400">Status:</span>{' '}
                    <span
                      className={`font-semibold ${lastRun.ok ? 'text-emerald-300' : 'text-amber-200'}`}
                    >
                      {lastRun.ok ? 'Success' : 'Needs Attention'}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-400">Duration:</span> {formatDuration(lastRun.durationMs)}
                  </p>
                  <p>
                    <span className="text-slate-400">HTTP Status:</span> {lastRun.httpStatus ?? '—'}
                  </p>
                  {lastRun.error && (
                    <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      {lastRun.error}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No runs have been recorded yet.</p>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-6 shadow-lg shadow-black/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                <History className="h-4 w-4" />
                Run history
              </h2>
              {runHistoryLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
            </div>
            {runHistory.length === 0 ? (
              <p className="text-sm text-slate-400">No previous activity recorded for this automation.</p>
            ) : (
              <div className="space-y-3">
                {runHistory.map((run) => (
                  <div
                    key={`${run.code}-${run.finishedAt}`}
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-100">{formatTimestamp(run.finishedAt)}</p>
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                          run.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200'
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full bg-current" />
                        {run.ok ? 'Success' : 'Needs Attention'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      HTTP {run.httpStatus ?? '—'} · Duration {formatDuration(run.durationMs)} · Started{' '}
                      {formatTimestamp(run.startedAt)}
                    </p>
                    {run.error ? (
                      <p className="mt-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        {run.error}
                      </p>
                    ) : run.responseBody ? (
                      <pre className="mt-2 max-h-40 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
                        {typeof run.responseBody === 'string'
                          ? run.responseBody
                          : JSON.stringify(run.responseBody, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-6 shadow-lg shadow-black/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                <Settings2 className="h-4 w-4" />
                Schedule settings
              </h2>
              {scheduleLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
            </div>
            <p className="text-sm text-slate-400">
              Define when SmartOps should execute this automation automatically. Manual runs are always available
              even when scheduling is turned off.
            </p>
            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              <label className="flex items-center gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-red-500 focus:ring-red-500/60"
                  checked={schedule.enabled}
                  onChange={(event) =>
                    handleScheduleChange({ enabled: event.target.checked })
                  }
                  disabled={scheduleLoading || scheduleSaving}
                />
                Enable automatic runs
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                  Frequency
                  <select
                    className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-red-500/60 focus:outline-none focus:ring-1 focus:ring-red-500/40"
                    value={schedule.frequency}
                    onChange={(event) =>
                      handleScheduleChange({
                        frequency: event.target.value as ScheduleFrequency,
                      })
                    }
                    disabled={!schedule.enabled || scheduleLoading || scheduleSaving}
                  >
                    {Object.entries(scheduleFrequencyLabel).map(([value, label]) => (
                      <option key={value} value={value} className="bg-slate-950">
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                  Time of day
                  <input
                    type="time"
                    value={schedule.timeOfDay}
                    onChange={(event) =>
                      handleScheduleChange({ timeOfDay: sanitizeTime(event.target.value) })
                    }
                    className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-red-500/60 focus:outline-none focus:ring-1 focus:ring-red-500/40"
                    disabled={
                      !schedule.enabled || scheduleLoading || scheduleSaving || schedule.frequency === 'hourly'
                    }
                  />
                </label>
              </div>

              {schedule.frequency === 'weekly' && (
                <label className="space-y-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                  Day of week
                  <select
                    className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-red-500/60 focus:outline-none focus:ring-1 focus:ring-red-500/40"
                    value={schedule.dayOfWeek}
                    onChange={(event) =>
                      handleScheduleChange({ dayOfWeek: event.target.value.toLowerCase() })
                    }
                    disabled={!schedule.enabled || scheduleLoading || scheduleSaving}
                  >
                    {dayOptions.map((day) => (
                      <option key={day} value={day} className="bg-slate-950">
                        {day.charAt(0).toUpperCase() + day.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Timezone</p>
                <p className="rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
                  {schedule.timezone}
                </p>
              </div>

              {scheduleError && (
                <p className="text-xs text-amber-200">{scheduleError}</p>
              )}
              {scheduleFeedback && (
                <p className="text-xs text-emerald-300">{scheduleFeedback}</p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={scheduleSaving || scheduleLoading}
                  className="inline-flex items-center gap-2 rounded-2xl bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:bg-red-500/50"
                >
                  {scheduleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {scheduleSaving ? 'Saving…' : 'Save schedule'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSchedule({ ...savedSchedule });
                    setScheduleError(null);
                    setScheduleFeedback(null);
                  }}
                  disabled={scheduleSaving || scheduleLoading}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                >
                  Reset changes
                </button>
              </div>
            </form>
          </section>
        </motion.div>
      )}
    </div>
  );
}
