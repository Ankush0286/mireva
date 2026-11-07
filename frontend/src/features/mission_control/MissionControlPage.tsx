import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Play,
  Pause,
  Clock,
  Sparkles,
  AlertTriangle,
  RotateCw,
  Send,
  Check,
  ShieldCheck,
  Flame,
  AlertCircle,
  Zap,
  Cpu,
  ChevronDown,
  X,
  Radio,
  Layers,
  Inbox,
  Trash2,
  RotateCcw,
} from "lucide-react";
import {
  api,
  type ChatMessage,
  type ToolExecutionLog,
  type StrategistState,
  type AutonomyLevel,
  type UsageState,
  type CopilotModelInfo,
  type OutreachMessage,
  type TriggerMatch,
} from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { AgentSteps } from "../../components/AgentSteps";
import { fromToolExecutionLog } from "../../components/agentStepsUtils";
import { StreamingText } from "../../components/StreamingText";
import {
  ReasoningTrace,
  type ReasoningStep,
} from "../../components/ReasoningTrace";
import { LoadingState } from "../../components/LoadingState";
import { UsageMeter } from "../../components/UsageMeter";

function parseModelOutput(rawContent: string): {
  reasoningSteps: ReasoningStep[];
  cleanAnswer: string;
} {
  if (!rawContent) return { reasoningSteps: [], cleanAnswer: "" };

  const match = rawContent.match(/<think>([\s\S]*?)<\/think>/);
  const thoughtContent = match ? match[1].trim() : "";
  const cleanAnswer = rawContent.replace(/<think>[\s\S]*?<\/think>/, "").trim();

  const steps = thoughtContent
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((content, idx) => ({ id: `think-${idx}`, content }));

  return { reasoningSteps: steps, cleanAnswer };
}

