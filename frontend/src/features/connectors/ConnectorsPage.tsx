import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Trash2,
  Sliders,
  Check,
  X,
  AlertCircle,
  TrendingUp,
  BarChart3,
  Power,
  Sparkles,
} from "lucide-react";
import {
  api,
  type DataConnector,
  type ConnectorType,
  type ConnectorStatus,
  type MetricOpportunityItem,
} from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { LoadingState } from "../../components/LoadingState";

// ============================================================================
// Provider Metadata & Styling
// ============================================================================

const PROVIDER_METADATA: Record<
  ConnectorType,
  {
    name: string;
    shortName: string;
    badgeBg: string;
    badgeText: string;
    description: string;
  }
> = {
  google_search_console: {
    name: "Google Search Console",
    shortName: "GSC",
    badgeBg: "bg-[#4285F4]",
    badgeText: "text-white",
    description: "Striking-distance queries, organic impressions & clicks",
  },
  ahrefs: {
    name: "Ahrefs Intelligence",
    shortName: "Ahrefs",
    badgeBg: "bg-[#0052CC]",
    badgeText: "text-white",
    description: "Competitor content gaps, keyword volumes & rankings",
  },
  dataforseo: {
    name: "DataForSEO",
    shortName: "DataForSEO",
    badgeBg: "bg-[#FF6600]",
    badgeText: "text-white",
    description: "Low-cost, on-demand SERP and keyword analysis",
  },
  ga4: {
    name: "Google Analytics 4",
    shortName: "GA4",
    badgeBg: "bg-[#F9AB00]",
    badgeText: "text-slate-900",
    description: "Landing page traffic, active visitors & bounce rates",
  },
  posthog: {
    name: "PostHog Product Analytics",
    shortName: "PostHog",
    badgeBg: "bg-[#1D1F20]",
    badgeText: "text-white",
    description: "Event tracking, funnels & conversion attribution",
  },
  stripe: {
    name: "Stripe Revenue",
    shortName: "Stripe",
    badgeBg: "bg-[#635BFF]",
    badgeText: "text-white",
    description: "MRR, paid customer conversions & churn insights",
  },
  hubspot: {
    name: "HubSpot CRM",
    shortName: "HubSpot",
    badgeBg: "bg-[#FF7A59]",
    badgeText: "text-white",
    description: "Lead stages, deals & sales pipeline alignment",
  },
};

function StatusBadge({ status }: { status: ConnectorStatus }) {
  const styles: Record<ConnectorStatus, { class: string; label: string }> = {
    connected: {
      class: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
      label: "Connected",
    },
    needs_reauth: {
      class: "bg-amber-50 text-amber-700 border-amber-200/60",
      label: "Re-Auth Required",
    },
    rate_limited: {
      class: "bg-amber-50 text-amber-700 border-amber-200/60",
      label: "Rate Limited",
    },
    error: {
      class: "bg-rose-50 text-rose-700 border-rose-200/60",
      label: "Error",
    },
    disabled: {
      class: "bg-slate-100 text-slate-500 border-slate-200/60",
      label: "Disabled",
    },
  };

  const badge = styles[status] || styles.disabled;

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badge.class}`}
    >
      {badge.label}
    </span>
  );
}

export const ConnectorsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<ConnectorType | "all">("all");

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
    data: connectors = [],
    isLoading: loading,
    isError,
    error: queryError,
    refetch: refetchConnectors,
  } = useQuery<DataConnector[]>({
    queryKey: queryKeys.connectors.list(),
    queryFn: () => api.connectors.list(),
  });

  // Opportunities Modal Selection & Dynamic Query
  const [inspectingConnector, setInspectingConnector] =
    useState<DataConnector | null>(null);

  const { data: opportunities = [], isLoading: loadingOpps } = useQuery<
    MetricOpportunityItem[]
  >({
    queryKey: inspectingConnector
      ? queryKeys.connectors.opportunities(inspectingConnector.id)
      : ["connectors", "opportunities", "none"],
    queryFn: () =>
      inspectingConnector
        ? api.connectors.getOpportunities(inspectingConnector.id, {
            min_impressions: 150,
            limit: 15,
          })
        : Promise.resolve([]),
    enabled: Boolean(inspectingConnector),
  });

  // Testing indicator state
  const [testingId, setTestingId] = useState<string | null>(null);

  // 2. Mutations with Auto-Cache Invalidation
  const createConnectorMutation = useMutation({
    mutationFn: api.connectors.create,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connectors.all });
      showToast(`Connector "${created.name}" registered successfully.`);
      setIsModalOpen(false);
    },
    onError: (err: any) => {
      setFormError(err?.message || "Could not save data connector.");
    },
  });

  const updateConnectorMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof api.connectors.update>[1];
    }) => api.connectors.update(id, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connectors.all });
      showToast(`Connector "${updated.name}" updated.`);
      setIsModalOpen(false);
    },
    onError: (err: any) => {
      setFormError(err?.message || "Could not update data connector.");
    },
  });

  const deleteConnectorMutation = useMutation({
    mutationFn: api.connectors.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connectors.all });
      showToast("Connector disconnected.");
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to delete connector.", "error");
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: api.connectors.test,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connectors.all });
      if (res.verified) {
        showToast("Connection verified successfully!");
      } else {
        showToast("Verification failed: Check credentials.", "error");
      }
      setTestingId(null);
    },
    onError: (err: any) => {
      showToast(err?.message || "Verification request failed.", "error");
      setTestingId(null);
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

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConnector, setEditingConnector] =
    useState<DataConnector | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<ConnectorType>(
    "google_search_console",
  );
  const [formTarget, setFormTarget] = useState("https://orlume.site");
  const [formSyncFreq, setFormSyncFreq] = useState(360);
  const [formApiKey, setFormApiKey] = useState("");
  const [formRefreshToken, setFormRefreshToken] = useState("");
  const [formClientId, setFormClientId] = useState("");
  const [formClientSecret, setFormClientSecret] = useState("");

  const stats = useMemo(() => {
    const total = connectors.length;
    const activeCount = connectors.filter(
      (c) => c.is_active && c.status === "connected",
    ).length;
    const gscCount = connectors.filter(
      (c) => c.connector_type === "google_search_console",
    ).length;
    const ahrefsCount = connectors.filter(
      (c) => c.connector_type === "ahrefs" || c.connector_type === "dataforseo",
    ).length;

    return { total, activeCount, gscCount, ahrefsCount };
  }, [connectors]);

  const filteredConnectors = useMemo(() => {
    return connectors.filter((c) => {
      return typeFilter === "all" || c.connector_type === typeFilter;
    });
  }, [connectors, typeFilter]);

  // Handlers
  const openCreateModal = (
    defaultType: ConnectorType = "google_search_console",
  ) => {
    setEditingConnector(null);
    setFormType(defaultType);
    setFormName(
      defaultType === "google_search_console"
        ? "Orlume Search Console"
        : "Competitor Ahrefs Tracker",
    );
    setFormTarget("https://orlume.site");
    setFormSyncFreq(360);
    setFormApiKey("");
    setFormRefreshToken("");
    setFormClientId("");
    setFormClientSecret("");
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (c: DataConnector) => {
    setEditingConnector(c);
    setFormType(c.connector_type);
    setFormName(c.name);
    setFormTarget(c.target_identifier);
    setFormSyncFreq(c.sync_frequency_minutes);
    setFormApiKey("");
    setFormRefreshToken("");
    setFormClientId("");
    setFormClientSecret("");
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveConnector = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanTarget = formTarget.trim();
    if (!formName.trim() || !cleanTarget) {
      setFormError("Please provide a name and target domain/URL.");
      return;
    }

    if (editingConnector) {
      updateConnectorMutation.mutate({
        id: editingConnector.id,
        payload: {
          name: formName.trim(),
          target_identifier: cleanTarget,
          sync_frequency_minutes: formSyncFreq,
          ...(formApiKey.trim() ? { api_key: formApiKey.trim() } : {}),
          ...(formRefreshToken.trim()
            ? { refresh_token: formRefreshToken.trim() }
            : {}),
          ...(formClientSecret.trim()
            ? { client_secret: formClientSecret.trim() }
            : {}),
        },
      });
    } else {
      createConnectorMutation.mutate({
        name: formName.trim(),
        connector_type: formType,
        target_identifier: cleanTarget,
        sync_frequency_minutes: formSyncFreq,
        api_key: formApiKey.trim() || undefined,
        refresh_token: formRefreshToken.trim() || undefined,
        client_id: formClientId.trim() || undefined,
        client_secret: formClientSecret.trim() || undefined,
      });
    }
  };

  const handleTestConnection = (c: DataConnector) => {
    setTestingId(c.id);
    testConnectionMutation.mutate(c.id);
  };

  const handleToggleActive = (c: DataConnector) => {
    updateConnectorMutation.mutate({
      id: c.id,
      payload: { is_active: !c.is_active },
    });
  };

  const requestDeleteConnector = (c: DataConnector) => {
    setConfirmModal({
      isOpen: true,
      title: "Disconnect Data Source",
      message: `Are you sure you want to disconnect "${c.name}"?`,
      subtext:
        "Your encrypted credentials will be permanently removed from the database vault.",
      confirmText: "Disconnect",
      onConfirm: () => {
        deleteConnectorMutation.mutate(c.id);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const isSubmitting =
    createConnectorMutation.isPending || updateConnectorMutation.isPending;

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
            <Database size={11} />
            <span>Semantic Marketing Connectors</span>
          </div>
          <h1 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.025em] text-[#09122A] leading-tight">
            Data Sources{" "}
            <span className="relative inline-block font-serif italic font-normal text-[#0D2149]">
              & SEO intelligence
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
            Connect Google Search Console, Ahrefs, and analytics so your AI
            agent plans campaigns using real search intent.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => refetchConnectors()}
            title="Refresh data sources"
            className="w-9 h-9 rounded-xl bg-white border border-[#DCE7F5] hover:bg-slate-50 text-slate-600 flex items-center justify-center shadow-2xs cursor-pointer"
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin text-[#0E3A75]" : ""}
            />
          </button>
          <button
            onClick={() => openCreateModal("google_search_console")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-md transition-all hover:scale-[1.01] active:scale-95 cursor-pointer"
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>Connect Data Source</span>
          </button>
        </div>
      </div>

      {/* 2. Top KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Active Sources
          </span>
          <div className="text-2xl font-bold text-[#09122A]">
            {stats.activeCount} / {stats.total}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Encrypted in vault
          </span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Search Console
          </span>
          <div className="text-2xl font-bold text-[#4285F4]">
            {stats.gscCount} Properties
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Striking-distance radar
          </span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            SEO & Competitor
          </span>
          <div className="text-2xl font-bold text-[#0052CC]">
            {stats.ahrefsCount} Domains
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Keyword gap analysis
          </span>
        </div>

        <div className="rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Agent Knowledge
          </span>
          <div className="text-2xl font-bold text-emerald-700 flex items-center gap-1.5">
            <Sparkles size={18} />
            <span>Ready</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Zero-hallucination tools
          </span>
        </div>
      </div>

      {/* 3. Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 mb-6 p-2 rounded-2xl bg-white/80 border border-[#DCE7F5]">
        <button
          onClick={() => setTypeFilter("all")}
          className={`px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
            typeFilter === "all"
              ? "bg-[#EBF3FC] text-[#0E3A75]"
              : "text-slate-500 hover:text-[#09122A]"
          }`}
        >
          All Providers
        </button>
        {Object.entries(PROVIDER_METADATA).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key as ConnectorType)}
            className={`px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
              typeFilter === key
                ? "bg-[#EBF3FC] text-[#0E3A75]"
                : "text-slate-500 hover:text-[#09122A]"
            }`}
          >
            {meta.shortName}
          </button>
        ))}
      </div>

      {isError && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle size={15} />
          <span>
            {(queryError as any)?.message || "Failed to load data sources."}
          </span>
        </div>
      )}

      {/* 4. Connectors Grid */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingState label="Decrypting data connectors" variant="Orbit" />
        </div>
      ) : filteredConnectors.length === 0 ? (
        <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-10 text-center shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center mx-auto mb-3 shadow-2xs">
            <Database size={24} />
          </div>
          <h2 className="text-lg font-bold text-[#09122A]">
            No data sources connected yet
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5 leading-relaxed">
            Connect Google Search Console for{" "}
            <span className="font-semibold text-[#09122A]">
              https://orlume.site
            </span>{" "}
            or add an Ahrefs key to let the AI agent identify real keyword
            opportunities.
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => openCreateModal("google_search_console")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer"
            >
              <Plus size={14} />
              <span>Connect Search Console</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
          {filteredConnectors.map((c) => {
            const meta =
              PROVIDER_METADATA[c.connector_type] ||
              PROVIDER_METADATA.google_search_console;
            const isTesting = testingId === c.id;

            return (
              <div
                key={c.id}
                className="rounded-[22px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm hover:border-[#B8D0EC] transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold ${meta.badgeBg} ${meta.badgeText}`}
                        >
                          {meta.shortName}
                        </span>
                        <StatusBadge status={c.status} />
                      </div>
                      <h3 className="text-[17px] font-bold text-[#09122A] truncate">
                        {c.name}
                      </h3>
                    </div>

                    <button
                      onClick={() => handleToggleActive(c)}
                      title={c.is_active ? "Pause data sync" : "Resume sync"}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center border cursor-pointer transition-colors ${
                        c.is_active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-400 border-slate-200"
                      }`}
                    >
                      <Power size={14} strokeWidth={2.4} />
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-[#F8FAFD] border border-[#EBF2FA] mb-3">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-600 mb-1">
                      <span className="font-semibold text-slate-400 text-[11px] uppercase">
                        Target Property:
                      </span>
                      <a
                        href={
                          c.target_identifier.startsWith("http")
                            ? c.target_identifier
                            : `https://${c.target_identifier}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-bold text-[#0E3A75] hover:underline truncate max-w-[200px]"
                      >
                        <span>{c.target_identifier}</span>
                        <ExternalLink size={10} />
                      </a>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Sync frequency:</span>
                      <span className="font-medium text-[#09122A]">
                        Every {c.sync_frequency_minutes / 60} hours
                      </span>
                    </div>
                  </div>

                  {c.last_error_message && (
                    <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-2">
                      <AlertTriangle size={13} className="shrink-0" />
                      <span className="truncate">{c.last_error_message}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3.5 border-t border-[#F0F5FA]">
                  <span className="text-[11px] font-mono text-slate-400">
                    {c.last_synced_at
                      ? `Synced ${new Date(c.last_synced_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "Never synced"}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setInspectingConnector(c)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EBF3FC] text-[#0E3A75] text-xs font-bold hover:bg-[#DDEBFA] transition-colors cursor-pointer"
                    >
                      <TrendingUp size={13} />
                      <span>Opportunities</span>
                    </button>

                    <button
                      onClick={() => handleTestConnection(c)}
                      disabled={isTesting}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
                      title="Verify credentials with upstream API"
                    >
                      {isTesting ? (
                        <RefreshCw
                          size={13}
                          className="animate-spin text-[#0E3A75]"
                        />
                      ) : (
                        "Test"
                      )}
                    </button>

                    <button
                      onClick={() => openEditModal(c)}
                      className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
                      title="Configure"
                    >
                      <Sliders size={13} />
                    </button>

                    <button
                      onClick={() => requestDeleteConnector(c)}
                      className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer"
                      title="Disconnect"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. OPPORTUNITIES INSPECTOR MODAL (Portal-Wrapped)                     */}
      {/* ===================================================================== */}
      {inspectingConnector &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1"
            onClick={(e) => {
              if (e.target === e.currentTarget) setInspectingConnector(null);
            }}
          >
            <div className="w-full max-w-3xl rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-[#09122A]">
              <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#F0F5FA] bg-[#F8FBFF]">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-[17px] text-[#09122A]">
                      {inspectingConnector.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-[#EBF3FC] text-[#0E3A75] font-mono text-[10.5px] font-bold">
                      Striking-Distance Radar
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 mt-0.5 block">
                    Keywords ranking positions 4–20 with high search volume for{" "}
                    {inspectingConnector.target_identifier}
                  </span>
                </div>
                <button
                  onClick={() => setInspectingConnector(null)}
                  className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {loadingOpps ? (
                  <div className="py-16 flex justify-center">
                    <LoadingState
                      label="Querying live Search Analytics"
                      variant="Orbit"
                    />
                  </div>
                ) : opportunities.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 bg-[#F8FAFD] rounded-2xl border border-[#DCE7F5]">
                    <BarChart3
                      size={24}
                      className="mx-auto mb-2 opacity-50 text-[#0E3A75]"
                    />
                    <span>
                      No striking-distance opportunities detected with the
                      current impression threshold.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {opportunities.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7] flex items-center justify-between gap-4 hover:border-[#B4CFF0] transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs font-bold text-[#0E3A75]">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-sm text-[#09122A] truncate">
                              {item.query}
                            </span>
                          </div>
                          {item.page_url && (
                            <span className="font-mono text-[11px] text-slate-400 truncate block">
                              {item.page_url}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-5 shrink-0 text-right">
                          <div>
                            <span className="block text-xs font-bold text-[#09122A]">
                              {item.impressions?.toLocaleString()}
                            </span>
                            <span className="block text-[10px] text-slate-400 uppercase">
                              Impressions
                            </span>
                          </div>

                          <div>
                            <span className="block text-xs font-bold text-blue-700">
                              Pos {item.position}
                            </span>
                            <span className="block text-[10px] text-slate-400 uppercase">
                              Rank
                            </span>
                          </div>

                          <div className="px-3 py-1 rounded-xl bg-white border border-[#DCE7F5] shadow-2xs">
                            <span className="block text-xs font-bold text-emerald-700">
                              {item.score} / 100
                            </span>
                            <span className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">
                              Opportunity
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-6 py-3.5 border-t border-[#F0F5FA] bg-[#F8FBFF] flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">
                  Data fetched directly from authenticated provider
                </span>
                <button
                  onClick={() => setInspectingConnector(null)}
                  className="px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold cursor-pointer"
                >
                  Close Inspector
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ===================================================================== */}
      {/* 6. CREATE / EDIT DATA CONNECTOR MODAL (Portal-Wrapped)               */}
      {/* ===================================================================== */}
      {isModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsModalOpen(false);
            }}
          >
            <div className="w-full max-w-[520px] rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col overflow-hidden text-[#09122A]">
              <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#F0F5FA] bg-[#F8FBFF]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center">
                    <Database size={16} />
                  </div>
                  <h3 className="font-bold text-[16px] text-[#09122A]">
                    {editingConnector
                      ? "Configure Data Connector"
                      : "Connect External Data Source"}
                  </h3>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleSaveConnector} className="p-6 space-y-4">
                {formError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {!editingConnector && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Select Provider
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        "google_search_console",
                        "ahrefs",
                        "dataforseo",
                        "ga4",
                      ].map((typeKey) => {
                        const meta =
                          PROVIDER_METADATA[typeKey as ConnectorType];
                        const selected = formType === typeKey;
                        return (
                          <button
                            key={typeKey}
                            type="button"
                            onClick={() => {
                              setFormType(typeKey as ConnectorType);
                              setFormName(
                                typeKey === "google_search_console"
                                  ? "Orlume Search Console"
                                  : `${meta.shortName} Tracker`,
                              );
                            }}
                            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                              selected
                                ? "bg-[#F4F9FF] border-[#0E3A75] text-[#09122A] ring-2 ring-[#0E3A75]/10 font-bold"
                                : "bg-white border-[#E2ECF7] text-slate-600 hover:bg-[#F8FAFD]"
                            }`}
                          >
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[9.5px] font-bold mb-1 ${meta.badgeBg} ${meta.badgeText}`}
                            >
                              {meta.shortName}
                            </span>
                            <span className="block text-xs font-bold text-[#09122A]">
                              {meta.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">
                    Connector Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Orlume Production Search Console"
                    className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-semibold focus:border-[#0E3A75] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#09122A] mb-1">
                    Target Site URL or Domain{" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formTarget}
                    onChange={(e) => setFormTarget(e.target.value)}
                    placeholder="https://orlume.site or competitor.com"
                    className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-mono focus:border-[#0E3A75] outline-none"
                  />
                </div>

                <div className="p-4 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7] space-y-3">
                  <span className="text-xs font-bold text-[#09122A] flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-emerald-600" />
                    <span>Encrypted API Credentials Vault</span>
                  </span>

                  {formType === "google_search_console" ? (
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Google OAuth Refresh Token
                        </label>
                        <input
                          type="password"
                          value={formRefreshToken}
                          onChange={(e) => setFormRefreshToken(e.target.value)}
                          placeholder={
                            editingConnector
                              ? "Leave blank to preserve existing token"
                              : "1//0g..."
                          }
                          className="w-full h-9 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs font-mono outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Client ID
                          </label>
                          <input
                            type="text"
                            value={formClientId}
                            onChange={(e) => setFormClientId(e.target.value)}
                            placeholder="xyz.apps.googleusercontent.com"
                            className="w-full h-9 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs font-mono outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Client Secret
                          </label>
                          <input
                            type="password"
                            value={formClientSecret}
                            onChange={(e) =>
                              setFormClientSecret(e.target.value)
                            }
                            placeholder="GOCSPX-..."
                            className="w-full h-9 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs font-mono outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        API Key
                      </label>
                      <input
                        type="password"
                        value={formApiKey}
                        onChange={(e) => setFormApiKey(e.target.value)}
                        placeholder={
                          editingConnector
                            ? "Leave blank to preserve existing key"
                            : "Paste API Key..."
                        }
                        className="w-full h-9 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs font-mono outline-none"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F5FA]">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
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
                      {isSubmitting
                        ? "Saving..."
                        : editingConnector
                          ? "Save Changes"
                          : "Connect Source"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ===================================================================== */}
      {/* 7. CUSTOM CONFIRMATION MODAL (Portal-Wrapped)                         */}
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

export default ConnectorsPage;
