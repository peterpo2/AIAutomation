import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import type { AutomationNode } from '../../types/automations';

interface AutomationOverviewItem extends AutomationNode {
  shortDescription: string;
}

const simplifyDescription = (description: string) => {
  if (!description) return '';
  if (description.length <= 160) return description;
  return `${description.slice(0, 157)}…`;
};

export default function AutomationsOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [automations, setAutomations] = useState<AutomationOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchAutomations = async () => {
      if (!user) {
        setAutomations([]);
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

        setAutomations(filtered);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Unable to load automations.';
        console.error('Failed to load automations', err);
        setError(message);
        setAutomations([]);
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
  }, [user]);

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
          <h1 className="text-3xl font-semibold tracking-tight text-white">Automations Overview</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Review every SmartOps automation at a glance. Select a workflow to open its full details and manage the
            connection.
          </p>
        </div>
      </motion.header>

      {loading ? (
        <div className="flex items-center justify-center rounded-3xl border border-slate-800 bg-slate-950/60 py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-900/80 bg-rose-950/40 p-6 text-sm text-rose-200">
          {error}
        </div>
      ) : automations.length === 0 ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">
          No automations found.
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          className="grid gap-6 md:grid-cols-2 xl:grid-cols-3"
        >
          {automations.map((automation, index) => (
            <motion.button
              key={automation.code}
              type="button"
              onClick={() => navigate(`/automations/${automation.code}`)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + index * 0.04, duration: 0.3 }}
              whileHover={{ y: -6 }}
              whileTap={{ scale: 0.98 }}
              className="group flex h-full flex-col items-start rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-left shadow-lg shadow-black/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
            >
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white">{automation.title}</h2>
                <p className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                  {automation.shortDescription || 'This automation is ready for configuration.'}
                </p>
              </div>
              <div className="mt-6 flex w-full items-center justify-between text-xs font-medium">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 transition-colors ${
                    automation.connected
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {automation.connected ? 'Connected' : 'Not Connected'}
                </span>
                <span className="text-sm text-red-300 transition group-hover:text-red-200">View Details →</span>
              </div>
            </motion.button>
          ))}
        </motion.div>
      )}
    </div>
  );
}
