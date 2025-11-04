import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, History, Loader2, Play } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import type {
  AutomationNode,
  AutomationRunResult,
  AutomationRunState,
} from '../../types/automations';
import {
  formatDuration,
  formatTimestamp,
  getDefaultSchedule,
  normalizeRunHistory,
  normalizeSchedule,
  sanitizeTime,
  type AutomationScheduleSettings,
  type ScheduleFrequency,
} from '../../utils/automations';

const DEFAULT_SCHEDULE = getDefaultSchedule();

const HISTORY_LIMIT = 25;

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
  const [activeTab, setActiveTab] = useState<'parameters' | 'settings' | 'history'>('parameters');

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

  useEffect(() => {
    setActiveTab('parameters');
  }, [automation?.code]);

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

  const tabItems: { id: typeof activeTab; label: string }[] = [
    { id: 'parameters', label: 'Parameters' },
    { id: 'settings', label: 'Settings' },
    { id: 'history', label: 'Run history' },
  ];

  return (
    <div className="space-y-8 text-slate-100">
      <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950/60 shadow-2xl shadow-black/40">
        <div className="relative flex flex-col gap-6 bg-gradient-to-br from-slate-900/80 via-slate-950/90 to-slate-900/80 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => navigate('/automations')}
              className="inline-flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-950/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-300 transition hover:border-rose-500/40 hover:text-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to canvas
            </button>
            {automation ? statusPill : null}
          </div>

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-900/70 bg-rose-950/40 p-6 text-sm text-rose-200">{error}</div>
          ) : !automation ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">
              Automation details unavailable.
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="space-y-8"
            >
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Automation</p>
                    <h1 className="text-3xl font-semibold tracking-tight text-white">{automation.title}</h1>
                  </div>
                  <p className="max-w-3xl text-sm leading-relaxed text-slate-300">{automation.description}</p>
                  <div className="flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.4em] text-slate-500">
                    <span className="rounded-full border border-slate-700/60 px-3 py-1 text-slate-400">
                      Workflow · {automation.code}
                    </span>
                    <span className="rounded-full border border-slate-700/60 px-3 py-1 text-slate-400">
                      Step {automation.sequence.toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-3 text-sm text-slate-300">
                  <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Dependencies</p>
                    <p className="mt-1 text-sm text-slate-200">
                      {automation.dependencies.length > 0 ? automation.dependencies.length : 'None'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Deliverables</p>
                    <p className="mt-1 text-sm text-slate-200">
                      {automation.deliverables.length > 0 ? automation.deliverables.length : 'None'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.45fr)_minmax(0,1.1fr)]">
                <section className="flex flex-col gap-4 rounded-3xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-xl shadow-black/30">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Input</p>
                      <h2 className="text-lg font-semibold text-white">Trigger payload</h2>
                    </div>
                    {runHistoryLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs leading-relaxed text-slate-300">
                    {lastRun && lastRun.requestPayload ? (
                      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-slate-200">
                        {typeof lastRun.requestPayload === 'string'
                          ? lastRun.requestPayload
                          : JSON.stringify(lastRun.requestPayload, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm text-slate-400">No request payload recorded yet.</p>
                    )}
                  </div>
                  <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-400">
                    <p>
                      <span className="font-semibold text-slate-200">Started:</span> {lastRun ? formatTimestamp(lastRun.startedAt) : '—'}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-200">Webhook:</span>{' '}
                      {automation.webhookUrl ? (
                        <span className="break-all font-mono text-[11px] text-rose-200/90">{automation.webhookUrl}</span>
                      ) : (
                        'Not configured'
                      )}
                    </p>
                  </div>
                </section>

                <section className="flex flex-col gap-6 rounded-3xl border border-rose-500/20 bg-slate-950/70 p-6 shadow-xl shadow-black/30">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-rose-200/70">AI workflow</p>
                        <h2 className="text-lg font-semibold text-white">{automation.step}</h2>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRunAutomation()}
                          disabled={runState.status === 'running'}
                          className="inline-flex items-center gap-2 rounded-full bg-rose-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-rose-100 shadow-lg shadow-rose-500/20 transition hover:bg-rose-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {runState.status === 'running' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          {runState.status === 'running' ? 'Executing…' : 'Execute workflow'}
                        </button>
                        {automation.webhookUrl ? (
                          <a
                            href={automation.webhookUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-300 transition hover:border-rose-400/60 hover:text-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
                          >
                            Open webhook
                          </a>
                        ) : null}
                      </div>
                    </div>
                    {runState.result ? (
                      <span
                        className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${
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
                    ) : null}
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

                  <div className="flex flex-wrap gap-2 border-b border-slate-800/70 pb-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    {tabItems.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`rounded-full px-4 py-1 transition ${
                          activeTab === tab.id
                            ? 'bg-rose-500/25 text-rose-100 shadow-lg shadow-rose-500/20'
                            : 'hover:text-rose-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4 text-sm leading-relaxed text-slate-300">
                    {activeTab === 'parameters' ? (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Why it matters</p>
                          <p className="mt-2 text-sm text-slate-200">{automation.function}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">OpenAI instructions</p>
                          {automation.aiAssist ? (
                            <pre className="mt-3 max-h-52 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-slate-200">
                              {automation.aiAssist}
                            </pre>
                          ) : (
                            <p className="mt-3 text-sm text-slate-400">This node does not include AI assistant guidance yet.</p>
                          )}
                        </div>
                        {automation.deliverables.length > 0 ? (
                          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Deliverables</p>
                            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
                              {automation.deliverables.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {automation.dependencies.length > 0 ? (
                          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Dependencies</p>
                            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
                              {automation.dependencies.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {activeTab === 'settings' ? (
                      <div className="space-y-4">
                        <p className="text-sm text-slate-400">
                          Define when SmartOps should execute this automation automatically. Manual runs are available
                          even when scheduling is turned off.
                        </p>
                        <form onSubmit={handleScheduleSubmit} className="space-y-4">
                          <label className="flex items-center gap-3 text-sm text-slate-300">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500/60"
                              checked={schedule.enabled}
                              onChange={(event) =>
                                handleScheduleChange({ enabled: event.target.checked })
                              }
                              disabled={scheduleLoading || scheduleSaving}
                            />
                            Enable automatic runs
                          </label>

                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="space-y-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                              Frequency
                              <select
                                className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 focus:border-rose-500/60 focus:outline-none focus:ring-1 focus:ring-rose-500/40"
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
                            <label className="space-y-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                              Time of day
                              <input
                                type="time"
                                value={schedule.timeOfDay}
                                onChange={(event) =>
                                  handleScheduleChange({ timeOfDay: sanitizeTime(event.target.value) })
                                }
                                className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 focus:border-rose-500/60 focus:outline-none focus:ring-1 focus:ring-rose-500/40"
                                disabled={
                                  !schedule.enabled || scheduleLoading || scheduleSaving || schedule.frequency === 'hourly'
                                }
                              />
                            </label>
                          </div>

                          {schedule.frequency === 'weekly' && (
                            <label className="space-y-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                              Day of week
                              <select
                                className="mt-1 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 focus:border-rose-500/60 focus:outline-none focus:ring-1 focus:ring-rose-500/40"
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
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Timezone</p>
                            <p className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
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
                              className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:bg-rose-500/60"
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
                              className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-300 transition hover:border-rose-400/60 hover:text-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                            >
                              Reset changes
                            </button>
                          </div>
                        </form>
                      </div>
                    ) : null}

                    {activeTab === 'history' ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                          <span className="inline-flex items-center gap-2"><History className="h-3.5 w-3.5" />Recent runs</span>
                          {runHistoryLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                        </div>
                        {runHistory.length === 0 ? (
                          <p className="text-sm text-slate-400">No previous activity recorded for this automation.</p>
                        ) : (
                          <div className="space-y-3">
                            {runHistory.map((run) => (
                              <div
                                key={`${run.code}-${run.finishedAt}`}
                                className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="font-medium text-slate-100">{formatTimestamp(run.finishedAt)}</p>
                                  <span
                                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${
                                      run.ok
                                        ? 'bg-emerald-500/15 text-emerald-300'
                                        : 'bg-amber-500/15 text-amber-200'
                                    }`}
                                  >
                                    <span className="h-2 w-2 rounded-full bg-current" />
                                    {run.ok ? 'Success' : 'Needs attention'}
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
                                  <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200">
                                    {typeof run.responseBody === 'string'
                                      ? run.responseBody
                                      : JSON.stringify(run.responseBody, null, 2)}
                                  </pre>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="flex flex-col gap-4 rounded-3xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-xl shadow-black/30">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Output</p>
                      <h2 className="text-lg font-semibold text-white">Latest response</h2>
                    </div>
                    {runState.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-300">
                    {lastRun ? (
                      lastRun.error ? (
                        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                          {lastRun.error}
                        </p>
                      ) : lastRun.responseBody ? (
                        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-slate-200">
                          {typeof lastRun.responseBody === 'string'
                            ? lastRun.responseBody
                            : JSON.stringify(lastRun.responseBody, null, 2)}
                        </pre>
                      ) : (
                        <p className="text-sm text-slate-400">The workflow did not return a response body.</p>
                      )
                    ) : (
                      <p className="text-sm text-slate-400">This workflow has not produced an output yet.</p>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-400">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Status</p>
                      <p
                        className={`mt-2 text-sm font-semibold ${
                          lastRun ? (lastRun.ok ? 'text-emerald-300' : 'text-amber-200') : 'text-slate-300'
                        }`}
                      >
                        {lastRun ? (lastRun.ok ? 'Success' : 'Needs attention') : 'Idle'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-400">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">HTTP</p>
                      <p className="mt-2 text-sm text-slate-200">{lastRun ? lastRun.httpStatus ?? '—' : '—'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-400 sm:col-span-2">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Duration</p>
                      <p className="mt-2 text-sm text-slate-200">{lastRun ? formatDuration(lastRun.durationMs) : '—'}</p>
                    </div>
                  </div>
                </section>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
