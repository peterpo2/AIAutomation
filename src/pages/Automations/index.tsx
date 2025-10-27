import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, MiniMap, MarkerType, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from '@dagrejs/dagre';
import { Loader2, RefreshCcw, X, Play } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import type { AutomationDetail, AutomationNode, AutomationRunResponse } from '../../types/automations';
import type { AutomationNodeData } from '../../components/automations/AutomationNodeCard';
import '../../styles/reactflow.css';

const LazyAutomationNode = lazy(() => import('../../components/automations/AutomationNodeCard'));

const nodeWidth = 280;
const nodeHeight = 220;
const statusRefreshIntervalMs = 45_000;

const simplify = (value: string) => {
  if (!value) return '';
  if (value.length <= 200) return value;
  return `${value.slice(0, 197)}…`;
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const formatExecutionStatus = (status: string) => {
  if (!status) return 'Unknown';
  if (status === 'success') return 'Succeeded';
  if (status === 'error') return 'Failed';
  if (status === 'running') return 'Running';
  return status.replace(/_/g, ' ');
};

type AutomationFlowNode = Node<AutomationNodeData>;

type ExecutionState = {
  status: 'idle' | 'running' | 'success' | 'error';
  message?: string;
};

interface DetailState {
  loading: boolean;
  error: string | null;
  data: AutomationDetail | null;
}

const NodeFallback = () => (
  <div className="w-[300px] rounded-3xl border border-slate-800/80 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
    Loading…
  </div>
);

const buildGraphLayout = (nodes: AutomationNode[]) => {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', nodesep: 160, ranksep: 120 });

  nodes.forEach((node) => {
    graph.setNode(node.code, { width: nodeWidth, height: nodeHeight });
  });

  nodes.forEach((node) => {
    node.dependencies.forEach((dependency) => {
      graph.setEdge(dependency, node.code);
    });
  });

  dagre.layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node) => {
    const nodeWithPosition = graph.node(node.code) as { x: number; y: number } | undefined;
    if (!nodeWithPosition) return;
    positions.set(node.code, {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    });
  });

  return positions;
};

const nodeTypes = {
  automation: (props: Node<AutomationNodeData>) => (
    <Suspense fallback={<NodeFallback />}>
      <LazyAutomationNode {...props} />
    </Suspense>
  ),
};

const buildEdgesFromNodes = (nodes: AutomationNode[]): Edge[] => {
  const edges: Edge[] = [];
  nodes.forEach((node) => {
    node.dependencies.forEach((dependency) => {
      edges.push({
        id: `${dependency}__${node.code}`,
        source: dependency,
        target: node.code,
        type: 'smoothstep',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(248, 113, 113, 0.7)' },
        style: { stroke: 'rgba(248, 113, 113, 0.6)', strokeWidth: 2 },
      });
    });
  });
  return edges;
};

