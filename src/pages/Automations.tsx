import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  PlugZap,
  Sparkles,
  Workflow,
} from 'lucide-react';
import AutomationFlowCanvas from '../components/automations/AutomationFlowCanvas';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/apiClient';
import type { AutomationNode, AutomationRunResult, AutomationRunState } from '../types/automations';

interface FocusOption {
  id: string;
  label: string;
  description: string;
}

const focusOptions: FocusOption[] = [
  {
    id: 'overall pipeline performance',
    label: 'Pipeline Health',
    description: 'Surface bottlenecks and orchestration risks.',
  },
  {
    id: 'content quality and ideation velocity',
    label: 'Creative Quality',
    description: 'Elevate briefs, hooks, and storytelling velocity.',
  },
  {
    id: 'automation reliability and release readiness',
    label: 'Automation Reliability',
    description: 'Reinforce scheduling, retries, and runtime stability.',
  },
];

const formatDuration = (ms: number | null | undefined): string => {
  if (ms == null || !Number.isFinite(ms)) {
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

const formatTimestamp = (iso?: string | null): string => {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
};

const formatResponseSnippet = (body: unknown): string => {
  if (body == null) {
    return 'No payload received.';
  }

  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      return 'Empty string received from webhook.';
    }
    return trimmed.length > 200 ? `${trimmed.slice(0, 197)}…` : trimmed;
  }

  try {
    const stringified = JSON.stringify(body, null, 2);
    return stringified.length > 200 ? `${stringified.slice(0, 197)}…` : stringified;
  } catch {
    return 'Unable to display response payload.';
  }
};

