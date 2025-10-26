import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Loader2, PlugZap } from 'lucide-react';
import type { AutomationNode, AutomationRunState } from '../../types/automations';

const statusAccent: Record<AutomationNode['status'], { badge: string; dot: string; border: string }> = {
  operational: {
    badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40',
    dot: 'bg-emerald-500',
    border: 'border-emerald-500/40',
  },
  monitor: {
    badge: 'bg-amber-500/15 text-amber-200 border border-amber-500/40',
    dot: 'bg-amber-400',
    border: 'border-amber-500/40',
  },
  upcoming: {
    badge: 'bg-slate-500/15 text-slate-200 border border-slate-500/30',
    dot: 'bg-slate-400',
    border: 'border-slate-500/30',
  },
};

interface AutomationFlowNode extends AutomationNode {
  tooltip?: string;
}

interface AutomationFlowCanvasProps {
  nodes: AutomationFlowNode[];
  runStates: Record<string, AutomationRunState>;
  onRun: (code: string) => Promise<void> | void;
}

interface ConnectionPath {
  id: string;
  d: string;
}

const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) {
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

const formatTimestamp = (iso?: string): string => {
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

const formatResponsePreview = (body: unknown): string => {
  if (body == null) {
    return 'No response payload received.';
  }

  if (typeof body === 'string') {
    if (body.trim().length === 0) {
      return 'Empty string received from webhook.';
    }
    return body.length > 220 ? `${body.slice(0, 217)}…` : body;
  }

  try {
    const stringified = JSON.stringify(body, null, 2);
    return stringified.length > 220 ? `${stringified.slice(0, 217)}…` : stringified;
  } catch {
    return 'Unable to display response payload.';
  }
};

const ensureRefsForNodes = (
  existing: Record<string, HTMLDivElement | null>,
  nodes: AutomationNode[],
): Record<string, HTMLDivElement | null> => {
  const next: Record<string, HTMLDivElement | null> = {};
  nodes.forEach((node) => {
    next[node.code] = existing[node.code] ?? null;
  });
  return next;
};

export default function AutomationFlowCanvas({ nodes, runStates, onRun }: AutomationFlowCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [paths, setPaths] = useState<ConnectionPath[]>([]);

  useEffect(() => {
    nodeRefs.current = ensureRefsForNodes(nodeRefs.current, nodes);
  }, [nodes]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updatePaths = () => {
      const container = containerRef.current;
      if (!container) {
        setPaths([]);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const newPaths: ConnectionPath[] = [];

      nodes.forEach((node) => {
        const targetEl = nodeRefs.current[node.code];
        if (!targetEl || node.dependencies.length === 0) {
          return;
        }

        const targetRect = targetEl.getBoundingClientRect();

        node.dependencies.forEach((dependencyCode) => {
          const sourceEl = nodeRefs.current[dependencyCode];
          if (!sourceEl) {
            return;
          }

          const sourceRect = sourceEl.getBoundingClientRect();
          const startX = sourceRect.right - containerRect.left;
          const startY = sourceRect.top + sourceRect.height / 2 - containerRect.top;
          const endX = targetRect.left - containerRect.left;
          const endY = targetRect.top + targetRect.height / 2 - containerRect.top;
          const midX = startX + (endX - startX) / 2;

          const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
          newPaths.push({ id: `${dependencyCode}->${node.code}`, d: path });
        });
      });

      setPaths(newPaths);
    };

    updatePaths();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updatePaths());
      if (containerRef.current) {
        observer.observe(containerRef.current);
      }
      Object.values(nodeRefs.current).forEach((element) => {
        if (element) {
          observer.observe(element);
        }
      });

      return () => {
        observer.disconnect();
      };
    }

    const resizeHandler = () => updatePaths();
    window.addEventListener('resize', resizeHandler);
    return () => {
      window.removeEventListener('resize', resizeHandler);
    };
  }, [nodes, runStates]);

  const orderedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => a.sequence - b.sequence);
  }, [nodes]);

  return (
    <div className="relative overflow-visible rounded-3xl border border-slate-800 bg-slate-950 p-10 text-white shadow-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(148,163,255,0.18),_transparent_55%)]" />
      <svg className="pointer-events-none absolute inset-0 hidden text-slate-700/60 lg:block" aria-hidden="true">
        {paths.map((path) => (
          <path key={path.id} d={path.d} className="fill-none stroke-current" strokeWidth={2.2} />
        ))}
      </svg>
      <div ref={containerRef} className="relative z-10 grid gap-10 md:grid-cols-2 xl:grid-cols-4">
        {orderedNodes.map((node, index) => {
          const accent = statusAccent[node.status];
          const runState = runStates[node.code] ?? { status: 'idle' };
          const result = runState.result;
          const isRunning = runState.status === 'running';
          const showConnector = index !== orderedNodes.length - 1;

          return (
            <Fragment key={node.code}>
              <motion.div
                ref={(element) => {
                  nodeRefs.current[node.code] = element;
                }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                className={`relative flex flex-col gap-5 rounded-2xl border bg-slate-900/80 p-6 pr-16 backdrop-blur ${
                  accent?.border ?? 'border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{node.step}</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">{node.title}</h3>
                    <p className="mt-1 text-sm text-slate-300/90">{node.description}</p>
                  </div>
                  <button
                    type="button"
                    className="hidden rounded-full border border-slate-700/70 bg-slate-900/70 p-1.5 text-slate-300 transition hover:text-white lg:flex"
                    title={node.tooltip ?? node.function}
                    aria-label={`About ${node.title}`}
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/80 p-4 text-sm text-slate-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Why it matters</p>
                  <p className="mt-1 leading-relaxed text-slate-200">{node.function}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300/80">
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium ${accent?.badge ?? ''}`}>
                    <span className={`h-2 w-2 rounded-full ${accent?.dot ?? 'bg-slate-500'}`} />
                    {node.statusLabel}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 px-3 py-1 text-slate-400">
                    {node.connected ? 'Connected to n8n' : 'Awaiting n8n URL'}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/80 p-4 text-xs text-slate-300/90">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold uppercase tracking-wide text-slate-400">n8n Webhook</p>
                    {node.webhookUrl ? (
                      <a
                        href={node.webhookUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 transition hover:text-white"
                      >
                        <PlugZap className="h-3.5 w-3.5" /> View
                      </a>
                    ) : (
                      <span className="text-[11px] text-amber-300">Configure in .env</span>
                    )}
                  </div>
                  <p className="mt-1 break-all text-[11px] text-slate-400/80">
                    {node.webhookUrl ?? `${node.webhookPath} → waiting for N8N_BASE_URL`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void onRun(node.code)}
                  disabled={isRunning}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
                >
                  {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {isRunning ? 'Running…' : 'Run Automation'}
                </button>

                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/80 p-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-slate-300">
                    <div className="flex items-center gap-2">
                      {runState.status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : runState.status === 'error' ? (
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                      )}
                      <span className="font-semibold uppercase tracking-wide text-slate-400">Last Run</span>
                    </div>
                    <span className="rounded-full border border-slate-700/70 px-2 py-0.5 text-[11px] text-slate-400">
                      {formatTimestamp(result?.finishedAt)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] text-slate-400">
                    <div>
                      <p className="uppercase tracking-wide text-slate-500">HTTP</p>
                      <p className="mt-1 text-slate-200">{result?.httpStatus != null ? result.httpStatus : '—'}</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-wide text-slate-500">Duration</p>
                      <p className="mt-1 text-slate-200">{formatDuration(result?.durationMs ?? NaN)}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="uppercase tracking-wide text-slate-500">Response</p>
                    <pre className="mt-1 max-h-28 overflow-auto rounded-xl border border-slate-800/60 bg-slate-950/70 p-3 text-[11px] leading-relaxed text-slate-200">
                      <code>{formatResponsePreview(result?.responseBody)}</code>
                    </pre>
                  </div>
                  {result?.error && (
                    <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                      {result.error}
                    </p>
                  )}
                </div>

                {showConnector && (
                  <div className="pointer-events-none absolute right-4 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/80 text-slate-300 lg:flex">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                )}

                {showConnector && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 lg:hidden">
                    <ArrowRight className="h-4 w-4" />
                    <span>Next step</span>
                  </div>
                )}
              </motion.div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
