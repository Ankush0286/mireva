// ============================================================================
// Strongly-Typed Domain Models (Mirroring FastAPI Pydantic Schemas)
// ============================================================================

export type PlatformType = 'twitter' | 'instagram' | 'facebook' | 'email';
export type AccountStatus = 'active' | 'needs_reauth' | 'rate_limited' | 'disconnected' | 'suspended';
export type AuthMethod = 'api_keys' | 'browser_session' | 'hybrid';

export interface Account {
  id: string;
  platform: PlatformType;
  handle: string;
  display_name: string | null;
  status: AccountStatus;
  auth_method: AuthMethod;
  is_active: boolean;
  daily_post_limit: number;
  daily_posts_sent: number;
  daily_dm_limit: number;
  daily_dms_sent: number;
  cooldown_until: string | null;
  has_valid_browser_session: boolean;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  target_audience: string | null;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  tags: string[];
  created_at: string;
}

export interface ScheduledPost {
  id: string;
  campaign_id: string;
  account_id: string;
  content: string;
  content_type: 'text' | 'image' | 'video' | 'carousel' | 'thread';
  media_urls: string[];
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
  scheduled_at: string | null;
  published_at: string | null;
  platform_post_url: string | null;
  last_error_message: string | null;
  created_at: string;
}

export interface WatchedHandle {
  id: string;
  platform: PlatformType;
  handle: string;
  display_name: string | null;
  is_active: boolean;
  scrape_frequency_minutes: number;
  last_scraped_at: string | null;
}

export interface TriggerRule {
  id: string;
  name: string;
  platform: PlatformType;
  account_id: string;
  watched_handle_id: string | null;
  action_type: 'auto_reply' | 'stage_draft' | 'notify_only' | 'dispatch_dm';
  keywords_any: string[];
  keywords_all: string[];
  keywords_exclude: string[];
  response_template: string | null;
  cooldown_minutes: number;
  is_active: boolean;
}

export interface TriggerMatch {
  id: string;
  rule_id: string;
  platform_post_id: string;
  platform_post_url: string | null;
  author_handle: string;
  post_content: string;
  matched_keywords: string[];
  status: 'pending_review' | 'approved' | 'dispatched' | 'ignored' | 'failed';
  generated_response: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  platform: PlatformType;
  handle: string;
  display_name: string | null;
  bio: string | null;
  follower_count: number | null;
  tier: 'nano' | 'micro' | 'mid' | 'macro' | 'mega';
  stage: 'discovered' | 'qualified' | 'contacted' | 'replied' | 'converted' | 'unresponsive' | 'do_not_contact';
  tags: string[];
  created_at: string;
}

export interface OutreachMessage {
  id: string;
  lead_id: string;
  account_id: string;
  channel: 'dm' | 'email';
  content: string;
  status: 'draft' | 'staged' | 'approved' | 'rejected' | 'dispatched' | 'failed';
  reviewed_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  activity_type: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  actor: string;
  created_at: string;
}

export interface ChatSession {
  id: string;
  title: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: string;
}

export interface ToolExecutionLog {
  id: string;
  session_id: string;
  tool_name: string;
  input_arguments: Record<string, unknown>;
  status: 'pending' | 'success' | 'error';
  execution_time_ms: number | null;
  created_at: string;
}

// ============================================================================
// Core Fetch Wrapper
// ============================================================================

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || `API Error (${res.status})`);
  }
  return data as T;
}

// ============================================================================
// Unified API Client
// ============================================================================

