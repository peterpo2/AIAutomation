import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Background,
  Controls,
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
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import type { AutomationNode } from '../../types/automations';
import type { AutomationNodeData } from '../../components/automations/AutomationNodeCard';
import '../../styles/reactflow.css';

const LazyAutomationNode = lazy(() => import('../../components/automations/AutomationNodeCard'));

interface AutomationOverviewItem extends AutomationNode {
  shortDescription: string;
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

const nodeSpacingX = 360;
const nodeStartY = 80;

type AutomationFlowNode = Node<AutomationNodeData>;

type AutomationNodeTypeRenderer = (props: NodeProps<AutomationNodeData>) => JSX.Element;

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

  const nodeTypes = useMemo(() => {
    const renderer: AutomationNodeTypeRenderer = (props) => (
      <Suspense fallback={<NodeFallback />}>
        <LazyAutomationNode {...props} />
      </Suspense>
    );

    return { automation: renderer };
  }, []);

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
      items.map((automation, index) => ({
        id: automation.code,
        type: 'automation',
        position: { x: index * nodeSpacingX, y: nodeStartY },
        draggable: true,
        data: {
          title: automation.title,
          shortDescription: automation.shortDescription,
          status: statusMap[automation.status] ?? 'operational',
          statusLabel: automation.statusLabel,
          connected: automation.connected,
          onOpen: handleOpenDetails,
        },
      })),
    [handleOpenDetails],
  );

  const refreshNodes = useCallback(
    (items: AutomationOverviewItem[]) => {
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
    },
    [setNodes, updateEdgesFromNodes],
  );

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
  }, []);

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

      <div className="relative min-h-[560px] overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/50">
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
          >
            <Background color="rgba(148, 163, 184, 0.2)" gap={28} />
            <Controls className="!border-none !bg-transparent" />
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
