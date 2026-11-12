import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  Paperclip,
  Plus,
  Square,
  X,
} from 'lucide-react';

// ============================================================================
// Types & Utilities
// ============================================================================

export interface Attachment {
  id: string;
  name: string;
  size: number;
  url?: string;
}

export interface ModelOption {
  id: string;
  name: string;
  description?: string | null;
  badge?: string | null;
  disabled?: boolean;
}

export type PromptComposerVariant = 'Default' | 'Minimal';

export interface PromptComposerProps {
  placeholder?: string;
  models?: ModelOption[];
  defaultModelId?: string;
  defaultThinking?: boolean;
  attachments?: Attachment[];
  onRemoveAttachment?: (id: string) => void;
  onAttach?: () => void;
  onSend?: (text: string, modelId?: string, thinking?: boolean) => void;
  onStop?: () => void;
  isGenerating?: boolean;
  maxLength?: number;
  variant?: PromptComposerVariant;
  className?: string;
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Internal default model options (non-exported to preserve Fast Refresh)
const DEFAULT_MODELS: ModelOption[] = [
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'Nemotron 3 Ultra (Free)',
    description: '550B MoE (OpenRouter) — 1M context, 100% Free Sandbox',
    badge: 'FREE',
  },
  {
    id: 'accounts/fireworks/models/deepseek-v4p1-flash-1017',
    name: 'DeepSeek V4.1 Flash 1017',
    description: '552B MoE Flagship ($0.30 / $1.20 per 1M) — 1M context',
    badge: 'PAID',
  },
  {
    id: 'accounts/fireworks/models/glm-5p3-flash',
    name: 'GLM 5.3 Flash',
    description: 'Ultra-budget agent ($0.15 / $0.50 per 1M) — 1M context',
    badge: 'BUDGET',
  },
  {
    id: 'accounts/fireworks/models/minimax-m3p1-flash',
    name: 'MiniMax M3.1 Flash',
    description: 'High-speed copywriting ($0.15 / $0.60 per 1M) — 1M context',
  },
];

// ============================================================================
// PromptComposer Component
// ============================================================================

