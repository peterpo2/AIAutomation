import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Play, RefreshCcw } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import type { AutomationDetail, AutomationRunResponse } from '../../types/automations';

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const formatStatus = (status: string) => {
  if (!status) return 'Unknown';
  if (status === 'success') return 'Succeeded';
  if (status === 'error') return 'Failed';
  return status.replace(/_/g, ' ');
};

export default function AutomationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [detail, setDetail] = useState<AutomationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!user || !id) {
      return;
    }
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const token = await user.getIdToken();
      const response = await apiFetch(`/automations/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Unable to load automation.');
      }
      const payload = (await response.json()) as { node: AutomationDetail };
      setDetail(payload.node);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load automation.';
      setError(message);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleRun = useCallback(async () => {
    if (!user || !id) {
      return;
    }
    setRunning(true);
    setFeedback(null);
    try {
      const token = await user.getIdToken();
      const response = await apiFetch(`/automations/run/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Automation run failed.');
      }
      const payload = (await response.json()) as AutomationRunResponse;
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              ...payload.automation,
              executions: [payload.execution, ...prev.executions].slice(0, 25),
            }
          : prev,
      );
      const cascadeCount = payload.cascade?.length ?? 0;
      setFeedback(
        cascadeCount > 0
          ? `Workflow triggered ${cascadeCount + 1} connected steps.`
          : 'Workflow triggered successfully.',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Automation run failed.';
      setFeedback(message);
    } finally {
      setRunning(false);
    }
  }, [id, user]);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <button
        type="button"
        onClick={() => navigate('/automations')}
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-rose-200 hover:text-rose-100"
      >
        <ArrowLeft className="h-4 w-4" /> Back to automation map
      </button>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-slate-200">
          <Loader2 className="mr-3 h-5 w-5 animate-spin" /> Loading automation…
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-800/70 bg-slate-900/70 p-10 text-center text-slate-200">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void loadDetail()}
            className="inline-flex items-center gap-2 rounded-full border border-rose-500/60 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
          >
            <RefreshCcw className="h-4 w-4" /> Retry
          </button>
        </div>
      ) : detail ? (
        <div className="space-y-8">
          <div className="rounded-3xl border border-slate-800/70 bg-slate-950/70 p-8">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                {detail.headline}
              </span>
              <h1 className="text-3xl font-semibold text-white">{detail.name}</h1>
              <p className="text-sm leading-relaxed text-slate-300">{detail.description}</p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Workflow outputs</h2>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {detail.deliverables.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">AI assistance</h2>
                <p className="mt-3 text-sm text-slate-300">{detail.aiAssist}</p>
              </div>
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Logic</h2>
                <p className="mt-3 text-sm text-slate-300">{detail.function}</p>
              </div>
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Dependencies</h2>
                <p className="mt-3 text-sm text-slate-300">
                  {detail.dependencies.length > 0 ? detail.dependencies.join(', ') : 'None'}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => void handleRun()}
                disabled={running}
                className={`inline-flex items-center gap-2 rounded-2xl border border-rose-500/60 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-rose-100 transition ${
                  running ? 'bg-rose-500/5 opacity-60' : 'bg-rose-500/10 hover:bg-rose-500/20'
                }`}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run automation
              </button>
              <span className="text-xs text-slate-500">Last run: {formatDateTime(detail.lastRun)}</span>
            </div>

            {feedback ? <p className="mt-4 text-sm text-rose-200">{feedback}</p> : null}
          </div>

          <div className="rounded-3xl border border-slate-800/70 bg-slate-950/70 p-8">
            <h2 className="text-lg font-semibold text-white">Run history</h2>
            {detail.executions.length === 0 ? (
              <p className="mt-4 text-sm text-slate-300">No executions recorded yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {detail.executions.map((run) => (
                  <li key={run.id} className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
                    <div className="flex items-center justify-between text-sm text-slate-200">
                      <span className="font-semibold text-rose-200">{formatStatus(run.status)}</span>
                      <span className="text-xs text-slate-400">{formatDateTime(run.startedAt)}</span>
                    </div>
                    {run.logs ? (
                      <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs text-slate-300">
                        {run.logs}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