export const MissionControlPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [humanReply, setHumanReply] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const modelPickerRef = useRef<HTMLDivElement | null>(null);

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        modelPickerRef.current &&
        !modelPickerRef.current.contains(e.target as Node)
      ) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. Fetch Strategist State
  const { data: state, isLoading: stateLoading } = useQuery<StrategistState>({
    queryKey: queryKeys.strategist.state,
    queryFn: () => api.strategist.getState(),
    refetchInterval: 4000,
  });

  // 2. Fetch Available Models
  const { data: models = [] } = useQuery<CopilotModelInfo[]>({
    queryKey: ["copilot", "models"],
    queryFn: () => api.copilot.listModels(),
    staleTime: 1000 * 60 * 30,
  });

  // 3. Fetch Staged Items for Review
  const { data: stagedDms = [], refetch: refetchStagedDms } = useQuery<
    OutreachMessage[]
  >({
    queryKey: queryKeys.outreach.messages({ status: "staged" }),
    queryFn: () => api.outreach.listMessages({ status: "staged", limit: 50 }),
    refetchInterval: 5000,
  });

  const { data: pendingMatches = [], refetch: refetchMatches } = useQuery<
    TriggerMatch[]
  >({
    queryKey: queryKeys.triggers.matches({ status: "pending_review" }),
    queryFn: () =>
      api.triggers.listMatches({ status: "pending_review", limit: 50 }),
    refetchInterval: 5000,
  });

  // 4. Fetch Strategist Monologue
  const sessionId = state?.session_id || null;

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: sessionId
      ? queryKeys.copilot.messages(sessionId)
      : ["strategist", "messages", "none"],
    queryFn: () =>
      sessionId ? api.copilot.getMessages(sessionId, 100) : Promise.resolve([]),
    enabled: Boolean(sessionId),
    refetchInterval: 4000,
  });

  const { data: toolLogs = [] } = useQuery<ToolExecutionLog[]>({
    queryKey: sessionId
      ? queryKeys.copilot.tools(sessionId)
      : ["strategist", "tools", "none"],
    queryFn: () =>
      sessionId ? api.copilot.getTools(sessionId) : Promise.resolve([]),
    enabled: Boolean(sessionId),
    refetchInterval: 4000,
  });

  // 5. Review Queue Mutations
  const approveDmMutation = useMutation({
    mutationFn: (msgId: string) =>
      api.outreach.reviewMessage(msgId, { status: "approved" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.outreach.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
      showToast("Cold DM approved & queued for dispatch!");
    },
    onError: (err: any) =>
      showToast(err?.message || "Failed to approve DM.", "error"),
  });

  const rejectDmMutation = useMutation({
    mutationFn: (msgId: string) =>
      api.outreach.reviewMessage(msgId, { status: "rejected" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.outreach.all });
      showToast("Cold DM dismissed.");
    },
    onError: (err: any) =>
      showToast(err?.message || "Failed to reject DM.", "error"),
  });

  const approveMatchMutation = useMutation({
    mutationFn: (matchId: string) =>
      api.triggers.reviewMatch(matchId, { status: "approved" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triggers.all });
      showToast("Trigger auto-reply approved!");
    },
    onError: (err: any) =>
      showToast(err?.message || "Failed to approve reply.", "error"),
  });

  const dismissMatchMutation = useMutation({
    mutationFn: (matchId: string) =>
      api.triggers.reviewMatch(matchId, { status: "ignored" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triggers.all });
      showToast("Opportunity dismissed.");
    },
    onError: (err: any) =>
      showToast(err?.message || "Failed to dismiss.", "error"),
  });

  // Context & Cycle Deletion Mutations
  const clearContextMutation = useMutation({
    mutationFn: () => api.strategist.clearContext(),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.strategist.state, updated);
      if (sessionId) {
        queryClient.setQueryData(queryKeys.copilot.messages(sessionId), []);
        queryClient.setQueryData(queryKeys.copilot.tools(sessionId), []);
      }
      showToast("Agent context window and cycle logs cleared!");
    },
    onError: (err: any) =>
      showToast(err?.message || "Failed to clear context.", "error"),
  });

  const deleteCycleMutation = useMutation({
    mutationFn: (messageId: string) => api.strategist.deleteCycle(messageId),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.strategist.state, updated);
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.copilot.messages(sessionId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.copilot.tools(sessionId),
        });
      }
      showToast("Cycle briefing removed.");
    },
    onError: (err: any) =>
      showToast(err?.message || "Failed to delete cycle.", "error"),
  });

  // Strategist Control Mutations
  const setModelMutation = useMutation({
    mutationFn: (modelId: string) => api.strategist.setModel(modelId),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.strategist.state, updated);
      const chosen = models.find((m) => m.id === updated.model_id);
      showToast(`Model set to ${chosen?.name || updated.model_id}`);
      setModelDropdownOpen(false);
    },
    onError: (err: any) =>
      showToast(err?.message || "Failed to update model.", "error"),
  });

  const runNowMutation = useMutation({
    mutationFn: () => api.strategist.runNow(),
    onMutate: async () => {
      queryClient.setQueryData<StrategistState | undefined>(
        queryKeys.strategist.state,
        (old) =>
          old
            ? {
                ...old,
                status: "running",
                current_step:
                  "Waking up: evaluating marketing telemetry & review outcomes...",
              }
            : old,
      );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.strategist.state, updated);
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.copilot.messages(sessionId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.copilot.tools(sessionId),
        });
      }
      refetchStagedDms();
      refetchMatches();
      if (updated.status !== "paused") showToast("Autonomous cycle completed!");
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.strategist.all });
      showToast(err?.message || "Failed to execute cycle.", "error");
    },
  });

  const togglePauseMutation = useMutation({
    mutationFn: () => api.strategist.togglePause(),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.strategist.state, updated);
      showToast(
        updated.status === "paused"
          ? "24/7 Strategist paused."
          : "24/7 Strategist resumed.",
      );
    },
    onError: (err: any) =>
      showToast(err?.message || "Failed to toggle pause.", "error"),
  });

  const setAutonomyMutation = useMutation({
    mutationFn: (level: AutonomyLevel) => api.strategist.setAutonomy(level),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.strategist.state, updated);
      showToast(
        updated.autonomy_level === "full_auto"
          ? "⚡ Full Auto: actions bypass review gates."
          : "🛡️ Staged Review: actions route to review queue.",
      );
    },
    onError: (err: any) =>
      showToast(err?.message || "Failed to update autonomy.", "error"),
  });

  const replyMutation = useMutation({
    mutationFn: (replyText: string) => api.strategist.reply(replyText),
    onSuccess: (updated) => {
      setHumanReply("");
      queryClient.setQueryData(queryKeys.strategist.state, updated);
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.copilot.messages(sessionId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.copilot.tools(sessionId),
        });
      }
      showToast("Guidance sent! Strategist resumed.");
    },
    onError: (err: any) =>
      showToast(err?.message || "Failed to submit reply.", "error"),
  });

  const activeModelId =
    state?.model_id ||
    models[0]?.id ||
    "nvidia/nemotron-3-ultra-550b-a55b:free";
  const activeModel = useMemo(() => {
    return (
      models.find((m) => m.id === activeModelId) || {
        id: activeModelId,
        name: activeModelId.split("/").pop() || "Nemotron 3 Ultra",
        badge: activeModelId.includes("free") ? "FREE" : undefined,
      }
    );
  }, [models, activeModelId]);

  const countdownFormatted = useMemo(() => {
    if (!state?.next_cycle_at || state.status !== "sleeping") return null;
    const diff = new Date(state.next_cycle_at).getTime() - now;
    if (diff <= 0) return "00:00:00";
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, [state, now]);

  const latestUsage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const usage = messages[i].extra_metadata?.usage as UsageState | undefined;
      if (usage && usage.contextWindow) return usage;
    }
    return null;
  }, [messages]);

  const assistantTurns = useMemo(() => {
    return messages.filter((m) => m.role === "assistant").reverse();
  }, [messages]);

  const isPaused = state?.status === "paused";
  const isRunning = !isPaused && state?.status === "running";
  const isFullAuto = state?.autonomy_level === "full_auto";
  const totalPendingReviews = stagedDms.length + pendingMatches.length;

  return (
    <div className="relative h-full w-full font-sans select-none text-[#09122A] overflow-hidden">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl text-white text-xs font-semibold shadow-2xl animate-fade-up-1 ${
            toast.type === "error" ? "bg-rose-600" : "bg-[#0E3A75]"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle size={15} />
          ) : (
            <Check size={15} className="text-emerald-400" strokeWidth={3} />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MAIN SCROLLABLE WORKSPACE                                                */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      <div
        className={`h-full overflow-y-auto overflow-x-hidden px-3 sm:px-6 py-3 custom-scrollbar transition-[padding] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          isSidebarOpen ? "xl:pr-[370px]" : ""
        }`}
      >
        <div className="max-w-5xl mx-auto">
          {/* 1. Stacked Header & Control Toolbar */}
          <div className="flex flex-col gap-4 mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 border border-[#DCE7F5] text-[11px] font-bold uppercase tracking-wider text-[#0E3A75] mb-2 shadow-2xs">
                <Brain size={12} className="text-[#0E3A75] shrink-0" />
                <span>24/7 Self-Regulating Growth Engine</span>
              </div>
              <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight text-[#09122A] leading-tight">
                Mission Control{" "}
                <span className="relative inline-block font-serif italic font-normal text-[#0D2149]">
                  & autonomous strategist
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
                Continuously audits search intent, launches campaigns, scouts
                creators, and manages its own sleep/wake schedule.
              </p>
            </div>

            {/* Dedicated Control Toolbar Row */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-2 rounded-2xl bg-white/85 backdrop-blur-md border border-[#DCE7F5] shadow-2xs">
              {/* Left Group: Engine & Policy */}
              <div className="flex flex-wrap items-center gap-2">
                <div ref={modelPickerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setModelDropdownOpen((prev) => !prev)}
                    className="flex items-center gap-1.5 h-8.5 px-3 rounded-xl bg-[#F8FAFD] hover:bg-white border border-[#DCE7F5] text-xs font-semibold text-[#09122A] cursor-pointer transition-colors"
                  >
                    <Cpu size={13} className="text-[#0E3A75] shrink-0" />
                    <span className="truncate max-w-[150px] sm:max-w-[200px]">
                      {activeModel.name}
                    </span>
                    {activeModel.badge && (
                      <span className="px-1.5 py-0.2 rounded bg-[#EBF3FC] text-[#0E3A75] font-mono text-[9px] font-bold shrink-0">
                        {activeModel.badge}
                      </span>
                    )}
                    <ChevronDown
                      size={13}
                      className={`text-slate-400 shrink-0 transition-transform ${modelDropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {modelDropdownOpen && (
                    <ul
                      role="listbox"
                      className="absolute left-0 top-full mt-1.5 z-50 w-72 rounded-2xl border border-[#DCE7F5] bg-white p-1.5 shadow-xl text-left animate-fade-up-1"
                    >
                      <li className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Select Strategist Engine
                      </li>
                      {models.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => setModelMutation.mutate(m.id)}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left cursor-pointer ${
                              m.id === activeModelId
                                ? "bg-[#EBF3FC] text-[#0E3A75]"
                                : "hover:bg-[#F8FAFD]"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-bold text-[#09122A]">
                                {m.name}
                              </span>
                              {m.description && (
                                <span className="block truncate text-[10.5px] text-slate-400">
                                  {m.description}
                                </span>
                              )}
                            </div>
                            {m.badge && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold uppercase bg-slate-100 text-slate-700">
                                {m.badge}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Autonomy Level Switcher */}
                <div className="flex items-center p-0.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5]">
                  <button
                    type="button"
                    onClick={() => setAutonomyMutation.mutate("staged_review")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                      !isFullAuto
                        ? "bg-white text-[#0E3A75] shadow-2xs"
                        : "text-slate-400 hover:text-[#09122A]"
                    }`}
                  >
                    <ShieldCheck size={12} />
                    <span>Staged Review</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutonomyMutation.mutate("full_auto")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                      isFullAuto
                        ? "bg-emerald-50 text-emerald-700 shadow-2xs"
                        : "text-slate-400 hover:text-[#09122A]"
                    }`}
                  >
                    <Zap size={12} />
                    <span>Full Auto</span>
                  </button>
                </div>
              </div>

              {/* Right Group: Actions & Queue Toggle */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => togglePauseMutation.mutate()}
                  disabled={togglePauseMutation.isPending}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                    isPaused
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                      : "bg-[#F8FAFD] text-slate-700 border-[#DCE7F5] hover:bg-slate-100"
                  }`}
                >
                  {isPaused ? <Play size={12} /> : <Pause size={12} />}
                  <span>{isPaused ? "Resume" : "Pause"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => runNowMutation.mutate()}
                  disabled={isRunning}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <RotateCw
                    size={12}
                    className={isRunning ? "animate-spin" : ""}
                  />
                  <span>{isRunning ? "Running..." : "Run Cycle"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSidebarOpen((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                    isSidebarOpen
                      ? "bg-[#EBF3FC] text-[#0E3A75] border-[#B4CFF0]"
                      : "bg-[#F8FAFD] text-slate-700 border-[#DCE7F5] hover:bg-slate-100"
                  }`}
                >
                  <Layers size={13} />
                  <span>Review Queue</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full font-mono text-[9.5px] font-bold ${
                      totalPendingReviews > 0
                        ? "bg-amber-500 text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {totalPendingReviews}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* 2. Live Heartbeat Status Banner */}
          {stateLoading ? (
            <div className="py-10 flex justify-center">
              <LoadingState
                label="Connecting to strategist heartbeat"
                variant="Orbit"
              />
            </div>
          ) : (
            <div className="mb-6 rounded-[22px] bg-white/95 border border-[#DCE7F5] p-4.5 shadow-[0_6px_24px_-6px_rgba(14,58,117,0.06)]">
              {isPaused && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 border border-slate-200">
                      <Pause size={18} />
                    </div>
                    <div>
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block">
                        Paused by Operator
                      </span>
                      <p className="text-xs font-bold text-[#09122A]">
                        Autonomous execution is paused. Background cycles will
                        not run until resumed.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePauseMutation.mutate()}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 self-end sm:self-auto cursor-pointer"
                  >
                    Resume Autonomy
                  </button>
                </div>
              )}

              {isRunning && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                      <Flame size={19} className="animate-pulse" />
                    </div>
                    <div>
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 block">
                        Active Cycle #{state?.cycle_count || 1} •{" "}
                        {activeModel.name}
                      </span>
                      <p className="text-xs font-bold text-[#09122A]">
                        {state?.current_step ||
                          "Evaluating telemetry, review outcomes, and executing growth actions..."}
                      </p>
                    </div>
                  </div>
                  <LoadingState label="Agent Working" variant="Orbit" />
                </div>
              )}

              {!isPaused && !isRunning && state?.status === "sleeping" && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center shrink-0 border border-[#D0E2F7] mt-0.5">
                      <Clock size={18} />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#0E3A75]">
                          Strategist Resting
                        </span>
                        <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.2 rounded-full">
                          {state?.cycle_count} Cycles Done
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 italic">
                        "
                        {state?.sleep_rationale ||
                          "Resting until next scheduled evaluation window."}
                        "
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                    <div className="text-right">
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 block">
                        Next Wake
                      </span>
                      <span className="font-mono text-sm font-bold text-[#0E3A75] tabular-nums">
                        {countdownFormatted || "00:00:00"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => runNowMutation.mutate()}
                      className="px-3 py-1.5 rounded-xl bg-[#EBF3FC] hover:bg-[#DDEBFA] text-[#0E3A75] text-xs font-bold cursor-pointer"
                    >
                      Wake Up Early
                    </button>
                  </div>
                </div>
              )}

              {!isPaused &&
                !isRunning &&
                state?.status === "waiting_for_human" && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs uppercase tracking-wider">
                        <AlertTriangle size={15} className="text-amber-600" />
                        <span>
                          Human Help Requested (
                          {state?.pending_urgency || "high"} urgency)
                        </span>
                      </div>
                      <span className="text-[10.5px] font-mono text-amber-700">
                        Loop Paused
                      </span>
                    </div>
                    <p className="text-xs font-bold text-[#09122A] bg-white p-2.5 rounded-lg border border-amber-200">
                      {state?.pending_question}
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (humanReply.trim())
                          replyMutation.mutate(humanReply.trim());
                      }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={humanReply}
                        onChange={(e) => setHumanReply(e.target.value)}
                        placeholder="Provide your strategic decision to resume the agent..."
                        className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-xs outline-none focus:border-[#0E3A75]"
                      />
                      <button
                        type="submit"
                        disabled={!humanReply.trim() || replyMutation.isPending}
                        className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-[#0E3A75] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        <Send size={12} />
                        <span>Resume</span>
                      </button>
                    </form>
                  </div>
                )}

              {!isPaused && !isRunning && state?.status === "idle" && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center shrink-0">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#0E3A75] block">
                        Ready to Launch
                      </span>
                      <p className="text-xs font-bold text-[#09122A]">
                        Strategist is initialized and ready for its first
                        autonomous cycle.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => runNowMutation.mutate()}
                    className="px-3.5 py-1.5 rounded-xl bg-[#0E3A75] text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Launch First Cycle
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3. Monologue Header + Global Telemetry + Reset Context Button */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 border-b border-[#E2ECF7] pb-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs uppercase tracking-wider text-[#09122A]">
                Autonomous Monologue Feed
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#EBF3FC] text-[#0E3A75] font-mono text-[10px] font-bold">
                {assistantTurns.length} Cycles Logged
              </span>
            </div>

            <div className="flex items-center gap-2">
              {latestUsage && (
                <UsageMeter usage={latestUsage} variant="Inline" />
              )}

              {assistantTurns.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Reset agent context and clear all cycle logs? Token usage will reset to 0.",
                      )
                    ) {
                      clearContextMutation.mutate();
                    }
                  }}
                  disabled={clearContextMutation.isPending}
                  title="Clear all cycle logs and refresh agent context window"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-[#DCE7F5] hover:border-rose-200 text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
                >
                  <RotateCcw size={11} />
                  <span>Reset Context</span>
                </button>
              )}
            </div>
          </div>

          {/* 4. Chronological Cycle Briefings */}
          {assistantTurns.length === 0 ? (
            <div className="rounded-[22px] bg-white/95 border border-[#DCE7F5] p-10 text-center shadow-sm">
              <Brain
                size={26}
                className="mx-auto mb-2.5 text-[#0E3A75] opacity-75"
              />
              <h2 className="text-base font-bold text-[#09122A]">
                No autonomous cycles recorded yet
              </h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4 leading-relaxed">
                Click <strong>Run Cycle</strong> to start the strategist. It
                will audit performance, discover intent keywords, execute growth
                actions, and regulate its own sleep schedule.
              </p>
              <button
                type="button"
                onClick={() => runNowMutation.mutate()}
                disabled={isRunning}
                className="px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                Start Autonomous Cycle #1
              </button>
            </div>
          ) : (
            <div className="space-y-4 pb-12">
              {assistantTurns.map((msg, idx) => {
                const turnTools = toolLogs.filter(
                  (t) => t.message_id === msg.id,
                );
                const { reasoningSteps, cleanAnswer } = parseModelOutput(
                  msg.content,
                );
                const cycleNumber = assistantTurns.length - idx;

                return (
                  <div
                    key={msg.id}
                    className="group rounded-[22px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-[#F0F5FA] pb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#EBF3FC] text-[#0E3A75] font-mono text-[10.5px] font-bold">
                          Cycle Briefing #{cycleNumber}
                        </span>
                        {msg.model_name && (
                          <span className="font-mono text-[10px] text-slate-400">
                            {msg.model_name.split("/").pop()}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10.5px] text-slate-400">
                          {new Date(msg.created_at).toLocaleString([], {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteCycleMutation.mutate(msg.id)}
                          disabled={deleteCycleMutation.isPending}
                          title="Delete this cycle log"
                          className="p-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {turnTools.length > 0 && (
                      <AgentSteps
                        steps={turnTools.map(fromToolExecutionLog)}
                        title="Autonomous Actions"
                      />
                    )}

                    {reasoningSteps.length > 0 && (
                      <ReasoningTrace
                        status="complete"
                        steps={reasoningSteps}
                      />
                    )}

                    {cleanAnswer && <StreamingText text={cleanAnswer} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* FLUSH FULL-HEIGHT RIGHT SIDEBAR                                          */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed top-0 right-0 bottom-0 z-40 w-80 sm:w-[360px] bg-white border-l border-[#DCE7F5] shadow-[-4px_0_24px_-4px_rgba(14,58,117,0.07)] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-13 px-4 border-b border-[#F0F5FA] flex items-center justify-between shrink-0 bg-[#F8FBFF]">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck
              size={16}
              className={isFullAuto ? "text-emerald-600" : "text-[#0E3A75]"}
            />
            <div className="min-w-0">
              <h3 className="font-bold text-xs text-[#09122A] leading-tight">
                Review Queue
              </h3>
              <span className="text-[10px] font-mono text-slate-400 block truncate">
                {isFullAuto
                  ? "⚡ Bypassed by Full Auto"
                  : `🛡️ ${totalPendingReviews} awaiting review`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="w-7 h-7 rounded-lg bg-slate-100/80 hover:bg-slate-200/70 text-slate-500 flex items-center justify-center cursor-pointer shrink-0"
            title="Collapse review queue"
          >
            <X size={14} />
          </button>
        </div>

        {isFullAuto && (
          <div className="p-3 mx-3 mt-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] leading-relaxed shrink-0">
            <span className="font-bold flex items-center gap-1 mb-0.5">
              <Zap size={11} className="text-emerald-600" />
              <span>Full Auto Mode Active</span>
            </span>
            New DMs and posts automatically dispatch within daily quotas. Any
            previously staged items below can still be cleared manually.
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          {totalPendingReviews === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400 px-4">
              <Inbox size={26} className="mx-auto mb-2 text-slate-300" />
              <p className="font-semibold text-slate-600">
                Review queue is empty
              </p>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                When the agent stages cold DMs or flags competitor auto-replies
                in Staged Review mode, they appear here.
              </p>
            </div>
          ) : (
            <>
              {stagedDms.map((dm) => (
                <div
                  key={dm.id}
                  className="p-3 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7] shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-mono text-[9px] font-bold border border-emerald-200">
                      <Send size={9} />
                      <span>Cold DM</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {new Date(dm.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-[#09122A] truncate">
                    Lead ID:{" "}
                    <span className="font-mono text-[11px]">
                      {dm.lead_id.slice(0, 8)}...
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-[#DCE7F5] leading-relaxed select-text whitespace-pre-wrap break-words">
                    "{dm.content}"
                  </p>

                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => rejectDmMutation.mutate(dm.id)}
                      disabled={rejectDmMutation.isPending}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-[11px] font-semibold cursor-pointer"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => approveDmMutation.mutate(dm.id)}
                      disabled={approveDmMutation.isPending}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#0E3A75] hover:bg-[#092854] text-white text-[11px] font-bold shadow-xs cursor-pointer"
                    >
                      <Check size={11} strokeWidth={2.5} />
                      <span>Approve & Dispatch</span>
                    </button>
                  </div>
                </div>
              ))}

              {pendingMatches.map((match) => (
                <div
                  key={match.id}
                  className="p-3 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7] shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-mono text-[9px] font-bold border border-purple-200">
                      <Radio size={9} />
                      <span>Competitor Radar</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {new Date(match.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-[#09122A] truncate">
                    Auto-reply to @{match.author_handle}
                  </div>

                  <p className="text-[11.5px] text-slate-600 bg-white p-2 rounded-xl border border-[#EBF2FA] line-clamp-2 break-words">
                    Original: "{match.post_content}"
                  </p>

                  {match.generated_response && (
                    <p className="text-xs text-blue-900 bg-blue-50/60 p-2.5 rounded-xl border border-blue-100 font-medium whitespace-pre-wrap select-text break-words">
                      💬 "{match.generated_response}"
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => dismissMatchMutation.mutate(match.id)}
                      disabled={dismissMatchMutation.isPending}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-semibold cursor-pointer"
                    >
                      Ignore
                    </button>
                    <button
                      type="button"
                      onClick={() => approveMatchMutation.mutate(match.id)}
                      disabled={approveMatchMutation.isPending}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#0E3A75] hover:bg-[#092854] text-white text-[11px] font-bold shadow-xs cursor-pointer"
                    >
                      <Check size={11} strokeWidth={2.5} />
                      <span>Approve</span>
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>
    </div>
  );
};

export default MissionControlPage;
