function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export interface UsageState {
  promptTokens: number;
  completionTokens: number;
  contextWindow: number;
  estimatedCostUsd?: number;
}

export type UsageMeterVariant = 'Bar' | 'Inline';

export interface UsageMeterProps {
  usage: UsageState;
  variant?: UsageMeterVariant;
  className?: string;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    const millions = count / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return `${count}`;
}

export function UsageMeter({
  usage,
  variant = 'Bar',
  className,
}: UsageMeterProps) {
  const used = usage.promptTokens + usage.completionTokens;
  const safeWindow = Math.max(1, usage.contextWindow);
  const ratio = Math.min(1, used / safeWindow);
  const percent = Math.round(ratio * 100);

  const barColor =
    ratio > 0.9
      ? 'bg-rose-600'
      : ratio > 0.75
        ? 'bg-amber-500'
        : 'bg-[#0E3A75]';

  const percentBadgeColor =
    ratio > 0.9
      ? 'text-rose-700 bg-rose-50 border-rose-200/60'
      : ratio > 0.75
        ? 'text-amber-700 bg-amber-50 border-amber-200/60'
        : 'text-[#0E3A75] bg-[#EBF3FC] border-[#D0E2F7]';

  // ---------------------------------------------------------------------------
  // 1. Compact Inline Variant (Great for Chat Header / Prompt Composer Footer)
  // ---------------------------------------------------------------------------
  if (variant === 'Inline') {
    return (
      <div
        className={cn(
          'inline-flex w-fit items-center gap-2.5 px-3 py-1 rounded-xl bg-white/95 border border-[#DCE7F5] shadow-2xs font-mono text-[11px] tabular-nums text-slate-600 select-none',
          className
        )}
      >
        <span
          aria-hidden
          className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 border border-slate-200/60"
        >
          <span
            className={cn(
              'block h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
              barColor
            )}
            style={{ width: `${percent}%` }}
          />
        </span>

        <span className="font-semibold text-[#09122A]">
          {formatTokens(used)}{' '}
          <span className="font-normal text-slate-400">
            / {formatTokens(usage.contextWindow)}
          </span>
        </span>

        {usage.estimatedCostUsd !== undefined && (
          <span className="px-1.5 py-0.2 rounded bg-[#F8FAFD] border border-[#E2ECF7] text-[10px] font-bold text-[#0E3A75]">
            ${usage.estimatedCostUsd.toFixed(4)}
          </span>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Full Card Bar Variant (Great for Inspector / Session Details / Sidebar)
  // ---------------------------------------------------------------------------
  return (
    <div
      className={cn(
        'w-full max-w-[380px] rounded-[20px] bg-white/95 border border-[#DCE7F5] p-4 shadow-[0_6px_24px_-6px_rgba(14,58,117,0.06)] font-sans select-none text-[#09122A]',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-bold text-[#09122A] tracking-tight">
          Context Window
        </span>
        <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
          <span className="font-semibold text-slate-600">
            {formatTokens(used)} / {formatTokens(usage.contextWindow)}
          </span>
          <span
            className={cn(
              'px-1.5 py-0.2 rounded-md text-[10px] font-bold border',
              percentBadgeColor
            )}
          >
            {percent}%
          </span>
        </div>
      </div>

      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={usage.contextWindow}
        aria-valuenow={used}
        aria-label="Context window usage"
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#F1F5F9] border border-[#E2ECF7]"
      >
        <span
          className={cn(
            'block h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
            barColor
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-3 pt-2.5 border-t border-[#F0F5FA] flex items-center justify-between font-mono text-[10.5px] tabular-nums text-slate-400">
        <span>
          prompt <strong className="text-slate-600">{formatTokens(usage.promptTokens)}</strong> · completion{' '}
          <strong className="text-slate-600">{formatTokens(usage.completionTokens)}</strong>
        </span>
        {usage.estimatedCostUsd !== undefined && (
          <span className="px-2 py-0.5 rounded-md bg-[#F8FAFD] border border-[#DCE7F5] font-bold text-[#0E3A75]">
            ≈ ${usage.estimatedCostUsd.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  );
}

export default UsageMeter;
