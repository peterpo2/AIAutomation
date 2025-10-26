import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import type { AutomationNode, AutomationRunResult } from '../../types/automations';

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

export default function AutomationDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [automation, setAutomation] = useState<AutomationNode | null>(null);
  const [lastRun, setLastRun] = useState<AutomationRunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadDetails = async () => {
      if (!user) {
        setAutomation(null);
        setLastRun(null);
        setError('You need to be logged in to view this automation.');
        setLoading(false);
        return;
      }

      if (!id) {
        setError('Automation not found.');
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
          setLoading(false);
          return;
        }

        setAutomation(match);

        try {
          const historyResponse = await apiFetch(`/automations/runs/${id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (historyResponse.ok) {
            const history = (await historyResponse.json().catch(() => null)) as
              | { lastRun?: AutomationRunResult | null }
              | AutomationRunResult
              | null;

            if (history && 'lastRun' in (history as { lastRun?: AutomationRunResult | null })) {
              setLastRun((history as { lastRun?: AutomationRunResult | null }).lastRun ?? null);
            } else if (history && 'code' in (history as AutomationRunResult)) {
              setLastRun(history as AutomationRunResult);
            } else {
              setLastRun(null);
            }
          } else {
            setLastRun(null);
          }
        } catch (runError) {
          console.warn('Unable to load automation run history', runError);
          setLastRun(null);
        }
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Unable to load automation.';
        console.error('Failed to load automation details', err);
        setError(message);
        setAutomation(null);
        setLastRun(null);
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

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950/60 p-6 shadow-lg shadow-black/30">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Webhook URL</h2>
              <p className="break-words text-sm text-slate-300">
                {automation.webhookUrl ? (
                  <span className="font-mono text-xs text-slate-200">{automation.webhookUrl}</span>
                ) : (
                  'Webhook has not been configured yet.'
                )}
              </p>
            </div>
            <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950/60 p-6 shadow-lg shadow-black/30">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Last run</h2>
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
                </div>
              ) : (
                <p className="text-sm text-slate-400">No runs have been recorded yet.</p>
              )}
            </div>
          </section>
        </motion.div>
      )}
    </div>
  );
}
