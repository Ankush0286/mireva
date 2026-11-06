import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone,
  Search,
  Layers,
  Copy,
  Check,
  RotateCcw,
  ArrowUpRight,
} from "lucide-react";
import {
  api,
  type ChatMessage,
  type ToolExecutionLog,
  type ChatSession,
} from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { AgentSteps } from "../../components/AgentSteps";
import { fromToolExecutionLog } from "../../components/agentStepsUtils";
import { LoadingState } from "../../components/LoadingState";
import {
  PromptComposer,
  type ModelOption,
} from "../../components/PromptComposer";
import {
  StreamingText,
  type SuggestedPrompt,
} from "../../components/StreamingText";
import {
  ReasoningTrace,
  type ReasoningStep,
} from "../../components/ReasoningTrace";

// ============================================================================
// Pure Module-Level Helpers (Outside render scope for React Compiler compliance)
// ============================================================================

const generateMessageId = (role: "user" | "assistant") =>
  `${role}-${Date.now()}`;
const getIsoTimestamp = () => new Date().toISOString();
const getHighResNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

function parseModelOutput(rawContent: string): {
  reasoningSteps: ReasoningStep[];
  cleanAnswer: string;
  isCurrentlyThinking: boolean;
} {
  if (!rawContent) {
    return { reasoningSteps: [], cleanAnswer: "", isCurrentlyThinking: false };
  }

  const hasOpenThink = rawContent.includes("<think>");
  const hasCloseThink = rawContent.includes("</think>");

  if (hasOpenThink && !hasCloseThink) {
    const partialThought = rawContent.replace("<think>", "").trim();
    const steps = partialThought
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((content, idx) => ({ id: `think-${idx}`, content }));

    return {
      reasoningSteps: steps,
      cleanAnswer: "",
      isCurrentlyThinking: true,
    };
  }

  if (hasOpenThink && hasCloseThink) {
    const match = rawContent.match(/<think>([\s\S]*?)<\/think>/);
    const thoughtContent = match ? match[1].trim() : "";
    const cleanAnswer = rawContent
      .replace(/<think>[\s\S]*?<\/think>/, "")
      .trim();

    const steps = thoughtContent
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((content, idx) => ({ id: `think-${idx}`, content }));

    return {
      reasoningSteps: steps,
      cleanAnswer,
      isCurrentlyThinking: false,
    };
  }

  return {
    reasoningSteps: [],
    cleanAnswer: rawContent,
    isCurrentlyThinking: false,
  };
}

// ============================================================================
// Extended Message Interface
// ============================================================================

interface ExtendedChatMessage extends ChatMessage {
  turnTools?: ToolExecutionLog[];
  thinkingDurationMs?: number;
}

interface ChatPageProps {
  sessionId: string | null;
  onSessionCreated: (newSession: ChatSession) => void;
}

const STARTER_CARDS = [
  {
    id: "campaign",
    title: "Create a marketing campaign",
    subtitle: "Multi-channel launch strategy",
    prompt:
      "Draft a high-converting multi-channel launch campaign for our brand. Check my connected accounts first.",
    icon: Megaphone,
    iconBg: "bg-[#F5F0FF]",
    iconColor: "text-[#7C3AED]",
    waveId: "purpleWave",
    stops: [
      { offset: "0%", color: "#C084FC", opacity: 0.85 },
      { offset: "60%", color: "#E9D5FF", opacity: 0.55 },
      { offset: "100%", color: "#FAF5FF", opacity: 0.05 },
    ],
  },
  {
    id: "social",
    title: "Write social media content",
    subtitle: "High-hook posts & threads",
    prompt:
      "Write 3 punchy social media posts with strong curiosity hooks and clean formatting.",
    icon: Layers,
    iconBg: "bg-[#EFF6FF]",
    iconColor: "text-[#2563EB]",
    waveId: "blueWave",
    stops: [
      { offset: "0%", color: "#60A5FA", opacity: 0.85 },
      { offset: "60%", color: "#BAE6FD", opacity: 0.55 },
      { offset: "100%", color: "#F0F9FF", opacity: 0.05 },
    ],
  },
  {
    id: "seo",
    title: "Improve my SEO & Triggers",
    subtitle: "Competitor keyword radar",
    prompt:
      "Audit my competitor watch list and suggest high-intent keyword trigger rules we should monitor.",
    icon: Search,
    iconBg: "bg-[#ECFDF5]",
    iconColor: "text-[#059669]",
    waveId: "greenWave",
    stops: [
      { offset: "0%", color: "#34D399", opacity: 0.85 },
      { offset: "60%", color: "#A7F3D0", opacity: 0.55 },
      { offset: "100%", color: "#ECFDF5", opacity: 0.05 },
    ],
  },
];

