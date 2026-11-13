import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Radio,
  Plus,
  RefreshCw,
  Trash2,
  Edit3,
  ExternalLink,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  Power,
  Clock,
  MessageSquare,
  Send,
  Sparkles,
  AtSign,
  Hash,
  CheckCircle2,
  Ban,
} from "lucide-react";
import {
  api,
  type WatchedHandle,
  type TriggerRule,
  type TriggerMatch,
  type Account,
  type PlatformType,
  type TriggerActionType,
  type TriggerMatchStatus,
} from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { LoadingState } from "../../components/LoadingState";

// ============================================================================
// Platform & Match Badges
// ============================================================================

function PlatformBadge({ platform }: { platform: PlatformType }) {
  if (platform === "twitter") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black text-white text-[10px] font-bold">
        <span>X / Twitter</span>
      </span>
    );
  }
  if (platform === "instagram") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white text-[10px] font-bold">
        <span>Instagram</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1877F2] text-white text-[10px] font-bold">
      <span>Facebook</span>
    </span>
  );
}

function MatchStatusBadge({ status }: { status: TriggerMatchStatus }) {
  const styles: Record<
    TriggerMatchStatus,
    { class: string; label: string; icon: React.ElementType }
  > = {
    pending_review: {
      class: "bg-amber-50 text-amber-700 border-amber-200/60 animate-pulse",
      label: "Pending Review",
      icon: Clock,
    },
    approved: {
      class: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
      label: "Approved",
      icon: CheckCircle2,
    },
    dispatched: {
      class: "bg-blue-50 text-blue-700 border-blue-200/60",
      label: "Dispatched",
      icon: Send,
    },
    ignored: {
      class: "bg-slate-100 text-slate-500 border-slate-200/60",
      label: "Ignored",
      icon: Ban,
    },
    failed: {
      class: "bg-rose-50 text-rose-700 border-rose-200/60",
      label: "Failed",
      icon: AlertTriangle,
    },
  };

  const item = styles[status] || styles.pending_review;
  const Icon = item.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${item.class}`}
    >
      <Icon size={10} />
      <span>{item.label}</span>
    </span>
  );
}

export const TriggersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"matches" | "rules" | "handles">(
    "matches",
  );

  // Toasts
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

  // 1. Reactive Queries via TanStack Query
  const {
    data: matches = [],
    isLoading: matchesLoading,
    refetch: refetchMatches,
  } = useQuery<TriggerMatch[]>({
    queryKey: queryKeys.triggers.matches({ limit: 100 }),
    queryFn: () => api.triggers.listMatches({ limit: 100 }),
  });

  const {
    data: rules = [],
    isLoading: rulesLoading,
    refetch: refetchRules,
  } = useQuery<TriggerRule[]>({
    queryKey: queryKeys.triggers.rules(),
    queryFn: () => api.triggers.listRules(),
  });

  const {
    data: handles = [],
    isLoading: handlesLoading,
    refetch: refetchHandles,
  } = useQuery<WatchedHandle[]>({
    queryKey: queryKeys.triggers.handles(false),
    queryFn: () => api.triggers.listHandles(false),
  });

  const { data: accounts = [], isLoading: accountsLoading } = useQuery<
    Account[]
  >({
    queryKey: queryKeys.accounts.list(false),
    queryFn: () => api.accounts.list(false),
  });

  const loading =
    matchesLoading || rulesLoading || handlesLoading || accountsLoading;

  // 2. Mutations with Auto-Cache Invalidation
  const reviewMatchMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof api.triggers.reviewMatch>[1];
    }) => api.triggers.reviewMatch(id, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triggers.all });
      showToast(
        variables.payload.status === "approved"
          ? "Reply approved for dispatch!"
          : "Opportunity ignored.",
      );
      setReviewingMatch(null);
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to review opportunity.", "error");
    },
  });

  const addHandleMutation = useMutation({
    mutationFn: api.triggers.addHandle,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triggers.all });
      showToast(`Started monitoring @${created.handle}.`);
      setIsHandleModalOpen(false);
    },
    onError: (err: any) => {
      setFormError(err?.message || "Could not save target handle.");
    },
  });

  const updateHandleMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof api.triggers.updateHandle>[1];
    }) => api.triggers.updateHandle(id, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triggers.all });
      showToast(`Target @${updated.handle} updated.`);
      setIsHandleModalOpen(false);
    },
    onError: (err: any) => {
      setFormError(err?.message || "Could not update target handle.");
    },
  });

  const deleteHandleMutation = useMutation({
    mutationFn: api.triggers.deleteHandle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triggers.all });
      showToast("Target handle removed.");
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to remove handle.", "error");
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: api.triggers.createRule,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triggers.all });
      showToast(`Trigger rule "${created.name}" created.`);
      setIsRuleModalOpen(false);
    },
    onError: (err: any) => {
      setFormError(err?.message || "Could not save trigger rule.");
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof api.triggers.updateRule>[1];
    }) => api.triggers.updateRule(id, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triggers.all });
      showToast(`Rule "${updated.name}" updated.`);
      setIsRuleModalOpen(false);
    },
    onError: (err: any) => {
      setFormError(err?.message || "Could not update trigger rule.");
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: api.triggers.deleteRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.triggers.all });
      showToast("Trigger rule deleted.");
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to delete rule.", "error");
    },
  });

  // Custom Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    subtext?: string;
    confirmText?: string;
    onConfirm: () => Promise<void> | void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Filters
  const [matchStatusFilter, setMatchStatusFilter] = useState<
    TriggerMatchStatus | "all"
  >("pending_review");
  const [platformFilter, setPlatformFilter] = useState<PlatformType | "all">(
    "all",
  );

  // Review & Inline Edit Modal
  const [reviewingMatch, setReviewingMatch] = useState<TriggerMatch | null>(
    null,
  );
  const [editedReply, setEditedReply] = useState("");

  // Handle Modal
  const [isHandleModalOpen, setIsHandleModalOpen] = useState(false);
  const [editingHandle, setEditingHandle] = useState<WatchedHandle | null>(
    null,
  );
  const [handlePlatform, setHandlePlatform] = useState<PlatformType>("twitter");
  const [handleUsername, setHandleUsername] = useState("");
  const [handleDisplayName, setHandleDisplayName] = useState("");
  const [handleFreq, setHandleFreq] = useState(180);

  // Rule Modal
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TriggerRule | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [rulePlatform, setRulePlatform] = useState<PlatformType>("twitter");
  const [ruleAccountId, setRuleAccountId] = useState("");
  const [ruleWatchedHandleId, setRuleWatchedHandleId] = useState<string>("all");
  const [ruleActionType, setRuleActionType] =
    useState<TriggerActionType>("stage_draft");
  const [ruleTemplate, setRuleTemplate] = useState(
    "Hey @{author}, check out our affordable alternative!",
  );
  const [ruleCooldown, setRuleCooldown] = useState(60);

  // Keyword Tags Input State
  const [anyTagInput, setAnyTagInput] = useState("");
  const [keywordsAny, setKeywordsAny] = useState<string[]>([
    "expensive",
    "alternative",
    "#saas",
  ]);
  const [allTagInput, setAllTagInput] = useState("");
  const [keywordsAll, setKeywordsAll] = useState<string[]>([]);
  const [excludeTagInput, setExcludeTagInput] = useState("");
  const [keywordsExclude, setKeywordsExclude] = useState<string[]>([
    "hiring",
    "job",
  ]);

  const [formError, setFormError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const pendingMatches = matches.filter(
      (m) => m.status === "pending_review",
    ).length;
    const totalRules = rules.length;
    const activeRules = rules.filter((r) => r.is_active).length;
    const totalHandles = handles.length;
    const totalDispatched = matches.filter(
      (m) => m.status === "dispatched" || m.status === "approved",
    ).length;

    return {
      pendingMatches,
      totalRules,
      activeRules,
      totalHandles,
      totalDispatched,
    };
  }, [matches, rules, handles]);

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      return matchStatusFilter === "all" || m.status === matchStatusFilter;
    });
  }, [matches, matchStatusFilter]);

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      return platformFilter === "all" || r.platform === platformFilter;
    });
  }, [rules, platformFilter]);

  // Handlers
  const openReviewModal = (match: TriggerMatch) => {
    setReviewingMatch(match);
    setEditedReply(
      match.generated_response ||
        `Hey @${match.author_handle}, check out our platform!`,
    );
  };

  const handleReviewAction = (
    matchId: string,
    status: "approved" | "ignored",
    customReply?: string,
  ) => {
    reviewMatchMutation.mutate({
      id: matchId,
      payload: {
        status,
        edited_response: customReply || undefined,
      },
    });
  };

  const openAddHandleModal = () => {
    setEditingHandle(null);
    setHandlePlatform("twitter");
    setHandleUsername("");
    setHandleDisplayName("");
    setHandleFreq(180);
    setFormError(null);
    setIsHandleModalOpen(true);
  };

  const handleSaveHandle = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = handleUsername.replace(/^@+/, "").trim();
    if (!cleanUser) {
      setFormError("Please enter a valid social handle.");
      return;
    }
    setFormError(null);

    if (editingHandle) {
      updateHandleMutation.mutate({
        id: editingHandle.id,
        payload: {
          display_name: handleDisplayName.trim() || undefined,
          scrape_frequency_minutes: handleFreq,
        },
      });
    } else {
      addHandleMutation.mutate({
        platform: handlePlatform,
        handle: cleanUser,
        display_name: handleDisplayName.trim() || undefined,
        scrape_frequency_minutes: handleFreq,
      });
    }
  };

  const requestDeleteHandle = (handle: WatchedHandle) => {
    setConfirmModal({
      isOpen: true,
      title: "Stop Monitoring Competitor",
      message: `Stop monitoring @${handle.handle} on ${handle.platform}?`,
      subtext:
        "This will stop automated feed polling and delete associated historical matches.",
      confirmText: "Stop Monitoring",
      onConfirm: () => {
        deleteHandleMutation.mutate(handle.id);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const openCreateRuleModal = () => {
    setEditingRule(null);
    setRuleName("Pricing Grievance Auto-Reply");
    setRulePlatform("twitter");
    setRuleAccountId(accounts[0]?.id ?? "");
    setRuleWatchedHandleId("all");
    setRuleActionType("stage_draft");
    setKeywordsAny(["expensive", "alternative", "#saas"]);
    setKeywordsAll([]);
    setKeywordsExclude(["hiring", "job"]);
    setRuleTemplate("Hey @{author}, check out our open-source alternative!");
    setRuleCooldown(60);
    setFormError(null);
    setIsRuleModalOpen(true);
  };

  const openEditRuleModal = (rule: TriggerRule) => {
    setEditingRule(rule);
    setRuleName(rule.name);
    setRulePlatform(rule.platform);
    setRuleAccountId(rule.account_id);
    setRuleWatchedHandleId(rule.watched_handle_id || "all");
    setRuleActionType(rule.action_type);
    setKeywordsAny(rule.keywords_any || []);
    setKeywordsAll(rule.keywords_all || []);
    setKeywordsExclude(rule.keywords_exclude || []);
    setRuleTemplate(rule.response_template || "");
    setRuleCooldown(rule.cooldown_minutes);
    setFormError(null);
    setIsRuleModalOpen(true);
  };

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) {
      setFormError("Please name your trigger rule.");
      return;
    }
    if (!ruleAccountId) {
      setFormError(
        "Please select a connected account to send outbound replies.",
      );
      return;
    }
    if (keywordsAny.length === 0 && keywordsAll.length === 0) {
      setFormError(
        "At least one keyword must be defined in Keywords Any or Keywords All.",
      );
      return;
    }
    setFormError(null);

    const payload = {
      name: ruleName.trim(),
      platform: rulePlatform,
      account_id: ruleAccountId,
      watched_handle_id:
        ruleWatchedHandleId !== "all" ? ruleWatchedHandleId : undefined,
      action_type: ruleActionType,
      keywords_any: keywordsAny,
      keywords_all: keywordsAll,
      keywords_exclude: keywordsExclude,
      response_template: ruleTemplate.trim() || undefined,
      cooldown_minutes: ruleCooldown,
    };

    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, payload });
    } else {
      createRuleMutation.mutate(payload);
    }
  };

  const requestDeleteRule = (rule: TriggerRule) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Trigger Rule",
      message: `Delete rule "${rule.name}"?`,
      subtext:
        "This will stop keyword interception and clear historical matches linked to this rule.",
      confirmText: "Delete Rule",
      onConfirm: () => {
        deleteRuleMutation.mutate(rule.id);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleToggleRuleActive = (rule: TriggerRule) => {
    updateRuleMutation.mutate({
      id: rule.id,
      payload: { is_active: !rule.is_active },
    });
  };

  const addTag = (
    val: string,
    list: string[],
    setList: (v: string[]) => void,
    clearInput: () => void,
  ) => {
    const clean = val.trim().toLowerCase();
    if (clean && !list.includes(clean)) {
      setList([...list, clean]);
      clearInput();
    }
  };

  const isSubmitting =
    addHandleMutation.isPending ||
    updateHandleMutation.isPending ||
    createRuleMutation.isPending ||
    updateRuleMutation.isPending;

  return (
    <div className="relative h-full overflow-y-auto px-3 sm:px-6 py-4 custom-scrollbar max-w-6xl mx-auto w-full font-sans select-none text-[#09122A]">
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

      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 border border-[#DCE7F5] text-[11px] font-bold uppercase tracking-wider text-[#0E3A75] mb-2 shadow-2xs">
            <Radio size={11} />
            <span>Real-Time Social Listening & Auto-Replies</span>
          </div>
          <h1 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.025em] text-[#09122A] leading-tight">
            Triggers Radar{" "}
            <span className="relative inline-block font-serif italic font-normal text-[#0D2149]">
              & competitor spy
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
            Monitor competitor feeds, intercept high-intent keywords, and stage
            personalized auto-replies.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => {
              refetchMatches();
              refetchRules();
              refetchHandles();
            }}
            title="Refresh radar"
            className="w-9 h-9 rounded-xl bg-white border border-[#DCE7F5] hover:bg-slate-50 text-slate-600 flex items-center justify-center shadow-2xs cursor-pointer"
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin text-[#0E3A75]" : ""}
            />
          </button>
          <button
            onClick={openAddHandleModal}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white border border-[#DCE7F5] hover:border-[#0E3A75] text-[#0E3A75] text-xs font-bold shadow-2xs transition-all hover:scale-[1.01] active:scale-95 cursor-pointer"
          >
            <AtSign size={14} />
            <span>Watch Competitor</span>
          </button>
          <button
            onClick={openCreateRuleModal}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-md transition-all hover:scale-[1.01] active:scale-95 cursor-pointer"
          >
            <Plus size={15} strokeWidth={2.4} />
            <span>New Keyword Rule</span>
          </button>
        </div>
      </div>

      {/* 2. Top KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Pending Opportunities
          </span>
          <div className="text-2xl font-bold text-amber-700 flex items-center gap-1.5">
            {stats.pendingMatches > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />
            )}
            <span>{stats.pendingMatches}</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Awaiting human review
          </span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Active Rules
          </span>
          <div className="text-2xl font-bold text-[#09122A]">
            {stats.activeRules} / {stats.totalRules}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Regex matching active
          </span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Monitored Targets
          </span>
          <div className="text-2xl font-bold text-[#0E3A75]">
            {stats.totalHandles} Competitors
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Periodic feed scraping
          </span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Approved & Dispatched
          </span>
          <div className="text-2xl font-bold text-emerald-700">
            {stats.totalDispatched}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            High-intent replies sent
          </span>
        </div>
      </div>

      {/* 3. Navigation View Switcher */}
      <div className="flex items-center justify-between mb-5 border-b border-[#E2ECF7] pb-3">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/80 border border-[#DCE7F5]">
          <button
            onClick={() => setActiveTab("matches")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "matches"
                ? "bg-[#EBF3FC] text-[#0E3A75] shadow-2xs"
                : "text-slate-500 hover:text-[#09122A]"
            }`}
          >
            <MessageSquare size={14} />
            <span>Opportunities ({matches.length})</span>
            {stats.pendingMatches > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-mono text-[9px]">
                {stats.pendingMatches}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("rules")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "rules"
                ? "bg-[#EBF3FC] text-[#0E3A75] shadow-2xs"
                : "text-slate-500 hover:text-[#09122A]"
            }`}
          >
            <Hash size={14} />
            <span>Trigger Rules ({rules.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("handles")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "handles"
                ? "bg-[#EBF3FC] text-[#0E3A75] shadow-2xs"
                : "text-slate-500 hover:text-[#09122A]"
            }`}
          >
            <AtSign size={14} />
            <span>Watched Competitors ({handles.length})</span>
          </button>
        </div>

        {activeTab === "matches" ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 hidden sm:inline">
              Status:
            </span>
            <select
              value={matchStatusFilter}
              onChange={(e) => setMatchStatusFilter(e.target.value as any)}
              className="h-8 px-2.5 rounded-xl bg-white border border-[#DCE7F5] text-xs font-semibold text-[#09122A] outline-none cursor-pointer"
            >
              <option value="pending_review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="dispatched">Dispatched</option>
              <option value="ignored">Ignored</option>
              <option value="all">All Statuses</option>
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value as any)}
              className="h-8 px-2.5 rounded-xl bg-white border border-[#DCE7F5] text-xs font-semibold text-[#09122A] outline-none cursor-pointer"
            >
              <option value="all">All Platforms</option>
              <option value="twitter">X / Twitter</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
            </select>
          </div>
        )}
      </div>

      {/* 4. Tab A: Intercepted Opportunities */}
      {activeTab === "matches" && (
        <>
          {loading ? (
            <div className="py-20 flex justify-center">
              <LoadingState
                label="Scanning intercepted feeds"
                variant="Orbit"
              />
            </div>
          ) : filteredMatches.length === 0 ? (
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-10 text-center shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center mx-auto mb-3 shadow-2xs">
                <Radio size={24} />
              </div>
              <h2 className="text-lg font-bold text-[#09122A]">
                No conversation opportunities found
              </h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                When competitor followers post complaints, alternatives, or
                keywords defined in your rules, they will appear here.
              </p>
              <button
                onClick={openCreateRuleModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Create Keyword Trigger Rule</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3 pb-8">
              {filteredMatches.map((m) => {
                const parentRule = rules.find((r) => r.id === m.rule_id);
                const watchedHandle = handles.find(
                  (h) => h.id === m.watched_handle_id,
                );

                return (
                  <div
                    key={m.id}
                    className="rounded-[22px] bg-white/95 border border-[#DCE7F5] p-4.5 shadow-sm hover:border-[#B8D0EC] transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2">
                          <MatchStatusBadge status={m.status} />
                          <span className="font-bold text-xs text-[#09122A]">
                            @{m.author_handle}
                          </span>
                          {watchedHandle && (
                            <span className="text-[11px] text-slate-400">
                              (via competitor @{watchedHandle.handle})
                            </span>
                          )}
                          <span className="text-slate-300">•</span>
                          <span className="text-xs font-semibold text-slate-500">
                            {parentRule?.name || "Rule"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                          <span>
                            {new Date(m.created_at).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {m.platform_post_url && (
                            <a
                              href={m.platform_post_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#0E3A75] hover:underline flex items-center gap-0.5 font-bold"
                            >
                              <span>Source</span>
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-[#09122A] bg-[#F8FAFD] p-3 rounded-xl border border-[#EBF2FA] mb-3 leading-relaxed whitespace-pre-wrap select-text">
                        "{m.post_content}"
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                          Matched:
                        </span>
                        {m.matched_keywords?.map((kw, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669] font-mono text-[10.5px] font-bold border border-[#A7F3D0]"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>

                      {m.generated_response && (
                        <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 mb-2">
                          <div className="flex items-center justify-between text-[11px] font-bold text-[#0E3A75] mb-1">
                            <span className="flex items-center gap-1">
                              <Sparkles size={11} />
                              <span>Proposed Reply:</span>
                            </span>
                            {m.status === "pending_review" && (
                              <button
                                onClick={() => openReviewModal(m)}
                                className="text-[10.5px] text-[#0E3A75] hover:underline flex items-center gap-0.5 cursor-pointer"
                              >
                                <Edit3 size={10} />
                                <span>Edit Copy</span>
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap select-text">
                            {m.generated_response}
                          </p>
                        </div>
                      )}
                    </div>

                    {m.status === "pending_review" && (
                      <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F0F5FA] mt-2">
                        <button
                          onClick={() => handleReviewAction(m.id, "ignored")}
                          disabled={reviewMatchMutation.isPending}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold cursor-pointer transition-colors"
                        >
                          Dismiss
                        </button>
                        <button
                          onClick={() => openReviewModal(m)}
                          disabled={reviewMatchMutation.isPending}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-bold shadow-xs cursor-pointer transition-all"
                        >
                          <Check size={13} strokeWidth={2.5} />
                          <span>Approve & Dispatch</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 5. Tab B: Trigger Rules Engine */}
      {activeTab === "rules" && (
        <>
          {loading ? (
            <div className="py-20 flex justify-center">
              <LoadingState label="Loading keyword rules" variant="Orbit" />
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-10 text-center shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center mx-auto mb-3 shadow-2xs">
                <Hash size={24} />
              </div>
              <h2 className="text-lg font-bold text-[#09122A]">
                No trigger rules configured
              </h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                Set up keyword matching logic to detect customer grievances,
                pricing inquiries, or alternative seeking.
              </p>
              <button
                onClick={openCreateRuleModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Create First Rule</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
              {filteredRules.map((rule) => {
                const targetAccount = accounts.find(
                  (a) => a.id === rule.account_id,
                );
                const watchedHandle = handles.find(
                  (h) => h.id === rule.watched_handle_id,
                );

                return (
                  <div
                    key={rule.id}
                    className="rounded-[22px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm hover:border-[#B8D0EC] transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <PlatformBadge platform={rule.platform} />
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                              {rule.action_type.replace("_", " ")}
                            </span>
                          </div>
                          <h3 className="text-[17px] font-bold text-[#09122A]">
                            {rule.name}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleToggleRuleActive(rule)}
                            title={
                              rule.is_active ? "Pause rule" : "Resume rule"
                            }
                            className={`w-7 h-7 rounded-lg flex items-center justify-center border cursor-pointer transition-colors ${
                              rule.is_active
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-400 border-slate-200"
                            }`}
                          >
                            <Power size={13} strokeWidth={2.4} />
                          </button>
                          <button
                            onClick={() => openEditRuleModal(rule)}
                            className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={() => requestDeleteRule(rule)}
                            className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {rule.description && (
                        <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">
                          {rule.description}
                        </p>
                      )}

                      <div className="p-3 rounded-xl bg-[#F8FAFD] border border-[#EBF2FA] mb-3 space-y-2 text-xs">
                        {rule.keywords_any && rule.keywords_any.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">
                              Any:
                            </span>
                            {rule.keywords_any.map((k, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10.5px]"
                              >
                                {k}
                              </span>
                            ))}
                          </div>
                        )}

                        {rule.keywords_all && rule.keywords_all.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">
                              All:
                            </span>
                            {rule.keywords_all.map((k, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[10.5px]"
                              >
                                {k}
                              </span>
                            ))}
                          </div>
                        )}

                        {rule.keywords_exclude &&
                          rule.keywords_exclude.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">
                                Exclude:
                              </span>
                              {rule.keywords_exclude.map((k, idx) => (
                                <span
                                  key={idx}
                                  className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-mono text-[10.5px]"
                                >
                                  {k}
                                </span>
                              ))}
                            </div>
                          )}
                      </div>

                      {rule.response_template && (
                        <p className="text-[11px] text-slate-600 bg-white p-2.5 rounded-lg border border-[#DCE7F5] font-mono mb-3 truncate">
                          💬 {rule.response_template}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[#F0F5FA] text-[11px] text-slate-400">
                      <span>
                        Sender:{" "}
                        <strong className="text-[#09122A]">
                          @{targetAccount?.handle || "Unknown"}
                        </strong>
                      </span>
                      <span>
                        Target:{" "}
                        <strong className="text-[#09122A]">
                          {watchedHandle
                            ? `@${watchedHandle.handle}`
                            : "Global Feeds"}
                        </strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 6. Tab C: Watched Competitors */}
      {activeTab === "handles" && (
        <>
          {loading ? (
            <div className="py-20 flex justify-center">
              <LoadingState
                label="Loading monitored competitors"
                variant="Orbit"
              />
            </div>
          ) : handles.length === 0 ? (
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-10 text-center shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center mx-auto mb-3 shadow-2xs">
                <AtSign size={24} />
              </div>
              <h2 className="text-lg font-bold text-[#09122A]">
                No competitor profiles watched
              </h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                Add target accounts to automatically scrape their recent posts
                and detect conversations.
              </p>
              <button
                onClick={openAddHandleModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Target Competitor</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
              {handles.map((h) => (
                <div
                  key={h.id}
                  className="rounded-[22px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm hover:border-[#B8D0EC] transition-all flex items-center justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <PlatformBadge platform={h.platform} />
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        Every {h.scrape_frequency_minutes}m
                      </span>
                    </div>
                    <h3 className="text-[17px] font-bold text-[#09122A] truncate">
                      @{h.handle}
                    </h3>
                    {h.display_name && (
                      <span className="text-xs text-slate-400 block truncate">
                        {h.display_name}
                      </span>
                    )}
                    <span className="text-[10.5px] font-mono text-slate-400 mt-1 block">
                      {h.last_scraped_at
                        ? `Last scraped: ${new Date(h.last_scraped_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : "Never scraped"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={
                        h.platform === "twitter"
                          ? `https://x.com/${h.handle}`
                          : `https://www.instagram.com/${h.handle}/`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
                      title="Open Profile"
                    >
                      <ExternalLink size={13} />
                    </a>
                    <button
                      onClick={() => requestDeleteHandle(h)}
                      className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* 7. REVIEW & EDIT RESPONSE MODAL (Portal-Wrapped)                      */}
      {/* ===================================================================== */}
      {reviewingMatch &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1"
            onClick={(e) => {
              if (e.target === e.currentTarget) setReviewingMatch(null);
            }}
          >
            <div className="w-full max-w-lg rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col overflow-hidden text-[#09122A]">
              <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#F0F5FA] bg-[#F8FBFF]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center">
                    <Sparkles size={16} />
                  </div>
                  <h3 className="font-bold text-[16px] text-[#09122A]">
                    Review Staged Reply
                  </h3>
                </div>
                <button
                  onClick={() => setReviewingMatch(null)}
                  className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Target Post
                  </span>
                  <p className="text-xs text-[#09122A] bg-[#F8FAFD] p-3 rounded-xl border border-[#DCE7F5] leading-relaxed select-text">
                    "{reviewingMatch.post_content}"
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-[#09122A]">
                      Your Outbound Reply
                    </label>
                    <span className="text-[11px] font-mono text-slate-400">
                      {editedReply.length} chars
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={editedReply}
                    onChange={(e) => setEditedReply(e.target.value)}
                    placeholder="Polish response copy..."
                    className="w-full p-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium focus:border-[#0E3A75] outline-none resize-none leading-relaxed"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F5FA]">
                  <button
                    type="button"
                    onClick={() =>
                      handleReviewAction(reviewingMatch.id, "ignored")
                    }
                    disabled={reviewMatchMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer"
                  >
                    Dismiss Opportunity
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleReviewAction(
                        reviewingMatch.id,
                        "approved",
                        editedReply,
                      )
                    }
                    disabled={reviewMatchMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    <Check size={14} />
                    <span>
                      {reviewMatchMutation.isPending
                        ? "Approving..."
                        : "Approve for Dispatch"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ===================================================================== */}
      {/* 8. ADD / EDIT WATCHED COMPETITOR MODAL (Portal-Wrapped)               */}
      {/* ===================================================================== */}
      {isHandleModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsHandleModalOpen(false);
            }}
          >
            <div className="w-full max-w-[480px] rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col overflow-hidden text-[#09122A]">
              <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#F0F5FA] bg-[#F8FBFF]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center">
                    <AtSign size={16} />
                  </div>
                  <h3 className="font-bold text-[16px] text-[#09122A]">
                    {editingHandle
                      ? "Configure Target"
                      : "Monitor Competitor Handle"}
                  </h3>
                </div>
                <button
                  onClick={() => setIsHandleModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleSaveHandle} className="p-6 space-y-4">
                {formError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">
                    Platform <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["twitter", "instagram"] as PlatformType[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setHandlePlatform(p)}
                        className={`p-2.5 rounded-xl border text-xs font-bold capitalize transition-all cursor-pointer ${
                          handlePlatform === p
                            ? "bg-[#F4F9FF] border-[#0E3A75] text-[#0E3A75]"
                            : "bg-white border-[#DCE7F5] text-slate-600"
                        }`}
                      >
                        {p === "twitter" ? "X / Twitter" : "Instagram"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">
                    Competitor Handle <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] focus-within:border-[#0E3A75]">
                    <span className="text-slate-400 text-xs font-mono font-semibold mr-1">
                      @
                    </span>
                    <input
                      type="text"
                      required
                      value={handleUsername}
                      onChange={(e) => setHandleUsername(e.target.value)}
                      placeholder="competitor_brand"
                      className="w-full bg-transparent text-xs font-medium text-[#09122A] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">
                    Display Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={handleDisplayName}
                    onChange={(e) => setHandleDisplayName(e.target.value)}
                    placeholder="Competitor HQ"
                    className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium outline-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-[#09122A] mb-1">
                    <span>Scrape Frequency</span>
                    <span className="font-mono text-[#0E3A75]">
                      Every {handleFreq} mins
                    </span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={720}
                    step={30}
                    value={handleFreq}
                    onChange={(e) => setHandleFreq(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg accent-[#0E3A75] cursor-pointer"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F5FA]">
                  <button
                    type="button"
                    onClick={() => setIsHandleModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    <Check size={14} />
                    <span>
                      {isSubmitting ? "Saving..." : "Start Monitoring"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ===================================================================== */}
      {/* 9. CREATE / EDIT TRIGGER RULE MODAL (Portal-Wrapped)                  */}
      {/* ===================================================================== */}
      {isRuleModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsRuleModalOpen(false);
            }}
          >
            <div className="w-full max-w-[560px] rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col max-h-[88vh] overflow-hidden text-[#09122A]">
              <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#F0F5FA] bg-[#F8FBFF]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center">
                    <Hash size={16} />
                  </div>
                  <h3 className="font-bold text-[16px] text-[#09122A]">
                    {editingRule
                      ? "Edit Trigger Rule"
                      : "New Keyword Trigger Rule"}
                  </h3>
                </div>
                <button
                  onClick={() => setIsRuleModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <form
                onSubmit={handleSaveRule}
                className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"
              >
                {formError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">
                    Rule Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="e.g. Alternative Seeking Inquiries"
                    className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold focus:border-[#0E3A75] outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#09122A] mb-1">
                      Target Platform
                    </label>
                    <select
                      value={rulePlatform}
                      onChange={(e) => setRulePlatform(e.target.value as any)}
                      className="w-full h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-bold outline-none cursor-pointer"
                    >
                      <option value="twitter">X / Twitter</option>
                      <option value="instagram">Instagram</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#09122A] mb-1">
                      Replying Account <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={ruleAccountId}
                      onChange={(e) => setRuleAccountId(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold outline-none cursor-pointer"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          @{a.handle} ({a.platform})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">
                    Scope to Competitor
                  </label>
                  <select
                    value={ruleWatchedHandleId}
                    onChange={(e) => setRuleWatchedHandleId(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold outline-none cursor-pointer"
                  >
                    <option value="all">
                      Global Feeds (All Watched Accounts)
                    </option>
                    {handles.map((h) => (
                      <option key={h.id} value={h.id}>
                        Only @{h.handle}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Keyword Conditions */}
                <div className="p-3.5 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7] space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-[#09122A]">
                        Keywords (ANY) <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[10px] text-slate-400">
                        At least one must match
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={anyTagInput}
                        onChange={(e) => setAnyTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag(
                              anyTagInput,
                              keywordsAny,
                              setKeywordsAny,
                              () => setAnyTagInput(""),
                            );
                          }
                        }}
                        placeholder="Add keyword (press enter)..."
                        className="flex-1 h-8 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          addTag(anyTagInput, keywordsAny, setKeywordsAny, () =>
                            setAnyTagInput(""),
                          )
                        }
                        className="px-3 h-8 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {keywordsAny.map((k) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs font-mono"
                        >
                          {k}
                          <button
                            type="button"
                            onClick={() =>
                              setKeywordsAny(keywordsAny.filter((x) => x !== k))
                            }
                            className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-[#09122A]">
                        Keywords (ALL / Required)
                      </label>
                      <span className="text-[10px] text-slate-400">
                        Every keyword must be present
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={allTagInput}
                        onChange={(e) => setAllTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag(
                              allTagInput,
                              keywordsAll,
                              setKeywordsAll,
                              () => setAllTagInput(""),
                            );
                          }
                        }}
                        placeholder="Add required keyword (press enter)..."
                        className="flex-1 h-8 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          addTag(allTagInput, keywordsAll, setKeywordsAll, () =>
                            setAllTagInput(""),
                          )
                        }
                        className="px-3 h-8 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                    {keywordsAll.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {keywordsAll.map((k) => (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-mono"
                          >
                            {k}
                            <button
                              type="button"
                              onClick={() =>
                                setKeywordsAll(
                                  keywordsAll.filter((x) => x !== k),
                                )
                              }
                              className="text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-[#09122A]">
                        Keywords (EXCLUDE / Negative)
                      </label>
                      <span className="text-[10px] text-slate-400">
                        Never match if present
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={excludeTagInput}
                        onChange={(e) => setExcludeTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag(
                              excludeTagInput,
                              keywordsExclude,
                              setKeywordsExclude,
                              () => setExcludeTagInput(""),
                            );
                          }
                        }}
                        placeholder="e.g. hiring, job, scam..."
                        className="flex-1 h-8 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          addTag(
                            excludeTagInput,
                            keywordsExclude,
                            setKeywordsExclude,
                            () => setExcludeTagInput(""),
                          )
                        }
                        className="px-3 h-8 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {keywordsExclude.map((k) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-xs font-mono"
                        >
                          {k}
                          <button
                            type="button"
                            onClick={() =>
                              setKeywordsExclude(
                                keywordsExclude.filter((x) => x !== k),
                              )
                            }
                            className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-[#09122A]">
                      Response Copy Template
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setRuleTemplate((prev) => `${prev} @{author}`)
                      }
                      className="text-[11px] font-mono text-[#0E3A75] hover:underline cursor-pointer"
                    >
                      + Insert &#123;author&#125;
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={ruleTemplate}
                    onChange={(e) => setRuleTemplate(e.target.value)}
                    placeholder="Hey @{author}, check our platform..."
                    className="w-full p-3 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium outline-none resize-none leading-relaxed"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-[#09122A] mb-1">
                    <span>Author Cooldown</span>
                    <span className="font-mono text-[#0E3A75]">
                      {ruleCooldown} mins
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={1440}
                    step={15}
                    value={ruleCooldown}
                    onChange={(e) => setRuleCooldown(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg accent-[#0E3A75] cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Prevents repeatedly messaging the same author within this
                    timeframe.
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F5FA]">
                  <button
                    type="button"
                    onClick={() => setIsRuleModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    <Check size={14} />
                    <span>
                      {isSubmitting ? "Saving..." : "Save Trigger Rule"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ===================================================================== */}
      {/* 10. CUSTOM CONFIRM MODAL (Portal-Wrapped)                             */}
      {/* ===================================================================== */}
      {confirmModal.isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1"
            onClick={(e) => {
              if (e.target === e.currentTarget)
                setConfirmModal((prev) => ({ ...prev, isOpen: false }));
            }}
          >
            <div className="w-full max-w-md rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl p-6 text-[#09122A]">
              <div className="flex items-start gap-3.5 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} strokeWidth={2.4} />
                </div>
                <div>
                  <h3 className="font-bold text-[17px] text-[#09122A]">
                    {confirmModal.title}
                  </h3>
                  <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
                    {confirmModal.message}
                  </p>
                  {confirmModal.subtext && (
                    <p className="text-[11px] text-slate-400 mt-2 bg-[#F8FAFD] p-2.5 rounded-xl border border-[#EBF2FA]">
                      {confirmModal.subtext}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#F0F5FA]">
                <button
                  type="button"
                  onClick={() =>
                    setConfirmModal((prev) => ({ ...prev, isOpen: false }))
                  }
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => confirmModal.onConfirm()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm cursor-pointer"
                >
                  <Check size={13} strokeWidth={2.5} />
                  <span>{confirmModal.confirmText || "Confirm"}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default TriggersPage;
