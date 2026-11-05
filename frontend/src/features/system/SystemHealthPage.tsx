import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Cpu,
  Play,
  Sparkles,
  History,
  Check,
  CloudUpload,
  Wrench,
} from 'lucide-react';
import {
  api,
  type SystemDiagnosticsResponse,
  type RecipeCoverageSlot,
} from '../../api/client';
import { LoadingState } from '../../components/LoadingState';
import { HistoryPage } from '../history/HistoryPage';

const PLATFORMS = ['instagram', 'twitter', 'facebook'];
const ACTIONS = [
  { key: 'publish_post', label: 'Publish Post' },
  { key: 'send_dm', label: 'Send Cold DM' },
  { key: 'comment_reply', label: 'Reply to Post' },
];

function StatusPill({ status }: { status: 'healthy' | 'warning' | 'error' }) {
  const styles = {
    healthy: { class: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2, label: 'Healthy' },
    warning: { class: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle, label: 'Warning' },
    error: { class: 'bg-rose-50 text-rose-700 border-rose-200', icon: AlertCircle, label: 'Error' },
  };
  const current = styles[status] || styles.warning;
  const Icon = current.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${current.class}`}>
      <Icon size={11} strokeWidth={2.5} />
      <span>{current.label}</span>
    </span>
  );
}

export const SystemHealthPage: React.FC = () => {
  const [activeView, setActiveView] = useState<'diagnostics' | 'audit'>('diagnostics');
  const [diagnostics, setDiagnostics] = useState<SystemDiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSeeding, setIsSeeding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [runningWorker, setRunningWorker] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // User-triggered reload
  const loadDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.system.getDiagnostics();
      setDiagnostics(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to run system diagnostics.');
    } finally {
      setLoading(false);
    }
  };

  // Mount effect (Zero synchronous setState inside effect body)
  useEffect(() => {
    let isMounted = true;

    api.system
      .getDiagnostics()
      .then((data) => {
        if (isMounted) setDiagnostics(data);
      })
      .catch((err) => {
        if (isMounted) setError(err?.message || 'Failed to load diagnostics.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSeedRecipes = async () => {
    setIsSeeding(true);
    try {
      const res = await api.system.seedRecipes();
      showToast(res.message);
      await loadDiagnostics();
    } catch (err: any) {
      showToast(err?.message || 'Failed to seed default recipes.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSyncReplica = async () => {
    setIsSyncing(true);
    try {
      const res = await api.system.syncReplica();
      showToast(res.message, res.status === 'synced' ? 'success' : 'error');
      await loadDiagnostics();
    } catch (err: any) {
      showToast(err?.message || 'Replica sync failed.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTriggerWorker = async (worker: 'post_dispatcher' | 'watcher_worker' | 'quota_reset_worker') => {
    setRunningWorker(worker);
    try {
      const res = await api.system.runWorker(worker);
      showToast(res.message);
      await loadDiagnostics();
    } catch (err: any) {
      showToast(err?.message || 'Worker execution failed.', 'error');
    } finally {
      setRunningWorker(null);
    }
  };

  const matrixByPlatform = useMemo(() => {
    const map: Record<string, Record<string, RecipeCoverageSlot>> = {};
    if (!diagnostics) return map;

    for (const slot of diagnostics.recipe_matrix) {
      if (!map[slot.platform]) map[slot.platform] = {};
      map[slot.platform][slot.action_type] = slot;
    }
    return map;
  }, [diagnostics]);

  if (activeView === 'audit') {
    return (
      <div className="h-full flex flex-col max-w-6xl mx-auto w-full">
        <div className="px-3 sm:px-6 pt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/90 border border-[#DCE7F5] shadow-2xs">
            <button
              onClick={() => setActiveView('diagnostics')}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-[#09122A] cursor-pointer"
            >
              <Cpu size={13} />
              <span>System Diagnostics</span>
            </button>
            <button
              onClick={() => setActiveView('audit')}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#EBF3FC] text-[#0E3A75] shadow-2xs cursor-pointer"
            >
              <History size={13} />
              <span>Activity Audit Trail</span>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <HistoryPage />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-y-auto px-3 sm:px-6 py-4 custom-scrollbar max-w-6xl mx-auto w-full font-sans select-none text-[#09122A]">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl text-white text-xs font-semibold shadow-2xl animate-fade-up-1 ${
            toast.type === 'error' ? 'bg-rose-600' : 'bg-[#0E3A75]'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle size={15} /> : <Check size={15} className="text-emerald-400" strokeWidth={3} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top View Switcher */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/90 border border-[#DCE7F5] shadow-2xs">
          <button
            onClick={() => setActiveView('diagnostics')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#EBF3FC] text-[#0E3A75] shadow-2xs cursor-pointer"
          >
            <Cpu size={13} />
            <span>System Diagnostics</span>
          </button>
          <button
            onClick={() => setActiveView('audit')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-[#09122A] cursor-pointer"
          >
            <History size={13} />
            <span>Activity Audit Trail</span>
          </button>
        </div>

        {diagnostics && <StatusPill status={diagnostics.overall_status} />}
      </div>

      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[28px] sm:text-[34px] font-bold tracking-[-0.025em] text-[#09122A] leading-tight">
            System Diagnostics{' '}
            <span className="relative inline-block font-serif italic font-normal text-[#0D2149]">
              & recipe matrix
              <svg className="absolute -bottom-1.5 left-0 w-full h-3 text-amber-400 pointer-events-none" viewBox="0 0 160 14" fill="none">
                <path d="M3 10C45 4 115 3 157 8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="text-[13px] text-[#475569] mt-1">
            Pre-flight health checks across your database, encryption vault, stealth browser, background workers, and platform recipes.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={loadDiagnostics}
            title="Re-run diagnostics"
            className="w-9 h-9 rounded-xl bg-white border border-[#DCE7F5] hover:bg-slate-50 text-slate-600 flex items-center justify-center shadow-2xs cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-[#0E3A75]' : ''} />
          </button>
          <button
            onClick={handleSyncReplica}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-white border border-[#DCE7F5] hover:border-[#0E3A75] text-[#0E3A75] text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <CloudUpload size={14} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Turso Cloud'}</span>
          </button>
          <button
            onClick={handleSeedRecipes}
            disabled={isSeeding}
            className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-md cursor-pointer disabled:opacity-50"
          >
            <Sparkles size={14} />
            <span>{isSeeding ? 'Seeding...' : 'Seed Default Recipes'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle size={15} /><span>{error}</span>
        </div>
      )}

      {loading || !diagnostics ? (
        <div className="py-20 flex justify-center"><LoadingState label="Auditing system infrastructure" variant="Orbit" /></div>
      ) : (
        <div className="space-y-6 pb-10">
          {/* 2. Subsystem Health Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {diagnostics.subsystems.map((sub) => (
              <div key={sub.id} className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-bold text-xs text-[#09122A]">{sub.name}</span>
                    <StatusPill status={sub.status} />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{sub.message}</p>
                </div>
                {sub.latency_ms !== undefined && sub.latency_ms !== null && (
                  <div className="mt-3 pt-2 border-t border-[#F0F5FA] flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>Probe Latency</span>
                    <span className="font-bold text-[#0E3A75]">{sub.latency_ms} ms</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 3. Recipe Coverage Matrix (Only 3 Write Actions + AI Browser Agent Badge) */}
          <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-[#F0F5FA]">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-bold text-[16px] text-[#09122A] flex items-center gap-2">
                    <Wrench size={16} className="text-[#0E3A75]" />
                    <span>Platform × Action Default Recipe Matrix</span>
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold border border-purple-200">
                    <Sparkles size={10} />
                    <span>Read & Explore: AI Browser Agent Active</span>
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  Tracks deterministic Playwright write recipes (0-token cost). Read actions (inbox reading, scraping, scouting) are autonomously executed by the Browser AI Agent.
                </span>
              </div>
              <button
                onClick={handleSeedRecipes}
                disabled={isSeeding}
                className="px-3 py-1.5 rounded-xl bg-[#EBF3FC] hover:bg-[#DDEBFA] text-[#0E3A75] text-xs font-bold cursor-pointer self-start sm:self-auto shrink-0"
              >
                + Auto-Populate Missing Defaults
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2ECF7] text-slate-400 text-[11px] uppercase font-bold">
                    <th className="py-2.5 px-3">Platform</th>
                    {ACTIONS.map((a) => (
                      <th key={a.key} className="py-2.5 px-3">{a.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F5FA]">
                  {PLATFORMS.map((platform) => (
                    <tr key={platform} className="hover:bg-[#F8FAFD]">
                      <td className="py-3 px-3 font-bold capitalize text-[#09122A]">
                        {platform === 'twitter' ? 'X (Twitter)' : platform}
                      </td>
                      {ACTIONS.map((action) => {
                        const slot = matrixByPlatform[platform]?.[action.key];
                        if (!slot) return <td key={action.key} className="py-3 px-3">—</td>;

                        return (
                          <td key={action.key} className="py-3 px-3">
                            {slot.status === 'custom_ready' ? (
                              <div className="inline-flex flex-col">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10.5px] border border-emerald-200 w-fit">
                                  <Check size={10} strokeWidth={3} />
                                  <span>Default Recipe</span>
                                </span>
                                <span className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">
                                  {slot.recipe_name}
                                </span>
                              </div>
                            ) : slot.status === 'native_ready' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[10.5px] border border-blue-200">
                                <ShieldCheck size={11} />
                                <span>Native Fallback</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold text-[10.5px] border border-amber-200">
                                <AlertTriangle size={10} />
                                <span>Missing</span>
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Background Workers Control Panel */}
          <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm">
            <div className="pb-3 mb-4 border-b border-[#F0F5FA]">
              <h3 className="font-bold text-[16px] text-[#09122A]">Background Workers & Manual Triggers</h3>
              <span className="text-xs text-slate-400">Trigger any background worker loop immediately to test dispatching, scraping, or quota resets.</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {[
                { id: 'post_dispatcher', name: 'Scheduled Post Dispatcher', interval: 'Every 30 seconds', desc: 'Polls due posts and dispatches via platform adapters.' },
                { id: 'watcher_worker', name: 'Competitor Feed Watcher', interval: 'Every 5 minutes', desc: 'Scrapes watched handles and evaluates keyword rules.' },
                { id: 'quota_reset_worker', name: 'Quota Reset & Cloud Sync', interval: 'Every 30 minutes', desc: 'Resets 24h account quotas and syncs Turso replica.' },
              ].map((w) => {
                const isRunning = runningWorker === w.id;
                return (
                  <div key={w.id} className="p-4 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-[#09122A]">{w.name}</span>
                        <span className="font-mono text-[10px] text-[#0E3A75] bg-[#EBF3FC] px-2 py-0.5 rounded-md font-bold">{w.interval}</span>
                      </div>
                      <p className="text-[11.5px] text-slate-500 mb-3">{w.desc}</p>
                    </div>
                    <button
                      onClick={() => handleTriggerWorker(w.id as any)}
                      disabled={isRunning}
                      className="w-full py-2 rounded-xl bg-white hover:bg-[#0E3A75] text-[#0E3A75] hover:text-white border border-[#DCE7F5] text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Play size={12} className={isRunning ? 'animate-spin' : ''} />
                      <span>{isRunning ? 'Running Cycle...' : 'Trigger Worker Now'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 5. Database Entity Counts */}
          <div className="grid grid-cols-2 sm:grid-cols-7 gap-2.5">
            {Object.entries(diagnostics.entity_counts).map(([key, count]) => (
              <div key={key} className="p-3 rounded-2xl bg-white/90 border border-[#DCE7F5] text-center shadow-2xs">
                <div className="text-lg font-bold text-[#0E3A75]">{count}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                  {key.replace('_', ' ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemHealthPage;