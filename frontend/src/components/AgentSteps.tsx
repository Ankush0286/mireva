import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  CircleDashed,
  X,
  Loader2,
  Wrench,
  Terminal,
} from 'lucide-react';

export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

export interface ToolCall {
  id: string;
  name: string;
  status: ToolCallStatus;
  args?: Record<string, unknown> | string;
  result?: string | Record<string, unknown>;
  executionTimeMs?: number | null;
  startedAt?: number;
  completedAt?: number;
  children?: ToolCall[];
  parallel?: boolean;
}

export interface AgentStepsProps {
  steps: ToolCall[];
  className?: string;
  title?: string;
  defaultExpanded?: boolean;
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

const STATUS_ICONS: Record<ToolCallStatus, React.ReactNode> = {
  running: (
    <span className="grid w-4 h-4 place-items-center rounded-full bg-blue-50 text-[#2563EB] border border-blue-200">
      <Loader2 className="w-2.5 h-2.5 animate-spin" strokeWidth={2.5} />
    </span>
  ),
  success: (
    <span className="grid w-4 h-4 place-items-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
      <Check className="w-2.5 h-2.5" strokeWidth={3} />
    </span>
  ),
  error: (
    <span className="grid w-4 h-4 place-items-center rounded-full bg-rose-50 text-rose-600 border border-rose-200">
      <X className="w-2.5 h-2.5" strokeWidth={3} />
    </span>
  ),
  pending: <CircleDashed className="w-3.5 h-3.5 text-slate-400" />,
  cancelled: <span className="w-2 h-2 rounded-full bg-slate-300" />,
};

export function AgentSteps({
  steps,
  className,
  title = 'Agent Actions',
  defaultExpanded = false,
}: AgentStepsProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!steps || steps.length === 0) return null;

  const totalMs = steps.reduce((sum, s) => sum + (s.executionTimeMs || 0), 0);
  const durationLabel = totalMs > 0 ? `${(totalMs / 1000).toFixed(1)}s` : null;

  return (
    <div className={cn('w-full max-w-xl text-[13px] font-sans select-none', className)}>
      {/* 1. Compact Collapsible Trigger Pill */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-[#DCE7F5] hover:border-[#B4CFF0] shadow-2xs text-xs font-medium text-[#09122A] hover:bg-slate-50 transition-all cursor-pointer"
      >
        <div className="w-4 h-4 rounded-full bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center shrink-0">
          <Wrench size={10} strokeWidth={2.5} />
        </div>
        <span className="font-bold text-[11px] text-[#0E3A75] uppercase tracking-wider">
          {title}
        </span>
        <span className="text-slate-400 font-mono text-[11px]">
          ({steps.length} {steps.length === 1 ? 'action' : 'actions'}
          {durationLabel ? ` • ${durationLabel}` : ''})
        </span>
        <ChevronDown
          size={13}
          className={cn(
            'text-slate-400 transition-transform duration-200 ml-0.5',
            isExpanded && 'rotate-180 text-[#0E3A75]'
          )}
        />
      </button>

      {/* 2. Expanded Action Steps Drawer */}
      {isExpanded && (
        <div className="mt-2 rounded-2xl bg-[#F8FAFD] border border-[#DCE7F5] p-3 shadow-2xs animate-fade-up-1">
          <ol className="w-full space-y-1">
            {steps.map((step, index) => (
              <StepRow
                key={step.id}
                step={step}
                last={index === steps.length - 1}
              />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function StepRow({ step, last }: { step: ToolCall; last: boolean }) {
  const [open, setOpen] = useState(false);
  const expandable = Boolean(step.result || step.args || step.children?.length);

  const durationLabel = step.executionTimeMs
    ? `${step.executionTimeMs}ms`
    : step.startedAt && step.completedAt
    ? `${((step.completedAt - step.startedAt) / 1000).toFixed(1)}s`
    : null;

  return (
    <li className="relative flex gap-3 text-left">
      <div className="flex flex-col items-center">
        <span className="grid w-5 h-5 shrink-0 place-items-center">
          {STATUS_ICONS[step.status]}
        </span>
        {!last && <span className="w-px flex-1 bg-[#DCE7F5] my-0.5" />}
      </div>

      <div className={cn('min-w-0 flex-1', last ? 'pb-1' : 'pb-2.5')}>
        <button
          type="button"
          onClick={expandable ? () => setOpen((o) => !o) : undefined}
          className={cn(
            'flex w-full items-center gap-2 text-left px-1.5 py-0.5 rounded-lg transition-colors',
            expandable ? 'hover:bg-slate-200/50 cursor-pointer' : 'cursor-default'
          )}
        >
          <span className="font-mono text-[12px] font-bold text-[#0E3A75]">
            {step.name}
          </span>

          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {durationLabel && (
              <span className="font-mono text-[10.5px] tabular-nums text-slate-400">
                {durationLabel}
              </span>
            )}
            {expandable && (
              <ChevronDown
                size={12}
                className={cn(
                  'text-slate-400 transition-transform duration-200',
                  open && 'rotate-180 text-[#0E3A75]'
                )}
              />
            )}
          </span>
        </button>

        {!open && step.args && (
          <p className="px-1.5 truncate font-mono text-[10.5px] text-slate-400">
            {typeof step.args === 'string' ? step.args : JSON.stringify(step.args)}
          </p>
        )}

        {expandable && open && (
          <div className="mt-2 space-y-1.5 animate-fade-up-1">
            {step.args && (
              <div className="rounded-xl bg-white border border-[#DCE7F5] p-2 text-[11px] font-mono shadow-2xs">
                <span className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                  <Terminal size={10} />
                  Arguments:
                </span>
                <pre className="text-slate-700 whitespace-pre-wrap break-all leading-relaxed">
                  {typeof step.args === 'string'
                    ? step.args
                    : JSON.stringify(step.args, null, 2)}
                </pre>
              </div>
            )}

            {step.result && (
              <div className="rounded-xl bg-white border border-[#DCE7F5] p-2 text-[11px] font-mono shadow-2xs">
                <span className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-emerald-700 mb-0.5">
                  <Check size={10} strokeWidth={2.5} />
                  Result:
                </span>
                <pre className="text-slate-800 whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto">
                  {typeof step.result === 'string'
                    ? step.result
                    : JSON.stringify(step.result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default AgentSteps;