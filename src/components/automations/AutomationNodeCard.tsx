import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Handle, NodeProps, Position } from 'reactflow';
import { CalendarClock, Loader2, Play } from 'lucide-react';
import type { AutomationStatus } from '../../types/automations';

export interface AutomationNodeData {
  code: string;
  name: string;
  headline: string;
  summary: string;
  status: AutomationStatus;
  statusLabel: string;
  connected: boolean;
  lastRun: string | null;
  onOpen: (id: string) => void;
  onExecute?: (id: string) => void;
  canExecute?: boolean;
  executionStatus?: 'idle' | 'running' | 'success' | 'error';
  executionMessage?: string | null;
}

const statusStyles: Record<
  AutomationStatus,
  { label: string; dot: string; chip: string; ring: string; button: string }
> = {
  operational: {
    label: 'Operational',
    dot: 'bg-emerald-400',
    chip: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    ring: 'ring-2 ring-emerald-400/40',
    button: 'border border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/10',
  },
  monitoring: {
    label: 'Monitoring',
    dot: 'bg-sky-400',
    chip: 'border border-sky-500/40 bg-sky-500/10 text-sky-100',
    ring: 'ring-2 ring-sky-400/40',
    button: 'border border-sky-500/40 text-sky-100 hover:bg-sky-500/10',
  },
  warning: {
    label: 'Needs attention',
    dot: 'bg-amber-400',
    chip: 'border border-amber-500/40 bg-amber-500/10 text-amber-100',
    ring: 'ring-2 ring-amber-400/40',
    button: 'border border-amber-500/40 text-amber-100 hover:bg-amber-500/10',
  },
  error: {
    label: 'Blocked',
    dot: 'bg-rose-400',
    chip: 'border border-rose-500/40 bg-rose-500/10 text-rose-100',
    ring: 'ring-2 ring-rose-400/40',
    button: 'border border-rose-500/40 text-rose-100 hover:bg-rose-500/10',
  },
};

const executionMessageStyles: Record<NonNullable<AutomationNodeData['executionStatus']>, string> = {
  idle: 'text-slate-400',
  running: 'text-amber-200',
  success: 'text-emerald-200',
  error: 'text-rose-200',
};

const formatRelativeTime = (value: string | null): string => {
  if (!value) return 'No runs yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No runs yet';
  }

  const diff = date.getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const minutes = Math.round(diff / (1000 * 60));

  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, 'minute');
  }

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) {
    return formatter.format(hours, 'hour');
  }

  const days = Math.round(hours / 24);
  return formatter.format(days, 'day');
};

function AutomationNodeCardComponent({ id, data, selected }: NodeProps<AutomationNodeData>) {
  const statusStyle = statusStyles[data.status] ?? statusStyles.operational;
  const executionStatus = data.executionStatus ?? 'idle';
  const executionMessage = data.executionMessage;
  const executionMessageClass = executionMessageStyles[executionStatus];
  const isExecuting = executionStatus === 'running';
  const canExecute = Boolean(data.onExecute) && (data.canExecute ?? true);

  const lastRunLabel = useMemo(() => formatRelativeTime(data.lastRun), [data.lastRun]);

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-none !bg-slate-500"
      />
      <button
        type="button"
        onClick={() => data.onOpen(id)}
        className={`group relative w-[280px] rounded-3xl border border-slate-800/70 bg-slate-900/70 p-5 text-left shadow-lg shadow-black/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 ${
          selected ? statusStyle.ring : ''
        }`}
      >
        <motion.div
          layout
          initial={{ opacity: 0.85, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ translateY: -3 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                {data.headline}
              </span>
              <h3 className="text-lg font-semibold text-slate-50">{data.name}</h3>
            </div>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusStyle.chip}`}
            >
              <span className={`h-2 w-2 rounded-full ${statusStyle.dot}`} />
              {statusStyle.label}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-slate-300">{data.summary}</p>

          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              {lastRunLabel}
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (!data.onExecute || !canExecute || isExecuting) return;
                data.onExecute(id);
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                statusStyle.button
              } ${!canExecute || isExecuting ? 'pointer-events-none opacity-60' : ''}`}
            >
              {isExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run
            </button>
          </div>

          <div className="mt-3 space-y-1 text-xs text-slate-400">
            <p>{data.statusLabel}</p>
            {executionMessage ? (
              <p className={`font-medium ${executionMessageClass}`}>{executionMessage}</p>
            ) : null}
          </div>
        </motion.div>
      </button>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-none !bg-rose-400"
      />
    </>
  );
}

export const AutomationNodeCard = memo(AutomationNodeCardComponent);

export default AutomationNodeCard;
