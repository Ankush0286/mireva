// ============================================================================
// 1. Domain Types & Enums (Directly Mirroring Backend Pydantic Schemas)
// ============================================================================

export type PlatformType = "twitter" | "instagram" | "facebook" | "email";
export type AccountStatus =
  "active" | "needs_reauth" | "rate_limited" | "disconnected" | "suspended";
export type AuthMethod = "api_keys" | "browser_session" | "hybrid";

export type CampaignStatus =
  "draft" | "active" | "paused" | "completed" | "archived";
export type PostStatus =
  "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
export type PostContentType =
  "text" | "image" | "video" | "carousel" | "thread";

export type TriggerActionType =
  "auto_reply" | "stage_draft" | "notify_only" | "dispatch_dm";
export type TriggerMatchStatus =
  "pending_review" | "approved" | "dispatched" | "ignored" | "failed";

export type LeadStage =
  | "discovered"
  | "qualified"
  | "contacted"
  | "replied"
  | "converted"
  | "unresponsive"
  | "do_not_contact";
export type LeadTier = "nano" | "micro" | "mid" | "macro" | "mega";
export type OutreachChannel = "dm" | "email";
export type OutreachMessageStatus =
  "draft" | "staged" | "approved" | "rejected" | "dispatched" | "failed";

export type ActivitySeverity = "info" | "success" | "warning" | "error";
export type ChatRole = "user" | "assistant" | "system" | "tool";
export type ToolExecutionStatus = "pending" | "success" | "error";

export type ConnectorType =
  | "google_search_console"
  | "ahrefs"
  | "dataforseo"
  | "ga4"
  | "posthog"
  | "stripe"
  | "hubspot";

export type ConnectorStatus =
  "connected" | "needs_reauth" | "rate_limited" | "error" | "disabled";

export type StrategistStatus =
  "idle" | "running" | "sleeping" | "waiting_for_human" | "paused";

export type AutonomyLevel = "staged_review" | "full_auto";

// ----------------- Domain Entities -----------------

export interface UsageState {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
  contextWindow: number;
  estimatedCostUsd?: number;
}

