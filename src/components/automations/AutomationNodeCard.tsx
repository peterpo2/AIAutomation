import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Handle, NodeProps, Position } from 'reactflow';
import { Link2 } from 'lucide-react';

export interface AutomationNodeData {
  title: string;
  shortDescription: string;
  status: 'operational' | 'under-watch' | 'offline';
  statusLabel: string;
  connected: boolean;
  onOpen: (id: string) => void;
}

const statusStyles: Record<AutomationNodeData['status'], { label: string; dot: string; chip: string }> = {
  operational: {
    label: 'Operational',
    dot: 'bg-emerald-400',
    chip: 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/30',
  },
  'under-watch': {
    label: 'Under Watch',
    dot: 'bg-amber-400',
    chip: 'bg-amber-500/10 text-amber-200 border border-amber-500/30',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-rose-400',
    chip: 'bg-rose-500/10 text-rose-200 border border-rose-500/30',
  },
};

function AutomationNodeCardComponent({ id, data, selected }: NodeProps<AutomationNodeData>) {
  const statusStyle = statusStyles[data.status] ?? statusStyles.operational;
  const connectionColor = data.connected ? 'bg-emerald-400 shadow-emerald-400/60' : 'bg-slate-600 shadow-slate-600/40';

  const displayDescription = useMemo(() => {
    if (!data.shortDescription) return 'No description provided yet.';
    return data.shortDescription;
  }, [data.shortDescription]);

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-none !bg-gradient-to-tr !from-slate-700 !to-slate-500"
      />
      <button
        type="button"
        onClick={() => data.onOpen(id)}
        className="group relative w-[280px] rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 text-left shadow-xl shadow-black/40 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
      >
        <motion.div
          layout
          initial={{ opacity: 0.7, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ translateY: -6 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`flex flex-col gap-4 rounded-2xl border border-slate-800/60 bg-slate-950/70 p-4 transition-colors ${
            selected ? 'ring-2 ring-rose-400/60' : 'ring-0'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-50">{data.title}</h3>
              <p className="mt-1 text-xs uppercase tracking-[0.28em] text-slate-500">Automation node</p>
            </div>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusStyle.chip}`}
            >
              <span className={`h-2 w-2 rounded-full ${statusStyle.dot}`} />
              {statusStyle.label}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-slate-400 group-hover:text-slate-200 transition-colors">
            {displayDescription}
          </p>

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1 font-medium">
              <span className={`h-2.5 w-2.5 rounded-full shadow-lg ${connectionColor}`} />
              <span>{data.connected ? 'n8n connected' : 'Connection pending'}</span>
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-rose-300 group-hover:text-rose-200">
              View details
              <Link2 className="h-3.5 w-3.5" />
            </span>
          </div>
        </motion.div>
      </button>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-none !bg-gradient-to-tr !from-rose-500 !to-rose-300"
      />
    </>
  );
}

export const AutomationNodeCard = memo(AutomationNodeCardComponent);

export default AutomationNodeCard;
