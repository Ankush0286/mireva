import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus,
  ShieldCheck,
  KeyRound,
  Sliders,
  Trash2,
  RefreshCw,
  Check,
  X,
  Eye,
  AlertCircle,
  Power,
  Send,
  CalendarDays,
  Lock,
  MonitorPlay,
} from 'lucide-react';
import {
  api,
  type Account,
  type PlatformType,
  type AuthMethod,
} from '../../api/client';
import { LoadingState } from '../../components/LoadingState';

// ============================================================================
// Platform Metadata & Authentic Brand Logos
// ============================================================================

const PLATFORMS: Array<{
  id: PlatformType;
  name: string;
  shortName: string;
  badgeBg: string;
  badgeText: string;
  borderHover: string;
  description: string;
}> = [
  {
    id: 'twitter',
    name: 'X (Twitter)',
    shortName: 'X / Twitter',
    badgeBg: 'bg-black',
    badgeText: 'text-white',
    borderHover: 'hover:border-slate-400',
    description: 'Automated threads, keyword interception & cold DMs',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    shortName: 'Instagram',
    badgeBg:
      'bg-[radial-gradient(circle_at_30%_107%,#fdf497_0%,#fdf497_5%,#fd5949_45%,#d6249f_60%,#285AEB_90%)]',
    badgeText: 'text-white',
    borderHover: 'hover:border-pink-300',
    description: 'Visual feed publishing, reels & creator DM outreach',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    shortName: 'Facebook',
    badgeBg: 'bg-[#1877F2]',
    badgeText: 'text-white',
    borderHover: 'hover:border-blue-300',
    description: 'Page publishing & audience group distribution',
  },
  {
    id: 'email',
    name: 'Gmail Outreach',
    shortName: 'Gmail',
    badgeBg: 'bg-white border border-slate-200/80',
    badgeText: 'text-slate-800',
    borderHover: 'hover:border-red-200',
    description: 'Direct newsletter & cold prospect sequences',
  },
];

function PlatformIcon({ platform, size = 16 }: { platform: PlatformType; size?: number }) {
  if (platform === 'twitter') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  if (platform === 'instagram') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    );
  }
  if (platform === 'facebook') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 6.5V18c0 1.1.9 2 2 2h2V9.8l6 4.5 6-4.5V20h2c1.1 0 2-.9 2-2V6.5c0-1.8-2.1-2.8-3.5-1.7L12 10 5.5 4.8C4.1 3.7 2 4.7 2 6.5z" fill="#EA4335" />
      <path d="M2 6.5V18c0 1.1.9 2 2 2h2V9.8L2 6.8V6.5z" fill="#4285F4" />
      <path d="M22 6.5V18c0 1.1-.9 2-2 2h-2V9.8l4-3V6.5z" fill="#34A853" />
      <path d="M18 9.8V4.8c1.4-1.1 3.5-.1 3.5 1.7v.3L18 9.8z" fill="#FBBC05" />
      <path d="M6 9.8V4.8C4.6 3.7 2.5 4.7 2.5 6.5v.3L6 9.8z" fill="#C5221F" />
    </svg>
  );
}

// ============================================================================
// Main AccountsPage Component
// ============================================================================

