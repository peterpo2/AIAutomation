import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Node,
  NodeChange,
  ReactFlow,
  ReactFlowInstance,
  ReactFlowProvider,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type Edge,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { CalendarClock, Clock, History, Loader2, Play, Settings2 } from 'lucide-react';
import dagre from '@dagrejs/dagre';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import type { AutomationNode, AutomationRunResult } from '../../types/automations';
import type { AutomationNodeData } from '../../components/automations/AutomationNodeCard';
import {
  formatDuration,
  formatTimestamp,
  getDefaultSchedule,
  normalizeRunHistory,
  normalizeSchedule,
  type AutomationScheduleSettings,
} from '../../utils/automations';
import '../../styles/reactflow.css';

const LazyAutomationNode = lazy(() => import('../../components/automations/AutomationNodeCard'));

interface AutomationOverviewItem extends AutomationNode {
  shortDescription: string;
  position?: { x: number; y: number } | null;
}

const simplifyDescription = (description: string) => {
  if (!description) return '';
  if (description.length <= 180) return description;
  return `${description.slice(0, 177)}…`;
};

const statusMap: Record<AutomationNode['status'], AutomationNodeData['status']> = {
  operational: 'operational',
  monitor: 'under-watch',
  upcoming: 'offline',
};

const inspectorStatusStyles: Record<AutomationNode['status'], { label: string; chip: string }> = {
  operational: {
    label: 'Operational',
    chip: 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
  },
  monitor: {
    label: 'Under watch',
    chip: 'border border-amber-500/40 bg-amber-500/15 text-amber-200',
  },
  upcoming: {
    label: 'Offline soon',
    chip: 'border border-rose-500/40 bg-rose-500/15 text-rose-200',
  },
};

const statusRefreshIntervalMs = 30_000;
const nodeWidth = 280;
const nodeHeight = 200;

const nodeSpacingX = 360;
const nodeStartY = 80;

type AutomationFlowNode = Node<AutomationNodeData>;

type AutomationNodeTypeRenderer = (props: NodeProps<AutomationNodeData>) => JSX.Element;

interface AutomationStatusUpdate {
  code: string;
  status?: string;
  statusLabel?: string;
  connected?: boolean;
}

const toAutomationStatusValue = (
  status: string | null | undefined,
  fallback: AutomationNode['status'] = 'operational',
): AutomationNode['status'] => {
  if (!status) return fallback;
  if (status === 'operational' || status === 'online' || status === 'active') {
    return 'operational';
  }
  if (status === 'monitor' || status === 'monitoring' || status === 'under-watch' || status === 'under_watch') {
    return 'monitor';
  }
  if (status === 'upcoming' || status === 'offline' || status === 'down') {
    return 'upcoming';
  }
  return fallback;
};

const mapStatusToNodeStatus = (
  status: string | null | undefined,
): AutomationNodeData['status'] => {
  if (!status) return 'operational';
  if (status === 'operational') return 'operational';
  if (status === 'monitor' || status === 'under-watch' || status === 'under_watch') {
    return 'under-watch';
  }
  if (status === 'offline' || status === 'down' || status === 'upcoming') {
    return 'offline';
  }
  return 'operational';
};

const extractPosition = (node: Record<string, unknown>): { x: number; y: number } | null => {
  if (!node) return null;

  const direct = node.position;
  if (direct && typeof direct === 'object') {
    const value = direct as Record<string, unknown>;
    const x = Number(value.x);
    const y = Number(value.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y };
    }
  }

  const lookup = (key: string) => {
    const value = (node as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : undefined;
  };

  const layoutRaw = (node as Record<string, unknown>).layout;
  let layoutX: number | undefined;
  let layoutY: number | undefined;

  if (layoutRaw && typeof layoutRaw === 'object') {
    const layout = layoutRaw as Record<string, unknown>;
    layoutX = typeof layout.x === 'number' ? (layout.x as number) : undefined;
    layoutY = typeof layout.y === 'number' ? (layout.y as number) : undefined;
  }

  const candidatesX = [lookup('positionX'), lookup('x'), lookup('posX'), lookup('layoutX'), layoutX];
  const candidatesY = [lookup('positionY'), lookup('y'), lookup('posY'), lookup('layoutY'), layoutY];

  const x = candidatesX.find((value) => typeof value === 'number');
  const y = candidatesY.find((value) => typeof value === 'number');

  if (typeof x === 'number' && typeof y === 'number') {
    return { x, y };
  }

  return null;
};

