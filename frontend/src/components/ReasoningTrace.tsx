import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';

const KEYFRAMES = `
@keyframes gc-shimmer-text { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
@keyframes gc-step-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
`;

// ============================================================================
// Self-Contained Types & Utilities
// ============================================================================

export interface ReasoningStep {
  id: string;
  content: string;
}

export type ReasoningTraceVariant = 'Steps' | 'Reasoning';

export interface ReasoningTraceProps {
  steps: ReasoningStep[];
  status: 'thinking' | 'complete';
  durationMs?: number;
  variant?: ReasoningTraceVariant;
  defaultOpen?: boolean;
  className?: string;
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

function useThinkingClock(active: boolean) {
  const [ds, setDs] = useState(0);
  const wasActive = useRef(active);

  useEffect(() => {
    if (active && !wasActive.current) {
      setDs(0);
    }
    wasActive.current = active;
    if (!active) return;

    const timer = setInterval(() => setDs((d) => d + 1), 100);
    return () => clearInterval(timer);
  }, [active]);

  return ds / 10;
}

// ============================================================================
// ReasoningTrace Component
// ============================================================================

export function ReasoningTrace({
  steps,
  status,
  durationMs,
  variant = 'Steps',
  defaultOpen = false,
  className,
}: ReasoningTraceProps) {
  const [open, setOpen] = useState(defaultOpen);
  const thinking = status === 'thinking';
  const elapsed = useThinkingClock(thinking);

  const seconds = thinking
    ? elapsed.toFixed(1)
    : ((durationMs ?? elapsed * 1000) / 1000).toFixed(1);

  const hasSteps = steps && steps.length > 0;

  return (
    <div className={cn('w-full max-w-xl text-[13px] font-sans select-none', className)}>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* 1. Trigger Pill (DeepSeek-style "Thought for Xs >") */}
      <button
        type="button"
        onClick={() => hasSteps && setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'group inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/95 border border-[#DCE7F5] shadow-2xs text-xs transition-all duration-150',
          hasSteps
            ? 'hover:border-[#B4CFF0] hover:bg-white cursor-pointer active:scale-[0.98]'
            : 'cursor-default'
        )}
      >
        <Sparkles
          aria-hidden
          className={cn(
            'w-3.5 h-3.5 text-[#2563EB] shrink-0',
            thinking && 'motion-safe:animate-pulse'
          )}
        />

        {thinking ? (
          <span
            className="bg-clip-text font-semibold text-transparent motion-reduce:!animate-none motion-reduce:!text-[#0E3A75]"
            style={{
              backgroundImage:
                'linear-gradient(90deg, #64748B 25%, #0E3A75 50%, #64748B 75%)',
              backgroundSize: '200% 100%',
              animation: 'gc-shimmer-text 1.5s linear infinite',
            }}
          >
            Thinking
          </span>
        ) : (
          <span className="font-semibold text-[#09122A] group-hover:text-[#0E3A75] transition-colors">
            Thought for {seconds}s
          </span>
        )}

        {thinking && (
          <span className="font-mono text-[11px] tabular-nums text-slate-400">
            {seconds}s
          </span>
        )}

        {hasSteps && (
          <ChevronDown
            aria-hidden
            className={cn(
              'w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
              open && 'rotate-180 text-[#0E3A75]'
            )}
          />
        )}
      </button>

      {/* 2. Expandable Reasoning Drawer */}
      {hasSteps && (
        <div
          className="grid transition-[grid-template-rows] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">
            <div className="ml-2 mt-2 border-l-2 border-[#DCE7F5] bg-white/80 rounded-r-xl pb-2 pl-4 pr-3 pt-2 shadow-2xs">
              {variant === 'Steps' ? (
                <ol className="space-y-2">
                  {steps.map((step, i) => (
                    <li
                      key={step.id}
                      className="flex items-start gap-2.5 text-[12.5px] leading-[1.6] text-slate-600 motion-safe:animate-[gc-step-in_240ms_cubic-bezier(0.23,1,0.32,1)_both]"
                    >
                      <span className="mt-0.5 px-1.5 py-0.2 rounded bg-[#EBF3FC] font-mono text-[10px] font-bold tabular-nums text-[#0E3A75] shrink-0">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="select-text">{step.content}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[12.5px] leading-[1.7] text-slate-600 select-text">
                  {steps.map((step) => step.content).join(' ')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReasoningTrace;