import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  History,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Bot,
  User,
  Cpu,
  Send,
  Radio,
  Search,
  X,
  Eye,
  Terminal,
} from "lucide-react";
import { api, type ActivityLog, type ActivitySeverity } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { LoadingState } from "../../components/LoadingState";

// ============================================================================
// Severity & Actor Helpers
// ============================================================================

function SeverityBadge({ severity }: { severity: ActivitySeverity }) {
  const styles: Record<
    ActivitySeverity,
    { class: string; icon: React.ElementType; label: string }
  > = {
    success: {
      class: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
      icon: CheckCircle2,
      label: "Success",
    },
    info: {
      class: "bg-blue-50 text-blue-700 border-blue-200/60",
      icon: Info,
      label: "Info",
    },
    warning: {
      class: "bg-amber-50 text-amber-700 border-amber-200/60",
      icon: AlertTriangle,
      label: "Warning",
    },
    error: {
      class: "bg-rose-50 text-rose-700 border-rose-200/60",
      icon: AlertCircle,
      label: "Error",
    },
  };

  const item = styles[severity] || styles.info;
  const Icon = item.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${item.class}`}
    >
      <Icon size={10} strokeWidth={2.5} />
      <span>{item.label}</span>
    </span>
  );
}

function ActorBadge({ actor }: { actor: string }) {
  const cleanActor = actor.toLowerCase();

  let Icon = Cpu;
  let label = actor;
  let bg = "bg-slate-100 text-slate-700 border-slate-200/60";

  if (cleanActor.includes("agent") || cleanActor.includes("copilot")) {
    Icon = Bot;
    label = "AI Copilot";
    bg = "bg-purple-50 text-purple-700 border-purple-200/60";
  } else if (cleanActor.includes("user")) {
    Icon = User;
    label = "User Action";
    bg = "bg-[#EBF3FC] text-[#0E3A75] border-[#D0E2F7]";
  } else if (cleanActor.includes("dispatcher") || cleanActor.includes("post")) {
    Icon = Send;
    label = "Post Dispatcher";
    bg = "bg-blue-50 text-blue-700 border-blue-200/60";
  } else if (cleanActor.includes("watcher")) {
    Icon = Radio;
    label = "Feed Watcher";
    bg = "bg-amber-50 text-amber-700 border-amber-200/60";
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold uppercase tracking-wide border font-mono ${bg}`}
    >
      <Icon size={11} />
      <span>{label}</span>
    </span>
  );
}

