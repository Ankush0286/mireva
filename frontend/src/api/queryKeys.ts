import type {
  PlatformType,
  CampaignStatus,
  PostStatus,
  LeadStage,
  LeadTier,
  OutreachMessageStatus,
  TriggerMatchStatus,
  ConnectorType,
} from "./client";

export const queryKeys = {
  accounts: {
    all: ["accounts"] as const,
    list: (activeOnly?: boolean) =>
      ["accounts", "list", { activeOnly }] as const,
    detail: (id: string) => ["accounts", "detail", id] as const,
  },
  campaigns: {
    all: ["campaigns"] as const,
    list: (status?: CampaignStatus) =>
      ["campaigns", "list", { status }] as const,
    detail: (id: string) => ["campaigns", "detail", id] as const,
    posts: (campaignId: string, status?: PostStatus) =>
      ["campaigns", campaignId, "posts", { status }] as const,
  },
  triggers: {
    all: ["triggers"] as const,
    handles: (activeOnly?: boolean) =>
      ["triggers", "handles", { activeOnly }] as const,
    rules: (params?: { platform?: PlatformType; active_only?: boolean }) =>
      ["triggers", "rules", params] as const,
    matches: (params?: {
      rule_id?: string;
      status?: TriggerMatchStatus;
      limit?: number;
    }) => ["triggers", "matches", params] as const,
  },
  outreach: {
    all: ["outreach"] as const,
    leads: (params?: {
      platform?: PlatformType;
      stage?: LeadStage;
      tier?: LeadTier;
      limit?: number;
      offset?: number;
    }) => ["outreach", "leads", params] as const,
    campaigns: (isActive?: boolean) =>
      ["outreach", "campaigns", { isActive }] as const,
    messages: (params?: {
      lead_id?: string;
      campaign_id?: string;
      status?: OutreachMessageStatus;
      limit?: number;
    }) => ["outreach", "messages", params] as const,
  },
  brand: {
    primary: ["brand", "primary"] as const,
  },
  recipes: {
    all: ["recipes"] as const,
    list: (params?: { platform?: PlatformType; active_only?: boolean }) =>
      ["recipes", "list", params] as const,
  },
  connectors: {
    all: ["connectors"] as const,
    list: (params?: {
      connector_type?: ConnectorType;
      active_only?: boolean;
    }) => ["connectors", "list", params] as const,
    opportunities: (id: string) => ["connectors", id, "opportunities"] as const,
  },
  history: {
    all: ["history"] as const,
    list: (params?: Record<string, unknown>) =>
      ["history", "list", params] as const,
  },
  copilot: {
    sessions: ["copilot", "sessions"] as const,
    messages: (sessionId: string) =>
      ["copilot", sessionId, "messages"] as const,
    tools: (sessionId: string) => ["copilot", sessionId, "tools"] as const,
  },
  strategist: {
    all: ["strategist"] as const,
    state: ["strategist", "state"] as const,
  },
  system: {
    all: ["system"] as const,
    diagnostics: ["system", "diagnostics"] as const,
  },
};
