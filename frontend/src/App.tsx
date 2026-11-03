import React, { useState } from 'react';
import {
  Plus,
  ChevronDown,
  ArrowUp,
  Megaphone,
  Layers,
  Search,
  Check,
} from 'lucide-react';
import { Navbar, type ActiveView } from './components/Navbar';
import { DashboardPage } from './features/dashboard/DashboardPage';

const CATEGORIES = [
  'Marketing',
  'Social Growth',
  'Competitor Spy',
  'Cold Outreach',
  'SEO & Content',
];

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState('Marketing');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const quickPrompts = [
    {
      icon: Megaphone,
      label: 'Launch a campaign',
      promptText: 'Draft a multi-channel product launch campaign for our brand',
    },
    {
      icon: Layers,
      label: 'Create social content',
      promptText: 'Generate 3 high-hook social posts for Twitter and Instagram',
    },
    {
      icon: Search,
      label: 'Improve SEO',
      promptText: 'Audit my target competitor keywords and suggest content gaps',
    },
  ];

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
    }, 800);
  };

  // If user navigated to Dashboard or a management module, show full-screen console
  if (activeView !== 'home') {
    return (
      <DashboardPage
        initialTab={activeView}
        onBackToHome={() => setActiveView('home')}
      />
    );
  }

  // Otherwise, render the pristine Pastoral Scenery Hero Landing
  return (
    <div className="relative min-h-screen flex flex-col justify-center items-center px-4 font-sans select-none overflow-hidden">
      {/* Static Pixel-Crisp Scenery Image Background */}
      <img
        src="/background.png"
        alt="Pastoral Scenery Dither"
        className="fixed inset-0 w-full h-full object-cover pointer-events-none -z-10 select-none"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Clean Hanging Island Navbar */}
      <Navbar activeView={activeView} onSelectView={setActiveView} />

      {/* Main Center Hero Workspace (-translate-y-0.5) */}
      <main className="w-full max-w-[760px] flex flex-col items-center text-center z-10 mx-auto -translate-y-0.5">
        {/* Main Two-Tone Navy Headline */}
        <h1 className="animate-fade-up-1 text-[44px] sm:text-[62px] md:text-[70px] font-bold tracking-[-0.03em] text-[#09122A] leading-[1.06]">
          Let’s grow your brand
          <span className="block font-serif italic font-normal text-[#0D2149] tracking-[-0.01em] mt-0.5">
            with intelligent marketing
          </span>
        </h1>

        {/* Subtitle */}
        <p className="animate-fade-up-2 mt-5 text-[15px] sm:text-[17.5px] text-[#283856] font-normal tracking-[-0.01em]">
          Your AI workspace for marketing that moves ideas forward.
        </p>

        {/* Omnibar Prompt Card */}
        <form
          onSubmit={handleSubmit}
          className="animate-fade-up-3 w-full mt-9 rounded-[24px] bg-white/95 backdrop-blur-md border border-[#DCE8F6] shadow-[0_16px_48px_-12px_rgba(14,58,117,0.14),0_2px_10px_-2px_rgba(14,58,117,0.06)] p-4 sm:p-5 flex flex-col justify-between transition-all duration-300 hover:border-[#C5D9F0] focus-within:border-[#9EC1EA] focus-within:shadow-[0_20px_60px_-12px_rgba(14,58,117,0.20)]"
        >
          {/* Textarea */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="What would you like to achieve today?"
            rows={3}
            className="w-full bg-transparent resize-none border-none outline-none text-[#0F1B33] placeholder-[#6B7A94] text-[16px] sm:text-[18px] font-normal leading-relaxed focus:ring-0 px-1.5 py-0.5 select-text"
          />

          {/* Bottom Action Bar inside Omnibar */}
          <div className="flex items-center justify-between pt-2 mt-1">
            {/* Left Controls */}
            <div className="flex items-center gap-2 relative">
              <button
                type="button"
                className="w-9 h-9 rounded-xl bg-[#F1F4F9] hover:bg-[#E4EBF5] active:scale-95 text-[#0F1B33] flex items-center justify-center transition-all duration-150 cursor-pointer group"
                title="Add attachment"
              >
                <Plus
                  size={18}
                  strokeWidth={2}
                  className="transition-transform duration-200 group-hover:rotate-90"
                />
              </button>

              {/* Category Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#F1F4F9] hover:bg-[#E4EBF5] active:scale-95 text-[13.5px] font-medium text-[#0F1B33] transition-colors cursor-pointer"
                >
                  <span>{category}</span>
                  <ChevronDown
                    size={15}
                    strokeWidth={2}
                    className={`text-[#475569] transition-transform duration-200 ${
                      dropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {dropdownOpen && (
                  <div className="absolute left-0 bottom-11 w-44 rounded-2xl bg-white/95 backdrop-blur-md border border-[#DCE8F6] shadow-xl py-1.5 z-30 text-left animate-fade-up-1">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setCategory(cat);
                          setDropdownOpen(false);
                        }}
                        className="w-full px-3.5 py-2 text-[13px] font-medium text-[#0F1B33] hover:bg-[#F0F6FF] flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span>{cat}</span>
                        {category === cat && (
                          <Check size={14} className="text-[#0E3A75]" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleSubmit()}
                className="h-9 px-4 rounded-xl bg-[#F1F4F9] hover:bg-[#E4EBF5] active:scale-95 text-[13.5px] font-medium text-[#0F1B33] transition-all duration-150 cursor-pointer"
              >
                Create
              </button>

              <button
                type="submit"
                disabled={!prompt.trim() || isSubmitting}
                className={`w-9 h-9 rounded-full bg-[#0E3A75] hover:bg-[#092854] text-white flex items-center justify-center transition-all duration-200 shadow-sm cursor-pointer ${
                  prompt.trim()
                    ? 'scale-105 shadow-md shadow-blue-950/25 hover:scale-110 active:scale-95'
                    : 'opacity-95 hover:scale-105'
                }`}
              >
                <ArrowUp
                  size={17}
                  strokeWidth={2.3}
                  className={`transition-transform duration-200 ${
                    isSubmitting ? '-translate-y-1 animate-bounce' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </form>

        {/* Bottom Suggestion Pills */}
        <div className="animate-fade-up-4 flex flex-wrap items-center justify-center gap-3 mt-6">
          {quickPrompts.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setPrompt(item.promptText)}
              className="group flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#F2F7FD]/90 hover:bg-white border border-[#D5E4F5] hover:border-[#B4CFF0] text-[13.5px] font-medium text-[#0F1B33] transition-all duration-200 shadow-[0_2px_8px_-2px_rgba(14,58,117,0.08)] hover:shadow-[0_6px_16px_-4px_rgba(14,58,117,0.16)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer"
            >
              <item.icon
                size={15}
                strokeWidth={2}
                className="text-[#1E3A5F] group-hover:text-[#0E3A75] group-hover:scale-110 transition-all duration-200"
              />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
};

export default App;