import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Loader2, PlugZap, Sparkles, Workflow } from 'lucide-react';
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
    label: 'Workflow Stability',
    description: 'Spot blockers before they slow down delivery.',
  },
  {
    id: 'content quality and ideation velocity',
    label: 'Content Performance',
    description: 'See which ideas and assets are resonating.',
  },
  {
    id: 'automation reliability and release readiness',
    label: 'System Uptime',
    description: 'Monitor handoffs, retries, and publishing health.',
  },
];

interface EnrichedAutomationNode extends AutomationNode {
  tooltip?: string;
}

const automationCopy: Record<
  string,
  {
    title: string;
    description: string;
    function: string;
    tooltip: string;
    order: number;
    step: string;
  }
> = {
  CCC: {
    title: 'AI Content Planner',
    description: 'Builds a full social media calendar with AI-generated post ideas, hooks, and visuals.',
    function: 'Keeps your content flow consistent and aligned with campaigns.',
    tooltip: 'Plan channel content with AI support and campaign alignment.',
    order: 1,
    step: 'Stage 1 · Plan',
  },
  VPE: {
    title: 'Smart Video Editor',
    description: 'Auto-edits raw footage, adds captions, and exports platform-ready clips.',
    function: 'Saves editors time and ensures every video follows brand style.',
    tooltip: 'Deliver polished clips without manual editing marathons.',
    order: 2,
    step: 'Stage 2 · Edit',
  },
  USP: {
    title: 'Engagement Scheduler',
    description: 'Calculates the best posting times using audience engagement patterns.',
    function: 'Publishes when your followers are most active — no guesswork needed.',
    tooltip: 'Schedule posts for the moments your community shows up.',
    order: 3,
    step: 'Stage 3 · Schedule',
  },
  UMS: {
    title: 'Asset Library Manager',
    description: 'Organizes all approved images and videos into searchable, reusable folders.',
    function: 'Keeps teams from re-uploading or losing key creative assets.',
    tooltip: 'Maintain an always-ready library of finished visuals.',
    order: 4,
    step: 'Stage 4 · Organize',
  },
  AL: {
    title: 'Account Sync Hub',
    description: 'Connects TikTok, Instagram, and YouTube through secure OAuth tokens.',
    function: 'Keeps brand channels linked and prevents failed uploads.',
    tooltip: 'Keep every channel authenticated and ready for launch.',
    order: 5,
    step: 'Stage 5 · Connect',
  },
  AR: {
    title: 'Workflow Guardrails',
    description: 'Sets publishing triggers, content approval steps, and safety checks.',
    function: 'Protects brand reputation and keeps automation under control.',
    tooltip: 'Define approvals and safeguards before content ships.',
    order: 6,
    step: 'Stage 6 · Safeguard',
  },
  WAU: {
    title: 'Auto Publisher',
    description: 'Pushes approved posts and videos to every connected account on schedule.',
    function: 'Removes manual posting so campaigns go live automatically.',
    tooltip: 'Launch every deliverable without late-night uploads.',
    order: 7,
    step: 'Stage 7 · Launch',
  },
  MAO: {
    title: 'Performance Insights',
    description: 'Collects weekly analytics and ranks your top-performing social posts.',
    function: 'Shows what content drives engagement so you can repeat success.',
    tooltip: 'Spot standout work and double down on what resonates.',
    order: 8,
    step: 'Stage 8 · Review',
  },
};

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
  const [nodes, setNodes] = useState<EnrichedAutomationNode[]>([]);
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
      setNodes([]);
      setError(null);
      setLoading(false);
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
        const enriched = data.nodes.map<EnrichedAutomationNode>((node) => {
          const overrides = automationCopy[node.code];

          return {
            ...node,
            title: overrides?.title ?? node.title,
            description: overrides?.description ?? node.description,
            function: overrides?.function ?? node.function,
            step: overrides?.step ?? node.step,
            tooltip: overrides?.tooltip ?? node.function,
            sequence: overrides?.order ?? node.sequence,
          };
        });
        setNodes(enriched);
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

        const data = (await response
          .clone()
          .json()
          .catch(() => null)) as AutomationRunResult | null;

        if (data) {
          setRunStates((prev) => ({
            ...prev,
            [code]: {
              status: response.ok && data.ok ? 'success' : 'error',
              result: data,
            },
          }));
          return;
        }

        const rawBody = await response.text().catch(() => null);
        const headersRecord = Object.fromEntries(response.headers.entries()) as Record<string, string>;
        const fallback: AutomationRunResult = {
          code,
          ok: response.ok,
          httpStatus: Number.isFinite(response.status) ? response.status : null,
          statusText: response.statusText || null,
          webhookUrl: nodes.find((node) => node.code === code)?.webhookUrl ?? null,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          requestPayload: null,
          responseBody: rawBody && rawBody.length > 0 ? rawBody : null,
          responseHeaders: headersRecord,
          ...(response.ok
            ? {}
            : { error: rawBody && rawBody.length > 0 ? rawBody : 'Unexpected response from n8n bridge.' }),
        };

        setRunStates((prev) => ({
          ...prev,
          [code]: {
            status: response.ok ? 'success' : 'error',
            result: fallback,
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
        label: 'Operational',
        value: active,
        description: 'Nodes ready for production triggers.',
        icon: Workflow,
      },
      {
        label: 'Needs Review',
        value: monitoring,
        description: 'Flagged by SmartOps for attention.',
        icon: AlertTriangle,
      },
      {
        label: 'n8n Linked',
        value: `${connected}/${nodes.length || 0}`,
        description: 'Webhooks wired into n8n bridge.',
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

  const resolveAutomationTitle = useCallback(
    (code: string | null | undefined) => nodes.find((node) => node.code === code)?.title ?? 'Automation',
    [nodes],
  );

  const connectedCount = nodes.filter((node) => node.connected).length;
  const missingN8n = nodes.length > 0 && connectedCount === 0;
  const latestRun = recentRuns[0];
  const latestRunTitle = latestRun ? resolveAutomationTitle(latestRun.code) : null;

  return (
    <div className="space-y-10 text-slate-900 dark:text-slate-100">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-10 text-white shadow-2xl dark:border-slate-800"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_55%)]" />
        <div className="relative z-10 flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-sm font-medium">
              <Workflow className="h-4 w-4" />
              SmartOps × n8n Bridge
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight">SmartOps Automation Dashboard</h1>
              <p className="text-lg text-slate-200">
                Blend SmartOps orchestration with n8n webhooks. Launch marketing automations, monitor outcomes, and keep
                every campaign moving.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-white/70">Bridge Status</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {missingN8n ? 'Configuration Needed' : 'Live Connection'}
                </p>
                <p className="mt-1 text-sm text-white/70">
                  {missingN8n
                    ? 'Add N8N_BASE_URL to sync SmartOps triggers with your n8n instance.'
                    : `${connectedCount} of ${nodes.length} nodes are actively synced with n8n.`}
                </p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-white/70">Latest Activity</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {recentRuns[0] ? formatTimestamp(recentRuns[0].finishedAt) : 'Awaiting runs'}
                </p>
                <p className="mt-1 text-sm text-white/70">
                  {latestRun
                    ? `${latestRunTitle} ${latestRun.ok ? 'ran successfully' : 'needs attention.'}`
                    : 'Run an automation to see live results.'}
                </p>
              </div>
            </div>
          </div>
          <div className="relative flex w-full max-w-md flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur-lg">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-1 h-5 w-5 text-amber-300" />
              <div className="space-y-1">
                <p className="text-sm font-semibold uppercase tracking-wide text-white/80">n8n Automation Playbook</p>
                <p className="text-sm text-white/70">
                  Follow the checklist to keep your production automations healthy.
                </p>
              </div>
            </div>
            <ul className="space-y-3 text-sm text-white/80">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-300" />
                <span>Confirm each node webhook URL responds to a <code className="rounded bg-white/10 px-1">POST</code> ping.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-sky-300" />
                <span>Mirror SmartOps payload contracts inside your n8n workflows.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 rounded-full bg-rose-300" />
                <span>Schedule synthetic runs weekly to catch authentication drift.</span>
              </li>
            </ul>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
        className="grid gap-4 md:grid-cols-3"
      >
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index, duration: 0.3 }}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{metric.label}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">{metric.value}</p>
              </div>
              <div className="rounded-xl bg-red-500/10 p-3 text-red-500 dark:bg-red-500/20 dark:text-red-300">
                <metric.icon className="h-6 w-6" />
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{metric.description}</p>
          </motion.div>
        ))}
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
              transition={{ delay: 0.12, duration: 0.3 }}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Bridge Diagnostics</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Snapshot of node reachability and environment variables for the n8n connector.
                  </p>
                </div>
                <PlugZap className="h-5 w-5 text-red-500 dark:text-red-300" />
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Environment</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">N8N_BASE_URL</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      missingN8n
                        ? 'bg-amber-500/20 text-amber-500 dark:bg-amber-500/10 dark:text-amber-300'
                        : 'bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
                    }`}
                  >
                    {missingN8n ? 'Missing' : 'Detected'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Linked Nodes</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{connectedCount}</p>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{nodes.length} total mapped</p>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Last Response</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {recentRuns[0] ? formatTimestamp(recentRuns[0].finishedAt) : 'Pending'}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {recentRuns[0] ? (recentRuns[0].ok ? 'Healthy webhook' : 'Check logs for errors') : 'Run any workflow'}
                  </p>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.3 }}
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
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void generateInsights()}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-red-500/50"
                    disabled={insightsLoading}
                  >
                    <Sparkles className="h-4 w-4" />
                    {insightsLoading ? 'Generating AI Insights…' : 'Refresh AI Synopsis'}
                  </button>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedFocus === 'automation reliability and release readiness'
                      ? 'Great for quarterly release reviews.'
                      : selectedFocus === 'content quality and ideation velocity'
                        ? 'Track creative freshness before campaigns launch.'
                        : 'Keep an eye on throughput and error budgets.'}
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                  {insightsLoading ? (
                    <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <motion.div
                        className="h-2 w-2 rounded-full bg-red-500"
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                      />
                      Generating AI Insights…
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
              transition={{ delay: 0.24, duration: 0.3 }}
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
                    Run an automation to see live results.
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