const DetailModal = ({
  open,
  detail,
  state,
  onClose,
  onRun,
}: {
  open: boolean;
  detail: AutomationDetail | null;
  state: DetailState;
  onClose: () => void;
  onRun: (code: string) => void;
}) => {
  if (!open) return null;

  const showRunHistory = detail?.executions ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur">
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950/85 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-800/60 bg-slate-900/80 text-slate-400 transition hover:text-slate-100"
        >
          <X className="h-5 w-5" />
        </button>

        {state.loading ? (
          <div className="flex flex-1 items-center justify-center p-16 text-slate-300">
            <Loader2 className="mr-3 h-5 w-5 animate-spin" /> Loading automation…
          </div>
        ) : state.error ? (
          <div className="flex flex-1 items-center justify-center p-16 text-rose-200">
            {state.error}
          </div>
        ) : detail ? (
          <div className="grid h-full grid-cols-1 gap-0 lg:grid-cols-[1.5fr_1fr]">
            <div className="flex flex-col gap-6 overflow-y-auto px-8 py-10">
              <div className="flex flex-col gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{detail.headline}</span>
                <h2 className="text-3xl font-semibold text-white">{detail.name}</h2>
                <p className="text-sm leading-relaxed text-slate-300">{detail.description}</p>
                <p className="text-xs text-slate-500">{detail.statusLabel}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Outputs</h3>
                  <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-300">
                    {detail.deliverables.map((item) => (
                      <li key={item} className="list-inside list-disc">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Workflow logic</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">{detail.function}</p>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Dependencies</h4>
                    <p className="mt-2 text-sm text-slate-300">
                      {detail.dependencies.length > 0 ? detail.dependencies.join(', ') : 'Runs independently'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">AI assistance</h3>
                <p className="mt-2 text-sm text-slate-300">{detail.aiAssist}</p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => onRun(detail.code)}
                  className="inline-flex items-center gap-2 self-start rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
                >
                  <Play className="h-4 w-4" /> Run this node now
                </button>
                <p className="text-xs text-slate-500">
                  Manual runs trigger dependent nodes automatically when prerequisites are met.
                </p>
              </div>
            </div>

            <aside className="flex h-full flex-col border-t border-slate-900/60 bg-slate-950/60 px-6 py-8 lg:border-l lg:border-t-0">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Run history</h3>
                <span className="text-xs text-slate-500">Last run {formatDateTime(detail.lastRun)}</span>
              </div>
              <div className="mt-4 flex-1 overflow-y-auto pr-2">
                {showRunHistory.length === 0 ? (
                  <p className="text-sm text-slate-400">No executions recorded yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {showRunHistory.map((run) => (
                      <li key={run.id} className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-3">
                        <div className="flex items-center justify-between text-sm text-slate-200">
                          <span className="font-semibold text-rose-200">{formatExecutionStatus(run.status)}</span>
                          <span className="text-xs text-slate-500">{formatDateTime(run.startedAt)}</span>
                        </div>
                        {run.logs ? (
                          <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-xs text-slate-400">
                            {run.logs}
                          </pre>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
};

function AutomationsCanvas() {
  const { user } = useAuth();
  const [nodes, setNodes, onNodesChange] = useNodesState<AutomationNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const statusIntervalRef = useRef<number | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailState>({ loading: false, error: null, data: null });
  const [executionStates, setExecutionStates] = useState<Record<string, ExecutionState>>({});
  const automationMapRef = useRef<Record<string, AutomationNode>>({});
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const statusSummary = useMemo(() => {
    const summary: Record<'operational' | 'monitoring' | 'warning' | 'error', number> = {
      operational: 0,
      monitoring: 0,
      warning: 0,
      error: 0,
    };

    nodes.forEach((nodeItem) => {
      const key = nodeItem.data.status;
      if (key in summary) {
        summary[key as keyof typeof summary] += 1;
      }
    });

    return summary;
  }, [nodes]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastRefreshed) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(lastRefreshed);
  }, [lastRefreshed]);

  const persistNodePosition = useCallback(
    async (code: string, position: { x: number; y: number } | null | undefined) => {
      if (!user || !position) return;
      try {
        const token = await user.getIdToken();
        await apiFetch(`/automations/${code}/position`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(position),
        });
      } catch (err) {
        console.error('Failed to persist automation node position', err);
      }
    },
    [user],
  );

  const handleNodeDragStop = useCallback(
    (_event: unknown, node: AutomationFlowNode) => {
      setNodes((current) =>
        current.map((item) => (item.id === node.id ? { ...item, position: node.position } : item)),
      );
      void persistNodePosition(node.id, node.position);
    },
    [persistNodePosition, setNodes],
  );

  const handleRunAutomation = useCallback(
    async (code: string) => {
      const automation = automationMapRef.current[code];
      if (!automation || !user) {
        return;
      }

      setExecutionStates((prev) => ({
        ...prev,
        [code]: { status: 'running', message: 'Executing…' },
      }));

      let processedCodes: string[] = [code];

      try {
        const token = await user.getIdToken();
        const response = await apiFetch(`/automations/run/${code}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? `Run failed (${response.status})`);
        }

        const payload = (await response.json()) as AutomationRunResponse;
        const resultEntries = [
          { code: payload.automation.code, automation: payload.automation, execution: payload.execution },
          ...payload.cascade.map((entry) => ({
            code: entry.automation.code,
            automation: entry.automation,
            execution: entry.execution,
          })),
        ];

        processedCodes = resultEntries.map((entry) => entry.code);

        resultEntries.forEach((entry) => {
          automationMapRef.current[entry.code] = entry.automation;
        });

        const messageMap = new Map<string, string>();
        const pipelineCount = resultEntries.length;
        messageMap.set(
          payload.automation.code,
          pipelineCount > 1
            ? `Triggered ${pipelineCount} connected step${pipelineCount === 1 ? '' : 's'}.`
            : 'Workflow triggered successfully.',
        );

        payload.cascade.forEach((entry) => {
          const dependencies = entry.automation.dependencies ?? [];
          const descriptor =
            dependencies.length > 0 ? dependencies.join(' → ') : payload.automation.name ?? payload.automation.code;
          messageMap.set(entry.automation.code, `Auto-ran after ${descriptor}.`);
        });

        const updateMap = new Map(resultEntries.map((entry) => [entry.code, entry]));

        setNodes((current) =>
          current.map((node) => {
            const update = updateMap.get(node.id);
            if (!update) return node;
            return {
              ...node,
              data: {
                ...node.data,
                status: update.automation.status,
                statusLabel: update.automation.statusLabel,
                lastRun: update.automation.lastRun,
                executionStatus: 'success',
                executionMessage: messageMap.get(update.automation.code) ?? 'Workflow triggered successfully.',
              },
            } satisfies AutomationFlowNode;
          }),
        );

        setExecutionStates((prev) => {
          const next = { ...prev };
          resultEntries.forEach((entry) => {
            next[entry.code] = {
              status: 'success',
              message: messageMap.get(entry.code) ?? 'Workflow triggered successfully.',
            };
          });
          return next;
        });

        if (selectedCode) {
          setDetailState((prev) => {
            if (!prev.data) return prev;
            const update = updateMap.get(prev.data.code);
            if (!update) return prev;
            return {
              ...prev,
              data: {
                ...prev.data,
                ...update.automation,
                executions: [update.execution, ...prev.data.executions].slice(0, 25),
              },
            };
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Automation execution failed.';
        setExecutionStates((prev) => ({
          ...prev,
          [code]: { status: 'error', message },
        }));
        console.error('Failed to execute automation', err);
      } finally {
        window.setTimeout(() => {
          setExecutionStates((prev) => {
            const next = { ...prev };
            processedCodes.forEach((entryCode) => {
              if (next[entryCode]?.status === 'success') {
                next[entryCode] = { status: 'idle' };
              } else if (entryCode === code && next[entryCode]?.status === 'running') {
                next[entryCode] = { status: 'idle' };
              }
            });
            return next;
          });
        }, 6_000);
      }
    },
    [selectedCode, setNodes, user],
  );

  const buildFlowNodes = useCallback(
    (items: AutomationNode[], layoutPositions: Map<string, { x: number; y: number }>): AutomationFlowNode[] =>
      items.map((automation) => {
        const savedPosition = automation.layout ?? automation.position ?? null;
        const dagrePosition = layoutPositions.get(automation.code) ?? null;
        const position = savedPosition ?? dagrePosition ?? { x: 0, y: 0 };

        return {
          id: automation.code,
          type: 'automation',
          position,
          draggable: true,
          data: {
            code: automation.code,
            name: automation.name,
            headline: automation.headline,
            summary: simplify(automation.description),
            status: automation.status,
            statusLabel: automation.statusLabel,
            connected: automation.connected,
            lastRun: automation.lastRun,
            onOpen: setSelectedCode,
            onExecute: handleRunAutomation,
            canExecute: true,
            executionStatus: executionStates[automation.code]?.status ?? 'idle',
            executionMessage: executionStates[automation.code]?.message ?? null,
          },
        } satisfies AutomationFlowNode;
      }),
    [executionStates, handleRunAutomation],
  );

  const loadAutomations = useCallback(async () => {
    if (!user) return;
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
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Unable to load automations.');
      }

      const payload = (await response.json()) as { nodes: AutomationNode[] };
      automationMapRef.current = payload.nodes.reduce<Record<string, AutomationNode>>((acc, node) => {
        acc[node.code] = node;
        return acc;
      }, {});

      const layoutPositions = buildGraphLayout(payload.nodes);
      const flowNodes = buildFlowNodes(payload.nodes, layoutPositions);
      const flowEdges = buildEdgesFromNodes(payload.nodes);

      setNodes(flowNodes);
      setEdges(flowEdges);
      setLastRefreshed(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load automations.';
      console.error('Failed to load automations', err);
      setError(message);
      setNodes([]);
      setEdges([]);
    } finally {
      setLoading(false);
    }
  }, [buildFlowNodes, setEdges, setNodes, user]);

  useEffect(() => {
    if (!user) {
      setNodes([]);
      setEdges([]);
      setLoading(false);
      return;
    }
    void loadAutomations();
  }, [loadAutomations, setEdges, setNodes, user]);

  const refreshStatuses = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await apiFetch('/automations/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { nodes: AutomationNode[] };
      automationMapRef.current = payload.nodes.reduce<Record<string, AutomationNode>>((acc, node) => {
        acc[node.code] = node;
        return acc;
      }, automationMapRef.current);

      setNodes((current) =>
        current.map((node) => {
          const update = payload.nodes.find((candidate) => candidate.code === node.id);
          if (!update) return node;
          return {
            ...node,
            data: {
              ...node.data,
              status: update.status,
              statusLabel: update.statusLabel,
              connected: update.connected,
              lastRun: update.lastRun,
            },
          } satisfies AutomationFlowNode;
        }),
      );
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to refresh automation statuses', err);
    }
  }, [setNodes, user]);

  useEffect(() => {
    if (statusIntervalRef.current) {
      window.clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    if (!user) {
      return;
    }
    void refreshStatuses();
    const timer = window.setInterval(() => {
      void refreshStatuses();
    }, statusRefreshIntervalMs);
    statusIntervalRef.current = timer;
    return () => {
      window.clearInterval(timer);
    };
  }, [refreshStatuses, user]);

  useEffect(() => {
    if (!selectedCode || !user) {
      setDetailState((prev) => ({ ...prev, data: null, error: null, loading: false }));
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      setDetailState({ loading: true, error: null, data: null });
      try {
        const token = await user.getIdToken();
        const response = await apiFetch(`/automations/${selectedCode}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? 'Unable to load automation details.');
        }
        const payload = (await response.json()) as { node: AutomationDetail };
        if (!cancelled) {
          setDetailState({ loading: false, error: null, data: payload.node });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load automation details.';
        if (!cancelled) {
          setDetailState({ loading: false, error: message, data: null });
        }
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedCode, user]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-rose-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-slate-300">{error}</p>
        <button
          type="button"
          onClick={() => void loadAutomations()}
          className="inline-flex items-center gap-2 rounded-full border border-rose-500/60 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
        >
          <RefreshCcw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">Creative automation map</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Drag nodes into the order that reflects your production flow. Select any node to review its purpose, logs, and manual
            controls.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Last update</span>
            <span className="text-sm font-medium text-slate-200">{lastUpdatedLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => void refreshStatuses()}
            className="inline-flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800/70"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative h-[660px]">
          <div className="reactflow-dark absolute inset-0 overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950/70">
            <ReactFlow
              className="reactflow-dark"
              nodeTypes={nodeTypes}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              fitView
              fitViewOptions={{ padding: 0.24 }}
              onNodeDragStop={handleNodeDragStop}
              proOptions={{ hideAttribution: true }}
              panOnScroll
              selectionOnDrag
              minZoom={0.5}
              maxZoom={1.6}
            >
              <MiniMap className="!bg-slate-950/80 !border !border-slate-800/60" />
              <Controls className="!border !border-slate-800/60 !bg-slate-950/80" />
              <Background gap={24} color="rgba(148, 163, 184, 0.12)" />
            </ReactFlow>
          </div>
        </div>

        <aside className="flex flex-col gap-6 rounded-3xl border border-slate-800/70 bg-slate-950/70 p-6">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Workflow health</h2>
            <p className="text-sm text-slate-300">
              Each automation hands off to the next stage: ideas → schedules → assets → publishing → reporting.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">Operational</span>
              <p className="mt-1 text-2xl font-semibold text-emerald-100">{statusSummary.operational}</p>
            </div>
            <div className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-200">Monitoring</span>
              <p className="mt-1 text-2xl font-semibold text-sky-100">{statusSummary.monitoring}</p>
            </div>
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">Warnings</span>
              <p className="mt-1 text-2xl font-semibold text-amber-100">{statusSummary.warning}</p>
            </div>
            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-200">Blocked</span>
              <p className="mt-1 text-2xl font-semibold text-rose-100">{statusSummary.error}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-5 text-sm leading-relaxed text-slate-300">
            <p>• AI Content Planner and Engagement Scheduler keep campaigns fresh and timed to audience peaks.</p>
            <p className="mt-2">• Media Fetcher moves approved assets into the SmartOps media library and retries Dropbox when offline.</p>
            <p className="mt-2">• Publishing and reporting nodes execute automatically once upstream checks pass.</p>
          </div>
        </aside>
      </div>

      <DetailModal
        open={Boolean(selectedCode)}
        detail={detailState.data}
        state={detailState}
        onClose={() => setSelectedCode(null)}
        onRun={(automationCode) => void handleRunAutomation(automationCode)}
      />
    </div>
  );
}

export default function AutomationsPage() {
  return (
    <ReactFlowProvider>
      <AutomationsCanvas />
    </ReactFlowProvider>
  );
}
