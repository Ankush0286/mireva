import React, { useEffect, useState } from 'react';

const KEYFRAMES = `
@keyframes gc-pixel-on { 0%, 100% { opacity: 0.15 } 40% { opacity: 1 } }
@keyframes gc-shimmer-text { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
`;

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// 3x3 Grid Delay Calculation
const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i);
  return k === -1 ? null : k * 110;
});

export type LoadingStateVariant = 'Drive' | 'Dots' | 'Orbit';

const PATTERNS: Record<
  LoadingStateVariant,
  { delays: (number | null)[]; dur: number; round: boolean }
> = {
  Drive: { delays: chevron, dur: 650, round: false },
  Dots: { delays: chevron, dur: 650, round: true },
  Orbit: { delays: orbit, dur: 950, round: false },
};

function useElapsed() {
  const [ds, setDs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDs((d) => d + 1), 100);
    return () => clearInterval(t);
  }, []);
  const total = ds / 10;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

export interface LoadingStateProps {
  label?: string;
  variant?: LoadingStateVariant;
  className?: string;
}

export function LoadingState({
  label = 'Agent executing',
  variant = 'Drive',
  className,
}: LoadingStateProps) {
  const elapsed = useElapsed();
  const { delays, dur, round } = PATTERNS[variant] ?? PATTERNS.Drive;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/95 border border-[#DCE7F5] shadow-2xs font-sans select-none text-[#09122A]',
        className
      )}
    >
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* Pixel Art 3x3 Micro Grid (Styled to match your dither aesthetic) */}
      <span aria-hidden className="grid grid-cols-[repeat(3,4px)] gap-[1.5px] text-[#0E3A75]">
        {delays.map((d, i) => (
          <span
            key={i}
            className={cn(
              'w-[4px] h-[4px] bg-current motion-reduce:!animate-none',
              round ? 'rounded-full' : 'rounded-[1px]'
            )}
            style={{
              opacity: d === null ? 0.08 : 0.15,
              animation:
                d === null
                  ? 'none'
                  : `gc-pixel-on ${dur}ms ease-in-out ${d}ms infinite`,
            }}
          />
        ))}
      </span>

      {/* Editorial Navy/Blue Shimmer Text */}
      <span
        className="bg-clip-text text-[12.5px] font-semibold text-transparent motion-reduce:!animate-none motion-reduce:!text-[#0E3A75]"
        style={{
          backgroundImage:
            'linear-gradient(90deg, #64748B 25%, #0E3A75 50%, #64748B 75%)',
          backgroundSize: '200% 100%',
          animation: 'gc-shimmer-text 1.6s linear infinite',
        }}
      >
        {label}
      </span>

      {/* Monospace Elapsed Timer */}
      <span
        role="timer"
        aria-label={`Elapsed time ${elapsed}`}
        className="font-mono text-[11px] tabular-nums text-slate-400 font-medium ml-0.5"
      >
        {elapsed}
      </span>
    </div>
  );
}

export default LoadingState;