const DEFAULT_FOLLOW_UPS: SuggestedPrompt[] = [
  {
    id: "fu-1",
    label: "Check my connected account quotas and health",
    prompt:
      "Check the health and remaining daily quotas of my connected accounts.",
  },
  {
    id: "fu-2",
    label: "Queue the best post draft for tomorrow morning",
    prompt:
      "Schedule the strongest post draft from above for tomorrow at 10:00 AM.",
  },
];

// ============================================================================
// Main ChatPage Component
// ============================================================================

export const ChatPage: React.FC<ChatPageProps> = ({
  sessionId,
  onSessionCreated,
}) => {
  const queryClient = useQueryClient();
  const location = useLocation();

  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isStreamingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initialPromptHandled = useRef(false);

  // 1. TanStack Query for Models
  const { data: models = [] } = useQuery<ModelOption[]>({
    queryKey: ["copilot", "models"],
    queryFn: async () => {
      const fetched = await api.copilot.listModels();
      return fetched && fetched.length > 0 ? fetched : [];
    },
    staleTime: 1000 * 60 * 30, // 30 minutes cache
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // 2. Hydrate History when sessionId changes
  useEffect(() => {
    let isMounted = true;

    if (!sessionId) {
      queueMicrotask(() => {
        if (isMounted) setMessages([]);
      });
      return () => {
        isMounted = false;
      };
    }

    if (isStreamingRef.current) return;

    setLoadingHistory(true);
    Promise.all([
      api.copilot.getMessages(sessionId),
      api.copilot.getTools(sessionId),
    ])
      .then(([historyMessages, toolLogs]) => {
        if (!isMounted) return;
        const mapped: ExtendedChatMessage[] = historyMessages.map((msg) => {
          if (msg.role === "assistant") {
            const turnTools = toolLogs.filter((t) => t.message_id === msg.id);
            return {
              ...msg,
              turnTools,
            };
          }
          return msg;
        });

        setMessages(mapped);
      })
      .catch((err) => {
        console.error("Failed to load chat history:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingHistory(false);
      });

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleStopGenerating = () => {
    abortControllerRef.current?.abort();
    isStreamingRef.current = false;
    setIsStreaming(false);
  };

  // 3. handleSendMessage wrapped in useCallback before any effect reads it
  const handleSendMessage = useCallback(
    async (promptText: string, modelId?: string, thinking?: boolean) => {
      const textToSend = promptText.trim();
      if (!textToSend || isStreaming) return;

      let targetSessionId = sessionId;

      if (!targetSessionId) {
        try {
          const newSession = await api.copilot.createSession(
            textToSend.slice(0, 36) || "New Marketing Session",
          );
          targetSessionId = newSession.id;
          queryClient.invalidateQueries({
            queryKey: queryKeys.copilot.sessions,
          });
          onSessionCreated(newSession);
        } catch (err) {
          console.error("Failed to create new session:", err);
          return;
        }
      }

      isStreamingRef.current = true;
      setIsStreaming(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const turnStartTime = getHighResNow();

      const userMsg: ExtendedChatMessage = {
        id: generateMessageId("user"),
        session_id: targetSessionId,
        role: "user",
        content: textToSend,
        created_at: getIsoTimestamp(),
      };

      const assistantMsgId = generateMessageId("assistant");
      const assistantMsg: ExtendedChatMessage = {
        id: assistantMsgId,
        session_id: targetSessionId,
        role: "assistant",
        content: "",
        created_at: getIsoTimestamp(),
        turnTools: [],
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      let firstTokenRecorded = false;

      try {
        await api.copilot.streamChat(
          targetSessionId,
          textToSend,
          (token: string) => {
            const elapsedThinking = !firstTokenRecorded
              ? Math.round(getHighResNow() - turnStartTime)
              : undefined;
            firstTokenRecorded = true;

            setMessages((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  content: updated[lastIndex].content + token,
                  thinkingDurationMs:
                    elapsedThinking ?? updated[lastIndex].thinkingDurationMs,
                };
                return updated;
              }
              return updated;
            });
          },
          (realtimeTools: ToolExecutionLog[]) => {
            setMessages((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  turnTools: realtimeTools,
                };
              }
              return updated;
            });
          },
          abortController.signal,
          modelId,
          thinking,
        );

        queryClient.invalidateQueries({ queryKey: queryKeys.copilot.sessions });
        queryClient.invalidateQueries({
          queryKey: queryKeys.copilot.messages(targetSessionId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.copilot.tools(targetSessionId),
        });
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("Streaming error:", err);
        const errMsg = err?.message || "Agent communication error";
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: `⚠️ ${errMsg}. Please verify FIREWORKS_API_KEY / OPENROUTER_API_KEY in backend/.env`,
            };
          }
          return updated;
        });
      } finally {
        isStreamingRef.current = false;
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [sessionId, isStreaming, queryClient, onSessionCreated],
  );

  // 4. Auto-Send Initial Prompt passed from Landing Page
  useEffect(() => {
    const passedPrompt = (location.state as any)?.initialPrompt;
    if (passedPrompt && !initialPromptHandled.current) {
      initialPromptHandled.current = true;
      handleSendMessage(passedPrompt);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, handleSendMessage]);

  return (
    <div className="relative h-full flex flex-col justify-between max-w-4xl mx-auto w-full font-sans select-none text-[#09122A] overflow-hidden">
      {/* 1. Main Conversation Stream */}
      <div
        className={`flex-1 overflow-y-auto px-3 sm:px-6 py-4 scrollbar-none flex flex-col ${
          messages.length === 0 ? "justify-center" : "justify-start"
        }`}
      >
        {loadingHistory && (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <LoadingState label="Loading conversation" variant="Orbit" />
          </div>
        )}

        {/* Empty State Hero */}
        {!loadingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center my-auto">
            <div className="relative inline-block mb-2.5">
              <h1 className="text-[36px] sm:text-[44px] font-bold text-[#09122A] tracking-[-0.025em] leading-[1.12]">
                What can I help you{" "}
                <span className="relative inline-block font-serif italic font-normal text-[#0D2149] tracking-normal">
                  create today?
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

            <p className="text-[14.5px] text-[#475569] font-normal max-w-md mb-9 leading-relaxed">
              Your AI workspace for marketing that moves ideas forward.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-2">
              {STARTER_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleSendMessage(card.prompt)}
                    className="relative overflow-hidden p-5 rounded-[22px] bg-white border border-[#DCE7F5] hover:border-[#B8D0EC] shadow-[0_6px_24px_-6px_rgba(14,58,117,0.06)] hover:shadow-[0_14px_34px_-8px_rgba(14,58,117,0.13)] transition-all duration-200 cursor-pointer flex items-center gap-3.5 text-left group hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <div
                      className={`w-11 h-11 rounded-2xl ${card.iconBg} ${card.iconColor} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200 z-10 shadow-2xs`}
                    >
                      <Icon size={19} strokeWidth={2.1} />
                    </div>

                    <div className="z-10 min-w-0 flex-1">
                      <span className="text-[13.5px] font-bold text-[#09122A] leading-snug block">
                        {card.title}
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium block mt-0.5 truncate">
                        {card.subtitle}
                      </span>
                    </div>

                    <ArrowUpRight
                      size={14}
                      className="text-slate-300 group-hover:text-[#0E3A75] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0 self-start z-10"
                    />

                    <svg
                      className="absolute right-0 bottom-0 w-36 h-14 pointer-events-none"
                      viewBox="0 0 144 56"
                      fill="none"
                    >
                      <path
                        d="M0 56C36 56 62 36 96 42C122 47 136 28 144 18V56H0Z"
                        fill={`url(#${card.waveId})`}
                      />
                      <defs>
                        <linearGradient
                          id={card.waveId}
                          x1="144"
                          y1="18"
                          x2="20"
                          y2="56"
                          gradientUnits="userSpaceOnUse"
                        >
                          {card.stops.map((s, idx) => (
                            <stop
                              key={idx}
                              offset={s.offset}
                              stopColor={s.color}
                              stopOpacity={s.opacity}
                            />
                          ))}
                        </linearGradient>
                      </defs>
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Conversation Messages */}
        {!loadingHistory && messages.length > 0 && (
          <div className="space-y-6 w-full max-w-3xl mx-auto pb-6">
            {messages.map((msg, idx) => {
              const isUser = msg.role === "user";
              const isLastAssistant = !isUser && idx === messages.length - 1;
              const hasTools = Boolean(
                msg.turnTools && msg.turnTools.length > 0,
              );

              const { reasoningSteps, cleanAnswer, isCurrentlyThinking } =
                !isUser
                  ? parseModelOutput(msg.content)
                  : {
                      reasoningSteps: [],
                      cleanAnswer: msg.content,
                      isCurrentlyThinking: false,
                    };

              const hasRealReasoning = reasoningSteps.length > 0;
              const hasTextContent = Boolean(
                cleanAnswer && cleanAnswer.trim().length > 0,
              );
              const isWaitingForStream =
                isLastAssistant &&
                isStreaming &&
                !hasTextContent &&
                !hasRealReasoning;

              if (isUser) {
                return (
                  <div key={msg.id} className="group flex flex-col items-end">
                    <div className="px-4.5 py-2.5 rounded-2xl rounded-tr-sm bg-[#0E3A75] text-white text-[14px] leading-relaxed shadow-[0_4px_14px_rgba(14,58,117,0.15)] max-w-[78%] select-text">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>

                    <div className="flex items-center gap-1 mt-1 pr-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.content)}
                        title="Copy prompt"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-400 hover:text-[#09122A] hover:bg-white/70 transition-colors cursor-pointer"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check size={12} className="text-emerald-600" />
                            <span className="text-emerald-600">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className="flex flex-col items-start space-y-2.5 w-full"
                >
                  {hasTools && (
                    <AgentSteps
                      steps={msg.turnTools!.map(fromToolExecutionLog)}
                    />
                  )}

                  {hasRealReasoning && (
                    <ReasoningTrace
                      status={isCurrentlyThinking ? "thinking" : "complete"}
                      durationMs={msg.thinkingDurationMs}
                      steps={reasoningSteps}
                    />
                  )}

                  {isWaitingForStream && (
                    <LoadingState
                      label={
                        hasTools
                          ? "Synthesizing tool findings"
                          : "Formulating response"
                      }
                      variant="Drive"
                    />
                  )}

                  {hasTextContent && (
                    <div className="w-full rounded-[20px] bg-white/95 border border-[#DCE7F5] px-5 py-4 shadow-[0_6px_24px_-6px_rgba(14,58,117,0.06)]">
                      <StreamingText
                        text={cleanAnswer}
                        streaming={isLastAssistant && isStreaming}
                        followUps={
                          isLastAssistant && !isStreaming
                            ? DEFAULT_FOLLOW_UPS
                            : []
                        }
                        onFollowUp={(item) =>
                          handleSendMessage(item.prompt || item.label)
                        }
                      />

                      {(!isLastAssistant || !isStreaming) && (
                        <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-[#F0F5FA] text-slate-400">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleCopy(msg.id, cleanAnswer)}
                              title="Copy response"
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold text-slate-500 hover:text-[#0E3A75] hover:bg-[#F4F8FD] transition-colors cursor-pointer"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check
                                    size={13}
                                    className="text-emerald-600"
                                  />
                                  <span className="text-emerald-600">
                                    Copied
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Copy size={13} />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>

                            {idx > 0 && messages[idx - 1]?.role === "user" && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleSendMessage(messages[idx - 1].content)
                                }
                                disabled={isStreaming}
                                title="Regenerate response"
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold text-slate-500 hover:text-[#0E3A75] hover:bg-[#F4F8FD] transition-colors cursor-pointer disabled:opacity-40"
                              >
                                <RotateCcw size={13} />
                                <span>Retry</span>
                              </button>
                            )}
                          </div>

                          <span className="font-mono text-[10px] text-slate-300">
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 2. Docked Bottom Prompt Composer */}
      <div className="w-full max-w-3xl mx-auto pb-2 pt-1 px-3 sm:px-0 shrink-0 relative z-20">
        <PromptComposer
          models={models.length > 0 ? models : undefined}
          isGenerating={isStreaming}
          onSend={(text, modelId, thinking) =>
            handleSendMessage(text, modelId, thinking)
          }
          onStop={handleStopGenerating}
          className="max-w-none"
        />
      </div>
    </div>
  );
};

export default ChatPage;