export default function Automations() {
  const { user } = useAuth();
  const [nodes, setNodes] = useState<AutomationNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFocus, setSelectedFocus] = useState<string>(focusOptions[0]?.id ?? 'overall pipeline performance');
  const [insights, setInsights] = useState('');
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [runStates, setRunStates] = useState<Record<string, AutomationRunState>>({});
  const isGeneratingRef = useRef(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;

    const loadNodes = async () => {
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
          throw new Error(data?.message ?? 'Unable to load automation map.');
        }

        const data = (await response.json()) as { nodes: AutomationNode[] };
        if (!active) return;
        setNodes(data.nodes);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Unable to load automation map.';
        console.error('Failed to load automations', err);
        setError(message);
        setNodes([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadNodes();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    setRunStates((prev) => {
      const next: Record<string, AutomationRunState> = { ...prev };
      let changed = false;

      nodes.forEach((node) => {
        if (!next[node.code]) {
          next[node.code] = { status: 'idle' };
          changed = true;
        }
      });

      Object.keys(next).forEach((code) => {
        if (!nodes.some((node) => node.code === code)) {
          delete next[code];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [nodes]);

  const generateInsights = useCallback(async () => {
    if (!user || isGeneratingRef.current) {
      return;
    }

    isGeneratingRef.current = true;
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const token = await user.getIdToken();
      const response = await apiFetch('/automations/insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ focus: selectedFocus }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? 'Unable to generate insights.');
      }

      const data = (await response.json()) as { insights: string };
      setInsights(data.insights);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate insights.';
      console.error('Failed to generate automation insights', err);
      setInsightsError(message);
      setInsights('');
    } finally {
      setInsightsLoading(false);
      isGeneratingRef.current = false;
    }
  }, [user, selectedFocus]);

  useEffect(() => {
    if (!user || nodes.length === 0) {
      return;
    }

    void generateInsights();
  }, [user, nodes.length, generateInsights]);

  const handleRun = useCallback(
    async (code: string) => {
      if (!user) {
        return;
      }

      setRunStates((prev) => ({
        ...prev,
        [code]: {
          status: 'running',
          result: prev[code]?.result,
        },
      }));

      try {
        const token = await user.getIdToken();
        const response = await apiFetch(`/automations/run/${code}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        const data = (await response.json().catch(() => null)) as AutomationRunResult | null;
        if (!data) {
          throw new Error('Unexpected response from n8n bridge.');
        }

        setRunStates((prev) => ({
          ...prev,
          [code]: {
            status: response.ok && data.ok ? 'success' : 'error',
            result: data,
          },
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to trigger n8n workflow.';
        const fallback: AutomationRunResult = {
          code,
          ok: false,
          httpStatus: null,
          statusText: 'CLIENT_ERROR',
          webhookUrl: nodes.find((node) => node.code === code)?.webhookUrl ?? null,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          requestPayload: null,
          responseBody: null,
          responseHeaders: {},
          error: message,
        };

        setRunStates((prev) => ({
          ...prev,
          [code]: {
            status: 'error',
            result: fallback,
          },
        }));
      }
    },
    [user, nodes],
  );

  const metrics = useMemo(() => {
    const active = nodes.filter((node) => node.status === 'operational').length;
    const monitoring = nodes.filter((node) => node.status === 'monitor').length;
    const connected = nodes.filter((node) => node.connected).length;

    return [
      {
        label: 'Active Nodes',
        value: active,
        description: 'n8n-ready with AI coverage.',
        icon: Workflow,
      },
      {
        label: 'Under Watch',
        value: monitoring,
        description: 'Requires manual review.',
        icon: AlertTriangle,
      },
      {
        label: 'Connected to n8n',
        value: `${connected}/${nodes.length}`,
        description: 'Webhooks mapped and reachable.',
        icon: PlugZap,
      },
    ];
  }, [nodes]);

  const recentRuns = useMemo(() => {
    return Object.values(runStates)
      .map((state) => state.result)
      .filter((result): result is AutomationRunResult => Boolean(result))
      .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())
      .slice(0, 5);
  }, [runStates]);

  const connectedCount = nodes.filter((node) => node.connected).length;
  const missingN8n = nodes.length > 0 && connectedCount === 0;

  return (
    <div className="space-y-10 text-slate-900 dark:text-slate-100">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-10 text-white shadow-2xl dark:border-slate-800"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_55%)]" />
        <div className="relative z-10 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-sm font-medium">
              <Workflow className="h-4 w-4" />
              SmartOps × n8n Bridge
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Connected Automation Control Room</h1>
            <p className="text-lg text-slate-200">
              Trigger production-grade workflows through n8n webhooks and inspect the responses without leaving SmartOps.
            </p>
            {nodes.length > 0 && (
              <div
                className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold ${
                  missingN8n
                    ? 'border-amber-300/70 bg-amber-500/20 text-amber-100'
                    : 'border-white/30 bg-white/10 text-white/90'
                }`}
              >
                {missingN8n ? (
                  <>
                    <AlertTriangle className="h-4 w-4" />
                    Set <code className="font-mono text-amber-100">N8N_BASE_URL</code> to activate webhook routing.
                  </>
                ) : (
                  <>
                    <PlugZap className="h-4 w-4 text-emerald-300" />
                    {connectedCount} of {nodes.length} nodes wired to n8n
                  </>
                )}
              </div>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-1">
            {metrics.map((metric, index) => (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index, duration: 0.3 }}
                className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-wide text-slate-200/80">{metric.label}</p>
                    <p className="mt-2 text-3xl font-semibold">
                      {typeof metric.value === 'number' ? metric.value : metric.value}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/20 p-3 text-white">
                    <metric.icon className="h-6 w-6" />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-200/70">{metric.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/60 dark:bg-red-500/15 dark:text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            Loading automation map…
          </div>
        </div>
      ) : nodes.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          No automation nodes are registered yet. Connect SmartOps to n8n to populate the canvas.
        </div>
      ) : (
        <div className="grid gap-8 xl:grid-cols-[2fr_1fr]">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            <AutomationFlowCanvas nodes={nodes} runStates={runStates} onRun={handleRun} />
          </motion.div>

          <div className="flex flex-col gap-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.3 }}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">AI Focus</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Pick a lens and let the agent recommend improvements across your n8n-connected pipeline.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {focusOptions.map((option) => {
                    const isActive = selectedFocus === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelectedFocus(option.id)}
                        className={`group rounded-2xl border px-4 py-2 text-left transition ${
                          isActive
                            ? 'border-red-500 bg-red-50 text-red-600 shadow-sm dark:border-red-400 dark:bg-red-500/10 dark:text-red-200'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:bg-red-50/60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-red-400/70 dark:hover:bg-red-500/10'
                        }`}
                      >
                        <p className="text-sm font-semibold">{option.label}</p>
                        <p className="text-xs text-slate-500 group-hover:text-slate-600 dark:text-slate-400 dark:group-hover:text-slate-200">
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => void generateInsights()}
                  className="inline-flex items-center gap-2 self-start rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-red-500/50"
                  disabled={insightsLoading}
                >
                  <Sparkles className="h-4 w-4" />
                  {insightsLoading ? 'Summoning AI…' : 'Refresh AI Synopsis'}
                </button>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                  {insightsLoading ? (
                    <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <motion.div
                        className="h-2 w-2 rounded-full bg-red-500"
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                      />
                      Synthesising guidance with OpenAI…
                    </div>
                  ) : insightsError ? (
                    <div className="flex items-center gap-3 text-sm text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                      {insightsError}
                    </div>
                  ) : insights ? (
                    <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                      {insights.split('\n').map((line, index) => (
                        <p key={index} className="whitespace-pre-wrap leading-relaxed">
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Activate a focus area to request AI-guided recommendations.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Recent n8n Responses</h2>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Every run launched from SmartOps is captured so you can trace webhook health.
              </p>
              <div className="mt-4 space-y-3">
                {recentRuns.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                    Trigger a node to capture telemetry from n8n.
                  </p>
                ) : (
                  recentRuns.map((run) => (
                    <div
                      key={`${run.code}-${run.finishedAt}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{run.code}</span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                            run.ok
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {run.ok ? 'Success' : 'Error'}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        HTTP {run.httpStatus ?? '—'} · {formatDuration(run.durationMs)} · {formatTimestamp(run.finishedAt)}
                      </p>
                      {run.error ? (
                        <p className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                          {run.error}
                        </p>
                      ) : (
                        <p className="mt-2 line-clamp-3 text-[11px] text-slate-400 dark:text-slate-300">
                          {formatResponseSnippet(run.responseBody)}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
}
