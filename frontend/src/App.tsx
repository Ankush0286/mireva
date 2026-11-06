import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './features/landing/LandingPage';
import { DashboardPage } from './features/dashboard/DashboardPage';

export const App: React.FC = () => {
  return (
    <Routes>
      {/* 1. Root Landing Page */}
      <Route path="/" element={<LandingPage />} />

      {/* 2. Direct Dashboard URLs (Preserved on refresh!) */}
      <Route path="/overview" element={<DashboardPage />} />
      <Route path="/accounts" element={<DashboardPage />} />
      <Route path="/connectors" element={<DashboardPage />} />
      <Route path="/campaigns" element={<DashboardPage />} />
      <Route path="/triggers" element={<DashboardPage />} />
      <Route path="/outreach" element={<DashboardPage />} />
      <Route path="/brand" element={<DashboardPage />} />
      <Route path="/studio" element={<DashboardPage />} />
      <Route path="/system" element={<DashboardPage />} />
      <Route path="/chat" element={<DashboardPage />} />
      <Route path="/chat/:sessionId" element={<DashboardPage />} />

      {/* 3. Aliases & Fallbacks */}
      <Route path="/dashboard" element={<Navigate to="/overview" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;