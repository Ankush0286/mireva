import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  Megaphone,
  Search,
  Layers,
  Plus,
  ArrowUp,
  Check,
  User,
  Wrench,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { api, type ChatMessage, type ToolExecutionLog, type ChatSession } from '../../api/client';

const CATEGORIES = [
  'Marketing',
  'Social Growth',
  'Competitor Spy',
  'Cold Outreach',
  'SEO & Content',
];

interface ChatPageProps {
  sessionId: string | null;
  onSessionCreated: (newSession: ChatSession) => void;
}

export const ChatPage: React.FC<ChatPageProps> = ({ sessionId, onSessionCreated }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<ToolExecutionLog[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Omnibar Controls
  const [category, setCategory] = useState('Marketing');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to bottom as tokens stream in
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // Load message history whenever a session is selected from the sidebar
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setTools([]);
      return;
    }

    const loadHistory = async () => {
      setLoadingHistory(true);
      try {
        const [historyMessages, toolLogs] = await Promise.all([
          api.copilot.getMessages(sessionId),
          api.copilot.getTools(sessionId),
        ]);
        setMessages(historyMessages);
        setTools(toolLogs);
      } catch (err) {
        console.error('Failed to load chat history:', err);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
  }, [sessionId]);

  // Handle sending a message and streaming tokens back
  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || inputPrompt).trim();
    if (!textToSend || isStreaming) return;

    let targetSessionId = sessionId;
    setInputPrompt('');

    // 1. If this is a fresh conversation, create the session first in SQLite/Turso
    if (!targetSessionId) {
      try {
        const titleSnippet = textToSend.slice(0, 32) || 'New Marketing Session';
        const newSession = await api.copilot.createSession(titleSnippet);
        targetSessionId = newSession.id;
        onSessionCreated(newSession);
      } catch (err) {
        console.error('Failed to create new session in database:', err);
        return;
      }
    }

    // 2. Append User message immediately
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      session_id: targetSessionId,
      role: 'user',
      content: textToSend,
      created_at: new Date().toISOString(),
    };

    // 3. Prepare placeholder Assistant message for incoming streamed chunks
    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      session_id: targetSessionId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    try {
      // 4. Stream tokens from backend SSE endpoint: POST /api/v1/copilot/sessions/{id}/stream
      await api.copilot.streamChat(targetSessionId, textToSend, (token: string) => {
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: updated[lastIndex].content + token,
            };
          }
          return updated;
        });
      });

      // 5. Query any tool logs executed by the ReAct agent during this turn
      const updatedTools = await api.copilot.getTools(targetSessionId);
      setTools(updatedTools);
    } catch (err) {
      console.error('Streaming error:', err);

      // Fallback: Check if synchronous chat endpoint works
      try {
        const syncReply = await api.copilot.chat(targetSessionId, textToSend);
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: syncReply.content,
            };
          }
          return updated;
        });
      } catch (syncErr) {
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content:
                'Agent connection issue. If you have not set OPENROUTER_API_KEY in backend/.env, please configure it to enable live responses.',
            };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  return (
    <div className="relative h-full flex flex-col justify-between max-w-4xl mx-auto w-full font-sans select-none text-[#09122A] overflow-hidden">
      {/* ===================================================================== */}
      {/* 1. SCROLLABLE CONVERSATION AREA                                       */}
      {/* ===================================================================== */}
      <div
        className={`flex-1 overflow-y-auto px-2 py-4 scrollbar-none flex flex-col ${
          messages.length === 0 ? 'justify-center' : 'justify-start'
        }`}
      >
        {loadingHistory && (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
            <RefreshCw size={20} className="animate-spin text-[#0E3A75]" />
            <span className="text-xs font-medium">Loading conversation context...</span>
          </div>
        )}

        {/* EMPTY STATE HERO (Displayed before any message is sent) */}
        {!loadingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center my-auto">
            {/* Headline with Yellow Hand-Drawn Accents */}
            <div className="relative inline-block mb-2">
              <h1 className="text-[36px] sm:text-[42px] font-bold text-[#09122A] tracking-tight leading-tight">
                What can I help you{' '}
                <span className="relative inline-block font-serif italic font-normal text-[#0D2149]">
                  create today?
                  {/* Underline Curve */}
                  <svg
                    className="absolute -bottom-2 left-0 w-full h-3.5 text-amber-400 pointer-events-none"
                    viewBox="0 0 160 14"
                    fill="none"
                  >
                    <path
                      d="M3 10C45 4 115 3 157 8"
                      stroke="currentColor"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                    />
                  </svg>
                  {/* Sunburst Rays */}
                  <svg
                    className="absolute -top-3 -right-6 w-6 h-6 text-amber-400 pointer-events-none"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                  >
                    <path d="M12 2v4M19 5l-3 3M22 12h-4" />
                  </svg>
                </span>
              </h1>
            </div>

            <p className="text-[14px] text-[#475569] font-normal mb-8">
              Your AI marketing workspace is ready to turn ideas into results.
            </p>

            {/* THREE STARTER CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5 w-full max-w-3xl mb-2">
              {/* Card 1: Marketing Campaign */}
              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    'Draft a high-converting launch campaign for our new AI feature targeting SaaS founders.'
                  )
                }
                className="relative overflow-hidden p-5 rounded-[22px] bg-white border border-[#DCE7F5] hover:border-[#C8DAEF] shadow-[0_6px_24px_-6px_rgba(14,58,117,0.06)] hover:shadow-[0_12px_32px_-8px_rgba(14,58,117,0.12)] transition-all cursor-pointer flex items-center gap-3.5 text-left group hover:-translate-y-0.5"
              >
                <div className="w-11 h-11 rounded-2xl bg-[#F5F0FF] text-[#8B5CF6] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform z-10 shadow-xs">
                  <Megaphone size={19} />
                </div>
                <div className="z-10">
                  <span className="text-[13.5px] font-bold text-[#09122A] leading-snug block">
                    Create a marketing campaign
                  </span>
                </div>
                <svg
                  className="absolute right-0 bottom-0 w-36 h-14 pointer-events-none"
                  viewBox="0 0 144 56"
                  fill="none"
                >
                  <path
                    d="M0 56C36 56 62 36 96 42C122 47 136 28 144 18V56H0Z"
                    fill="url(#purpleWave)"
                  />
                  <defs>
                    <linearGradient id="purpleWave" x1="144" y1="18" x2="20" y2="56" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#C084FC" stopOpacity="0.85" />
                      <stop offset="0.6" stopColor="#E9D5FF" stopOpacity="0.6" />
                      <stop offset="1" stopColor="#FAF5FF" stopOpacity="0.1" />
                    </linearGradient>
                  </defs>
                </svg>
              </button>

              {/* Card 2: Social Media Content */}
              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    'Write 3 viral Twitter posts with curiosity hooks and clean spacing for my brand.'
                  )
                }
                className="relative overflow-hidden p-5 rounded-[22px] bg-white border border-[#DCE7F5] hover:border-[#C8DAEF] shadow-[0_6px_24px_-6px_rgba(14,58,117,0.06)] hover:shadow-[0_12px_32px_-8px_rgba(14,58,117,0.12)] transition-all cursor-pointer flex items-center gap-3.5 text-left group hover:-translate-y-0.5"
              >
                <div className="w-11 h-11 rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform z-10 shadow-xs">
                  <Layers size={19} />
                </div>
                <div className="z-10">
                  <span className="text-[13.5px] font-bold text-[#09122A] leading-snug block">
                    Write social media content
                  </span>
                </div>
                <svg
                  className="absolute right-0 bottom-0 w-36 h-14 pointer-events-none"
                  viewBox="0 0 144 56"
                  fill="none"
                >
                  <path
                    d="M0 56C36 56 64 34 98 38C122 41 135 22 144 14V56H0Z"
                    fill="url(#blueWave)"
                  />
                  <defs>
                    <linearGradient id="blueWave" x1="144" y1="14" x2="20" y2="56" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#60A5FA" stopOpacity="0.85" />
                      <stop offset="0.6" stopColor="#BAE6FD" stopOpacity="0.6" />
                      <stop offset="1" stopColor="#F0F9FF" stopOpacity="0.1" />
                    </linearGradient>
                  </defs>
                </svg>
              </button>

              {/* Card 3: SEO Audit */}
              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    'Audit my competitor keywords and tell me what high-intent opportunities I should target.'
                  )
                }
                className="relative overflow-hidden p-5 rounded-[22px] bg-white border border-[#DCE7F5] hover:border-[#C8DAEF] shadow-[0_6px_24px_-6px_rgba(14,58,117,0.06)] hover:shadow-[0_12px_32px_-8px_rgba(14,58,117,0.12)] transition-all cursor-pointer flex items-center gap-3.5 text-left group hover:-translate-y-0.5"
              >
                <div className="w-11 h-11 rounded-2xl bg-[#ECFDF5] text-[#10B981] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform z-10 shadow-xs">
                  <Search size={19} />
                </div>
                <div className="z-10">
                  <span className="text-[13.5px] font-bold text-[#09122A] leading-snug block">
                    Improve my SEO
                  </span>
                </div>
                <svg
                  className="absolute right-0 bottom-0 w-36 h-14 pointer-events-none"
                  viewBox="0 0 144 56"
                  fill="none"
                >
                  <path
                    d="M0 56C34 56 58 38 92 36C118 34 134 20 144 10V56H0Z"
                    fill="url(#greenWave)"
                  />
                  <defs>
                    <linearGradient id="greenWave" x1="144" y1="10" x2="20" y2="56" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#4ADE80" stopOpacity="0.85" />
                      <stop offset="0.6" stopColor="#BBF7D0" stopOpacity="0.6" />
                      <stop offset="1" stopColor="#F0FDF4" stopOpacity="0.1" />
                    </linearGradient>
                  </defs>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE MULTI-TURN CONVERSATION */}
        {!loadingHistory && messages.length > 0 && (
          <div className="space-y-4 py-2 w-full max-w-3xl mx-auto">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-xl bg-[#0E3A75] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 shadow-2xs">
                      AI
                    </div>
                  )}

                  <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%]`}>
                    <div
                      className={`px-4.5 py-3 rounded-2xl text-[13.5px] leading-relaxed select-text shadow-2xs ${
                        isUser
                          ? 'bg-[#0E3A75] text-white rounded-tr-xs'
                          : 'bg-white text-slate-800 border border-[#DCE7F5] rounded-tl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content || '...'}</p>
                    </div>

                    <span className="text-[10px] text-slate-400 mt-1 px-1">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-[#0E3A75] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 shadow-2xs">
                      <User size={15} />
                    </div>
                  )}
                </div>
              );
            })}

            {isStreaming && (
              <div className="flex items-center gap-2 text-xs text-slate-400 italic py-1 pl-11">
                <Sparkles size={13} className="animate-spin text-[#0E3A75]" />
                <span>Agent is formulating response and running tools...</span>
              </div>
            )}

            {/* Agent Tool Execution Badges (Observability) */}
            {tools.length > 0 && (
              <div className="pt-2 pl-11">
                <div className="px-3.5 py-2.5 rounded-xl bg-[#EBF3FC]/80 border border-[#D0E2F7] text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-[#0E3A75] text-[11px] uppercase tracking-wider">
                    <Wrench size={13} />
                    <span>Agent Actions Executed</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tools.map((t) => (
                      <span
                        key={t.id}
                        className="px-2 py-0.5 rounded-md bg-white border border-[#DCE7F5] text-[11px] text-slate-700 font-mono flex items-center gap-1 shadow-2xs"
                      >
                        <CheckCircle2 size={11} className="text-emerald-600" />
                        <span>{t.tool_name}</span>
                        <span className="text-slate-400 text-[10px]">({t.execution_time_ms}ms)</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 2. BOTTOM FLOATING OMNIBAR CHATBOX                                    */}
      {/* ===================================================================== */}
      <div className="w-full max-w-3xl mx-auto pb-2 shrink-0 relative">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="w-full rounded-[24px] bg-white border border-[#E2ECF7] shadow-[0_12px_36px_rgba(14,58,117,0.07)] p-3 sm:p-4 flex flex-col justify-between transition-all duration-200 hover:border-[#C5D9F0] focus-within:border-[#9EC1EA] focus-within:shadow-[0_16px_40px_rgba(14,58,117,0.12)] outline-none"
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="What would you like to achieve today?"
            className="w-full bg-transparent resize-none border-none outline-none text-[#0F1B33] placeholder-[#6B7A94] text-[15px] font-normal leading-relaxed focus:ring-0 px-1 py-0.5 select-text"
          />

          {/* Action Row */}
          <div className="flex items-center justify-between pt-1 mt-1">
            {/* Left Controls: Plus & Category Dropdown */}
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

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#F1F4F9] hover:bg-[#E4EBF5] active:scale-95 text-[13px] font-medium text-[#0F1B33] transition-colors cursor-pointer"
                >
                  <span>{category}</span>
                  <ChevronDown
                    size={14}
                    strokeWidth={2}
                    className={`text-[#475569] transition-transform duration-200 ${
                      dropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {dropdownOpen && (
                  <div className="absolute left-0 bottom-11 w-44 rounded-2xl bg-white border border-[#DCE7F5] shadow-xl py-1.5 z-30 text-left">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setCategory(cat);
                          setDropdownOpen(false);
                        }}
                        className="w-full px-3.5 py-2 text-[12.5px] font-medium text-[#0F1B33] hover:bg-[#F0F6FF] flex items-center justify-between transition-colors cursor-pointer"
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

            {/* Right Controls: Create text button & Arrow button */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputPrompt.trim() || isStreaming}
                className="h-9 px-4 rounded-xl bg-[#F1F4F9] hover:bg-[#E4EBF5] active:scale-95 text-[13px] font-medium text-[#0F1B33] transition-all duration-150 cursor-pointer disabled:opacity-40"
              >
                Create
              </button>

              <button
                type="submit"
                disabled={!inputPrompt.trim() || isStreaming}
                className={`w-9 h-9 rounded-full bg-[#0E3A75] hover:bg-[#092854] text-white flex items-center justify-center transition-all duration-200 shadow-sm cursor-pointer ${
                  inputPrompt.trim()
                    ? 'scale-105 shadow-md shadow-blue-950/25 hover:scale-110 active:scale-95'
                    : 'opacity-90'
                }`}
              >
                <ArrowUp
                  size={17}
                  strokeWidth={2.3}
                  className={`transition-transform duration-200 ${
                    isStreaming ? '-translate-y-0.5 animate-bounce' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};