const normalizeStatusPayload = (payload: unknown): AutomationStatusUpdate[] => {
  if (!payload) {
    return [];
  }

  const mapItem = (item: unknown): AutomationStatusUpdate | null => {
    if (!item || typeof item !== 'object') {
      return null;
    }
    const record = item as Record<string, unknown>;
    const codeCandidate = record.code ?? record.id ?? record.workflowId ?? record.slug;
    if (typeof codeCandidate !== 'string') {
      return null;
    }

    return {
      code: codeCandidate,
      status: typeof record.status === 'string' ? record.status : undefined,
      statusLabel: typeof record.statusLabel === 'string' ? record.statusLabel : undefined,
      connected: typeof record.connected === 'boolean' ? record.connected : undefined,
    };
  };

  if (Array.isArray(payload)) {
    return payload.map(mapItem).filter((item): item is AutomationStatusUpdate => Boolean(item));
  }

  if (typeof payload === 'object') {
    const container = payload as Record<string, unknown>;
    const keys = ['statuses', 'nodes', 'items', 'automations', 'data'];
    for (const key of keys) {
      if (Array.isArray(container[key])) {
        return normalizeStatusPayload(container[key]);
      }
    }
  }

  return [];
};

const NodeFallback = () => (
  <div className="w-[280px] rounded-3xl border border-slate-800/80 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
    Loading…
  </div>
);

