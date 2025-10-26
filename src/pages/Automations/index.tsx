import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Background,
  ControlButton,
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

import { Loader2 } from 'lucide-react';
import dagre from '@dagrejs/dagre';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import type { AutomationNode } from '../../types/automations';
import type { AutomationNodeData } from '../../components/automations/AutomationNodeCard';
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

  const n8nBaseUrl = useMemo(() => {
    const raw = import.meta.env.VITE_N8N_BASE_URL ?? '';
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return '';
    }
    return raw.trim().replace(/\/$/, '');
  }, []);

  const nodeTypes = useMemo(() => {
    const renderer: AutomationNodeTypeRenderer = (props) => (
      <Suspense fallback={<NodeFallback />}>
        <LazyAutomationNode {...props} />
      </Suspense>
    );

    return { automation: renderer };
  }, []);

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

      clearExecutionReset(id);

      const webhook = (() => {
        if (meta.webhookUrl && meta.webhookUrl.trim().length > 0) {
          return meta.webhookUrl.trim();
        }
        if (!n8nBaseUrl || !meta.webhookPath) {
          return null;
        }
        const sanitizedPath = meta.webhookPath.replace(/^\/+/, '');
        return `${n8nBaseUrl}/${sanitizedPath}`;
      })();

      if (!webhook) {
        setExecutionStates((prev) => ({
          ...prev,
          [id]: { status: 'error', message: 'No webhook configured for this automation.' },
        }));
        scheduleExecutionReset(id);
        return;
      }

      setExecutionStates((prev) => ({
        ...prev,
        [id]: { status: 'running', message: 'Executing workflow…' },
      }));

      try {
        const response = await fetch(webhook, { method: 'POST' });
        if (!response.ok) {
          throw new Error(`Execution failed (${response.status})`);
        }

        setExecutionStates((prev) => ({
          ...prev,
          [id]: { status: 'success', message: 'Workflow triggered successfully.' },
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to execute workflow.';
        console.error('Failed to execute automation workflow', err);
        setExecutionStates((prev) => ({
          ...prev,
          [id]: { status: 'error', message },
        }));
      } finally {
        scheduleExecutionReset(id);
      }
    },
    [clearExecutionReset, n8nBaseUrl, scheduleExecutionReset],
  );

  const persistNodePosition = useCallback(
    async (id: string, position: { x: number; y: number }) => {
      if (!user) {
        return;
      }

      try {
        const token = await user.getIdToken();
        await apiFetch(`/automations/${id}/position`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ x: position.x, y: position.y }),
        });
      } catch (err) {
        console.error('Failed to persist automation node position', err);
      }
    },
    [user],
  );

  const persistNodePositions = useCallback(
    async (nodeList: AutomationFlowNode[]) => {
      if (!nodeList || nodeList.length === 0) {
        return;
      }

      await Promise.all(
        nodeList.map((node) => persistNodePosition(node.id, node.position)),
      );
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

  const handleOpenDetails = useCallback(
    (id: string) => {
      navigate(`/automations/${id}`);
    },
    [navigate],
  );

  const buildNodes = useCallback(
    (items: AutomationOverviewItem[]): AutomationFlowNode[] =>
      items.map((automation, index) => {
        const executionState = executionStates[automation.code] ?? { status: 'idle' as const };
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
            onOpen: handleOpenDetails,
            onExecute: handleExecuteAutomation,
            canExecute: Boolean(automation.webhookUrl || (n8nBaseUrl && automation.webhookPath)),
            executionStatus: executionState.status,
            executionMessage: executionState.message ?? null,
          },
        } satisfies AutomationFlowNode;
      }),
    [executionStates, handleExecuteAutomation, handleOpenDetails, n8nBaseUrl],
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
    },
    [buildNodes, setNodes, updateEdgesFromNodes],
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
      void persistNodePosition(node.id, node.position);
    },
    [persistNodePosition, setNodes, updateEdgesFromNodes],
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
        void persistNodePositions(changedNodes);
      }
      return nextNodes;
    });
  }, [edges, persistNodePositions, setNodes, updateEdgesFromNodes]);

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
  }, []);

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
    };
  }, []);

  useEffect(() => {
    if (!reactFlowInstance || nodes.length === 0 || initialFitDone) {
      return;
    }

    reactFlowInstance.fitView({ padding: 0.35, duration: 600, minZoom: 0.4 });
    setInitialFitDone(true);
  }, [reactFlowInstance, nodes, initialFitDone]);

  return (
    <div className="space-y-10 text-slate-100">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-3"
      >
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Automations</p>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Workflow Canvas</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Visualize each SmartOps automation as an interconnected pipeline. Drag nodes to explore different
            sequences and open any node to manage its details.
          </p>
        </div>
      </motion.header>

      <div className="relative h-[640px] w-full overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/50 sm:h-[560px]">
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

        <button
          type="button"
          onClick={() => {
            if (nodes.length === 0) return;
            handleAutoLayout();
          }}
          disabled={nodes.length === 0}
          className={`absolute right-5 top-5 z-30 hidden rounded-full border border-slate-700/70 bg-slate-900/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 shadow-lg shadow-black/40 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 md:flex ${
            nodes.length === 0
              ? 'cursor-not-allowed opacity-60'
              : 'hover:border-rose-500/50 hover:text-rose-200'
          }`}
        >
          Rearrange nodes
        </button>

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
            panOnScroll
            zoomOnScroll
            minZoom={0.3}
            maxZoom={1.6}
            nodesDraggable
            nodeTypes={nodeTypes}
            proOptions={{ hideAttribution: true }}
            style={{ width: '100%', height: '100%' }}
          >
            <Background color="rgba(148, 163, 184, 0.2)" gap={28} />
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
            <Controls className="!border-none !bg-transparent">
              <ControlButton
                onClick={() => {
                  if (nodes.length === 0) return;
                  handleAutoLayout();
                }}
                title="Rearrange nodes"
                className="!bg-slate-900/90 !text-slate-100 hover:!bg-rose-500/20 hover:!text-rose-100"
              >
                Auto layout
              </ControlButton>
            </Controls>
          </ReactFlow>
        </ReactFlowProvider>

        {!loading && nodes.length === 0 && !error ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            No automations found.
          </div>
        ) : null}
      </div>
    </div>
  );
}
