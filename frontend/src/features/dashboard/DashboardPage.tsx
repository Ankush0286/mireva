import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Sidebar, type SidebarTab } from '../../components/Sidebar';
import { OverviewPage } from '../overview/OverviewPage';
import { ChatPage } from '../chat/ChatPage';
import { AccountsPage } from '../accounts/AccountsPage';
import { ConnectorsPage } from '../connectors/ConnectorsPage';
import { CampaignsPage } from '../campaigns/CampaignsPage';
import { TriggersPage } from '../triggers/TriggersPage';
import { OutreachPage } from '../outreach/OutreachPage';
import { BrandKitPage } from '../brand/BrandKitPage';
import { ActionStudioPage } from '../studio/ActionStudioPage';
import { SystemHealthPage } from '../system/SystemHealthPage';
import { type ChatSession } from '../../api/client';

const VALID_SIDEBAR_TABS: SidebarTab[] = [
  'overview',
  'accounts',
  'connectors',
  'campaigns',
  'triggers',
  'outreach',
  'brand',
  'studio',
  'system',
];

export const DashboardPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId?: string }>();

  // Determine active tab directly from URL!
  const currentPath = location.pathname.replace(/^\//, '').split('/')[0];
  const isChatRoute = location.pathname.startsWith('/chat');
  const activeTab: SidebarTab | null = isChatRoute
    ? null
    : VALID_SIDEBAR_TABS.includes(currentPath as SidebarTab)
    ? (currentPath as SidebarTab)
    : 'overview';

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSelectTab = (tab: SidebarTab) => {
    navigate(`/${tab}`);
  };

  const handleNewChat = () => {
    navigate('/chat');
  };

  const handleSelectSession = (id: string) => {
    navigate(`/chat/${id}`);
  };

  const handleSessionCreated = (newSession: ChatSession) => {
    navigate(`/chat/${newSession.id}`, { replace: true });
    setRefreshTrigger((prev) => prev + 1);
  };

  const renderActiveView = () => {
    if (activeTab === null) {
      return (
        <ChatPage
          sessionId={sessionId || null}
          onSessionCreated={handleSessionCreated}
        />
      );
    }

    switch (activeTab) {
      case 'accounts':
        return <AccountsPage />;
      case 'connectors':
        return <ConnectorsPage />;
      case 'campaigns':
        return <CampaignsPage />;
      case 'triggers':
        return <TriggersPage />;
      case 'outreach':
        return <OutreachPage />;
      case 'brand':
        return <BrandKitPage />;
      case 'studio':
        return <ActionStudioPage />;
      case 'system':
        return <SystemHealthPage />;
      case 'overview':
      default:
        return (
          <OverviewPage
            onNavigate={handleSelectTab}
            onOpenCopilot={handleNewChat}
          />
        );
    }
  };

  return (
    <div className="flex h-screen w-screen font-sans text-[#09122A] overflow-hidden relative bg-[#E8F3FD]">
      {/* 1. Fixed Sticky Sidebar */}
      <Sidebar
        key={refreshTrigger}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        selectedSessionId={sessionId || null}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* 2. Main Workspace */}
      <main
        className={`relative flex-1 h-screen overflow-hidden px-8 py-5 transition-[margin] duration-300 ease-[cubic-bezier(0.2,0,0,1)] flex flex-col justify-between ${
          isSidebarCollapsed ? 'ml-16' : 'ml-60'
        }`}
      >
        {/* Dither Sky Background Asset */}
        <img
          src="/chat-bg.png"
          alt="Dither Sky Background"
          className="absolute inset-0 w-full h-full object-cover object-top pointer-events-none select-none opacity-100"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Dynamic View */}
        <div className="relative h-full flex flex-col">
          {renderActiveView()}
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;