export interface StrategistState {
  id: string;
  status: StrategistStatus;
  current_step: string | null;
  model_id: string | null;
  next_cycle_at: string | null;
  sleep_rationale: string | null;
  pending_question: string | null;
  pending_urgency: string | null;
  pending_context: Record<string, unknown>;
  autonomy_level: AutonomyLevel;
  session_id: string | null;
  cycle_count: number;
  last_cycle_started_at: string | null;
  last_cycle_completed_at: string | null;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RecipeStep {
  type: string;
  description?: string;
  selectors?: string[];
  target?: string;
  variable?: string;
  optional?: boolean;
  [key: string]: any;
}

export interface ActionRecipe {
  id: string;
  name: string;
  platform: PlatformType;
  description: string | null;
  steps: RecipeStep[];
  is_default: boolean;
  is_active: boolean;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  platform: PlatformType;
  handle: string;
  display_name: string | null;
  platform_user_id: string | null;
  status: AccountStatus;
  auth_method: AuthMethod;
  is_active: boolean;
  daily_post_limit: number;
  daily_posts_sent: number;
  daily_dm_limit: number;
  daily_dms_sent: number;
  cooldown_until: string | null;
  has_valid_browser_session: boolean;
  last_browser_login_at: string | null;
  follower_count: number | null;
  profile_image_url: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  target_audience: string | null;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  tags: string[];
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  posts?: ScheduledPost[];
}

export interface ScheduledPost {
  id: string;
  campaign_id: string;
  account_id: string;
  content: string;
  content_type: PostContentType;
  media_urls: string[];
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  platform_post_id: string | null;
  platform_post_url: string | null;
  last_error_message: string | null;
  retry_count: number;
  max_retries: number;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WatchedHandle {
  id: string;
  platform: PlatformType;
  handle: string;
  display_name: string | null;
  is_active: boolean;
  scrape_frequency_minutes: number;
  last_scraped_at: string | null;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TriggerRule {
  id: string;
  name: string;
  description: string | null;
  platform: PlatformType;
  account_id: string;
  watched_handle_id: string | null;
  action_type: TriggerActionType;
  keywords_any: string[];
  keywords_all: string[];
  keywords_exclude: string[];
  response_template: string | null;
  cooldown_minutes: number;
  is_active: boolean;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TriggerMatch {
  id: string;
  rule_id: string;
  watched_handle_id: string | null;
  platform_post_id: string;
  platform_post_url: string | null;
  author_handle: string;
  post_content: string;
  matched_keywords: string[];
  status: TriggerMatchStatus;
  generated_response: string | null;
  published_reply_id: string | null;
  last_error_message: string | null;
  reviewed_at: string | null;
  dispatched_at: string | null;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  platform: PlatformType;
  handle: string;
  display_name: string | null;
  bio: string | null;
  profile_url: string | null;
  email: string | null;
  follower_count: number | null;
  tier: LeadTier;
  stage: LeadStage;
  tags: string[];
  notes: string | null;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OutreachCampaign {
  id: string;
  name: string;
  account_id: string;
  description: string | null;
  is_active: boolean;
  target_criteria: Record<string, unknown>;
  template: string | null;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OutreachMessage {
  id: string;
  outreach_campaign_id: string | null;
  lead_id: string;
  account_id: string;
  channel: OutreachChannel;
  content: string;
  status: OutreachMessageStatus;
  reviewed_at: string | null;
  sent_at: string | null;
  platform_message_id: string | null;
  last_error_message: string | null;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  activity_type: string;
  severity: ActivitySeverity;
  title: string;
  description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  actor: string;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ChatSession {
  id: string;
  title: string;
  is_archived: boolean;
  system_prompt_override: string | null;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  messages?: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: ChatRole;
  content: string;
  token_count?: number | null;
  model_name?: string | null;
  extra_metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export interface ToolExecutionLog {
  id: string;
  session_id: string;
  message_id: string | null;
  tool_name: string;
  input_arguments: Record<string, unknown>;
  output_result: unknown | null;
  status: ToolExecutionStatus;
  execution_time_ms: number | null;
  error_message: string | null;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CopilotModelInfo {
  id: string;
  name: string;
  description?: string | null;
  badge?: string | null;
  context_window?: number;
  input_cost_per_1m?: number;
  output_cost_per_1m?: number;
}

export interface DataConnector {
  id: string;
  name: string;
  connector_type: ConnectorType;
  target_identifier: string;
  status: ConnectorStatus;
  is_active: boolean;
  sync_frequency_minutes: number;
  last_synced_at: string | null;
  last_error_message: string | null;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MetricOpportunityItem {
  query: string;
  page_url: string | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  position: number | null;
  opportunity_type: string;
  score: number;
}

export interface BrandKit {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  website_url: string | null;
  industry: string | null;
  is_primary: boolean;
  tone_traits: string[];
  banned_words: string[];
  preferred_phrases: string[];
  emoji_policy: string;
  target_personas: Array<{
    title: string;
    pain_points: string[];
    pitch_angle: string;
  }>;
  value_props: Array<{ feature: string; benefit: string }>;
  competitor_advantages: Array<{ competitor: string; why_we_win: string }>;
  pricing_summary: string | null;
  key_links: Array<{ title: string; url: string }>;
  extra_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SubsystemHealth {
  id: string;
  name: string;
  status: "healthy" | "warning" | "error";
  message: string;
  latency_ms?: number | null;
  details: Record<string, unknown>;
}

export interface SchedulerJobInfo {
  id: string;
  name: string;
  next_run_time: string | null;
}

export interface RecipeCoverageSlot {
  platform: string;
  action_type: string;
  action_label: string;
  status: "custom_ready" | "native_ready" | "missing";
  has_custom_recipe: boolean;
  has_native_adapter: boolean;
  recipe_id: string | null;
  recipe_name: string | null;
}

export interface SystemDiagnosticsResponse {
  overall_status: "healthy" | "warning" | "error";
  checked_at: string;
  subsystems: SubsystemHealth[];
  scheduler_running: boolean;
  scheduler_jobs: SchedulerJobInfo[];
  recipe_matrix: RecipeCoverageSlot[];
  entity_counts: Record<string, number>;
}

export interface SeedRecipesResponse {
  seeded_count: number;
  total_recipes: number;
  message: string;
}

export interface WorkerTriggerResponse {
  worker: string;
  status: string;
  items_processed: number;
  message: string;
}

// ============================================================================
// 2. Custom API Error Class
// ============================================================================

export class ApiError extends Error {
  public status: number;
  public errorCode?: string;
  public details?: unknown;

  constructor(
    message: string,
    status: number,
    errorCode?: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
  }
}

// ============================================================================
// 3. Core HTTP Fetch Transport
// ============================================================================

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return "";
  const searchParams = new URLSearchParams();

  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== "") {
      searchParams.append(key, String(val));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has("Content-Type") && !(options?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  let data: any = null;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    data = await response.json().catch(() => null);
  } else {
    data = await response.text().catch(() => null);
  }

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && (data.detail || data.message)) ||
      `Request failed with status ${response.status}`;
    const errorCode =
      (data && typeof data === "object" && data.error) ||
      `HTTP_${response.status}`;
    const details = data && typeof data === "object" ? data.details : undefined;

    throw new ApiError(message, response.status, errorCode, details);
  }

  return data as T;
}

// ============================================================================
// 4. Complete Unified API Client
// ============================================================================

export const api = {
  health: () => request<{ status: string; app: string }>("/health"),

  // --------------------------------------------------------------------------
  // 24/7 Autonomous Strategist (Mission Control)
  // --------------------------------------------------------------------------
  strategist: {
    getState: () => request<StrategistState>("/api/v1/strategist/state"),

    setModel: (modelId: string) =>
      request<StrategistState>("/api/v1/strategist/model", {
        method: "POST",
        body: JSON.stringify({ model_id: modelId }),
      }),

    runNow: () =>
      request<StrategistState>("/api/v1/strategist/run-now", {
        method: "POST",
      }),

    togglePause: () =>
      request<StrategistState>("/api/v1/strategist/toggle-pause", {
        method: "POST",
      }),

    setAutonomy: (autonomyLevel: AutonomyLevel) =>
      request<StrategistState>("/api/v1/strategist/autonomy", {
        method: "POST",
        body: JSON.stringify({ autonomy_level: autonomyLevel }),
      }),

    clearContext: () =>
      request<StrategistState>("/api/v1/strategist/clear-context", {
        method: "POST",
      }),

    deleteCycle: (messageId: string) =>
      request<StrategistState>(`/api/v1/strategist/cycles/${messageId}`, {
        method: "DELETE",
      }),

    reply: (replyText: string) =>
      request<StrategistState>("/api/v1/strategist/reply", {
        method: "POST",
        body: JSON.stringify({ reply: replyText }),
      }),
  },

  // --------------------------------------------------------------------------
  // Accounts
  // --------------------------------------------------------------------------
  accounts: {
    list: (activeOnly = false) =>
      request<Account[]>(
        `/api/v1/accounts/${buildQueryString({ active_only: activeOnly })}`,
      ),

    get: (accountId: string) =>
      request<Account>(`/api/v1/accounts/${accountId}`),

    create: (payload: {
      platform: PlatformType;
      handle: string;
      display_name?: string;
      auth_method?: AuthMethod;
      daily_post_limit?: number;
      daily_dm_limit?: number;
      access_token?: string;
      refresh_token?: string;
      token_secret?: string;
      api_key?: string;
      api_secret?: string;
      browser_storage_path?: string;
    }) =>
      request<Account>("/api/v1/accounts/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    update: (
      accountId: string,
      payload: {
        display_name?: string;
        status?: AccountStatus;
        is_active?: boolean;
        daily_post_limit?: number;
        daily_dm_limit?: number;
        extra_metadata?: Record<string, unknown>;
        access_token?: string;
        refresh_token?: string;
        api_key?: string;
        api_secret?: string;
      },
    ) =>
      request<Account>(`/api/v1/accounts/${accountId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),

    delete: (accountId: string) =>
      request<void>(`/api/v1/accounts/${accountId}`, { method: "DELETE" }),

    verifySession: (accountId: string) =>
      request<Account>(`/api/v1/accounts/${accountId}/session/verify`, {
        method: "POST",
      }),
  },

  // --------------------------------------------------------------------------
  // Campaigns & Posts
  // --------------------------------------------------------------------------
  campaigns: {
    list: (status?: CampaignStatus) =>
      request<Campaign[]>(`/api/v1/campaigns/${buildQueryString({ status })}`),

    get: (campaignId: string) =>
      request<Campaign>(`/api/v1/campaigns/${campaignId}`),

    create: (payload: {
      name: string;
      description?: string;
      target_audience?: string;
      status?: CampaignStatus;
      start_date?: string;
      end_date?: string;
      tags?: string[];
      extra_metadata?: Record<string, unknown>;
    }) =>
      request<Campaign>("/api/v1/campaigns/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    update: (
      campaignId: string,
      payload: {
        name?: string;
        description?: string;
        target_audience?: string;
        status?: CampaignStatus;
        start_date?: string;
        end_date?: string;
        tags?: string[];
        extra_metadata?: Record<string, unknown>;
      },
    ) =>
      request<Campaign>(`/api/v1/campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),

    delete: (campaignId: string) =>
      request<void>(`/api/v1/campaigns/${campaignId}`, { method: "DELETE" }),

    listPosts: (campaignId: string, status?: PostStatus) =>
      request<ScheduledPost[]>(
        `/api/v1/campaigns/${campaignId}/posts${buildQueryString({ status })}`,
      ),

    queuePost: (
      campaignId: string,
      payload: {
        account_id: string;
        content: string;
        content_type?: PostContentType;
        media_urls?: string[];
        scheduled_at?: string;
        status?: PostStatus;
        max_retries?: number;
        extra_metadata?: Record<string, unknown>;
      },
    ) =>
      request<ScheduledPost>(`/api/v1/campaigns/${campaignId}/posts`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    getPost: (postId: string) =>
      request<ScheduledPost>(`/api/v1/campaigns/posts/${postId}`),

    updatePost: (
      postId: string,
      payload: {
        account_id?: string;
        content?: string;
        content_type?: PostContentType;
        media_urls?: string[];
        scheduled_at?: string;
        status?: PostStatus;
        extra_metadata?: Record<string, unknown>;
      },
    ) =>
      request<ScheduledPost>(`/api/v1/campaigns/posts/${postId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),

    cancelPost: (postId: string) =>
      request<ScheduledPost>(`/api/v1/campaigns/posts/${postId}/cancel`, {
        method: "POST",
      }),

    deletePost: (postId: string) =>
      request<void>(`/api/v1/campaigns/posts/${postId}`, { method: "DELETE" }),
  },

  // --------------------------------------------------------------------------
  // Triggers Radar
  // --------------------------------------------------------------------------
  triggers: {
    listHandles: (activeOnly = false) =>
      request<WatchedHandle[]>(
        `/api/v1/triggers/handles${buildQueryString({ active_only: activeOnly })}`,
      ),

    getHandle: (handleId: string) =>
      request<WatchedHandle>(`/api/v1/triggers/handles/${handleId}`),

    addHandle: (payload: {
      platform: PlatformType;
      handle: string;
      display_name?: string;
      scrape_frequency_minutes?: number;
      extra_metadata?: Record<string, unknown>;
    }) =>
      request<WatchedHandle>("/api/v1/triggers/handles", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    updateHandle: (
      handleId: string,
      payload: {
        display_name?: string;
        is_active?: boolean;
        scrape_frequency_minutes?: number;
        extra_metadata?: Record<string, unknown>;
      },
    ) =>
      request<WatchedHandle>(`/api/v1/triggers/handles/${handleId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),

    deleteHandle: (handleId: string) =>
      request<void>(`/api/v1/triggers/handles/${handleId}`, {
        method: "DELETE",
      }),

    listRules: (params?: { platform?: PlatformType; active_only?: boolean }) =>
      request<TriggerRule[]>(
        `/api/v1/triggers/rules${buildQueryString(params)}`,
      ),

    getRule: (ruleId: string) =>
      request<TriggerRule>(`/api/v1/triggers/rules/${ruleId}`),

    createRule: (payload: {
      name: string;
      platform: PlatformType;
      account_id: string;
      description?: string;
      watched_handle_id?: string;
      action_type?: TriggerActionType;
      keywords_any: string[];
      keywords_all?: string[];
      keywords_exclude?: string[];
      response_template?: string;
      cooldown_minutes?: number;
      is_active?: boolean;
      extra_metadata?: Record<string, unknown>;
    }) =>
      request<TriggerRule>("/api/v1/triggers/rules", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    updateRule: (
      ruleId: string,
      payload: {
        name?: string;
        description?: string;
        account_id?: string;
        watched_handle_id?: string;
        action_type?: TriggerActionType;
        keywords_any?: string[];
        keywords_all?: string[];
        keywords_exclude?: string[];
        response_template?: string;
        cooldown_minutes?: number;
        is_active?: boolean;
        extra_metadata?: Record<string, unknown>;
      },
    ) =>
      request<TriggerRule>(`/api/v1/triggers/rules/${ruleId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),

    deleteRule: (ruleId: string) =>
      request<void>(`/api/v1/triggers/rules/${ruleId}`, { method: "DELETE" }),

    listMatches: (params?: {
      rule_id?: string;
      status?: TriggerMatchStatus;
      limit?: number;
    }) =>
      request<TriggerMatch[]>(
        `/api/v1/triggers/matches${buildQueryString(params)}`,
      ),

    getMatch: (matchId: string) =>
      request<TriggerMatch>(`/api/v1/triggers/matches/${matchId}`),

    reviewMatch: (
      matchId: string,
      payload: {
        status: "approved" | "ignored";
        edited_response?: string;
      },
    ) =>
      request<TriggerMatch>(`/api/v1/triggers/matches/${matchId}/review`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },

  // --------------------------------------------------------------------------
  // Outreach CRM
  // --------------------------------------------------------------------------
  outreach: {
    listLeads: (params?: {
      platform?: PlatformType;
      stage?: LeadStage;
      tier?: LeadTier;
      limit?: number;
      offset?: number;
    }) => request<Lead[]>(`/api/v1/outreach/leads${buildQueryString(params)}`),

    getLead: (leadId: string) =>
      request<Lead>(`/api/v1/outreach/leads/${leadId}`),

    createLead: (payload: {
      platform: PlatformType;
      handle: string;
      display_name?: string;
      bio?: string;
      profile_url?: string;
      email?: string;
      follower_count?: number;
      tier?: LeadTier;
      stage?: LeadStage;
      tags?: string[];
      notes?: string;
      extra_metadata?: Record<string, unknown>;
    }) =>
      request<Lead>("/api/v1/outreach/leads", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    updateLead: (
      leadId: string,
      payload: {
        display_name?: string;
        bio?: string;
        profile_url?: string;
        email?: string;
        follower_count?: number;
        tier?: LeadTier;
        stage?: LeadStage;
        tags?: string[];
        notes?: string;
        extra_metadata?: Record<string, unknown>;
      },
    ) =>
      request<Lead>(`/api/v1/outreach/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),

    deleteLead: (leadId: string) =>
      request<void>(`/api/v1/outreach/leads/${leadId}`, { method: "DELETE" }),

    listCampaigns: (isActive?: boolean) =>
      request<OutreachCampaign[]>(
        `/api/v1/outreach/campaigns${buildQueryString({ is_active: isActive })}`,
      ),

    getCampaign: (campaignId: string) =>
      request<OutreachCampaign>(`/api/v1/outreach/campaigns/${campaignId}`),

    createCampaign: (payload: {
      name: string;
      account_id: string;
      description?: string;
      is_active?: boolean;
      target_criteria?: Record<string, unknown>;
      template?: string;
      extra_metadata?: Record<string, unknown>;
    }) =>
      request<OutreachCampaign>("/api/v1/outreach/campaigns", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    updateCampaign: (
      campaignId: string,
      payload: {
        name?: string;
        account_id?: string;
        description?: string;
        is_active?: boolean;
        target_criteria?: Record<string, unknown>;
        template?: string;
        extra_metadata?: Record<string, unknown>;
      },
    ) =>
      request<OutreachCampaign>(`/api/v1/outreach/campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),

    deleteCampaign: (campaignId: string) =>
      request<void>(`/api/v1/outreach/campaigns/${campaignId}`, {
        method: "DELETE",
      }),

    listMessages: (params?: {
      lead_id?: string;
      campaign_id?: string;
      status?: OutreachMessageStatus;
      limit?: number;
    }) =>
      request<OutreachMessage[]>(
        `/api/v1/outreach/messages${buildQueryString(params)}`,
      ),

    getMessage: (messageId: string) =>
      request<OutreachMessage>(`/api/v1/outreach/messages/${messageId}`),

    stageMessage: (payload: {
      lead_id: string;
      account_id: string;
      content: string;
      outreach_campaign_id?: string;
      channel?: OutreachChannel;
      extra_metadata?: Record<string, unknown>;
    }) =>
      request<OutreachMessage>("/api/v1/outreach/messages/stage", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    reviewMessage: (
      messageId: string,
      payload: {
        status: "approved" | "rejected";
        edited_content?: string;
        rejection_reason?: string;
      },
    ) =>
      request<OutreachMessage>(
        `/api/v1/outreach/messages/${messageId}/review`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),

    deleteMessage: (messageId: string) =>
      request<void>(`/api/v1/outreach/messages/${messageId}`, {
        method: "DELETE",
      }),

    scoutLeads: (payload: {
      account_id: string;
      niche_or_query: string;
      max_leads?: number;
      auto_import?: boolean;
    }) =>
      request<{
        niche: string;
        discovered_count: number;
        imported_count: number;
        leads: Array<Record<string, unknown>>;
      }>("/api/v1/outreach/scout", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    sweepInbox: (accountId: string) =>
      request<{ account: string; platform: string; summary: string }>(
        `/api/v1/outreach/sweep-inbox?account_id=${accountId}`,
        { method: "POST" },
      ),
  },

  // --------------------------------------------------------------------------
  // Audit Trail History
  // --------------------------------------------------------------------------
  history: {
    list: (params?: {
      activity_type?: string;
      severity?: ActivitySeverity;
      entity_type?: string;
      entity_id?: string;
      since?: string;
      until?: string;
      limit?: number;
      offset?: number;
    }) => request<ActivityLog[]>(`/api/v1/history/${buildQueryString(params)}`),

    get: (logId: string) => request<ActivityLog>(`/api/v1/history/${logId}`),

    logActivity: (payload: {
      activity_type: string;
      title: string;
      severity?: ActivitySeverity;
      description?: string;
      entity_type?: string;
      entity_id?: string;
      actor?: string;
      extra_metadata?: Record<string, unknown>;
    }) =>
      request<ActivityLog>("/api/v1/history/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },

  // --------------------------------------------------------------------------
  // AI Copilot & Streaming Execution Engine
  // --------------------------------------------------------------------------
  copilot: {
    listModels: () => request<CopilotModelInfo[]>("/api/v1/copilot/models"),

    listSessions: (includeArchived = false, limit = 50, offset = 0) =>
      request<ChatSession[]>(
        `/api/v1/copilot/sessions${buildQueryString({
          include_archived: includeArchived,
          limit,
          offset,
        })}`,
      ),

    getSession: (sessionId: string) =>
      request<ChatSession>(`/api/v1/copilot/sessions/${sessionId}`),

    createSession: (
      title = "New Marketing Session",
      systemPromptOverride?: string,
    ) =>
      request<ChatSession>("/api/v1/copilot/sessions", {
        method: "POST",
        body: JSON.stringify({
          title,
          system_prompt_override: systemPromptOverride,
        }),
      }),

    updateSession: (
      sessionId: string,
      payload: {
        title?: string;
        is_archived?: boolean;
        system_prompt_override?: string;
      },
    ) =>
      request<ChatSession>(`/api/v1/copilot/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),

    deleteSession: (sessionId: string) =>
      request<void>(`/api/v1/copilot/sessions/${sessionId}`, {
        method: "DELETE",
      }),

    getMessages: (sessionId: string, limit = 100, offset = 0) =>
      request<ChatMessage[]>(
        `/api/v1/copilot/sessions/${sessionId}/messages${buildQueryString({ limit, offset })}`,
      ),

    addMessage: (
      sessionId: string,
      payload: {
        role: ChatRole;
        content: string;
        token_count?: number;
        model_name?: string;
      },
    ) =>
      request<ChatMessage>(`/api/v1/copilot/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    deleteMessagesFrom: (sessionId: string, messageId: string) =>
      request<void>(
        `/api/v1/copilot/sessions/${sessionId}/messages/${messageId}`,
        {
          method: "DELETE",
        },
      ),

    getTools: (sessionId: string) =>
      request<ToolExecutionLog[]>(
        `/api/v1/copilot/sessions/${sessionId}/tools`,
      ),

    chat: (
      sessionId: string,
      content: string,
      modelOverride?: string,
      thinking?: boolean,
    ) =>
      request<ChatMessage>(`/api/v1/copilot/sessions/${sessionId}/chat`, {
        method: "POST",
        body: JSON.stringify({
          content,
          model_override: modelOverride,
          thinking: Boolean(thinking),
        }),
      }),

    streamChat: async (
      sessionId: string,
      content: string,
      onToken: (token: string) => void,
      onTools?: (tools: ToolExecutionLog[]) => void,
      signal?: AbortSignal,
      modelOverride?: string,
      thinking?: boolean,
      onUsage?: (usage: UsageState) => void,
    ): Promise<void> => {
      const response = await fetch(
        `/api/v1/copilot/sessions/${sessionId}/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            model_override: modelOverride,
            thinking: Boolean(thinking),
          }),
          signal,
        },
      );

      if (!response.ok) {
        let errorPayload: any = null;
        try {
          errorPayload = await response.json();
        } catch {
          errorPayload = await response.text();
        }

        const message =
          (errorPayload &&
            typeof errorPayload === "object" &&
            (errorPayload.detail || errorPayload.message)) ||
          `Streaming request failed with status ${response.status}`;
        const errorCode =
          (errorPayload &&
            typeof errorPayload === "object" &&
            errorPayload.error) ||
          `HTTP_${response.status}`;

        throw new ApiError(message, response.status, errorCode);
      }

      if (!response.body) {
        throw new ApiError("No readable stream body returned from server", 500);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const event of events) {
            const trimmed = event.trim();
            if (!trimmed) continue;

            const lines = trimmed.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const rawPayload = line.slice(6).trim();

                if (rawPayload === "[DONE]") {
                  return;
                }

                if (rawPayload.startsWith("[ERROR]: ")) {
                  throw new ApiError(rawPayload.slice(9), 500, "STREAM_ERROR");
                }

                try {
                  const decoded = JSON.parse(rawPayload);

                  if (
                    decoded &&
                    typeof decoded === "object" &&
                    decoded.__event__ === "tools"
                  ) {
                    if (onTools && Array.isArray(decoded.tools)) {
                      onTools(decoded.tools);
                    }
                  } else if (
                    decoded &&
                    typeof decoded === "object" &&
                    decoded.__event__ === "usage"
                  ) {
                    if (onUsage && decoded.usage) {
                      onUsage(decoded.usage as UsageState);
                    }
                  } else if (typeof decoded === "string") {
                    if (decoded.startsWith("[ERROR]: ")) {
                      throw new ApiError(decoded.slice(9), 500, "STREAM_ERROR");
                    }
                    onToken(decoded);
                  }
                } catch (err) {
                  if (err instanceof ApiError) {
                    throw err;
                  }
                  onToken(rawPayload);
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  },

  // --------------------------------------------------------------------------
  // Recipes
  // --------------------------------------------------------------------------
  recipes: {
    list: (params?: { platform?: PlatformType; active_only?: boolean }) =>
      request<ActionRecipe[]>(`/api/v1/recipes/${buildQueryString(params)}`),

    get: (recipeId: string) =>
      request<ActionRecipe>(`/api/v1/recipes/${recipeId}`),

    getDefault: (platform: PlatformType) =>
      request<ActionRecipe | null>(
        `/api/v1/recipes/default${buildQueryString({ platform })}`,
      ),

    create: (payload: {
      name: string;
      platform: PlatformType;
      description?: string;
      steps?: RecipeStep[];
      is_default?: boolean;
      is_active?: boolean;
      extra_metadata?: Record<string, unknown>;
    }) =>
      request<ActionRecipe>("/api/v1/recipes/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    update: (
      recipeId: string,
      payload: {
        name?: string;
        description?: string;
        steps?: RecipeStep[];
        is_default?: boolean;
        is_active?: boolean;
        extra_metadata?: Record<string, unknown>;
      },
    ) =>
      request<ActionRecipe>(`/api/v1/recipes/${recipeId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),

    delete: (recipeId: string) =>
      request<void>(`/api/v1/recipes/${recipeId}`, { method: "DELETE" }),
  },

  // --------------------------------------------------------------------------
  // Data Connectors
  // --------------------------------------------------------------------------
  connectors: {
    list: (params?: {
      connector_type?: ConnectorType;
      active_only?: boolean;
    }) =>
      request<DataConnector[]>(
        `/api/v1/connectors/${buildQueryString(params)}`,
      ),

    get: (connectorId: string) =>
      request<DataConnector>(`/api/v1/connectors/${connectorId}`),

    create: (payload: {
      name: string;
      connector_type: ConnectorType;
      target_identifier: string;
      sync_frequency_minutes?: number;
      api_key?: string;
      access_token?: string;
      refresh_token?: string;
      client_id?: string;
      client_secret?: string;
      extra_metadata?: Record<string, unknown>;
    }) =>
      request<DataConnector>("/api/v1/connectors/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    update: (
      connectorId: string,
      payload: {
        name?: string;
        target_identifier?: string;
        is_active?: boolean;
        status?: ConnectorStatus;
        sync_frequency_minutes?: number;
        api_key?: string;
        access_token?: string;
        refresh_token?: string;
        client_secret?: string;
        extra_metadata?: Record<string, unknown>;
      },
    ) =>
      request<DataConnector>(`/api/v1/connectors/${connectorId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),

    delete: (connectorId: string) =>
      request<void>(`/api/v1/connectors/${connectorId}`, { method: "DELETE" }),

    test: (connectorId: string) =>
      request<{ status: string; verified: boolean }>(
        `/api/v1/connectors/${connectorId}/test`,
        {
          method: "POST",
        },
      ),

    getOpportunities: (
      connectorId: string,
      params?: { min_impressions?: number; limit?: number },
    ) =>
      request<MetricOpportunityItem[]>(
        `/api/v1/connectors/${connectorId}/opportunities${buildQueryString(params)}`,
      ),
  },

  // --------------------------------------------------------------------------
  // Brand Kit
  // --------------------------------------------------------------------------
  brand: {
    getPrimary: () => request<BrandKit>("/api/v1/brand/primary"),

    create: (payload: Partial<BrandKit>) =>
      request<BrandKit>("/api/v1/brand/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    update: (id: string, payload: Partial<BrandKit>) =>
      request<BrandKit>(`/api/v1/brand/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
  },

  // --------------------------------------------------------------------------
  // System Diagnostics
  // --------------------------------------------------------------------------
  system: {
    getDiagnostics: () =>
      request<SystemDiagnosticsResponse>("/api/v1/system/diagnostics"),

    seedRecipes: () =>
      request<SeedRecipesResponse>("/api/v1/system/seed-recipes", {
        method: "POST",
      }),

    syncReplica: () =>
      request<{ status: string; message: string }>(
        "/api/v1/system/sync-replica",
        {
          method: "POST",
        },
      ),

    runWorker: (
      workerName:
        | "post_dispatcher"
        | "dm_dispatcher"
        | "watcher_worker"
        | "quota_reset_worker",
    ) =>
      request<WorkerTriggerResponse>(
        `/api/v1/system/workers/${workerName}/run`,
        {
          method: "POST",
        },
      ),
  },
};
