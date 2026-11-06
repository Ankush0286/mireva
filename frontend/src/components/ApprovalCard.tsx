import React, { useState } from 'react';
import { Check, X, ShieldAlert, Sparkles, Send, Clock, Loader2 } from 'lucide-react';

const KEYFRAMES = `
@keyframes gc-pop { 0% { opacity: 0; transform: scale(0.88) } 100% { opacity: 1; transform: scale(1) } }
@keyframes gc-slide-up { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }
`;

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export type ApprovalDecision = 'approved' | 'rejected';

export interface ApprovalCardProps {
  title?: string;
  meta?: string;
  badge?: string;
  badgeType?: 'outreach' | 'trigger' | 'campaign' | 'default';
  approveLabel?: string;
  rejectLabel?: string;
  decision?: ApprovalDecision | null;
  onDecide?: (decision: ApprovalDecision) => void | Promise<void>;
  isLoading?: boolean;
  className?: string;
}

export function ApprovalCard({
  title = 'Send test DM to Mark Zuckerberg (@zuck)?',
  meta = 'Agent Tool: request_human_approval',
  badge = 'COLD DM REVIEW',
  badgeType = 'outreach',
  approveLabel = 'Approve & Dispatch',
  rejectLabel = 'Dismiss',
  decision: decisionProp,
  onDecide,
  isLoading = false,
  className,
}: ApprovalCardProps) {
  const [decisionState, setDecisionState] = useState<ApprovalDecision | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const decision = decisionProp !== undefined ? decisionProp : decisionState;

  const badgeStyles = {
    outreach: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    trigger: 'bg-purple-50 text-purple-700 border-purple-200/60',
    campaign: 'bg-blue-50 text-[#0E3A75] border-blue-200/60',
    default: 'bg-amber-50 text-amber-700 border-amber-200/60',
  }[badgeType];

  async function handleDecide(next: ApprovalDecision) {
    if (isLoading || internalLoading) return;
    setInternalLoading(true);
    try {
      setDecisionState(next);
      await onDecide?.(next);
    } finally {
      setInternalLoading(false);
    }
  }

  return (
    <div
      className={cn(
        'w-full rounded-t-[26px] rounded-b-none bg-white/98 backdrop-blur-md border-t border-x border-[#DCE7F5] pt-5 px-5 pb-9 shadow-[0_-8px_32px_rgba(14,58,117,0.10)] font-sans select-none text-[#09122A] animate-[gc-slide-up_260ms_cubic-bezier(0.23,1,0.32,1)_both]',
        className
      )}
    >
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {decision ? (
        <div className="flex flex-col items-center py-2 text-center">
          <span
            className={cn(
              'grid w-8 h-8 place-items-center rounded-xl motion-safe:animate-[gc-pop_220ms_cubic-bezier(0.23,1,0.32,1)_both] shadow-xs',
              decision === 'approved'
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            )}
          >
            {decision === 'approved' ? (
              <Check className="w-4 h-4 text-emerald-600" strokeWidth={3} />
            ) : (
              <X className="w-4 h-4 text-slate-500" strokeWidth={3} />
            )}
          </span>
          <p className="mt-2 text-[13.5px] font-bold text-[#09122A]">
            {decision === 'approved' ? 'Approved — execution queued' : 'Action dismissed'}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-slate-400">
            {meta}
          </p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                  badgeStyles
                )}
              >
                {badgeType === 'outreach' ? <Send size={10} /> : <Sparkles size={10} />}
                <span>{badge}</span>
              </span>

              <span className="flex items-center gap-1 text-[10.5px] font-mono text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                <Clock size={10} />
                <span>Requires Approval</span>
              </span>
            </div>

            <h3 className="text-[15.5px] font-bold tracking-tight text-[#09122A] leading-snug">
              {title}
            </h3>

            <p className="mt-1 font-mono text-[10.5px] text-slate-400 truncate">
              {meta}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              disabled={isLoading || internalLoading}
              onClick={() => handleDecide('rejected')}
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs font-semibold transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {rejectLabel}
            </button>
            <button
              type="button"
              disabled={isLoading || internalLoading}
              onClick={() => handleDecide('approved')}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-bold shadow-xs transition-all hover:scale-[1.01] active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isLoading || internalLoading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Check size={13} strokeWidth={2.5} />
              )}
              <span>{approveLabel}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ApprovalCard;