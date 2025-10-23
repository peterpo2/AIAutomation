import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  Cpu,
  Layers3,
  LineChart,
  PlayCircle,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { AutomationNode, AutomationStatus } from '../types/automations';

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

const statusAccent: Record<AutomationStatus, { badge: string; dot: string; border: string }> = {
  operational: {
    badge: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    border: 'border-emerald-200 dark:border-emerald-500/40',
  },
  monitor: {
    badge: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    dot: 'bg-amber-500',
    border: 'border-amber-200 dark:border-amber-500/40',
  },
  upcoming: {
    badge: 'bg-slate-500/15 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200',
    dot: 'bg-slate-400',
    border: 'border-slate-200 dark:border-slate-500/40',
  },
};

const nodeIcon: Record<string, ComponentType<{ className?: string }>> = {
  CCC: Sparkles,
  VPE: PlayCircle,
  USP: CalendarClock,
  UMS: Layers3,
  AL: ShieldCheckCircle,
  AR: Workflow,
  WAU: Activity,
  MAO: LineChart,
};

function ShieldCheckCircle(props: { className?: string }) {
  return <CheckCircle2 {...props} />;
}

export default function Automations() {
  const { user } = useAuth();
  const [nodes, setNodes] = useState<AutomationNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFocus, setSelectedFocus] = useState<string>(focusOptions[0]?.id ?? 'overall pipeline performance');
  const [insights, setInsights] = useState('');
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
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
        const response = await fetch('/api/automations', {
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

  const generateInsights = useCallback(async () => {
    if (!user || isGeneratingRef.current) {
      return;
    }

    isGeneratingRef.current = true;
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/automations/insights', {
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

  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => a.sequence - b.sequence);
  }, [nodes]);

  const metrics = useMemo(() => {
    const active = nodes.filter((node) => node.status === 'operational').length;
    const monitoring = nodes.filter((node) => node.status === 'monitor').length;
    return [
      {
        label: 'Active Nodes',
        value: active,
        description: 'Running with AI copilot coverage.',
        icon: Cpu,
      },
      {
        label: 'Under Watch',
        value: monitoring,
        description: 'Need analyst review this week.',
        icon: AlertTriangle,
      },
      {
        label: 'Total Automations',
        value: nodes.length,
        description: 'End-to-end workflow coverage.',
        icon: Workflow,
      },
    ];
  }, [nodes]);

  const focusMeta = focusOptions.find((option) => option.id === selectedFocus) ?? focusOptions[0];

  return (
    <div className="space-y-10 text-slate-900 dark:text-slate-100">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-10 text-white shadow-2xl dark:border-slate-800"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%)]" />
        <div className="relative z-10 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-sm font-medium">
              <Bot className="h-4 w-4" />
              SmartOps Automation Framework
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Automation Control Room</h1>
            <p className="text-lg text-slate-200">
              Visualise every node across the creative pipeline and let the OpenAI agent highlight what deserves your next
              play.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => void generateInsights()}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-black/20 transition hover:scale-[1.01] hover:bg-slate-100 dark:bg-slate-100"
                disabled={insightsLoading}
              >
                <Sparkles className="h-4 w-4 text-red-500" />
                {insightsLoading ? 'Summoning AI...' : 'Refresh AI Synopsis'}
              </button>
              <div className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm text-white/90">
                <ArrowRight className="h-4 w-4 text-red-300" />
                {focusMeta?.label}
              </div>
            </div>
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
                    <p className="mt-2 text-3xl font-semibold">{metric.value}</p>
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

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">AI Focus</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">Select a lens and let the agent tailor the insights.</p>
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
        </div>
        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950/40">
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
      </motion.div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/60 dark:bg-red-500/15 dark:text-red-200">
          {error}
        </div>
      )}

      {!loading && nodes.length > 0 && (
        <div className="grid gap-8 xl:grid-cols-[2fr_1fr]">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Workflow Nodes</h2>
              <span className="text-sm text-slate-500 dark:text-slate-300">
                Sequenced view of the SmartOps automation spine.
              </span>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {sortedNodes.map((node) => {
                const Icon = nodeIcon[node.code] ?? Bot;
                const accent = statusAccent[node.status];
                return (
                  <motion.div
                    key={node.code}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.25 }}
                    className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br from-white via-white to-slate-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950"
                  >
                    <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
                      <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-red-500/20" />
                    </div>
                    <div className="relative z-10 flex items-center gap-3">
                      <div className="rounded-2xl bg-red-500/10 p-3 text-red-500 dark:bg-red-500/20 dark:text-red-300">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-300">
                            {node.code}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${accent.badge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
                            {node.statusLabel}
                          </span>
                        </div>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{node.title}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{node.step}</p>
                      </div>
                    </div>
                    <p className="relative z-10 mt-4 text-sm text-slate-600 dark:text-slate-300">{node.description}</p>
                    <div className="relative z-10 mt-4 space-y-2 rounded-2xl border border-slate-100 bg-white/80 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
                      <div className="flex items-start gap-2">
                        <Cpu className="h-4 w-4 text-red-500 dark:text-red-300" />
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-white">Primary Function</p>
                          <p>{node.function}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Sparkles className="h-4 w-4 text-amber-500 dark:text-amber-300" />
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-white">AI Assist</p>
                          <p>{node.aiAssist}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Layers3 className="h-4 w-4 text-slate-500 dark:text-slate-300" />
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-white">Deliverables</p>
                          <p>{node.deliverables?.join(', ')}</p>
                        </div>
                      </div>
                      {node.dependencies?.length > 0 && (
                        <div className="flex items-start gap-2">
                          <ArrowRight className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-white">Depends on</p>
                            <p>{node.dependencies.join(' → ')}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="flex h-full flex-col gap-6"
          >
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Runtime Timeline</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">Track the path from concept to optimisation.</p>
              <div className="mt-6 space-y-6">
                {sortedNodes.map((node, index) => {
                  const accent = statusAccent[node.status];
                  const isLast = index === sortedNodes.length - 1;
                  return (
                    <div key={node.code} className="relative pl-6">
                      {!isLast && <span className="absolute left-[10px] top-5 h-full w-px bg-slate-200 dark:bg-slate-700" />}
                      <span
                        className={`absolute left-0 top-1 flex h-5 w-5 items-center justify-center rounded-full border ${accent.border} bg-white text-[10px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-200`}
                      >
                        {node.sequence}
                      </span>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{node.title}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-300">{node.step}</p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${accent.badge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
                            {node.status === 'operational'
                              ? 'Operational'
                              : node.status === 'monitor'
                              ? 'Monitoring'
                              : 'Scheduled'}
                          </span>
                        </div>
                        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">{node.function}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">AI Implementation Notes</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Every node leverages the OpenAI API configured in your workspace. Keep the key fresh to maintain captioning,
                ideation, and analytics automation.
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500 dark:text-emerald-300" />
                  <span>Secrets are stored server-side – the UI simply orchestrates the agent requests.</span>
                </div>
                <div className="flex items-start gap-2">
                  <PlayCircle className="mt-0.5 h-4 w-4 text-red-500 dark:text-red-300" />
                  <span>
                    Each insight request triggers{' '}
                    <code className="rounded bg-slate-100 px-1 text-slate-900 dark:bg-slate-800 dark:text-slate-200">
                      /api/automations/insights
                    </code>{' '}
                    for OpenAI-powered guidance.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500 dark:text-amber-300" />
                  <span>Without an active OpenAI subscription the agent may return a friendly fallback message.</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
