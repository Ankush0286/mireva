import React, { useState, useEffect } from 'react';
import {
  Home,
  Megaphone,
  Layers,
  Search,
  BarChart2,
  BookOpen,
  Settings,
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
  | 'campaigns'
  | 'social'
  | 'seo'
  | 'analytics'
  | 'brand'
  | 'settings';

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
  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;

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

  const loadSidebarData = async () => {
    setLoading(true);
    try {
      const [realSessions, realAccounts] = await Promise.allSettled([
        api.copilot.listSessions(),
        api.accounts.list(),
      ]);

      if (realSessions.status === 'fulfilled') {
        setSessions(realSessions.value);
      }
      if (realAccounts.status === 'fulfilled' && realAccounts.value.length > 0) {
        setAccount(realAccounts.value[0]);
      }
    } catch (err) {
      console.error('Failed to load sidebar data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSidebarData();
  }, []);

  const navItems: Array<{ id: SidebarTab; label: string; icon: React.ElementType }> = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
    { id: 'social', label: 'Social Content', icon: Layers },
    { id: 'seo', label: 'SEO', icon: Search },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'brand', label: 'Brand Kit', icon: BookOpen },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 bottom-0 z-40 flex flex-col justify-between bg-white border-r border-[#DCE7F5] select-none rounded-none text-[#09122A] overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
        isCollapsed ? 'w-16 shadow-xs' : 'w-60 shadow-[4px_0_20px_-4px_rgba(14,58,117,0.05)]'
      }`}
    >
      {/* ===================================================================== */}
      {/* TOP SECTION: Header & Navigation                                      */}
      {/* ===================================================================== */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Brand Header */}
        <div className="h-14 border-b border-[#F4F8FD] flex items-center px-3 overflow-hidden shrink-0">
          {/* Logo & Brand Name */}
          <div
            className={`flex items-center gap-2 overflow-hidden whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
              isCollapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[140px] opacity-100'
            }`}
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="rotate-12">
                <rect x="3.5" y="4" width="5.5" height="15" rx="2.75" fill="#2563EB" />
                <rect x="13.5" y="4" width="5.5" height="15" rx="2.75" fill="#60A5FA" />
              </svg>
            </div>
            <span className="font-bold text-[15px] tracking-tight text-[#09122A] whitespace-nowrap">
              GrowthCraft
            </span>
          </div>

          {/* Action Icons */}
          <div
            className={`flex items-center transition-all duration-300 ${
              isCollapsed ? 'w-full justify-center' : 'ml-auto gap-0.5'
            }`}
          >
            <button
              type="button"
              onClick={loadSidebarData}
              title="Refresh database"
              className={`rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all duration-200 cursor-pointer overflow-hidden ${
                isCollapsed ? 'w-0 h-0 opacity-0 pointer-events-none p-0' : 'w-7 h-7 opacity-100'
              }`}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={handleToggleCollapse}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all duration-200 cursor-pointer rounded-xl ${
                isCollapsed ? 'w-10 h-10' : 'w-7 h-7'
              }`}
            >
              {isCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        </div>

        {/* New Chat Primary Tab */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <button
            type="button"
            onClick={onNewChat}
            title="New Chat"
            className="w-full flex items-center h-10 rounded-xl bg-[#EBF3FC] hover:bg-[#DDEBFA] text-[#0E3A75] border border-[#D0E2F7] shadow-2xs transition-colors cursor-pointer overflow-hidden active:scale-95"
          >
            <div className="w-10 h-10 shrink-0 flex items-center justify-center">
              <Plus size={18} strokeWidth={2.4} />
            </div>

            <div
              className={`flex items-center justify-between flex-1 overflow-hidden whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] pr-3 ${
                isCollapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[150px] opacity-100'
              }`}
            >
              <span className="text-[12.5px] font-semibold whitespace-nowrap">New Chat</span>
              <span className="text-[9.5px] uppercase font-bold text-blue-700 bg-white px-1.5 py-0.2 rounded-full ml-2 shrink-0">
                AI
              </span>
            </div>
          </button>
        </div>

        {/* Primary Navigation Tabs */}
        <div className="px-3 py-1 space-y-1 shrink-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center h-10 rounded-xl transition-colors duration-150 cursor-pointer overflow-hidden ${
                  isActive
                    ? 'bg-[#EBF3FC] text-[#0E3A75] shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-[#09122A] hover:bg-slate-50 font-semibold'
                }`}
              >
                <div className="w-10 h-10 shrink-0 flex items-center justify-center">
                  <Icon
                    size={17}
                    strokeWidth={isActive ? 2.3 : 1.9}
                    className={isActive ? 'text-[#0E3A75]' : 'text-slate-500'}
                  />
                </div>
                <span
                  className={`text-[12.5px] whitespace-nowrap overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                    isCollapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[140px] opacity-100 ml-1'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mx-4 my-1.5 border-b border-[#F0F5FA] shrink-0" />

        {/* Settings Tab */}
        <div className="px-3 shrink-0">
          <button
            type="button"
            onClick={() => onSelectTab('settings')}
            title={isCollapsed ? 'Settings' : undefined}
            className={`w-full flex items-center h-10 rounded-xl transition-colors duration-150 cursor-pointer overflow-hidden ${
              activeTab === 'settings'
                ? 'bg-[#EBF3FC] text-[#0E3A75] shadow-2xs'
                : 'text-slate-600 hover:text-[#09122A] hover:bg-slate-50'
            }`}
          >
            <div className="w-10 h-10 shrink-0 flex items-center justify-center">
              <Settings size={17} strokeWidth={1.9} className="text-slate-500" />
            </div>
            <span
              className={`text-[12.5px] font-semibold whitespace-nowrap overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                isCollapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[140px] opacity-100 ml-1'
              }`}
            >
              Settings
            </span>
          </button>
        </div>

        {/* ===================================================================== */}
        {/* CHATS SECTION                                                         */}
        {/* ===================================================================== */}
        <div
          className={`flex-1 overflow-y-auto px-3 pt-2 pb-1 scrollbar-none transition-all duration-300 overflow-hidden ${
            isCollapsed ? 'opacity-0 pointer-events-none max-w-0' : 'opacity-100'
          }`}
        >
          <div className="flex items-center justify-between px-2 mb-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
            <span>Chats</span>
            <button
              type="button"
              onClick={onNewChat}
              title="Start New Chat"
              className="flex items-center gap-1 hover:text-[#09122A] text-slate-500 cursor-pointer transition-colors"
            >
              <Plus size={13} />
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="px-2 py-2 text-[11.5px] text-slate-400 font-normal rounded-lg bg-slate-50/50 whitespace-nowrap">
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
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[11.5px] transition-all cursor-pointer truncate whitespace-nowrap ${
                      isSelected
                        ? 'bg-[#EBF3FC] text-[#0E3A75] font-semibold shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-[#09122A]'
                    }`}
                  >
                    <MessageSquare size={12} className="text-slate-400 shrink-0" />
                    <span className="truncate whitespace-nowrap">{sess.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BOTTOM SECTION: Grass & User Profile                                  */}
      {/* ===================================================================== */}
      <div className="relative w-full shrink-0 overflow-hidden">
        <div className="relative h-44 w-full overflow-hidden">
          {/* Grass illustration anchored to bottom-left */}
          <img
            src="/sidebar-grass.png"
            alt="Meadow grass"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
            className="absolute bottom-0 left-0 w-60 min-w-[240px] max-w-none h-44 object-cover object-left-bottom pointer-events-none select-none opacity-100"
            style={{
              imageRendering: 'pixelated',
            }}
          />

          {/* User Profile Card */}
          <div className="absolute bottom-3 inset-x-3 z-10 flex justify-center">
            <div
              className={`flex items-center bg-white border border-[#DCE7F5] rounded-xl shadow-xs transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] overflow-hidden ${
                isCollapsed ? 'w-10 h-10 p-0 justify-center' : 'w-full h-11 px-2.5'
              }`}
            >
              {/* Avatar Slot: centered in 40px square in collapsed mode */}
              <div className="w-10 h-10 flex items-center justify-center shrink-0">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-[#0E3A75] flex items-center justify-center font-bold text-xs shrink-0">
                  {account?.handle ? account.handle.slice(0, 1).toUpperCase() : 'A'}
                </div>
              </div>

              {/* Name & Email: flex-1 left-aligned snug against avatar */}
              <div
                className={`overflow-hidden text-left transition-all duration-300 whitespace-nowrap min-w-0 flex-1 ${
                  isCollapsed ? 'max-w-0 opacity-0 pointer-events-none ml-0' : 'opacity-100 ml-1.5'
                }`}
              >
                <span className="block text-xs font-bold text-[#09122A] truncate leading-tight text-left">
                  {account?.display_name || account?.handle || 'Alex'}
                </span>
                <span className="block text-[10.5px] text-slate-400 truncate text-left mt-0.5">
                  {account?.handle ? `@${account.handle}` : 'alex@example.com'}
                </span>
              </div>

              {/* Chevron Down pushed to the far right with ml-auto */}
              <div
                className={`overflow-hidden transition-all duration-300 shrink-0 ml-auto ${
                  isCollapsed ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-4 opacity-100'
                }`}
              >
                <ChevronDown size={13} className="text-slate-400" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};