export const api = {
  // System Health
  health: () => request<{ status: string }>('/health'),

  // 1. Accounts
  accounts: {
    list: (activeOnly = false) =>
      request<Account[]>(`/api/v1/accounts/?active_only=${activeOnly}`),
    create: (payload: {
      platform: PlatformType;
      handle: string;
      display_name?: string;
      daily_post_limit?: number;
      daily_dm_limit?: number;
      access_token?: string;
      api_secret?: string;
    }) =>
      request<Account>('/api/v1/accounts/', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    delete: (id: string) =>
      request<void>(`/api/v1/accounts/${id}`, { method: 'DELETE' }),
  },

  // 2. Campaigns & Posts
  campaigns: {
    list: () => request<Campaign[]>('/api/v1/campaigns/'),
    create: (payload: {
      name: string;
      description?: string;
      target_audience?: string;
      status?: string;
      tags?: string[];
    }) =>
      request<Campaign>('/api/v1/campaigns/', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    listPosts: (campaignId: string) =>
      request<ScheduledPost[]>(`/api/v1/campaigns/${campaignId}/posts`),
    queuePost: (
      campaignId: string,
      payload: {
        account_id: string;
        content: string;
        status?: 'draft' | 'scheduled';
        scheduled_at?: string;
      }
    ) =>
      request<ScheduledPost>(`/api/v1/campaigns/${campaignId}/posts`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    delete: (id: string) =>
      request<void>(`/api/v1/campaigns/${id}`, { method: 'DELETE' }),
  },

  // 3. Triggers
  triggers: {
    listHandles: () => request<WatchedHandle[]>('/api/v1/triggers/handles'),
    addHandle: (payload: {
      platform: PlatformType;
      handle: string;
      display_name?: string;
      scrape_frequency_minutes?: number;
    }) =>
      request<WatchedHandle>('/api/v1/triggers/handles', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    deleteHandle: (id: string) =>
      request<void>(`/api/v1/triggers/handles/${id}`, { method: 'DELETE' }),
    listRules: () => request<TriggerRule[]>('/api/v1/triggers/rules'),
    createRule: (payload: {
      name: string;
      platform: PlatformType;
      account_id: string;
      keywords_any: string[];
      response_template?: string;
    }) =>
      request<TriggerRule>('/api/v1/triggers/rules', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    listMatches: () => request<TriggerMatch[]>('/api/v1/triggers/matches'),
    reviewMatch: (
      matchId: string,
      payload: { status: 'approved' | 'ignored'; edited_response?: string }
    ) =>
      request<TriggerMatch>(`/api/v1/triggers/matches/${matchId}/review`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  // 4. Outreach CRM
  outreach: {
    listLeads: () => request<Lead[]>('/api/v1/outreach/leads'),
    createLead: (payload: {
      platform: PlatformType;
      handle: string;
      display_name?: string;
      bio?: string;
      follower_count?: number;
      tier?: string;
      tags?: string[];
    }) =>
      request<Lead>('/api/v1/outreach/leads', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    deleteLead: (id: string) =>
      request<void>(`/api/v1/outreach/leads/${id}`, { method: 'DELETE' }),
    listMessages: () => request<OutreachMessage[]>('/api/v1/outreach/messages'),
    stageMessage: (payload: {
      lead_id: string;
      account_id: string;
      content: string;
    }) =>
      request<OutreachMessage>('/api/v1/outreach/messages/stage', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    reviewMessage: (
      messageId: string,
      payload: { status: 'approved' | 'rejected'; edited_content?: string }
    ) =>
      request<OutreachMessage>(`/api/v1/outreach/messages/${messageId}/review`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  // 5. History Audit Trail
  history: {
    list: (severity?: string) =>
      request<ActivityLog[]>(
        `/api/v1/history/${severity ? `?severity=${severity}` : ''}`
      ),
  },

  // 6. Copilot & Streaming Agent
  copilot: {
    listSessions: () => request<ChatSession[]>('/api/v1/copilot/sessions'),
    createSession: (title = 'New Growth Session') =>
      request<ChatSession>('/api/v1/copilot/sessions', {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),
    getMessages: (sessionId: string) =>
      request<ChatMessage[]>(`/api/v1/copilot/sessions/${sessionId}/messages`),
    getTools: (sessionId: string) =>
      request<ToolExecutionLog[]>(`/api/v1/copilot/sessions/${sessionId}/tools`),
    chat: (sessionId: string, content: string) =>
      request<ChatMessage>(`/api/v1/copilot/sessions/${sessionId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
    streamChat: async (
      sessionId: string,
      content: string,
      onToken: (token: string) => void
    ): Promise<void> => {
      const res = await fetch(`/api/v1/copilot/sessions/${sessionId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Streaming failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6);
            if (payload === '[DONE]') return;
            onToken(payload);
          }
        }
      }
    },
  },
};