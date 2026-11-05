import React, { useState } from 'react';
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
import { type ActiveView } from '../../components/Navbar';

interface DashboardPageProps {
  initialTab?: ActiveView;
  onBackToHome?: () => void;
}

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

export const DashboardPage: React.FC<DashboardPageProps> = ({ initialTab }) => {
  const [activeTab, setActiveTab] = useState<SidebarTab | null>(() => {
    if (initialTab && VALID_SIDEBAR_TABS.includes(initialTab as SidebarTab)) {
      return initialTab as SidebarTab;
    }
    return 'overview';
  });

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSelectTab = (tab: SidebarTab) => {
    setSelectedSessionId(null);
    setActiveTab(tab);
  };

  const handleNewChat = () => {
    setSelectedSessionId(null);
    setActiveTab(null);
  };

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setActiveTab(null);
  };

  const handleSessionCreated = (newSession: ChatSession) => {
    setSelectedSessionId(newSession.id);
    setActiveTab(null);
    setRefreshTrigger((prev) => prev + 1);
  };

  const renderActiveView = () => {
    if (activeTab === null) {
      return (
        <ChatPage
          sessionId={selectedSessionId}
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
        selectedSessionId={selectedSessionId}
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
          className="absolute inset-0 w-full h-full object-cover object-top pointer-events-none z-0 select-none opacity-100"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Dynamic View Router */}
        <div className="relative h-full flex flex-col z-10">
          {renderActiveView()}
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;