export default function AutomationsFlow() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [nodes, setNodes] = useNodesState<AutomationNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [initialFitDone, setInitialFitDone] = useState(false);
  const automationMapRef = useRef<Record<string, AutomationOverviewItem>>({});
  const [executionStates, setExecutionStates] = useState<
    Record<string, { status: 'idle' | 'running' | 'success' | 'error'; message?: string }>
  >({});
  const statusIntervalRef = useRef<number | null>(null);
  const executionResetTimersRef = useRef<Record<string, number>>({});
  const initialOrderRef = useRef<string[]>([]);
  const defaultPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const saveFeedbackTimeoutRef = useRef<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<
    | {
        type: 'success' | 'error';
        message: string;
      }
    | null
  >(null);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);
  const [selectedRuns, setSelectedRuns] = useState<AutomationRunResult[]>([]);
  const [selectedLastRun, setSelectedLastRun] = useState<AutomationRunResult | null>(null);
  const [selectedRunsLoading, setSelectedRunsLoading] = useState(false);
  const [selectedRunsError, setSelectedRunsError] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<AutomationScheduleSettings | null>(null);
  const [selectedScheduleLoading, setSelectedScheduleLoading] = useState(false);
  const [selectedScheduleError, setSelectedScheduleError] = useState<string | null>(null);
  const [inspectorRefreshKey, setInspectorRefreshKey] = useState(0);

  const nodeTypes = useMemo(() => {
    const renderer: AutomationNodeTypeRenderer = (props) => (
      <Suspense fallback={<NodeFallback />}>
        <LazyAutomationNode {...props} />
      </Suspense>
    );

    return { automation: renderer };
  }, []);

  const selectedAutomation = selectedAutomationId
    ? automationMapRef.current[selectedAutomationId] ?? null
    : null;

  const clearExecutionReset = useCallback((id: string) => {
    const currentTimers = executionResetTimersRef.current;
    if (currentTimers[id]) {
      window.clearTimeout(currentTimers[id]);
      delete currentTimers[id];
    }
  }, []);

  const scheduleExecutionReset = useCallback((id: string) => {
    clearExecutionReset(id);
    executionResetTimersRef.current[id] = window.setTimeout(() => {
      setExecutionStates((prev) => {
        const next = { ...prev };
        if (!next[id]) {
          return prev;
        }
        next[id] = { status: 'idle', message: undefined };
        return next;
      });
      delete executionResetTimersRef.current[id];
    }, 8_000);
  }, [clearExecutionReset]);

  const handleExecuteAutomation = useCallback(
    async (id: string) => {
      const meta = automationMapRef.current[id];
      if (!meta) {
        return;
      }

      if (!user) {
        setExecutionStates((prev) => ({
          ...prev,
          [id]: { status: 'error', message: 'Sign in to trigger automations.' },
        }));
        scheduleExecutionReset(id);
        return;
      }

      clearExecutionReset(id);

      setExecutionStates((prev) => ({
        ...prev,
        [id]: { status: 'running', message: 'Executing workflow…' },
      }));

      try {
        const token = await user.getIdToken();
        const response = await apiFetch(`/automations/run/${id}`, {
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
          const now = new Date().toISOString();
          const headersRecord = Object.fromEntries(response.headers.entries()) as Record<string, string>;
          const statusText = response.statusText || null;

          result = {
            code: id,
            ok: response.ok,
            httpStatus: Number.isFinite(response.status) ? response.status : null,
            statusText,
            webhookUrl: meta.webhookUrl ?? null,
            startedAt: now,
            finishedAt: now,
            durationMs: 0,
            requestPayload: null,
            responseBody: null,
            responseHeaders: headersRecord,
            ...(response.ok
              ? {}
              : {
                  error:
                    statusText ?? 'Unexpected response from automation run endpoint.',
                }),
          } satisfies AutomationRunResult;
        }

        const success = response.ok && result.ok;

        setExecutionStates((prev) => ({
          ...prev,
          [id]: {
            status: success ? 'success' : 'error',
            message: success
              ? 'Workflow triggered successfully.'
              : result.error ?? 'The automation reported an issue.',
          },
        }));

        if (selectedAutomationId === id) {
          setSelectedLastRun(result);
          setSelectedRuns((prev) => {
            const filtered = prev.filter(
              (entry) => !(entry.code === result.code && entry.finishedAt === result.finishedAt),
            );
            const next = [result, ...filtered];
            return next
              .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())
              .slice(0, 5);
          });
          setSelectedRunsError(null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to execute workflow.';
        console.error('Failed to execute automation workflow', err);
        setExecutionStates((prev) => ({
          ...prev,
          [id]: { status: 'error', message },
        }));
      } finally {
        scheduleExecutionReset(id);
        if (selectedAutomationId === id) {
          setInspectorRefreshKey((prev) => prev + 1);
        }
      }
    },
    [
      clearExecutionReset,
      scheduleExecutionReset,
      selectedAutomationId,
      setInspectorRefreshKey,
      setSelectedLastRun,
      setSelectedRuns,
      setSelectedRunsError,
      user,
    ],
  );

  const persistNodePosition = useCallback(
    async (id: string, position: { x: number; y: number } | null | undefined) => {
      if (!user || !position) {
        return false;
      }

      try {
        const token = await user.getIdToken();
        const response = await apiFetch(`/automations/${id}/position`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ x: position.x, y: position.y }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? `Failed with status ${response.status}`);
        }

        return true;
      } catch (err) {
        console.error('Failed to persist automation node position', err);
        return false;
      }
    },
    [user],
  );

  const persistNodePositions = useCallback(
    async (nodeList: AutomationFlowNode[]) => {
      if (!nodeList || nodeList.length === 0) {
        return true;
      }

      const results = await Promise.all(
        nodeList.map((node) => persistNodePosition(node.id, node.position)),
      );

      return results.every(Boolean);
    },
    [persistNodePosition],
  );

  const updateEdgesFromNodes = useCallback(
    (nodeList: AutomationFlowNode[]) => {
      if (!nodeList || nodeList.length <= 1) {
        setEdges([]);
        return;
      }

      const sorted = [...nodeList].sort((a, b) => {
        if (a.position.x === b.position.x) {
          return a.position.y - b.position.y;
        }
        return a.position.x - b.position.x;
      });

      const linked: Edge[] = sorted.slice(0, -1).map((node, index) => {
        const next = sorted[index + 1];
        return {
          id: `${node.id}__${next.id}`,
          source: node.id,
          target: next.id,
          animated: true,
          type: 'smoothstep',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'rgba(248, 113, 113, 0.85)',
          },
          style: {
            stroke: 'rgba(248, 113, 113, 0.8)',
            strokeWidth: 2.5,
          },
        } satisfies Edge;
      });

      setEdges(linked);
    },
    [setEdges],
  );

  const handleSelectAutomation = useCallback(
    (id: string) => {
      setSelectedAutomationId((current) => {
        if (current === id) {
          setInspectorRefreshKey((prev) => prev + 1);
          return current;
        }
        return id;
      });
    },
    [setInspectorRefreshKey],
  );

  const handleOpenDetails = useCallback(
    (id: string) => {
      navigate(`/automations/${id}`);
    },
    [navigate],
  );

  const buildNodes = useCallback(
    (items: AutomationOverviewItem[]): AutomationFlowNode[] =>
      items.map((automation, index) => {
        const basePosition = automation.position ?? {
          x: index * nodeSpacingX,
          y: nodeStartY,
        };

        return {
          id: automation.code,
          type: 'automation',
          position: basePosition,
          draggable: true,
          data: {
            title: automation.title,
            shortDescription: automation.shortDescription,
            status: statusMap[automation.status] ?? 'operational',
            statusLabel: automation.statusLabel,
            connected: automation.connected,
            onOpen: handleSelectAutomation,
            onNavigate: handleOpenDetails,
            onExecute: handleExecuteAutomation,
            canExecute: Boolean(automation.webhookUrl || automation.webhookPath),
            executionStatus: 'idle',
            executionMessage: null,
          },
        } satisfies AutomationFlowNode;
      }),
    [handleExecuteAutomation, handleOpenDetails, handleSelectAutomation],
  );

  const refreshNodes = useCallback(
    (items: AutomationOverviewItem[]) => {
      automationMapRef.current = items.reduce<Record<string, AutomationOverviewItem>>(
        (acc, item) => {
          acc[item.code] = item;
          return acc;
        },
        {},
      );

      initialOrderRef.current = items.map((item) => item.code);
      defaultPositionsRef.current = items.reduce<Record<string, { x: number; y: number }>>(
        (acc, item, index) => {
          acc[item.code] = {
            x: index * nodeSpacingX,
            y: nodeStartY,
          };
          return acc;
        },
        {},
      );

      setExecutionStates((prev) => {
        const next: Record<string, { status: 'idle' | 'running' | 'success' | 'error'; message?: string }> = {};
        items.forEach((item) => {
          next[item.code] = prev[item.code] ?? { status: 'idle' };
        });
        return next;
      });

      const nextNodes = buildNodes(items);
      setNodes(nextNodes);
      updateEdgesFromNodes(nextNodes);
      setInitialFitDone(false);
      setLayoutDirty(false);
      setSaveFeedback(null);

      if (items.length === 0) {
        setSelectedAutomationId(null);
      } else if (!selectedAutomationId || !automationMapRef.current[selectedAutomationId]) {
        setSelectedAutomationId(items[0].code);
      }
    },
    [buildNodes, selectedAutomationId, setNodes, updateEdgesFromNodes],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<AutomationNodeData>[]) => {
      setNodes((current) => {
        const updated = applyNodeChanges(changes, current);
        updated.forEach((node) => {
          const meta = automationMapRef.current[node.id];
          if (meta) {
            automationMapRef.current[node.id] = {
              ...meta,
              position: node.position ?? meta.position ?? null,
            };
          }
        });
        updateEdgesFromNodes(updated as AutomationFlowNode[]);
        return updated;
      });
    },
    [setNodes, updateEdgesFromNodes],
  );

  const handleNodeDragStop = useCallback(
    (_event: unknown, node: AutomationFlowNode) => {
      setNodes((current) => {
        const updated = current.map((item) =>
          item.id === node.id ? { ...item, position: node.position } : item,
        );
        updateEdgesFromNodes(updated as AutomationFlowNode[]);
        return updated;
      });
      const meta = automationMapRef.current[node.id];
      if (meta) {
        automationMapRef.current[node.id] = { ...meta, position: node.position };
      }
      setLayoutDirty(true);
      setSaveFeedback(null);
    },
    [setNodes, updateEdgesFromNodes],
  );

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
  }, []);

  const handleAutoLayout = useCallback(() => {
    setNodes((current) => {
      if (current.length === 0) {
        return current;
      }

      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({
        rankdir: 'LR',
        nodesep: 220,
        ranksep: 160,
        marginx: 60,
        marginy: 60,
      });

      current.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
      });

      edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
      });

      dagre.layout(dagreGraph);

      const changedNodes: AutomationFlowNode[] = [];
      const nextNodes = current.map((node) => {
        const dagreNode = dagreGraph.node(node.id) as { x: number; y: number } | undefined;
        if (!dagreNode || !Number.isFinite(dagreNode.x) || !Number.isFinite(dagreNode.y)) {
          return node;
        }

        const position = {
          x: dagreNode.x - nodeWidth / 2,
          y: dagreNode.y - nodeHeight / 2,
        };

        if (!node.position || node.position.x !== position.x || node.position.y !== position.y) {
          changedNodes.push({ ...node, position });
        }

        const meta = automationMapRef.current[node.id];
        if (meta) {
          automationMapRef.current[node.id] = { ...meta, position };
        }

        return { ...node, position };
      });

      updateEdgesFromNodes(nextNodes as AutomationFlowNode[]);
      if (changedNodes.length > 0) {
        setLayoutDirty(true);
        setSaveFeedback(null);
      }
      return nextNodes;
    });
  }, [edges, setNodes, updateEdgesFromNodes]);

  const handleResetToDefaultOrder = useCallback(() => {
    const order = initialOrderRef.current;
    if (!order || order.length === 0) {
      return;
    }

    const orderedItems: AutomationOverviewItem[] = order
      .map((id, index) => {
        const meta = automationMapRef.current[id];
        if (!meta) {
          return null;
        }

        const defaultPosition = defaultPositionsRef.current[id] ?? {
          x: index * nodeSpacingX,
          y: nodeStartY,
        };

        return {
          ...meta,
          position: defaultPosition,
        } satisfies AutomationOverviewItem;
      })
      .filter((item): item is AutomationOverviewItem => Boolean(item));

    const knownIds = new Set(order);
    const additionalItems: AutomationOverviewItem[] = Object.values(automationMapRef.current)
      .filter((item) => !knownIds.has(item.code))
      .map((item, index) => ({
        ...item,
        position: {
          x: (orderedItems.length + index) * nodeSpacingX,
          y: nodeStartY,
        },
      }));

    const combined = [...orderedItems, ...additionalItems];
    if (combined.length === 0) {
      return;
    }

    const nextNodes = buildNodes(combined);
    setNodes(nextNodes);
    updateEdgesFromNodes(nextNodes);
    combined.forEach((item) => {
      automationMapRef.current[item.code] = { ...automationMapRef.current[item.code], position: item.position };
    });
    setLayoutDirty(true);
    setSaveFeedback(null);
  }, [buildNodes, setNodes, updateEdgesFromNodes]);

  const handleSaveLayout = useCallback(async () => {
    if (savingLayout) {
      return;
    }

    const latestNodes = (reactFlowInstance?.getNodes?.() ?? nodes) as AutomationFlowNode[];
    if (!latestNodes || latestNodes.length === 0) {
      setSaveFeedback({ type: 'error', message: 'No workflow nodes available to save.' });
      return;
    }

    setSavingLayout(true);
    setSaveFeedback(null);

    const success = await persistNodePositions(latestNodes);

    setSavingLayout(false);

    if (success) {
      latestNodes.forEach((node) => {
        const meta = automationMapRef.current[node.id];
        if (meta) {
          automationMapRef.current[node.id] = { ...meta, position: node.position };
        }
      });
      setLayoutDirty(false);
      setSaveFeedback({ type: 'success', message: 'Workflow arrangement saved.' });
    } else {
      setSaveFeedback({ type: 'error', message: 'Unable to save layout. Please try again.' });
    }
  }, [nodes, persistNodePositions, reactFlowInstance, savingLayout]);

  const applyStatusUpdates = useCallback((updates: AutomationStatusUpdate[]) => {
    if (!updates || updates.length === 0) {
      return;
    }

    const updateMap = updates.reduce<Record<string, AutomationStatusUpdate>>((acc, item) => {
      acc[item.code] = item;
      return acc;
    }, {});

    setNodes((current) =>
      current.map((node) => {
        const update = updateMap[node.id];
        if (!update) {
          return node;
        }

        const nextStatus = mapStatusToNodeStatus(update.status ?? node.data.status);
        return {
          ...node,
          data: {
            ...node.data,
            status: nextStatus,
            statusLabel: update.statusLabel ?? node.data.statusLabel,
            connected: typeof update.connected === 'boolean' ? update.connected : node.data.connected,
          },
        } satisfies AutomationFlowNode;
      }),
    );

    Object.values(updateMap).forEach((update) => {
      const meta = automationMapRef.current[update.code];
      if (!meta) {
        return;
      }

      automationMapRef.current[update.code] = {
        ...meta,
        status: toAutomationStatusValue(update.status, meta.status),
        statusLabel: update.statusLabel ?? meta.statusLabel,
        connected:
          typeof update.connected === 'boolean' ? update.connected : meta.connected,
      };
    });
  }, [setNodes]);

  const fetchAutomationStatuses = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      const token = await user.getIdToken();
      const response = await apiFetch('/automations/status', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to refresh automation statuses (${response.status})`);
      }

      const payload = await response.json();
      const updates = normalizeStatusPayload(payload);
      applyStatusUpdates(updates);
    } catch (err) {
      console.error('Unable to refresh automation statuses', err);
    }
  }, [applyStatusUpdates, user]);

  useEffect(() => {
    let active = true;

    const fetchAutomations = async () => {
      if (!user) {
        setError(null);
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

        const filtered = data.nodes
          .filter((node) => node.code !== 'VPE')
          .map<AutomationOverviewItem>((node) => ({
            ...node,
            shortDescription: simplifyDescription(node.description ?? ''),
            position: extractPosition(node as unknown as Record<string, unknown>),
          }))
          .sort((a, b) => a.sequence - b.sequence);

        refreshNodes(filtered);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Unable to load automations.';
        console.error('Failed to load automations', err);
        setError(message);
        refreshNodes([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void fetchAutomations();

    return () => {
      active = false;
    };
  }, [user, refreshNodes]);

  useEffect(() => {
    if (!user) {
      if (statusIntervalRef.current) {
        window.clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      return;
    }

    void fetchAutomationStatuses();

    if (statusIntervalRef.current) {
      window.clearInterval(statusIntervalRef.current);
    }

    statusIntervalRef.current = window.setInterval(() => {
      void fetchAutomationStatuses();
    }, statusRefreshIntervalMs);

    return () => {
      if (statusIntervalRef.current) {
        window.clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
    };
  }, [fetchAutomationStatuses, user]);

  useEffect(() => {
    if (!selectedAutomationId || !user) {
      setSelectedRuns([]);
      setSelectedLastRun(null);
      setSelectedRunsLoading(false);
      setSelectedRunsError(null);
      setSelectedSchedule({ ...getDefaultSchedule() });
      setSelectedScheduleLoading(false);
      setSelectedScheduleError(null);
      return;
    }

    let active = true;
    setSelectedRunsLoading(true);
    setSelectedScheduleLoading(true);
    setSelectedRunsError(null);
    setSelectedScheduleError(null);

    const loadInspectorDetails = async () => {
      try {
        const token = await user.getIdToken();
        const [runsResponse, scheduleResponse] = await Promise.all([
          apiFetch(`/automations/runs/${selectedAutomationId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          apiFetch(`/automations/${selectedAutomationId}/schedule`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!active) {
          return;
        }

        if (runsResponse.ok) {
          const payload = await runsResponse.json().catch(() => null);
          if (active) {
            const normalized = normalizeRunHistory(payload);
            setSelectedLastRun(normalized.lastRun);
            setSelectedRuns(normalized.runs.slice(0, 5));
          }
        } else {
          setSelectedRuns([]);
          setSelectedLastRun(null);
          setSelectedRunsError('Unable to load recent runs.');
        }

        if (scheduleResponse.ok) {
          const payload = await scheduleResponse.json().catch(() => null);
          if (active) {
            setSelectedSchedule(normalizeSchedule(payload));
          }
        } else if (scheduleResponse.status === 404) {
          setSelectedSchedule({ ...getDefaultSchedule() });
        } else {
          setSelectedSchedule({ ...getDefaultSchedule() });
          setSelectedScheduleError('Unable to load schedule settings.');
        }
      } catch (err) {
        if (!active) {
          return;
        }
        console.warn('Unable to load automation inspector details', err);
        setSelectedRuns([]);
        setSelectedLastRun(null);
        setSelectedRunsError('Unable to load recent runs.');
        setSelectedSchedule({ ...getDefaultSchedule() });
        setSelectedScheduleError('Unable to load schedule settings.');
      } finally {
        if (active) {
          setSelectedRunsLoading(false);
          setSelectedScheduleLoading(false);
        }
      }
    };

    void loadInspectorDetails();

    return () => {
      active = false;
    };
  }, [inspectorRefreshKey, selectedAutomationId, user]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const execution = executionStates[node.id] ?? { status: 'idle' as const };
        return {
          ...node,
          data: {
            ...node.data,
            executionStatus: execution.status,
            executionMessage: execution.message ?? null,
          },
        } satisfies AutomationFlowNode;
      }),
    );
  }, [executionStates, setNodes]);

  useEffect(() => {
    return () => {
      Object.values(executionResetTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      executionResetTimersRef.current = {};
      if (saveFeedbackTimeoutRef.current) {
        window.clearTimeout(saveFeedbackTimeoutRef.current);
        saveFeedbackTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!reactFlowInstance || nodes.length === 0 || initialFitDone) {
      return;
    }

    reactFlowInstance.fitView({ padding: 0.35, duration: 600, minZoom: 0.4 });
    setInitialFitDone(true);
  }, [reactFlowInstance, nodes, initialFitDone]);

  useEffect(() => {
    if (!saveFeedback) {
      return;
    }

    if (saveFeedbackTimeoutRef.current) {
      window.clearTimeout(saveFeedbackTimeoutRef.current);
    }

    saveFeedbackTimeoutRef.current = window.setTimeout(() => {
      setSaveFeedback(null);
      saveFeedbackTimeoutRef.current = null;
    }, saveFeedback.type === 'success' ? 3200 : 4600);

    return () => {
      if (saveFeedbackTimeoutRef.current) {
        window.clearTimeout(saveFeedbackTimeoutRef.current);
        saveFeedbackTimeoutRef.current = null;
      }
    };
  }, [saveFeedback]);

  const inspectorExecutionState = selectedAutomation
    ? executionStates[selectedAutomation.code] ?? { status: 'idle' as const }
    : { status: 'idle' as const };

  const inspectorStatus = useMemo(() => {
    if (!selectedAutomation) {
      return null;
    }
    const style = inspectorStatusStyles[selectedAutomation.status] ?? inspectorStatusStyles.operational;
    return {
      label: selectedAutomation.statusLabel || style.label,
      chip: style.chip,
    };
  }, [selectedAutomation]);

  const scheduleSummary = selectedSchedule ?? getDefaultSchedule();
  const scheduleDescription = scheduleSummary.enabled
    ? scheduleSummary.frequency === 'hourly'
      ? 'Runs every hour'
      : scheduleSummary.frequency === 'daily'
        ? `Runs daily at ${scheduleSummary.timeOfDay}`
        : `Runs every ${scheduleSummary.dayOfWeek.charAt(0).toUpperCase() + scheduleSummary.dayOfWeek.slice(1)} at ${scheduleSummary.timeOfDay}`
    : 'Automatic scheduling disabled.';

  return (
    <div className="space-y-10 text-slate-100">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-3"
      >
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Automations</p>
      </motion.header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] 2xl:grid-cols-[minmax(0,1.85fr)_minmax(360px,1fr)]">
        <div className="relative h-[720px] w-full overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/50">
          {loading ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 backdrop-blur">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : null}

          {error ? (
            <div className="absolute inset-x-0 top-0 z-30 m-6 rounded-2xl border border-rose-800/70 bg-rose-950/60 p-4 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="absolute right-5 top-5 z-30 flex flex-col items-end gap-3">
            <div className="flex flex-col gap-2 md:flex-row">
              <button
                type="button"
                onClick={handleResetToDefaultOrder}
                disabled={nodes.length === 0}
                className={`rounded-full border border-slate-700/70 bg-slate-900/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 shadow-lg shadow-black/40 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 md:min-w-[168px] ${
                  nodes.length === 0
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:border-rose-500/50 hover:text-rose-200'
                }`}
              >
                Reset layout
              </button>
              <button
                type="button"
                onClick={() => {
                  if (nodes.length === 0) return;
                  handleAutoLayout();
                }}
                disabled={nodes.length === 0}
                className={`rounded-full border border-slate-700/70 bg-slate-900/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 shadow-lg shadow-black/40 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 md:min-w-[168px] ${
                  nodes.length === 0
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:border-rose-500/50 hover:text-rose-200'
                }`}
              >
                Auto arrange
              </button>
              <button
                type="button"
                onClick={handleSaveLayout}
                disabled={nodes.length === 0 || savingLayout || !layoutDirty}
                className={`rounded-full border border-rose-500/60 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-100 shadow-lg shadow-black/40 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 md:min-w-[168px] ${
                  nodes.length === 0 || savingLayout || !layoutDirty
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:border-rose-400/80 hover:text-rose-50'
                }`}
              >
                {savingLayout ? 'Saving…' : 'Save layout'}
              </button>
            </div>
            {saveFeedback ? (
              <div
                className={`rounded-full px-4 py-1 text-xs font-medium uppercase tracking-[0.2em] ${
                  saveFeedback.type === 'success'
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : 'bg-rose-500/10 text-rose-200'
                }`}
              >
                {saveFeedback.message}
              </div>
            ) : null}
          </div>

          <ReactFlowProvider>
            <ReactFlow
              className="reactflow-dark"
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStop={handleNodeDragStop}
              onInit={handleInit}
              fitView
              panOnScroll={false}
              panOnDrag
              zoomOnScroll
              minZoom={0.3}
              maxZoom={1.6}
              nodesDraggable
              nodeTypes={nodeTypes}
              proOptions={{ hideAttribution: true }}
              style={{ width: '100%', height: '100%' }}
            >
              <Background color="rgba(148, 163, 184, 0.2)" gap={28} />
              {controlsVisible ? (
                <>
                  <MiniMap
                    className="!bg-slate-900/90 !text-slate-200"
                    pannable
                    zoomable
                    maskColor="rgba(15, 23, 42, 0.92)"
                    nodeColor={(node) => {
                      const status = (node.data as AutomationNodeData | undefined)?.status;
                      if (status === 'offline') return '#f87171';
                      if (status === 'under-watch') return '#facc15';
                      return '#34d399';
                    }}
                    nodeStrokeColor="rgba(148, 163, 184, 0.4)"
                  />
                  <Controls className="!border-none !bg-transparent" />
                </>
              ) : null}
            </ReactFlow>
          </ReactFlowProvider>

          <button
            type="button"
            onClick={() => setControlsVisible((prev) => !prev)}
            className="absolute bottom-5 left-5 z-30 rounded-full border border-slate-700/70 bg-slate-900/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-200 shadow-lg shadow-black/40 transition hover:border-rose-500/40 hover:text-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
          >
            {controlsVisible ? 'Hide controls' : 'Show controls'}
          </button>

          {!loading && nodes.length === 0 && !error ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              No automations found.
            </div>
          ) : null}
        </div>

        <aside className="flex min-h-[720px] flex-col gap-5 rounded-3xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-2xl shadow-black/40">
          {selectedAutomation ? (
            <div className="flex h-full flex-col gap-6">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Selected node</p>
                    <h2 className="text-2xl font-semibold text-white">{selectedAutomation.title}</h2>
                    <p className="text-sm text-slate-300">{selectedAutomation.shortDescription}</p>
                  </div>
                  {inspectorStatus ? (
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${inspectorStatus.chip}`}
                    >
                      <span className="h-2 w-2 rounded-full bg-current" />
                      {inspectorStatus.label}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleExecuteAutomation(selectedAutomation.code)}
                    disabled={inspectorExecutionState.status === 'running'}
                    className="inline-flex items-center gap-2 rounded-full bg-rose-500/25 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-rose-100 shadow-lg shadow-rose-500/25 transition hover:bg-rose-500/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {inspectorExecutionState.status === 'running' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {inspectorExecutionState.status === 'running' ? 'Executing…' : 'Execute'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenDetails(selectedAutomation.code)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-300 transition hover:border-rose-400/60 hover:text-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
                  >
                    Open full view
                  </button>
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${
                    selectedAutomation.connected ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border border-amber-500/40 bg-amber-500/10 text-amber-200'
                  }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {selectedAutomation.connected ? 'n8n connected' : 'Connection pending'}
                  </span>
                </div>

                {inspectorExecutionState.message ? (
                  <p className="text-xs text-rose-200">{inspectorExecutionState.message}</p>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-400">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Webhook</p>
                    <p className="mt-2 break-all font-mono text-[11px] text-slate-200">
                      {selectedAutomation.webhookUrl ?? 'Not configured'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-400">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Deliverables</p>
                    <p className="mt-2 text-sm text-slate-200">
                      {selectedAutomation.deliverables.length > 0 ? selectedAutomation.deliverables.length : 'None listed'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <section className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                      <Clock className="h-4 w-4" />Input
                    </span>
                    {selectedRunsLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                  </div>
                  {selectedLastRun && selectedLastRun.requestPayload ? (
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono text-[11px] text-slate-200">
                      {typeof selectedLastRun.requestPayload === 'string'
                        ? selectedLastRun.requestPayload
                        : JSON.stringify(selectedLastRun.requestPayload, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-slate-400">No payload recorded for the latest execution.</p>
                  )}
                  <p className="text-xs text-slate-500">
                    Started {selectedLastRun ? formatTimestamp(selectedLastRun.startedAt) : '—'}
                  </p>
                </section>

                <section className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                      <Settings2 className="h-4 w-4" />Output
                    </span>
                    {inspectorExecutionState.status === 'running' && (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                    )}
                  </div>
                  {selectedLastRun ? (
                    selectedLastRun.error ? (
                      <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        {selectedLastRun.error}
                      </p>
                    ) : selectedLastRun.responseBody ? (
                      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono text-[11px] text-slate-200">
                        {typeof selectedLastRun.responseBody === 'string'
                          ? selectedLastRun.responseBody
                          : JSON.stringify(selectedLastRun.responseBody, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm text-slate-400">The workflow did not return a response body.</p>
                    )
                  ) : (
                    <p className="text-sm text-slate-400">Execute the workflow to view output details.</p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <p className="text-xs text-slate-500">
                      HTTP {selectedLastRun ? selectedLastRun.httpStatus ?? '—' : '—'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Duration {selectedLastRun ? formatDuration(selectedLastRun.durationMs) : '—'}
                    </p>
                  </div>
                </section>
              </div>

              <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                    <CalendarClock className="h-4 w-4" />Schedule
                  </span>
                  {selectedScheduleLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                </div>
                <p className="text-sm text-slate-300">{scheduleDescription}</p>
                <p className="text-xs text-slate-500">Timezone · {scheduleSummary.timezone}</p>
                {selectedScheduleError ? (
                  <p className="text-xs text-amber-200">{selectedScheduleError}</p>
                ) : null}
              </section>

              <section className="flex-1 space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                    <History className="h-4 w-4" />Recent runs
                  </span>
                  {selectedRunsLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                </div>
                {selectedRunsError ? (
                  <p className="text-xs text-amber-200">{selectedRunsError}</p>
                ) : selectedRuns.length === 0 ? (
                  <p className="text-sm text-slate-400">No executions recorded for this automation yet.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedRuns.map((run) => (
                      <div
                        key={`${run.code}-${run.finishedAt}`}
                        className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-slate-100">{formatTimestamp(run.finishedAt)}</p>
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${
                              run.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200'
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full bg-current" />
                            {run.ok ? 'Success' : 'Needs attention'}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          HTTP {run.httpStatus ?? '—'} · Duration {formatDuration(run.durationMs)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleOpenDetails(selectedAutomation.code)}
                  className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:text-rose-100"
                >
                  View full history
                </button>
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/50 p-6 text-center text-sm text-slate-400">
              Select a node on the canvas to inspect its OpenAI workflow configuration.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