export const HistoryPage: React.FC = () => {
  const limit = 60;

  // Filters & Search State
  const [severityFilter, setSeverityFilter] = useState<
    ActivitySeverity | "all"
  >("all");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Inspector Modal State
  const [inspectingLog, setInspectingLog] = useState<ActivityLog | null>(null);

  // 1. Reactive Queries via TanStack Query
  const {
    data: logs = [],
    isLoading: loading,
    isError,
    error: queryError,
    refetch,
  } = useQuery<ActivityLog[]>({
    queryKey: queryKeys.history.list({ limit }),
    queryFn: () => api.history.list({ limit }),
  });

  const stats = useMemo(() => {
    const total = logs.length;
    const successes = logs.filter((l) => l.severity === "success").length;
    const warnings = logs.filter((l) => l.severity === "warning").length;
    const errors = logs.filter((l) => l.severity === "error").length;

    return { total, successes, warnings, errors };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      const matchSeverity =
        severityFilter === "all" || l.severity === severityFilter;
      const matchActor =
        actorFilter === "all" ||
        l.actor.toLowerCase().includes(actorFilter.toLowerCase());
      const query = searchQuery.trim().toLowerCase();
      const matchQuery =
        !query ||
        l.title.toLowerCase().includes(query) ||
        (l.description && l.description.toLowerCase().includes(query)) ||
        l.activity_type.toLowerCase().includes(query) ||
        (l.entity_type && l.entity_type.toLowerCase().includes(query));

      return matchSeverity && matchActor && matchQuery;
    });
  }, [logs, severityFilter, actorFilter, searchQuery]);

  return (
    <div className="relative h-full overflow-y-auto px-3 sm:px-6 py-4 custom-scrollbar max-w-6xl mx-auto w-full font-sans select-none text-[#09122A]">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 border border-[#DCE7F5] text-[11px] font-bold uppercase tracking-wider text-[#0E3A75] mb-2 shadow-2xs">
            <History size={11} />
            <span>Unified Activity Audit Trail</span>
          </div>
          <h1 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.025em] text-[#09122A] leading-tight">
            System Activity{" "}
            <span className="relative inline-block font-serif italic font-normal text-[#0D2149]">
              & audit logs
              <svg
                className="absolute -bottom-1.5 left-0 w-full h-3 text-amber-400 pointer-events-none"
                viewBox="0 0 160 14"
                fill="none"
              >
                <path
                  d="M3 10C45 4 115 3 157 8"
                  stroke="currentColor"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>
          <p className="text-[13.5px] text-[#475569] mt-1">
            Real-time chronological timeline of background workers, post
            deliveries, trigger events, and AI agent executions.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => refetch()}
            title="Refresh logs"
            className="w-9 h-9 rounded-xl bg-white border border-[#DCE7F5] hover:bg-slate-50 text-slate-600 flex items-center justify-center shadow-2xs cursor-pointer"
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin text-[#0E3A75]" : ""}
            />
          </button>
        </div>
      </div>

      {/* 2. Top KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Events
          </span>
          <div className="text-2xl font-bold text-[#09122A]">
            {stats.total} Logs
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Stored in PostgreSQL
          </span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Successful Actions
          </span>
          <div className="text-2xl font-bold text-emerald-700">
            {stats.successes}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Dispatched & synced
          </span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Warnings & Pacing
          </span>
          <div className="text-2xl font-bold text-amber-700">
            {stats.warnings}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Anti-ban throttles
          </span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Exceptions & Failures
          </span>
          <div
            className={`text-2xl font-bold ${stats.errors > 0 ? "text-rose-600" : "text-slate-700"}`}
          >
            {stats.errors}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Diagnostics logged
          </span>
        </div>
      </div>

      {/* 3. Search and Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 p-2 rounded-2xl bg-white/80 border border-[#DCE7F5]">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSeverityFilter("all")}
            className={`px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
              severityFilter === "all"
                ? "bg-[#EBF3FC] text-[#0E3A75]"
                : "text-slate-500 hover:text-[#09122A]"
            }`}
          >
            All Severities
          </button>
          {(["success", "info", "warning", "error"] as ActivitySeverity[]).map(
            (s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold capitalize cursor-pointer transition-all ${
                  severityFilter === s
                    ? "bg-[#EBF3FC] text-[#0E3A75]"
                    : "text-slate-500 hover:text-[#09122A]"
                }`}
              >
                {s}
              </button>
            ),
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center h-8 px-2.5 rounded-xl bg-white border border-[#DCE7F5] text-xs">
            <Search size={12} className="text-slate-400 mr-1.5" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none text-xs text-[#09122A] w-28 sm:w-44"
            />
          </div>

          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="h-8 px-2 rounded-xl bg-white border border-[#DCE7F5] text-xs font-semibold text-[#09122A] outline-none cursor-pointer"
          >
            <option value="all">All Actors</option>
            <option value="dispatcher">Post Dispatcher</option>
            <option value="watcher">Competitor Watcher</option>
            <option value="agent">AI Copilot</option>
            <option value="user">User Actions</option>
            <option value="system">System Maintenance</option>
          </select>
        </div>
      </div>

      {isError && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle size={15} />
          <span>
            {(queryError as any)?.message || "Failed to query activity logs."}
          </span>
        </div>
      )}

      {/* 4. Timeline Event Stream */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingState label="Reading audit logs" variant="Orbit" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-10 text-center shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center mx-auto mb-3 shadow-2xs">
            <History size={24} />
          </div>
          <h2 className="text-lg font-bold text-[#09122A]">
            No activity logs match your filters
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
            System workers, post publishing events, and AI agent actions will be
            logged automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 pb-8">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm hover:border-[#B8D0EC] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
            >
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                <div className="mt-0.5 shrink-0">
                  <SeverityBadge severity={log.severity} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-bold text-xs sm:text-[13.5px] text-[#09122A] truncate">
                      {log.title}
                    </h3>
                    <span className="text-slate-300">•</span>
                    <ActorBadge actor={log.actor} />
                    {log.entity_type && (
                      <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono text-[10px] uppercase font-bold">
                        {log.entity_type}
                      </span>
                    )}
                  </div>

                  {log.description && (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {log.description}
                    </p>
                  )}

                  {log.extra_metadata &&
                    Object.keys(log.extra_metadata).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Object.entries(log.extra_metadata)
                          .slice(0, 3)
                          .map(([k, v], idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md bg-[#F8FAFD] border border-[#E2ECF7] font-mono text-[10px] text-slate-500 truncate max-w-[180px]"
                            >
                              {k}:{" "}
                              {typeof v === "object"
                                ? JSON.stringify(v)
                                : String(v)}
                            </span>
                          ))}
                      </div>
                    )}
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#F0F5FA]">
                <span className="text-[11px] font-mono text-slate-400">
                  {new Date(log.created_at).toLocaleString([], {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>

                <button
                  type="button"
                  onClick={() => setInspectingLog(log)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-[#EBF3FC] text-slate-600 hover:text-[#0E3A75] text-xs font-semibold cursor-pointer transition-colors"
                >
                  <Eye size={12} />
                  <span>Inspect</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. LOG INSPECTOR MODAL (Portal-Wrapped)                               */}
      {/* ===================================================================== */}
      {inspectingLog &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1"
            onClick={(e) => {
              if (e.target === e.currentTarget) setInspectingLog(null);
            }}
          >
            <div className="w-full max-w-2xl rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-[#09122A]">
              <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#F0F5FA] bg-[#F8FBFF]">
                <div className="flex items-center gap-2.5">
                  <SeverityBadge severity={inspectingLog.severity} />
                  <h3 className="font-bold text-[16px] text-[#09122A]">
                    {inspectingLog.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectingLog(null)}
                  className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar text-xs">
                <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7]">
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                      Event Type
                    </span>
                    <span className="font-mono text-slate-700">
                      {inspectingLog.activity_type}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                      Actor
                    </span>
                    <ActorBadge actor={inspectingLog.actor} />
                  </div>
                  {inspectingLog.entity_type && (
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                        Entity Target
                      </span>
                      <span className="font-mono text-slate-700">
                        {inspectingLog.entity_type}{" "}
                        {inspectingLog.entity_id
                          ? `(${inspectingLog.entity_id})`
                          : ""}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                      Timestamp (UTC)
                    </span>
                    <span className="font-mono text-slate-700">
                      {new Date(inspectingLog.created_at).toISOString()}
                    </span>
                  </div>
                </div>

                {inspectingLog.description && (
                  <div>
                    <span className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                      Message Description
                    </span>
                    <p className="p-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] leading-relaxed select-text text-slate-800">
                      {inspectingLog.description}
                    </p>
                  </div>
                )}

                <div>
                  <span className="flex items-center gap-1 text-[11px] font-bold uppercase text-slate-400 mb-1">
                    <Terminal size={12} />
                    <span>Metadata Payload</span>
                  </span>
                  <pre className="p-3.5 rounded-xl bg-[#09122A] text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed max-h-56 select-text shadow-2xs">
                    {JSON.stringify(
                      inspectingLog.extra_metadata || {},
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </div>

              <div className="px-6 py-3.5 border-t border-[#F0F5FA] bg-[#F8FBFF] flex justify-end">
                <button
                  type="button"
                  onClick={() => setInspectingLog(null)}
                  className="px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold cursor-pointer"
                >
                  Close Inspector
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default HistoryPage;
