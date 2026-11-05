import React, { useState, useEffect } from 'react';
import {
  Home,
  Users2,
  Database,
  Megaphone,
  Radio,
  Send,
  BookOpen,
  Sliders,
  Cpu,
  Plus,
  MessageSquare,
  ChevronDown,
  RefreshCw,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { api, type ChatSession, type Account } from '../api/client';

export type SidebarTab =
  | 'overview'
  | 'accounts'
  | 'connectors'
  | 'campaigns'
  | 'triggers'
  | 'outreach'
  | 'brand'
  | 'studio'
  | 'system';

interface SidebarProps {
  activeTab: SidebarTab;
  onSelectTab: (tab: SidebarTab) => void;
  selectedSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
  onNewChat?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  selectedSessionId,
  onSelectSession,
  onNewChat,
  isCollapsed: externalCollapsed,
  onToggleCollapse: externalToggle,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [isNavExpanded, setIsNavExpanded] = useState(true);

  const isCollapsed =
    externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;

  const handleToggleCollapse = () => {
    if (externalToggle) {
      externalToggle();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    Promise.allSettled([
      api.copilot.listSessions(),
      api.accounts.list(false),
    ]).then(([realSessions, realAccounts]) => {
      if (!isMounted) return;
      if (realSessions.status === 'fulfilled') {
        setSessions(realSessions.value);
      }
      if (realAccounts.status === 'fulfilled') {
        setAccount(realAccounts.value.length > 0 ? realAccounts.value[0] : null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeTab, selectedSessionId]);

  const handleManualRefresh = () => {
    setLoading(true);
    Promise.allSettled([
      api.copilot.listSessions(),
      api.accounts.list(false),
    ])
      .then(([realSessions, realAccounts]) => {
        if (realSessions.status === 'fulfilled') {
          setSessions(realSessions.value);
        }
        if (realAccounts.status === 'fulfilled') {
          setAccount(realAccounts.value.length > 0 ? realAccounts.value[0] : null);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  const navItems: Array<{
    id: SidebarTab;
    label: string;
    icon: React.ElementType;
  }> = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'accounts', label: 'Accounts', icon: Users2 },
    { id: 'connectors', label: 'Data Sources', icon: Database },
    { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
    { id: 'triggers', label: 'Triggers Radar', icon: Radio },
    { id: 'outreach', label: 'Outreach CRM', icon: Send },
    { id: 'brand', label: 'Brand Kit', icon: BookOpen },
    { id: 'studio', label: 'Workflows', icon: Sliders },
    { id: 'system', label: 'System & Logs', icon: Cpu },
  ];

  const avatarInitial = account?.handle
    ? account.handle.replace(/^@+/, '').slice(0, 1).toUpperCase()
    : 'A';

  return (
    <aside
      className={`fixed left-0 top-0 bottom-0 z-40 flex flex-col justify-between bg-white border-r border-[#DCE7F5] select-none text-[#09122A] overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
        isCollapsed
          ? 'w-16 shadow-xs'
          : 'w-60 shadow-[4px_0_20px_-4px_rgba(14,58,117,0.05)]'
      }`}
    >
      {/* ===================================================================== */}
      {/* 1. TOP SECTION: Header, New Chat & Navigation                         */}
      {/* ===================================================================== */}
      <div className="flex flex-col flex-1 overflow-hidden z-10">
        {/* Brand Header (Smooth interpolation, zero flex snapping) */}
        <div className="h-13 border-b border-[#F4F8FD] flex items-center px-3 overflow-hidden shrink-0">
          <div
            className={`flex items-center gap-2 overflow-hidden whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
              isCollapsed
                ? 'max-w-0 opacity-0 pointer-events-none'
                : 'max-w-[148px] opacity-100'
            }`}
          >
            <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="rotate-12">
                <rect x="3.5" y="4" width="5.5" height="15" rx="2.75" fill="#2563EB" />
                <rect x="13.5" y="4" width="5.5" height="15" rx="2.75" fill="#60A5FA" />
              </svg>
            </div>
            <span className="font-bold text-[14.5px] tracking-tight text-[#09122A]">
              GrowthCraft
            </span>
          </div>

          <div className="flex items-center ml-auto shrink-0">
            <button
              type="button"
              onClick={handleManualRefresh}
              title="Refresh database"
              className={`rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all duration-300 cursor-pointer overflow-hidden ${
                isCollapsed
                  ? 'w-0 h-0 opacity-0 pointer-events-none'
                  : 'w-7 h-7 opacity-100 mr-0.5'
              }`}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin text-[#0E3A75]' : ''} />
            </button>

            <button
              type="button"
              onClick={handleToggleCollapse}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="w-10 h-9 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer rounded-xl shrink-0"
            >
              {isCollapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        </div>

        {/* New Chat Button (Fixed w-10 left icon column) */}
        <div className="px-3 pt-2 pb-1 shrink-0">
          <button
            type="button"
            onClick={onNewChat}
            title="New Chat"
            className="w-full flex items-center h-9 rounded-xl bg-[#EBF3FC] hover:bg-[#DDEBFA] text-[#0E3A75] border border-[#D0E2F7] shadow-2xs transition-colors cursor-pointer overflow-hidden active:scale-95"
          >
            <div className="w-10 h-9 shrink-0 flex items-center justify-center">
              <Plus size={16} strokeWidth={2.5} />
            </div>
            <div
              className={`flex items-center justify-between flex-1 overflow-hidden whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] pr-2.5 ${
                isCollapsed
                  ? 'max-w-0 opacity-0 pointer-events-none'
                  : 'max-w-[150px] opacity-100'
              }`}
            >
              <span className="text-[12px] font-bold">New Chat</span>
              <span className="text-[9px] uppercase font-bold text-blue-700 bg-white px-1.5 py-0.2 rounded-full shrink-0">
                AI
              </span>
            </div>
          </button>
        </div>

        {/* Workspace Section Header (Stays mounted so height never jumps) */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] shrink-0 ${
            isCollapsed ? 'max-h-0 opacity-0' : 'max-h-7 opacity-100'
          }`}
        >
          <button
            type="button"
            onClick={() => setIsNavExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between px-5 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-[#09122A] cursor-pointer whitespace-nowrap"
          >
            <span>Workspace</span>
            <ChevronDown
              size={12}
              className={`transition-transform duration-200 ${isNavExpanded ? '' : '-rotate-90'}`}
            />
          </button>
        </div>

        {/* Navigation Items */}
        <div
          className={`px-3 space-y-0.5 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] shrink-0 ${
            !isNavExpanded && !isCollapsed ? 'max-h-0 opacity-0 py-0' : 'max-h-[340px] opacity-100 py-0.5'
          }`}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center h-8 rounded-xl transition-colors duration-150 cursor-pointer overflow-hidden ${
                  isActive
                    ? 'bg-[#EBF3FC] text-[#0E3A75] font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-[#09122A] hover:bg-slate-50 font-semibold'
                }`}
              >
                <div className="w-10 h-8 shrink-0 flex items-center justify-center">
                  <Icon
                    size={15}
                    strokeWidth={isActive ? 2.4 : 1.9}
                    className={isActive ? 'text-[#0E3A75]' : 'text-slate-500'}
                  />
                </div>
                <span
                  className={`text-[12px] whitespace-nowrap overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                    isCollapsed
                      ? 'max-w-0 opacity-0 pointer-events-none'
                      : 'max-w-[140px] opacity-100 ml-0.5'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mx-4 my-1 border-b border-[#F0F5FA] shrink-0" />

        {/* ===================================================================== */}
        {/* 2. RECENT CHATS SECTION                                               */}
        {/* ===================================================================== */}
        <div
          className={`flex-1 overflow-y-auto px-3 pt-1 pb-2 custom-scrollbar transition-opacity duration-200 ${
            isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <div className="flex items-center justify-between px-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
            <span>Recent Chats ({sessions.length})</span>
            <button
              type="button"
              onClick={onNewChat}
              title="Start New Chat"
              className="hover:text-[#09122A] text-slate-500 cursor-pointer"
            >
              <Plus size={12} />
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-slate-400 rounded-lg bg-slate-50/50 whitespace-nowrap">
              No chats yet.
            </div>
          ) : (
            <div className="space-y-0.5">
              {sessions.map((sess) => {
                const isSelected = selectedSessionId === sess.id;
                return (
                  <button
                    key={sess.id}
                    type="button"
                    onClick={() => onSelectSession && onSelectSession(sess.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[11.5px] transition-all cursor-pointer truncate whitespace-nowrap ${
                      isSelected
                        ? 'bg-[#EBF3FC] text-[#0E3A75] font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-[#09122A]'
                    }`}
                  >
                    <MessageSquare size={11} className="text-slate-400 shrink-0" />
                    <span className="truncate">{sess.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. BOTTOM SECTION: Uncropped Grass Image & Smooth Profile Card        */}
      {/* ===================================================================== */}
      <div className="relative w-full h-36 shrink-0 pointer-events-none">
        {/* Full uncropped grass artwork */}
        <img
          src="/sidebar-grass.png"
          alt="Meadow grass"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
          className="absolute bottom-0 left-0 w-60 min-w-[240px] max-w-none h-auto object-contain object-left-bottom pointer-events-none select-none mix-blend-multiply"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Profile Button (Locked w-10 avatar column for zero-snap collapse) */}
        <div className="absolute bottom-3 inset-x-3 z-10 pointer-events-auto">
          <button
            type="button"
            onClick={() => onSelectTab('accounts')}
            title="Manage Connected Accounts"
            className="w-full h-10 flex items-center bg-white/95 backdrop-blur-xs hover:bg-white border border-[#DCE7F5] rounded-xl shadow-xs transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] overflow-hidden cursor-pointer"
          >
            <div className="w-10 h-10 flex items-center justify-center shrink-0">
              <div className="w-6.5 h-6.5 rounded-full bg-blue-100 text-[#0E3A75] flex items-center justify-center font-bold text-[11px] shrink-0">
                {avatarInitial}
              </div>
            </div>

            <div
              className={`overflow-hidden text-left transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] whitespace-nowrap min-w-0 flex-1 ${
                isCollapsed
                  ? 'max-w-0 opacity-0 pointer-events-none'
                  : 'max-w-[140px] opacity-100 ml-0.5 pr-2'
              }`}
            >
              <span className="block text-[11.5px] font-bold text-[#09122A] truncate leading-tight">
                {account?.display_name || account?.handle || 'Workspace'}
              </span>
              <span className="block text-[10px] text-slate-400 truncate">
                {account?.handle ? `@${account.handle}` : 'Connect account'}
              </span>
            </div>

            <div
              className={`overflow-hidden transition-all duration-300 shrink-0 ${
                isCollapsed
                  ? 'max-w-0 opacity-0 pointer-events-none'
                  : 'max-w-5 opacity-100 pr-2.5'
              }`}
            >
              <ChevronDown size={12} className="text-slate-400" />
            </div>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;