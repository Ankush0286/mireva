import React, { useState } from 'react';
import { Sidebar, type SidebarTab } from '../../components/Sidebar';
import { ChatPage } from '../chat/ChatPage';
import { type ChatSession } from '../../api/client';

export const DashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('overview');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleNewChat = () => {
    setSelectedSessionId(null);
  };

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
  };

  const handleSessionCreated = (newSession: ChatSession) => {
    setSelectedSessionId(newSession.id);
    // Triggers sidebar to load the newly created session
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="flex h-screen w-screen font-sans text-[#09122A] overflow-hidden relative bg-[#E8F3FD]">
      {/* 1. Fixed Sticky Sidebar */}
      <Sidebar
        key={refreshTrigger}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        selectedSessionId={selectedSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* 2. Main Workspace: Fixed Viewport */}
      <main
        className={`relative flex-1 h-screen overflow-hidden px-8 py-5 transition-[margin] duration-300 ease-[cubic-bezier(0.2,0,0,1)] flex flex-col justify-between ${
          isSidebarCollapsed ? 'ml-16' : 'ml-60'
        }`}
      >
        <img
          src="/chat-bg.png"
          alt="Dither Sky Background"
          className="absolute inset-0 w-full h-full object-cover object-top pointer-events-none z-0 select-none opacity-100"
          style={{ imageRendering: 'pixelated' }}
        />

        <div className="relative z-10 h-full flex flex-col">
          <ChatPage
            sessionId={selectedSessionId}
            onSessionCreated={handleSessionCreated}
          />
        </div>
      </main>
    </div>
  );
};