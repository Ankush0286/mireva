import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Users2,
  CalendarDays,
  Radio,
  Send,
  History,
  LayoutDashboard,
  ExternalLink,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = (name: string) => {
    setOpenDropdown((prev) => (prev === name ? null : name));
  };

  return (
    <header className="fixed top-0 left-1/2 -translate-x-1/2 z-50 select-none">
      <div
        ref={navRef}
        className="flex items-center gap-7 sm:gap-8 px-7 sm:px-9 py-2.5 rounded-b-[22px] bg-white/90 backdrop-blur-md border-b border-x border-[#E3EDF7] shadow-[0_8px_30px_rgba(14,58,117,0.07)] transition-all duration-200"
      >
        {/* 1. Product ⌵ */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleDropdown('product')}
            className="flex items-center gap-1 text-[14px] font-semibold text-[#091326] hover:text-[#0E3A75] transition-colors cursor-pointer"
          >
            <span>Product</span>
            <ChevronDown
              size={13}
              strokeWidth={2.5}
              className={`text-[#475569] transition-transform duration-200 ${
                openDropdown === 'product' ? 'rotate-180 text-[#0E3A75]' : ''
              }`}
            />
          </button>

          {openDropdown === 'product' && (
            <div className="absolute left-1/2 -translate-x-1/2 top-10 w-52 rounded-2xl bg-white/95 backdrop-blur-xl border border-[#E3EDF7] shadow-xl py-2 z-50 text-left animate-fade-up-1">
              <button
                type="button"
                onClick={() => {
                  navigate('/accounts');
                  setOpenDropdown(null);
                }}
                className="w-full px-4 py-2.5 text-xs font-semibold text-[#091326] hover:bg-[#F2F6FC] flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Users2 size={15} className="text-[#0E3A75]" />
                <div>
                  <span className="block leading-none">Social Accounts</span>
                  <span className="text-[10px] font-normal text-slate-400 mt-0.5 block">Credentials & Vault</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  navigate('/campaigns');
                  setOpenDropdown(null);
                }}
                className="w-full px-4 py-2.5 text-xs font-semibold text-[#091326] hover:bg-[#F2F6FC] flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <CalendarDays size={15} className="text-[#0E3A75]" />
                <div>
                  <span className="block leading-none">Campaigns & Posts</span>
                  <span className="text-[10px] font-normal text-slate-400 mt-0.5 block">Content queue & calendar</span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* 2. Solutions ⌵ */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleDropdown('solutions')}
            className="flex items-center gap-1 text-[14px] font-semibold text-[#091326] hover:text-[#0E3A75] transition-colors cursor-pointer"
          >
            <span>Solutions</span>
            <ChevronDown
              size={13}
              strokeWidth={2.5}
              className={`text-[#475569] transition-transform duration-200 ${
                openDropdown === 'solutions' ? 'rotate-180 text-[#0E3A75]' : ''
              }`}
            />
          </button>

          {openDropdown === 'solutions' && (
            <div className="absolute left-1/2 -translate-x-1/2 top-10 w-52 rounded-2xl bg-white/95 backdrop-blur-xl border border-[#E3EDF7] shadow-xl py-2 z-50 text-left animate-fade-up-1">
              <button
                type="button"
                onClick={() => {
                  navigate('/triggers');
                  setOpenDropdown(null);
                }}
                className="w-full px-4 py-2.5 text-xs font-semibold text-[#091326] hover:bg-[#F2F6FC] flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Radio size={15} className="text-[#0E3A75]" />
                <div>
                  <span className="block leading-none">Competitor Triggers</span>
                  <span className="text-[10px] font-normal text-slate-400 mt-0.5 block">Keyword monitoring & replies</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  navigate('/outreach');
                  setOpenDropdown(null);
                }}
                className="w-full px-4 py-2.5 text-xs font-semibold text-[#091326] hover:bg-[#F2F6FC] flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Send size={15} className="text-[#0E3A75]" />
                <div>
                  <span className="block leading-none">Outreach CRM</span>
                  <span className="text-[10px] font-normal text-slate-400 mt-0.5 block">Influencers & cold DMs</span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* 3. Resources ⌵ */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleDropdown('resources')}
            className="flex items-center gap-1 text-[14px] font-semibold text-[#091326] hover:text-[#0E3A75] transition-colors cursor-pointer"
          >
            <span>Resources</span>
            <ChevronDown
              size={13}
              strokeWidth={2.5}
              className={`text-[#475569] transition-transform duration-200 ${
                openDropdown === 'resources' ? 'rotate-180 text-[#0E3A75]' : ''
              }`}
            />
          </button>

          {openDropdown === 'resources' && (
            <div className="absolute left-1/2 -translate-x-1/2 top-10 w-48 rounded-2xl bg-white/95 backdrop-blur-xl border border-[#E3EDF7] shadow-xl py-2 z-50 text-left animate-fade-up-1">
              <button
                type="button"
                onClick={() => {
                  navigate('/system');
                  setOpenDropdown(null);
                }}
                className="w-full px-4 py-2 text-xs font-semibold text-[#091326] hover:bg-[#F2F6FC] flex items-center gap-2 transition-colors cursor-pointer"
              >
                <History size={14} className="text-[#0E3A75]" />
                <span>Audit Trail Logs</span>
              </button>
              <a
                href="/docs"
                target="_blank"
                rel="noreferrer"
                className="w-full px-4 py-2 text-xs font-semibold text-[#091326] hover:bg-[#F2F6FC] flex items-center justify-between transition-colors cursor-pointer"
              >
                <span>Swagger Docs</span>
                <ExternalLink size={12} className="text-slate-400" />
              </a>
            </div>
          )}
        </div>

        {/* 4. Dashboard */}
        <button
          type="button"
          onClick={() => navigate('/overview')}
          className="flex items-center gap-1.5 text-[14px] font-semibold text-[#091326] hover:text-[#0E3A75] transition-colors cursor-pointer"
        >
          <LayoutDashboard size={14} className="text-[#0E3A75] hidden sm:inline" />
          <span>Dashboard</span>
        </button>
      </div>
    </header>
  );
};