export function PromptComposer({
  placeholder = 'What would you like to achieve today?',
  models = DEFAULT_MODELS,
  defaultModelId,
  defaultThinking = false,
  attachments = [],
  onRemoveAttachment,
  onAttach,
  onSend,
  onStop,
  isGenerating = false,
  maxLength = 4000,
  variant = 'Default',
  className,
}: PromptComposerProps) {
  const [value, setValue] = useState('');
  const [modelId, setModelId] = useState(defaultModelId ?? models[0]?.id);
  const [thinkingMode, setThinkingMode] = useState(defaultThinking);
  const [pickerOpen, setPickerOpen] = useState(false);

  const textarea = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Derive the active model ID during render (eliminates cascading useEffect re-renders)
  const effectiveModelId = models.some((m) => m.id === modelId)
    ? modelId
    : (defaultModelId ?? models[0]?.id);
  const activeModel = models.find((model) => model.id === effectiveModelId) ?? models[0];

  // Close model picker dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const canSend = value.trim().length > 0 && !isGenerating;
  const minimal = variant === 'Minimal';

  function submit() {
    if (!canSend) return;
    onSend?.(value.trim(), effectiveModelId, thinkingMode);
    setValue('');
    if (textarea.current) {
      textarea.current.style.height = 'auto';
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={cn(
        'w-full max-w-3xl rounded-[24px] bg-white border border-[#E2ECF7] shadow-[0_12px_36px_rgba(14,58,117,0.07)] transition-all duration-200 hover:border-[#C5D9F0] focus-within:border-[#9EC1EA] focus-within:shadow-[0_16px_40px_rgba(14,58,117,0.12)] font-sans select-none outline-none',
        className
      )}
    >
      {/* 1. Attached Files List */}
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-4 pt-3.5">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-1.5 rounded-xl border border-[#DCE7F5] bg-[#F8FAFD] py-1 pl-2.5 pr-1.5"
            >
              <Paperclip className="w-3 h-3 text-[#0E3A75]" />
              <span className="max-w-[150px] truncate text-[11.5px] font-semibold text-[#09122A]">
                {attachment.name}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-slate-400">
                {formatSize(attachment.size)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${attachment.name}`}
                onClick={() => onRemoveAttachment?.(attachment.id)}
                className="grid w-4 h-4 place-items-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 2. Auto-Resizing Prompt Textarea */}
      <div className="px-4 pt-3.5">
        <textarea
          ref={textarea}
          value={value}
          rows={minimal ? 1 : 2}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label="Prompt"
          onChange={(event) => {
            setValue(event.target.value);
            event.target.style.height = 'auto';
            event.target.style.height = `${Math.min(event.target.scrollHeight, 132)}px`;
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
          className="max-h-[132px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-[#0F1B33] outline-none placeholder:text-[#6B7A94] select-text"
        />
      </div>

      {/* 3. Bottom Controls Bar */}
      <div className="flex items-center justify-between gap-2 px-3.5 pb-3 pt-1.5">
        {/* Left: Attachment Button & Model Picker */}
        <div className="flex min-w-0 items-center gap-2">
          {!minimal && (
            <button
              type="button"
              aria-label="Attach a file"
              onClick={onAttach}
              className="w-9 h-9 shrink-0 rounded-xl bg-[#F1F4F9] hover:bg-[#E4EBF5] active:scale-95 text-[#0F1B33] flex items-center justify-center transition-all duration-150 cursor-pointer group"
              title="Add attachment"
            >
              <Plus
                size={18}
                strokeWidth={2}
                className="transition-transform duration-200 group-hover:rotate-90"
              />
            </button>
          )}

          {!minimal && models.length > 0 && (
            <div ref={pickerRef} className="relative min-w-0">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen((open) => !open)}
                className="flex min-w-0 items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#F1F4F9] hover:bg-[#E4EBF5] active:scale-95 text-[13px] font-medium text-[#0F1B33] transition-colors cursor-pointer"
              >
                <span className="truncate">{activeModel?.name ?? 'Model'}</span>
                <ChevronDown
                  size={14}
                  strokeWidth={2}
                  className={cn(
                    'text-[#475569] shrink-0 transition-transform duration-200',
                    pickerOpen && 'rotate-180'
                  )}
                />
              </button>

              {pickerOpen && (
                <ul
                  role="listbox"
                  aria-label="Model"
                  className="absolute bottom-full left-0 z-30 mb-2 w-64 rounded-2xl border border-[#DCE7F5] bg-white p-1.5 shadow-xl text-left"
                >
                  {models.map((model) => {
                    const selected = model.id === effectiveModelId;
                    return (
                      <li key={model.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          disabled={model.disabled}
                          onClick={() => {
                            setModelId(model.id);
                            setPickerOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors',
                            model.disabled
                              ? 'cursor-not-allowed opacity-40'
                              : 'hover:bg-[#F0F6FF] cursor-pointer'
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-bold text-[#09122A]">
                              {model.name}
                            </span>
                            {model.description && (
                              <span className="block truncate text-[11px] text-slate-400 mt-0.5">
                                {model.description}
                              </span>
                            )}
                          </span>
                          {model.badge && !selected && (
                            <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-[#0E3A75]">
                              {model.badge}
                            </span>
                          )}
                          {selected && (
                            <Check className="w-4 h-4 shrink-0 text-[#0E3A75]" strokeWidth={2.5} />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Right: Character Count, Think Toggle Button & Morphing Send/Stop Button */}
        <div className="flex shrink-0 items-center gap-2.5">
          {!minimal && value.length > 0 && (
            <span
              className={cn(
                'font-mono text-[11px] tabular-nums transition-colors hidden sm:inline',
                value.length > maxLength * 0.9 ? 'text-amber-600 font-semibold' : 'text-slate-300'
              )}
            >
              {value.length}/{maxLength}
            </span>
          )}

          {!minimal && !isGenerating && (
            <button
              type="button"
              aria-pressed={thinkingMode}
              onClick={() => setThinkingMode((prev) => !prev)}
              className={cn(
                'h-9 px-4 rounded-xl active:scale-95 text-[13px] font-medium transition-all duration-150 cursor-pointer border',
                thinkingMode
                  ? 'bg-[#EBF3FC] text-[#0E3A75] border-[#9EC1EA] font-semibold shadow-2xs'
                  : 'bg-[#F1F4F9] hover:bg-[#E4EBF5] text-[#0F1B33] border-transparent'
              )}
            >
              Think
            </button>
          )}

          <button
            type={isGenerating ? 'button' : 'submit'}
            onClick={isGenerating ? onStop : undefined}
            aria-label={isGenerating ? 'Stop generating' : 'Send prompt'}
            disabled={!isGenerating && !canSend}
            className={cn(
              'grid w-9 h-9 place-items-center rounded-full bg-[#0E3A75] hover:bg-[#092854] text-white transition-all duration-200 shadow-sm cursor-pointer active:scale-95',
              canSend || isGenerating
                ? 'scale-105 shadow-md shadow-blue-950/25'
                : 'opacity-90'
            )}
          >
            <span className="relative grid w-4 h-4 place-items-center">
              <ArrowUp
                size={17}
                strokeWidth={2.3}
                className={cn(
                  'absolute transition-all duration-200',
                  isGenerating ? 'opacity-0 scale-50' : 'opacity-100 scale-100'
                )}
              />
              <Square
                size={12}
                className={cn(
                  'absolute fill-current transition-all duration-200',
                  isGenerating ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
                )}
              />
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}

export default PromptComposer;