export const AccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connect / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [platform, setPlatform] = useState<PlatformType>('twitter');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('hybrid');
  const [dailyPostLimit, setDailyPostLimit] = useState(10);
  const [dailyDmLimit, setDailyDmLimit] = useState(15);

  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [showSecrets, setShowSecrets] = useState(false);

  // Live Auth Studio State
  const [authStudioAccount, setAuthStudioAccount] = useState<Account | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  const [studioStatus, setStudioStatus] = useState('Initializing Chromium session...');
  const [currentUrl, setCurrentUrl] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // User-triggered account reload (refresh button, after closing auth studio)
  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.accounts.list(false);
      setAccounts(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load connected accounts.');
    } finally {
      setLoading(false);
    }
  };
  
  // Initial load on mount (no synchronous setState calls in effect body)
  useEffect(() => {
    let isMounted = true;
    api.accounts
      .list(false)
      .then((data) => {
        if (isMounted) {
          setAccounts(data);
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setError(err?.message || 'Failed to load connected accounts.');
          setLoading(false);
        }
      });
  
    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const activeCount = accounts.filter((a) => a.is_active && a.status === 'active').length;
    const postsSent = accounts.reduce((acc, a) => acc + a.daily_posts_sent, 0);
    const postsLimit = accounts.reduce((acc, a) => acc + a.daily_post_limit, 0);
    const dmsSent = accounts.reduce((acc, a) => acc + a.daily_dms_sent, 0);
    const dmsLimit = accounts.reduce((acc, a) => acc + a.daily_dm_limit, 0);

    return { total: accounts.length, activeCount, postsSent, postsLimit, dmsSent, dmsLimit };
  }, [accounts]);

  const openCreateModal = (defaultPlatform: PlatformType = 'twitter') => {
    setEditingAccount(null);
    setPlatform(defaultPlatform);
    setHandle('');
    setDisplayName('');
    setAuthMethod('hybrid');
    setDailyPostLimit(10);
    setDailyDmLimit(15);
    setApiKey('');
    setApiSecret('');
    setAccessToken('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (acc: Account) => {
    setEditingAccount(acc);
    setPlatform(acc.platform);
    setHandle(acc.handle);
    setDisplayName(acc.display_name || '');
    setAuthMethod(acc.auth_method);
    setDailyPostLimit(acc.daily_post_limit);
    setDailyDmLimit(acc.daily_dm_limit);
    setApiKey('');
    setApiSecret('');
    setAccessToken('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const sanitizedHandle = handle.replace(/^@+/, '').trim();
    if (!sanitizedHandle) {
      setFormError('Please enter a valid account handle.');
      return;
    }

    setIsSubmitting(true);
    try {
      let savedAccount: Account;
      if (editingAccount) {
        savedAccount = await api.accounts.update(editingAccount.id, {
          display_name: displayName.trim() || undefined,
          daily_post_limit: dailyPostLimit,
          daily_dm_limit: dailyDmLimit,
          ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
          ...(apiSecret.trim() ? { api_secret: apiSecret.trim() } : {}),
          ...(accessToken.trim() ? { access_token: accessToken.trim() } : {}),
        });
        setAccounts((prev) => prev.map((a) => (a.id === savedAccount.id ? savedAccount : a)));
      } else {
        savedAccount = await api.accounts.create({
          platform,
          handle: sanitizedHandle,
          display_name: displayName.trim() || sanitizedHandle,
          auth_method: authMethod,
          daily_post_limit: dailyPostLimit,
          daily_dm_limit: dailyDmLimit,
          api_key: apiKey.trim() || undefined,
          api_secret: apiSecret.trim() || undefined,
          access_token: accessToken.trim() || undefined,
        });
        setAccounts((prev) => [savedAccount, ...prev]);
      }
      setIsModalOpen(false);

      if (!editingAccount && ['browser_session', 'hybrid'].includes(authMethod)) {
        if (window.confirm(`Account saved! Do you want to log into @${savedAccount.handle} now to capture the session cookies?`)) {
          openAuthStudio(savedAccount);
        }
      }
    } catch (err: any) {
      setFormError(err?.message || 'Could not save account. Check handle format.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (acc: Account) => {
    try {
      const updated = await api.accounts.update(acc.id, { is_active: !acc.is_active });
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err: any) {
      alert(err?.message || 'Failed to update account status.');
    }
  };

  const handleDeleteAccount = async (acc: Account) => {
    if (!window.confirm(`Disconnect and remove @${acc.handle} from your vault?`)) return;
    try {
      await api.accounts.delete(acc.id);
      setAccounts((prev) => prev.filter((a) => a.id !== acc.id));
    } catch (err: any) {
      alert(err?.message || 'Failed to disconnect account.');
    }
  };

  // =========================================================================
  // Live Auth Studio Engine (With Clipboard Paste & Keyboard Forwarding)
  // =========================================================================
  const openAuthStudio = (acc: Account) => {
    setAuthStudioAccount(acc);
    setHasReceivedFrame(false);
    setStudioStatus(`Connecting to ${acc.platform}...`);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '127.0.0.1:8000' : window.location.host;
    
    // Dedicated accounts session websocket
    const wsUrl = `${protocol}//${wsHost}/api/v1/accounts/${acc.id}/session/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setIsWsConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'frame' && canvasRef.current) {
          setHasReceivedFrame(true);
          const img = new Image();
          img.onload = () => {
            canvasRef.current?.getContext('2d')?.drawImage(img, 0, 0, 1280, 800);
          };
          img.src = `data:image/jpeg;base64,${msg.data}`;
        } else if (msg.type === 'status') {
          setStudioStatus(msg.message);
        } else if (msg.type === 'navigated') {
          setCurrentUrl(msg.url);
        }
      } catch (err) {
        console.debug('Frame error:', err);
      }
    };

    ws.onerror = () => setStudioStatus('Connection failed. Ensure backend is running.');
    ws.onclose = () => setIsWsConnected(false);
  };

  const closeAuthStudio = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setIsWsConnected(false);
    setAuthStudioAccount(null);
    setTimeout(() => loadAccounts(), 1000);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    canvasRef.current?.focus();
    if (!canvasRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const cw = canvas.width;  // 1280
    const ch = canvas.height; // 800

    const canvasAspect = cw / ch;
    const rectAspect = rect.width / rect.height;

    let renderWidth = rect.width;
    let renderHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (rectAspect > canvasAspect) {
      renderWidth = rect.height * canvasAspect;
      offsetX = (rect.width - renderWidth) / 2;
    } else {
      renderHeight = rect.width / canvasAspect;
      offsetY = (rect.height - renderHeight) / 2;
    }

    const clickX = e.clientX - rect.left - offsetX;
    const clickY = e.clientY - rect.top - offsetY;

    if (clickX < 0 || clickX > renderWidth || clickY < 0 || clickY > renderHeight) return;

    const scaleX = cw / renderWidth;
    const scaleY = ch / renderHeight;
    const targetX = Math.round(clickX * scaleX);
    const targetY = Math.round(clickY * scaleY);

    wsRef.current.send(JSON.stringify({ type: 'click', x: targetX, y: targetY }));
  };

  // Physical Keyboard Listener with Ctrl+V (Paste) and Ctrl+A (Select All)
  const handleCanvasKeyDown = async (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Handle Ctrl+V / Cmd+V (Paste Password/Text)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          wsRef.current.send(JSON.stringify({ type: 'type', text }));
        }
      } catch {
        // Fallback handled by onPaste event
      }
      return;
    }

    // Handle Ctrl+A / Cmd+A (Select All)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      wsRef.current.send(JSON.stringify({ type: 'key', key: 'ControlOrMeta+A' }));
      return;
    }

    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
      e.preventDefault();
    }

    if (['Backspace', 'Delete', 'Enter', 'Tab', 'Escape'].includes(e.key) || e.key.startsWith('Arrow')) {
      wsRef.current.send(JSON.stringify({ type: 'key', key: e.key }));
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      wsRef.current.send(JSON.stringify({ type: 'type', text: e.key }));
    }
  };

  // Clipboard Paste Event Listener
  const handleCanvasPaste = (e: React.ClipboardEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    if (pastedText && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'type', text: pastedText }));
    }
  };

  return (
    <div className="relative h-full overflow-y-auto px-3 sm:px-6 py-4 custom-scrollbar max-w-5xl mx-auto w-full font-sans select-none text-[#09122A]">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 border border-[#DCE7F5] text-[11px] font-bold uppercase tracking-wider text-[#0E3A75] mb-2 shadow-2xs">
            <Lock size={11} />
            <span>AES-128 Fernet Credential Vault</span>
          </div>
          <h1 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.025em] text-[#09122A] leading-tight">
            Connected Accounts{' '}
            <span className="relative inline-block font-serif italic font-normal text-[#0D2149]">
              & safety quotas
              <svg className="absolute -bottom-1.5 left-0 w-full h-3 text-amber-400 pointer-events-none" viewBox="0 0 160 14" fill="none">
                <path d="M3 10C45 4 115 3 157 8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="text-[13.5px] text-[#475569] mt-1">
            Link your social profiles, authenticate sessions, and enforce anti-ban daily rate limits.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button onClick={loadAccounts} title="Refresh accounts" className="w-9 h-9 rounded-xl bg-white border border-[#DCE7F5] hover:bg-slate-50 text-slate-600 flex items-center justify-center shadow-2xs cursor-pointer">
            <RefreshCw size={14} className={loading ? 'animate-spin text-[#0E3A75]' : ''} />
          </button>
          <button onClick={() => openCreateModal('twitter')} className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-md transition-all hover:scale-[1.01] active:scale-95 cursor-pointer">
            <Plus size={15} strokeWidth={2.5} />
            <span>Connect Account</span>
          </button>
        </div>
      </div>

      {/* 2. Top KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
        <div className="rounded-[22px] bg-white/95 border border-[#DCE7F5] p-4.5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Active Profiles</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10.5px] font-bold">{stats.activeCount} / {stats.total} Online</span>
          </div>
          <div className="text-2xl font-bold text-[#09122A]">{stats.total} Connected</div>
          <span className="text-[11.5px] text-slate-400 block mt-1">Encrypted in local libSQL replica</span>
        </div>

        <div className="rounded-[22px] bg-white/95 border border-[#DCE7F5] p-4.5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Daily Post Quota</span>
            <CalendarDays size={14} className="text-[#0E3A75]" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-[#09122A]">{stats.postsSent}</span>
            <span className="text-xs text-slate-400 font-medium">/ {stats.postsLimit || 0} dispatched</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2.5 overflow-hidden">
            <div className="h-full bg-[#0E3A75] rounded-full transition-all" style={{ width: `${Math.min(100, (stats.postsSent / Math.max(1, stats.postsLimit)) * 100)}%` }} />
          </div>
        </div>

        <div className="rounded-[22px] bg-white/95 border border-[#DCE7F5] p-4.5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Cold DM Safe Cap</span>
            <Send size={14} className="text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-[#09122A]">{stats.dmsSent}</span>
            <span className="text-xs text-slate-400 font-medium">/ {stats.dmsLimit || 0} sent today</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2.5 overflow-hidden">
            <div className="h-full bg-emerald-600 rounded-full transition-all" style={{ width: `${Math.min(100, (stats.dmsSent / Math.max(1, stats.dmsLimit)) * 100)}%` }} />
          </div>
        </div>
      </div>

      {/* 3. Account Cards List */}
      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle size={15} /><span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center"><LoadingState label="Decrypting account metadata" variant="Orbit" /></div>
      ) : accounts.length === 0 ? (
        <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center mx-auto mb-3 shadow-2xs"><ShieldCheck size={24} /></div>
          <h2 className="text-lg font-bold text-[#09122A]">No social accounts connected yet</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-6 leading-relaxed">
            Connect your first profile so the AI Copilot can audit your health, schedule campaigns, and monitor competitors.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 max-w-4xl mx-auto">
            {PLATFORMS.map((p) => (
              <button key={p.id} onClick={() => openCreateModal(p.id)} className="p-4 rounded-2xl bg-[#F8FAFD] hover:bg-white border border-[#DCE7F5] transition-all cursor-pointer group text-left hover:shadow-md hover:-translate-y-0.5">
                <div className="flex items-center justify-between mb-2.5">
                  <div className={`w-9 h-9 rounded-xl ${p.badgeBg} ${p.badgeText} flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform`}>
                    <PlatformIcon platform={p.id} size={17} />
                  </div>
                  <span className="text-[11px] font-bold text-[#0E3A75] group-hover:underline">+ Connect</span>
                </div>
                <span className="font-bold text-xs text-[#09122A] block">{p.name}</span>
                <span className="text-[11px] text-slate-400 block mt-0.5 leading-snug">{p.description}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4.5 pb-6">
          {accounts.map((acc) => {
            const pMeta = PLATFORMS.find((p) => p.id === acc.platform) || PLATFORMS[0];
            const isOnline = acc.is_active && acc.status === 'active';

            return (
              <div key={acc.id} className={`rounded-[22px] bg-white/95 border transition-all p-5 shadow-sm flex flex-col justify-between ${acc.is_active ? 'border-[#DCE7F5]' : 'border-slate-200 opacity-75'}`}>
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-11 h-11 rounded-2xl ${pMeta.badgeBg} ${pMeta.badgeText} flex items-center justify-center shrink-0 shadow-xs`}>
                        <PlatformIcon platform={acc.platform} size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-[15px] text-[#09122A] truncate">@{acc.handle}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' : acc.status === 'rate_limited' ? 'bg-amber-50 text-amber-700 border-amber-200/60' : 'bg-slate-100 text-slate-600'}`}>
                            {acc.is_active ? acc.status.replace('_', ' ') : 'paused'}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 block truncate mt-0.5">
                          {acc.display_name || pMeta.name} • <span className="font-mono text-[11px] text-[#0E3A75]">{acc.auth_method.replace('_', ' ')}</span>
                        </span>
                      </div>
                    </div>
                    <button onClick={() => handleToggleActive(acc)} title={acc.is_active ? 'Pause account automation' : 'Resume automation'} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 border cursor-pointer ${acc.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200 hover:text-slate-700'}`}>
                      <Power size={14} strokeWidth={2.4} />
                    </button>
                  </div>

                  <div className="space-y-3 bg-[#F8FAFD] rounded-2xl p-3.5 border border-[#EBF2FA]">
                    <div>
                      <div className="flex justify-between text-[11.5px] mb-1">
                        <span className="font-semibold text-slate-600">Daily Posts Sent</span>
                        <span className="font-mono font-bold text-[#09122A]">{acc.daily_posts_sent} / {acc.daily_post_limit}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
                        <div className="h-full bg-[#0E3A75] rounded-full transition-all" style={{ width: `${Math.min(100, (acc.daily_posts_sent / Math.max(1, acc.daily_post_limit)) * 100)}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11.5px] mb-1">
                        <span className="font-semibold text-slate-600">Daily Cold DMs Sent</span>
                        <span className="font-mono font-bold text-[#09122A]">{acc.daily_dms_sent} / {acc.daily_dm_limit}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-600 rounded-full transition-all" style={{ width: `${Math.min(100, (acc.daily_dms_sent / Math.max(1, acc.daily_dm_limit)) * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#F0F5FA]">
                  {/* Sync Session Button with Live Auth Studio */}
                  {['browser_session', 'hybrid'].includes(acc.auth_method) ? (
                    <button
                      type="button"
                      onClick={() => openAuthStudio(acc)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold transition-colors shadow-2xs cursor-pointer"
                    >
                      <MonitorPlay size={13} />
                      <span>{acc.has_valid_browser_session ? 'Sync Session' : 'Login Required'}</span>
                    </button>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                      <ShieldCheck size={13} className="text-emerald-600" />
                      <span>API Encrypted</span>
                    </span>
                  )}

                  <div className="flex items-center gap-1.5">
                    <button onClick={() => openEditModal(acc)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F1F4F9] hover:bg-[#E4EBF5] text-xs font-semibold text-[#09122A] transition-colors cursor-pointer">
                      <Sliders size={12} /><span>Configure</span>
                    </button>
                    <button onClick={() => handleDeleteAccount(acc)} title="Disconnect account" className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors cursor-pointer">
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
      {/* 4. AUTH STUDIO: LIGHT THEME BROWSER (NO RIPPLE, DIRECT PASTE SUPPORT) */}
      {/* ===================================================================== */}
      {authStudioAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1">
          <div className="w-full max-w-6xl h-[90vh] rounded-[24px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col overflow-hidden text-[#09122A]">

            {/* Premium Browser Header - Light Theme */}
            <div className="px-4 py-3 bg-[#F8FBFF] border-b border-[#F0F5FA] flex items-center justify-between shrink-0 select-none">
              
              {/* Left: Window Controls & Title */}
              <div className="flex items-center gap-3 w-1/4">
                <button
                  type="button"
                  onClick={closeAuthStudio}
                  className="group flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition-colors cursor-pointer"
                  title="Close without saving"
                >
                  <X size={15} className="group-hover:scale-110 transition-transform" />
                </button>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-[#09122A] tracking-wide">
                    @{authStudioAccount.handle}
                  </span>
                  <span className={`text-[9.5px] font-semibold uppercase tracking-wider flex items-center gap-1.5 mt-0.5 ${isWsConnected ? 'text-[#0E3A75]' : 'text-slate-400'}`}>
                    {isWsConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    {isWsConnected ? 'Secure Connection' : 'Connecting...'}
                  </span>
                </div>
              </div>

              {/* Center: URL Bar */}
              <div className="hidden md:flex flex-1 max-w-lg items-center gap-2.5 px-4 py-2 rounded-xl bg-white border border-[#DCE7F5] text-xs font-mono text-slate-500 shadow-2xs">
                <Lock size={12} className="text-emerald-600 shrink-0" />
                <span className="truncate opacity-80 select-all">
                  {currentUrl || `https://www.${authStudioAccount.platform}.com/`}
                </span>
              </div>

              {/* Right: Save & Exit Actions */}
              <div className="flex items-center justify-end w-1/4 gap-2">
                <button
                  type="button"
                  onClick={closeAuthStudio}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Exit
                </button>
                <button
                  type="button"
                  onClick={closeAuthStudio}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-bold shadow-md transition-all cursor-pointer transform active:scale-95 shrink-0"
                  title="Saves authenticated cookies to vault"
                >
                  <Check size={14} strokeWidth={3} />
                  <span>Save Session</span>
                </button>
              </div>
            </div>

            {/* Viewport Canvas (Ripple Removed, Paste Enabled) */}
            <div className="flex-1 bg-slate-100 flex flex-col items-center justify-center relative overflow-hidden p-2">
              {!hasReceivedFrame && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 bg-slate-50 text-[#09122A]">
                  <LoadingState label={studioStatus} variant="Orbit" />
                  <span className="text-xs text-slate-500 font-mono">Provisioning isolated container...</span>
                </div>
              )}

              <div className="relative w-full h-full max-w-full max-h-full flex items-center justify-center shadow-sm">
                <canvas
                  ref={canvasRef}
                  tabIndex={0}
                  width={1280}
                  height={800}
                  onClick={handleCanvasClick}
                  onKeyDown={handleCanvasKeyDown}
                  onPaste={handleCanvasPaste}
                  className={`max-w-full max-h-full object-contain cursor-crosshair outline-none transition-opacity duration-500 bg-white ${hasReceivedFrame ? 'opacity-100' : 'opacity-0'}`}
                />
              </div>

              {/* Floating Glassmorphic Footer Pill */}
              <div className="absolute bottom-6 inset-x-0 flex justify-center pointer-events-none z-20">
                <div className="px-6 py-3 rounded-full bg-white/95 backdrop-blur-md border border-[#DCE7F5] shadow-[0_10px_40px_rgba(14,58,117,0.1)] flex items-center gap-3">
                  <ShieldCheck size={18} className="text-emerald-600" />
                  <span className="text-[#09122A] text-xs font-medium tracking-wide">
                    Log in normally to capture cookies. Paste with <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px]">Ctrl+V</kbd>. Click <b className="text-[#0E3A75]">Save Session</b> when done.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Create / Edit Account Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm animate-fade-up-1" onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
          <div className="w-full max-w-[520px] rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#F0F5FA] bg-[#F8FBFF] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#EBF3FC] border border-[#D0E2F7] text-[#0E3A75] flex items-center justify-center">
                  <KeyRound size={17} strokeWidth={2.2} />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-[#09122A]">
                    {editingAccount ? `Configure @${editingAccount.handle}` : 'Connect Social Account'}
                  </h3>
                  <span className="text-[11.5px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <ShieldCheck size={12} className="text-emerald-600 shrink-0" />
                    <span>Encrypted via AES-128 Fernet before disk storage</span>
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 flex items-center justify-center cursor-pointer">
                <X size={15} strokeWidth={2.2} />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4.5 custom-scrollbar">
                {formError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" /><span>{formError}</span>
                  </div>
                )}

                {!editingAccount && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Select Platform</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {PLATFORMS.map((p) => {
                        const selected = platform === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setPlatform(p.id)}
                            className={`flex flex-col items-center justify-center py-3 px-2 rounded-2xl border text-xs transition-all cursor-pointer ${selected ? 'bg-[#F4F9FF] border-[#0E3A75] text-[#09122A] ring-2 ring-[#0E3A75]/10 font-bold' : 'bg-white border-[#E2ECF7] text-slate-600 hover:bg-[#F8FAFD]'}`}
                          >
                            <div className={`w-8 h-8 rounded-xl ${p.badgeBg} ${p.badgeText} flex items-center justify-center shadow-2xs mb-1.5`}><PlatformIcon platform={p.id} size={15} /></div>
                            <span className="text-[11.5px] tracking-tight">{p.shortName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-[#09122A] mb-1.5">Account Handle <span className="text-rose-500">*</span></label>
                    <div className="flex items-center h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] focus-within:border-[#0E3A75] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#0E3A75]/10">
                      <span className="text-slate-400 text-xs font-mono font-semibold mr-1">@</span>
                      <input type="text" required disabled={Boolean(editingAccount)} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="growth_hacker" className="w-full bg-transparent text-xs font-medium text-[#09122A] outline-none disabled:text-slate-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#09122A] mb-1.5">Display Name</label>
                    <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. GrowthCraft Official" className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium focus:border-[#0E3A75] focus:bg-white outline-none" />
                  </div>
                </div>

                {!editingAccount && (
                  <div>
                    <label className="block text-xs font-bold text-[#09122A] mb-1.5">Automation Mode</label>
                    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#F1F5F9] border border-[#E2ECF7]">
                      {[{ id: 'hybrid', label: 'Hybrid' }, { id: 'browser_session', label: 'Browser' }, { id: 'api_keys', label: 'API Keys' }].map((m) => (
                        <button key={m.id} type="button" onClick={() => setAuthMethod(m.id as AuthMethod)} className={`py-1.5 px-2 rounded-lg text-[11.5px] transition-all cursor-pointer truncate ${authMethod === m.id ? 'bg-white text-[#09122A] font-bold shadow-xs' : 'text-slate-500 hover:text-[#09122A]'}`}>{m.label}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Anti-Ban Daily Safety Quotas</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-[#09122A] flex items-center gap-1.5"><CalendarDays size={13} className="text-[#0E3A75]" /><span>Post Limit</span></span>
                        <span className="px-2 py-0.5 rounded-lg bg-white border border-[#DCE7F5] font-mono text-[11px] font-bold text-[#0E3A75]">{dailyPostLimit} / day</span>
                      </div>
                      <input type="range" min={1} max={50} value={dailyPostLimit} onChange={(e) => setDailyPostLimit(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg accent-[#0E3A75] cursor-pointer" />
                    </div>
                    <div className="p-3.5 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-[#09122A] flex items-center gap-1.5"><Send size={13} className="text-emerald-600" /><span>Cold DM Cap</span></span>
                        <span className="px-2 py-0.5 rounded-lg bg-white border border-[#DCE7F5] font-mono text-[11px] font-bold text-emerald-700">{dailyDmLimit} / day</span>
                      </div>
                      <input type="range" min={0} max={50} value={dailyDmLimit} onChange={(e) => setDailyDmLimit(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg accent-emerald-600 cursor-pointer" />
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#09122A] flex items-center gap-1.5"><Lock size={13} className="text-[#0E3A75]" /><span>{editingAccount ? 'Rotate Vault Credentials' : 'Encrypted Credential Vault'}</span><span className="text-[10.5px] font-normal text-slate-400">(Optional)</span></span>
                    <button type="button" onClick={() => setShowSecrets((prev) => !prev)} className="px-2 py-0.5 rounded-md bg-white border border-[#DCE7F5] text-[11px] font-semibold text-slate-600 hover:text-[#0E3A75] flex items-center gap-1 cursor-pointer"><Eye size={11} /><span>{showSecrets ? 'Hide' : 'Show'}</span></button>
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Account Password / API Secret (For Stealth Login)</label>
                      <input type={showSecrets ? 'text' : 'password'} value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder={editingAccount ? 'Leave blank to keep existing' : 'Enter password...'} className="w-full h-9 px-3 rounded-xl bg-white border border-[#DCE7F5] text-xs font-mono focus:border-[#0E3A75] outline-none" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 px-6 py-3.5 border-t border-[#F0F5FA] bg-[#F8FBFF] shrink-0">
                <span className="text-[11px] text-slate-400 font-medium">Zero plaintext tokens exposed</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="h-9 px-4 rounded-xl bg-white border border-[#DCE7F5] hover:bg-slate-50 text-xs font-semibold text-slate-600 cursor-pointer">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="h-9 flex items-center gap-1.5 px-4 rounded-xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-xs cursor-pointer">
                    <Check size={13} strokeWidth={2.5} /><span>{isSubmitting ? 'Saving...' : editingAccount ? 'Save Changes' : 'Connect & Save'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountsPage;