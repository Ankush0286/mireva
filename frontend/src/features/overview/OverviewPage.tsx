import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  Megaphone,
  Send,
  Radio,
  Users2,
  Sparkles,
  RefreshCw,
  ArrowUpRight,
  Activity,
  Layers,
  ShieldCheck,
  Database,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  api,
  type Account,
  type Campaign,
  type ScheduledPost,
  type Lead,
  type OutreachMessage,
  type TriggerMatch,
  type TriggerRule,
  type ActivityLog,
  type DataConnector,
} from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { type SidebarTab } from "../../components/Sidebar";
import { LoadingState } from "../../components/LoadingState";

interface OverviewPageProps {
  onNavigate: (tab: SidebarTab) => void;
  onOpenCopilot: () => void;
}

// ============================================================================
// Pure SVG Micro-Sparkline Component
// ============================================================================

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const width = 88;
  const height = 28;

  const points = data.map((val, idx) => {
    const x = (idx / Math.max(data.length - 1, 1)) * width;
    const y = height - ((val - min) / range) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylinePoints = points.join(" ");
  const areaPoints = `0,${height} ${polylinePoints} ${width},${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible shrink-0"
    >
      <polygon points={areaPoints} fill={color} fillOpacity="0.12" />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polylinePoints}
      />
    </svg>
  );
}

// ============================================================================
// Pure SVG Multi-Segment Donut Chart
// ============================================================================

function PipelineDonut({
  published,
  scheduled,
  draft,
  failed,
}: {
  published: number;
  scheduled: number;
  draft: number;
  failed: number;
}) {
  const total = published + scheduled + draft + failed;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  const segments = [
    { label: "Published", count: published, color: "#10B981" },
    { label: "Scheduled", count: scheduled, color: "#2563EB" },
    { label: "Drafts", count: draft, color: "#94A3B8" },
    { label: "Failed", count: failed, color: "#F43F5E" },
  ];

  let accumulatedPercent = 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
        <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="transparent"
            stroke="#F1F5F9"
            strokeWidth="14"
          />
          {total > 0 &&
            segments.map((seg) => {
              if (seg.count === 0) return null;
              const pct = seg.count / total;
              const strokeDasharray = `${pct * circumference} ${circumference}`;
              const strokeDashoffset = -accumulatedPercent * circumference;
              accumulatedPercent += pct;

              return (
                <circle
                  key={seg.label}
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth="14"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="butt"
                  className="transition-all duration-500"
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold font-mono text-[#09122A] leading-none">
            {total}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
            Total Posts
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-2.5">
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.count / total) * 100) : 0;
          return (
            <div
              key={seg.label}
              className="flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="font-semibold text-slate-600">
                  {seg.label}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="font-bold text-[#09122A]">{seg.count}</span>
                <span className="text-[10.5px] text-slate-400 w-9 text-right">
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildLastSevenDays(): Array<{ dateKey: string; label: string }> {
  const days: Array<{ dateKey: string; label: string }> = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push({
      dateKey: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    });
  }
  return days;
}

const LAST_SEVEN_DAYS = buildLastSevenDays();

// ============================================================================
// Main OverviewPage Component
// ============================================================================

export const OverviewPage: React.FC<OverviewPageProps> = ({
  onNavigate,
  onOpenCopilot,
}) => {
  const queryClient = useQueryClient();
  const [chartFilter, setChartFilter] = useState<
    "all" | "content" | "outreach"
  >("all");
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

  // 1. Reactive Cached Queries via TanStack Query
  const { data: accounts = [], isLoading: accountsLoading } = useQuery<
    Account[]
  >({
    queryKey: queryKeys.accounts.list(false),
    queryFn: () => api.accounts.list(false),
  });

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<
    Campaign[]
  >({
    queryKey: queryKeys.campaigns.list(),
    queryFn: () => api.campaigns.list(),
  });

  const { data: leads = [], isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: queryKeys.outreach.leads({ limit: 200 }),
    queryFn: () => api.outreach.listLeads({ limit: 200 }),
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<
    OutreachMessage[]
  >({
    queryKey: queryKeys.outreach.messages({ limit: 200 }),
    queryFn: () => api.outreach.listMessages({ limit: 200 }),
  });

  const { data: matches = [], isLoading: matchesLoading } = useQuery<
    TriggerMatch[]
  >({
    queryKey: queryKeys.triggers.matches({ limit: 200 }),
    queryFn: () => api.triggers.listMatches({ limit: 200 }),
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery<TriggerRule[]>(
    {
      queryKey: queryKeys.triggers.rules(),
      queryFn: () => api.triggers.listRules(),
    },
  );

  const { data: logs = [], isLoading: logsLoading } = useQuery<ActivityLog[]>({
    queryKey: queryKeys.history.list({ limit: 60 }),
    queryFn: () => api.history.list({ limit: 60 }),
  });

  const { data: connectors = [], isLoading: connectorsLoading } = useQuery<
    DataConnector[]
  >({
    queryKey: queryKeys.connectors.list(),
    queryFn: () => api.connectors.list(),
  });

  const { data: posts = [], isLoading: postsLoading } = useQuery<
    ScheduledPost[]
  >({
    queryKey: ["campaigns", "all-posts", campaigns.map((c) => c.id)],
    queryFn: async () => {
      if (campaigns.length === 0) return [];
      const detailedCamps = await Promise.allSettled(
        campaigns.map((c) => api.campaigns.get(c.id)),
      );
      const hydratedPosts: ScheduledPost[] = [];
      detailedCamps.forEach((r) => {
        if (r.status === "fulfilled" && r.value.posts) {
          hydratedPosts.push(...r.value.posts);
        }
      });
      return hydratedPosts;
    },
    enabled: campaigns.length > 0,
  });

  const loading =
    accountsLoading ||
    campaignsLoading ||
    leadsLoading ||
    messagesLoading ||
    matchesLoading ||
    rulesLoading ||
    logsLoading ||
    connectorsLoading ||
    (campaigns.length > 0 && postsLoading);

  const loadAllMetrics = () => {
    queryClient.invalidateQueries();
  };

  // ==========================================================================
  // Computed Analytics & 7-Day Time-Series Aggregation
  // ==========================================================================

  const metrics = useMemo(() => {
    const activeAccounts = accounts.filter(
      (a) => a.is_active && a.status === "active",
    ).length;
    const postsSentToday = accounts.reduce(
      (sum, a) => sum + a.daily_posts_sent,
      0,
    );
    const postsLimitToday = accounts.reduce(
      (sum, a) => sum + a.daily_post_limit,
      0,
    );
    const dmsSentToday = accounts.reduce((sum, a) => sum + a.daily_dms_sent, 0);
    const dmsLimitToday = accounts.reduce(
      (sum, a) => sum + a.daily_dm_limit,
      0,
    );

    const publishedPosts = posts.filter((p) => p.status === "published").length;
    const scheduledPosts = posts.filter((p) => p.status === "scheduled").length;
    const draftPosts = posts.filter((p) => p.status === "draft").length;
    const failedPosts = posts.filter((p) => p.status === "failed").length;

    const stagedDms = messages.filter((m) => m.status === "staged").length;
    const dispatchedDms = messages.filter(
      (m) => m.status === "dispatched" || m.status === "approved",
    ).length;

    const pendingMatches = matches.filter(
      (m) => m.status === "pending_review",
    ).length;
    const approvedMatches = matches.filter(
      (m) => m.status === "approved" || m.status === "dispatched",
    ).length;

    return {
      activeAccounts,
      postsSentToday,
      postsLimitToday,
      dmsSentToday,
      dmsLimitToday,
      publishedPosts,
      scheduledPosts,
      draftPosts,
      failedPosts,
      stagedDms,
      dispatchedDms,
      pendingMatches,
      approvedMatches,
    };
  }, [accounts, posts, messages, matches]);

  const dailySeries = useMemo(() => {
    const days = LAST_SEVEN_DAYS.map((d) => ({
      ...d,
      contentCount: 0,
      outreachCount: 0,
      total: 0,
    }));

    const bucketMap = new Map(days.map((d) => [d.dateKey, d]));

    posts.forEach((p) => {
      const key = (
        p.published_at ||
        p.scheduled_at ||
        p.created_at ||
        ""
      ).slice(0, 10);
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.contentCount += 1;
        bucket.total += 1;
      }
    });

    logs.forEach((l) => {
      const key = (l.created_at || "").slice(0, 10);
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.contentCount += 1;
        bucket.total += 1;
      }
    });

    leads.forEach((ld) => {
      const key = (ld.created_at || "").slice(0, 10);
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.outreachCount += 1;
        bucket.total += 1;
      }
    });

    messages.forEach((m) => {
      const key = (m.created_at || "").slice(0, 10);
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.outreachCount += 1;
        bucket.total += 1;
      }
    });

    matches.forEach((mt) => {
      const key = (mt.created_at || "").slice(0, 10);
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.outreachCount += 1;
        bucket.total += 1;
      }
    });

    return days;
  }, [posts, logs, leads, messages, matches]);

  const crmFunnel = useMemo(() => {
    const stages = [
      { key: "discovered", label: "Discovered", color: "#64748B" },
      { key: "qualified", label: "Qualified", color: "#2563EB" },
      { key: "contacted", label: "Contacted", color: "#D97706" },
      { key: "replied", label: "Replied", color: "#7C3AED" },
      { key: "converted", label: "Converted", color: "#10B981" },
    ];
    const maxStageCount = Math.max(
      ...stages.map((s) => leads.filter((l) => l.stage === s.key).length),
      1,
    );

    return stages.map((s) => {
      const count = leads.filter((l) => l.stage === s.key).length;
      const pctWidth = Math.max(
        Math.round((count / maxStageCount) * 100),
        count > 0 ? 14 : 4,
      );
      return { ...s, count, pctWidth };
    });
  }, [leads]);

  const chartGeometry = useMemo(() => {
    const values = dailySeries.map((d) =>
      chartFilter === "content"
        ? d.contentCount
        : chartFilter === "outreach"
          ? d.outreachCount
          : d.total,
    );
    const maxVal = Math.max(...values, 4);
    const width = 680;
    const height = 190;
    const padX = 28;
    const padY = 20;
    const usableW = width - padX * 2;
    const usableH = height - padY * 2;

    const coords = values.map((val, idx) => {
      const x = padX + (idx / Math.max(values.length - 1, 1)) * usableW;
      const y = padY + usableH - (val / maxVal) * usableH;
      return { x, y, val, day: dailySeries[idx] };
    });

    let pathD = "";
    coords.forEach((pt, idx) => {
      if (idx === 0) {
        pathD += `M ${pt.x} ${pt.y}`;
      } else {
        const prev = coords[idx - 1];
        const cx1 = prev.x + (pt.x - prev.x) / 2;
        const cy1 = prev.y;
        const cx2 = prev.x + (pt.x - prev.x) / 2;
        const cy2 = pt.y;
        pathD += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${pt.x} ${pt.y}`;
      }
    });

    const areaD =
      coords.length > 0
        ? `${pathD} L ${coords[coords.length - 1].x} ${height - padY} L ${coords[0].x} ${height - padY} Z`
        : "";

    return { width, height, padY, maxVal, coords, pathD, areaD };
  }, [dailySeries, chartFilter]);

  return (
    <div className="relative h-full overflow-y-auto px-3 sm:px-6 py-4 custom-scrollbar max-w-6xl mx-auto w-full font-sans select-none text-[#09122A]">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 border border-[#DCE7F5] text-[11px] font-bold uppercase tracking-wider text-[#0E3A75] mb-2 shadow-2xs">
            <Activity size={11} />
            <span>Autonomous Growth Telemetry</span>
          </div>
          <h1 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.025em] text-[#09122A] leading-tight">
            Marketing Command{" "}
            <span className="relative inline-block font-serif italic font-normal text-[#0D2149]">
              & performance
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
            Real-time telemetry across your campaigns, social accounts,
            competitor triggers, and outreach pipeline.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={loadAllMetrics}
            title="Refresh all cached telemetry"
            className="w-9 h-9 rounded-xl bg-white border border-[#DCE7F5] hover:bg-slate-50 text-slate-600 flex items-center justify-center shadow-2xs cursor-pointer"
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin text-[#0E3A75]" : ""}
            />
          </button>
          <button
            onClick={onOpenCopilot}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-md transition-all hover:scale-[1.01] active:scale-95 cursor-pointer"
          >
            <Sparkles size={14} />
            <span>Ask AI Copilot</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-24 flex justify-center">
          <LoadingState
            label="Aggregating workspace telemetry"
            variant="Orbit"
          />
        </div>
      ) : (
        <div className="space-y-5 pb-10">
          {/* 2. Top 4 Executive KPI Cards with Sparklines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Content Pipeline */}
            <div
              onClick={() => onNavigate("campaigns")}
              className="group rounded-[22px] bg-white/95 border border-[#DCE7F5] hover:border-[#B4CFF0] p-4.5 shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Content Velocity
                </span>
                <div className="w-7 h-7 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Megaphone size={14} />
                </div>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-2xl font-bold font-mono text-[#09122A]">
                    {posts.length}
                  </div>
                  <span className="text-[11px] text-emerald-600 font-semibold">
                    {metrics.publishedPosts} published •{" "}
                    {metrics.scheduledPosts} queued
                  </span>
                </div>
                <MiniSparkline
                  data={dailySeries.map((d) => d.contentCount)}
                  color="#2563EB"
                />
              </div>
            </div>

            {/* Card 2: Outreach CRM */}
            <div
              onClick={() => onNavigate("outreach")}
              className="group rounded-[22px] bg-white/95 border border-[#DCE7F5] hover:border-[#B4CFF0] p-4.5 shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Outreach Pipeline
                </span>
                <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Send size={14} />
                </div>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-2xl font-bold font-mono text-[#09122A]">
                    {leads.length} Leads
                  </div>
                  <span className="text-[11px] text-amber-600 font-semibold">
                    {metrics.stagedDms} staged DMs awaiting review
                  </span>
                </div>
                <MiniSparkline
                  data={dailySeries.map((d) => d.outreachCount)}
                  color="#10B981"
                />
              </div>
            </div>

            {/* Card 3: Triggers Radar */}
            <div
              onClick={() => onNavigate("triggers")}
              className="group rounded-[22px] bg-white/95 border border-[#DCE7F5] hover:border-[#B4CFF0] p-4.5 shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Triggers Radar
                </span>
                <div className="w-7 h-7 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Radio size={14} />
                </div>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-2xl font-bold font-mono text-[#09122A]">
                    {matches.length} Matches
                  </div>
                  <span className="text-[11px] text-purple-600 font-semibold">
                    {rules.filter((r) => r.is_active).length} active rules •{" "}
                    {metrics.pendingMatches} pending
                  </span>
                </div>
                <MiniSparkline
                  data={dailySeries.map((d) => d.total)}
                  color="#7C3AED"
                />
              </div>
            </div>

            {/* Card 4: Daily Safety Quotas */}
            <div
              onClick={() => onNavigate("accounts")}
              className="group rounded-[22px] bg-white/95 border border-[#DCE7F5] hover:border-[#B4CFF0] p-4.5 shadow-sm transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Account Safety Quotas
                </span>
                <div className="w-7 h-7 rounded-xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ShieldCheck size={14} />
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-[#09122A]">
                    {metrics.activeAccounts} / {accounts.length}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600">
                    Online
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-[#0E3A75] rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        ((metrics.postsSentToday + metrics.dmsSentToday) /
                          Math.max(
                            1,
                            metrics.postsLimitToday + metrics.dmsLimitToday,
                          )) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
                <span className="text-[10.5px] text-slate-400 mt-1 block font-mono">
                  {metrics.postsSentToday}/{metrics.postsLimitToday} posts •{" "}
                  {metrics.dmsSentToday}/{metrics.dmsLimitToday} DMs today
                </span>
              </div>
            </div>
          </div>

          {/* 3. Main Row: 7-Day Activity Velocity Chart + Content Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-[24px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm flex flex-col justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-2 border-b border-[#F0F5FA]">
                <div>
                  <h3 className="font-bold text-[15.5px] text-[#09122A] flex items-center gap-2">
                    <TrendingUp size={16} className="text-[#2563EB]" />
                    <span>7-Day Autonomous Execution Velocity</span>
                  </h3>
                  <span className="text-xs text-slate-400">
                    Daily volume of published content, lead captures, and system
                    actions
                  </span>
                </div>

                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F8FAFD] border border-[#E2ECF7] self-start sm:self-auto">
                  {[
                    { id: "all", label: "All Activity" },
                    { id: "content", label: "Content" },
                    { id: "outreach", label: "CRM & Triggers" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setChartFilter(tab.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        chartFilter === tab.id
                          ? "bg-white text-[#0E3A75] shadow-2xs"
                          : "text-slate-500 hover:text-[#09122A]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* SVG Area Chart */}
              <div className="relative pt-2">
                <svg
                  viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
                  className="w-full h-48 overflow-visible"
                >
                  <defs>
                    <linearGradient
                      id="overviewAreaGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#2563EB"
                        stopOpacity="0.28"
                      />
                      <stop
                        offset="100%"
                        stopColor="#2563EB"
                        stopOpacity="0.0"
                      />
                    </linearGradient>
                  </defs>

                  {[0, 0.5, 1].map((ratio, idx) => {
                    const y =
                      chartGeometry.padY +
                      ratio * (chartGeometry.height - chartGeometry.padY * 2);
                    const val = Math.round(chartGeometry.maxVal * (1 - ratio));
                    return (
                      <g key={idx}>
                        <line
                          x1={28}
                          y1={y}
                          x2={chartGeometry.width - 28}
                          y2={y}
                          stroke="#F1F5F9"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                        <text
                          x={4}
                          y={y + 3}
                          className="fill-slate-300 font-mono text-[9px]"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  {chartGeometry.areaD && (
                    <path
                      d={chartGeometry.areaD}
                      fill="url(#overviewAreaGrad)"
                    />
                  )}
                  {chartGeometry.pathD && (
                    <path
                      d={chartGeometry.pathD}
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                    />
                  )}

                  {chartGeometry.coords.map((pt, idx) => {
                    const isHovered = hoveredDayIdx === idx;
                    return (
                      <g
                        key={pt.day.dateKey}
                        onMouseEnter={() => setHoveredDayIdx(idx)}
                        onMouseLeave={() => setHoveredDayIdx(null)}
                        className="cursor-pointer"
                      >
                        <rect
                          x={pt.x - 24}
                          y={0}
                          width={48}
                          height={chartGeometry.height}
                          fill="transparent"
                        />
                        {isHovered && (
                          <line
                            x1={pt.x}
                            y1={chartGeometry.padY}
                            x2={pt.x}
                            y2={chartGeometry.height - chartGeometry.padY}
                            stroke="#93C5FD"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                          />
                        )}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 5.5 : 3.5}
                          fill="#FFFFFF"
                          stroke="#0E3A75"
                          strokeWidth={isHovered ? 3 : 2}
                        />
                        <text
                          x={pt.x}
                          y={chartGeometry.height - 2}
                          textAnchor="middle"
                          className="fill-slate-400 font-mono text-[9.5px]"
                        >
                          {pt.day.label.split(",")[0]}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {hoveredDayIdx !== null &&
                  chartGeometry.coords[hoveredDayIdx] && (
                    <div className="absolute top-2 right-4 px-3 py-2 rounded-xl bg-[#09122A] text-white text-[11px] shadow-lg pointer-events-none flex items-center gap-3">
                      <span className="font-bold text-blue-300">
                        {chartGeometry.coords[hoveredDayIdx].day.label}
                      </span>
                      <span className="font-mono">
                        Content:{" "}
                        <b>
                          {chartGeometry.coords[hoveredDayIdx].day.contentCount}
                        </b>
                      </span>
                      <span className="font-mono">
                        Outreach:{" "}
                        <b>
                          {
                            chartGeometry.coords[hoveredDayIdx].day
                              .outreachCount
                          }
                        </b>
                      </span>
                    </div>
                  )}
              </div>
            </div>

            {/* Post Queue Distribution Donut */}
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#F0F5FA]">
                  <div>
                    <h3 className="font-bold text-[15.5px] text-[#09122A] flex items-center gap-2">
                      <Layers size={15} className="text-[#0E3A75]" />
                      <span>Post Queue Breakdown</span>
                    </h3>
                    <span className="text-xs text-slate-400">
                      Across {campaigns.length} campaigns
                    </span>
                  </div>
                  <button
                    onClick={() => onNavigate("campaigns")}
                    className="text-xs font-bold text-[#0E3A75] hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Queue</span>
                    <ArrowUpRight size={13} />
                  </button>
                </div>

                <PipelineDonut
                  published={metrics.publishedPosts}
                  scheduled={metrics.scheduledPosts}
                  draft={metrics.draftPosts}
                  failed={metrics.failedPosts}
                />
              </div>

              <div className="mt-4 pt-3 border-t border-[#F0F5FA] flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">
                  Active Data Sources
                </span>
                <button
                  onClick={() => onNavigate("connectors")}
                  className="font-mono font-bold text-[#0E3A75] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Database size={12} />
                  <span>{connectors.length} Connected</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4. Bottom Row: Outreach Funnel & Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#F0F5FA]">
                  <div>
                    <h3 className="font-bold text-[15.5px] text-[#09122A] flex items-center gap-2">
                      <Users2 size={16} className="text-emerald-600" />
                      <span>Outreach CRM Conversion Funnel</span>
                    </h3>
                    <span className="text-xs text-slate-400">
                      Prospect progression from discovery to conversion
                    </span>
                  </div>
                  <button
                    onClick={() => onNavigate("outreach")}
                    className="text-xs font-bold text-[#0E3A75] hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Open CRM</span>
                    <ArrowUpRight size={13} />
                  </button>
                </div>

                <div className="space-y-3">
                  {crmFunnel.map((stage) => (
                    <div key={stage.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#09122A]">
                          {stage.label}
                        </span>
                        <span className="font-mono font-bold text-slate-600">
                          {stage.count} leads
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${stage.pctWidth}%`,
                            backgroundColor: stage.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 p-3 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Activity size={15} className="text-amber-600 shrink-0" />
                  <span className="text-xs font-semibold text-[#09122A]">
                    {metrics.stagedDms} cold DMs & {metrics.pendingMatches}{" "}
                    trigger replies awaiting review
                  </span>
                </div>
                <button
                  onClick={() =>
                    onNavigate(metrics.stagedDms > 0 ? "outreach" : "triggers")
                  }
                  className="px-3 py-1 rounded-xl bg-[#0E3A75] text-white text-[11px] font-bold cursor-pointer shrink-0"
                >
                  Review Now
                </button>
              </div>
            </div>

            <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#F0F5FA]">
                  <div>
                    <h3 className="font-bold text-[15.5px] text-[#09122A] flex items-center gap-2">
                      <Activity size={16} className="text-[#0E3A75]" />
                      <span>Recent System Activity</span>
                    </h3>
                    <span className="text-xs text-slate-400">
                      Latest automated worker & agent events
                    </span>
                  </div>
                  <button
                    onClick={() => onNavigate("system")}
                    className="text-xs font-bold text-[#0E3A75] hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>System & Logs</span>
                    <ChevronRight size={14} />
                  </button>
                </div>

                {logs.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">
                    No activity events recorded yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.slice(0, 5).map((log) => (
                      <div
                        key={log.id}
                        className="p-2.5 rounded-xl bg-[#F8FAFD] border border-[#EBF2FA] flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {log.severity === "error" ? (
                            <AlertTriangle
                              size={14}
                              className="text-rose-600 shrink-0"
                            />
                          ) : log.severity === "warning" ? (
                            <AlertTriangle
                              size={14}
                              className="text-amber-600 shrink-0"
                            />
                          ) : (
                            <CheckCircle2
                              size={14}
                              className="text-emerald-600 shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <span className="font-bold text-[#09122A] block truncate">
                              {log.title}
                            </span>
                            <span className="text-[10.5px] font-mono text-slate-400">
                              Actor: {log.actor}
                            </span>
                          </div>
                        </div>

                        <span className="text-[10.5px] font-mono text-slate-400 shrink-0">
                          {new Date(log.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OverviewPage;
