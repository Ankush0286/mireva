import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CornerDownLeft, ExternalLink } from 'lucide-react';

const KEYFRAMES = `
@keyframes gc-caret { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
@keyframes gc-msg-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
`;

// ============================================================================
// Types & Utilities
// ============================================================================

export interface Citation {
  id: string;
  index: number;
  title: string;
  url: string;
}

export interface SuggestedPrompt {
  id: string;
  label: string;
  prompt?: string;
}

export type StreamingTextVariant = 'Answer' | 'Sources';

export interface StreamingTextProps {
  text: string;
  streaming?: boolean;
  citations?: Citation[];
  followUps?: SuggestedPrompt[];
  onFollowUp?: (prompt: SuggestedPrompt) => void;
  variant?: StreamingTextVariant;
  className?: string;
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ============================================================================
// Main StreamingText Component (Powered by react-markdown + remark-gfm)
// ============================================================================

export function StreamingText({
  text,
  streaming = false,
  citations = [],
  followUps = [],
  onFollowUp,
  variant = 'Answer',
  className,
}: StreamingTextProps) {
  return (
    <div className={cn('w-full text-[13.5px] font-sans select-text', className)}>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* 1. Rich Markdown Content */}
      <div className="space-y-2.5 leading-[1.7] text-slate-800">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-[18px] font-bold text-[#09122A] tracking-tight mt-4 mb-1.5 first:mt-0">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-[16px] font-bold text-[#09122A] tracking-tight mt-3.5 mb-1.5 first:mt-0">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-[14.5px] font-bold text-[#09122A] mt-3 mb-1 first:mt-0">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-[13.5px] font-bold text-[#0E3A75] mt-2.5 mb-1 first:mt-0">
                {children}
              </h4>
            ),
            p: ({ children }) => (
              <p className="text-slate-800 leading-[1.7] my-1.5 first:mt-0 last:mb-0">
                {children}
              </p>
            ),
            strong: ({ children }) => (
              <strong className="font-bold text-[#09122A]">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="italic text-slate-700">{children}</em>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-5 space-y-1 my-2 text-slate-800 marker:text-[#0E3A75]">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-5 space-y-1 my-2 text-slate-800 marker:font-bold marker:text-[#0E3A75]">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="pl-1 leading-[1.65]">{children}</li>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-3 border-[#2563EB] bg-[#F8FAFD] pl-3.5 pr-3 py-2 my-2 rounded-r-xl text-slate-700 italic">
                {children}
              </blockquote>
            ),
            hr: () => <hr className="my-3 border-[#E2ECF7]" />,
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[#2563EB] hover:text-[#0E3A75] underline underline-offset-2 transition-colors"
              >
                {children}
              </a>
            ),
            code: ({ className: codeClass, children, ...props }) => {
              const isBlock = Boolean(codeClass && codeClass.includes('language-'));
              if (isBlock) {
                return (
                  <code
                    className={cn(
                      'block overflow-x-auto rounded-xl bg-[#09122A] text-slate-100 p-3.5 font-mono text-[12px] leading-relaxed my-2 shadow-xs',
                      codeClass
                    )}
                    {...props}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code
                  className="px-1.5 py-0.5 rounded-md bg-[#F1F6FC] text-[#0E3A75] text-[12px] font-mono border border-[#DCE7F5]"
                  {...props}
                >
                  {children}
                </code>
              );
            },
            pre: ({ children }) => <pre className="my-2 overflow-x-auto">{children}</pre>,
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto rounded-xl border border-[#DCE7F5]">
                <table className="w-full text-left border-collapse text-[12.5px]">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-[#F8FAFD] border-b border-[#DCE7F5] text-[#09122A] font-bold">
                {children}
              </thead>
            ),
            th: ({ children }) => <th className="px-3 py-2">{children}</th>,
            td: ({ children }) => (
              <td className="px-3 py-2 border-t border-[#F0F5FA] text-slate-700">
                {children}
              </td>
            ),
          }}
        >
          {text}
        </ReactMarkdown>

        {streaming && (
          <span
            aria-hidden
            className="inline-block h-[1.05em] w-[2px] translate-y-[0.15em] animate-[gc-caret_1s_steps(1,end)_infinite] bg-[#0E3A75] motion-reduce:animate-none"
          />
        )}
      </div>

      {/* 2. Citations / Sources Section */}
      {!streaming && citations.length > 0 && (
        <div className="mt-3.5 pt-2.5 border-t border-[#F0F5FA] motion-safe:animate-[gc-msg-in_240ms_cubic-bezier(0.23,1,0.32,1)_both]">
          {variant === 'Sources' ? (
            <ul className="space-y-1.5">
              {citations.map((citation) => (
                <li
                  key={citation.id}
                  className="flex items-baseline gap-2 text-[12px] leading-[1.55]"
                >
                  <span className="grid w-4 h-4 shrink-0 translate-y-0.5 place-items-center rounded bg-[#EBF3FC] border border-[#D0E2F7] font-mono text-[9px] font-bold text-[#0E3A75]">
                    {citation.index}
                  </span>
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 group inline-flex items-baseline gap-1.5 hover:underline"
                  >
                    <span className="font-semibold text-[#09122A] group-hover:text-[#0E3A75] truncate">
                      {citation.title}
                    </span>
                    <span className="font-mono text-[10.5px] text-slate-400">
                      {safeHostname(citation.url)}
                    </span>
                    <ExternalLink size={10} className="text-slate-300 group-hover:text-[#0E3A75]" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2">
              <span aria-hidden className="flex -space-x-1">
                {citations.slice(0, 3).map((citation) => (
                  <span
                    key={citation.id}
                    className="grid w-4 h-4 place-items-center rounded-full border border-white bg-[#EBF3FC] font-mono text-[8.5px] font-bold text-[#0E3A75] shadow-2xs"
                  >
                    {citation.index}
                  </span>
                ))}
              </span>
              <span className="font-mono text-[11px] font-medium text-slate-400">
                {citations.length} source{citations.length === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3. Suggested Follow-Ups */}
      {!streaming && followUps.length > 0 && (
        <div className="mt-4 pt-2.5 border-t border-[#F0F5FA]">
          <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Suggested Follow-ups
          </p>
          <ul className="space-y-0.5">
            {followUps.map((prompt, index) => (
              <li
                key={prompt.id}
                className="motion-safe:animate-[gc-msg-in_240ms_cubic-bezier(0.23,1,0.32,1)_both]"
                style={{ animationDelay: `${Math.min(index, 4) * 50}ms` }}
              >
                <button
                  type="button"
                  onClick={() => onFollowUp?.(prompt)}
                  className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-medium text-slate-600 transition-all hover:bg-[#F8FAFD] hover:text-[#0E3A75] active:scale-[0.99] cursor-pointer"
                >
                  <CornerDownLeft className="w-3.5 h-3.5 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[#0E3A75] shrink-0" />
                  <span className="truncate">{prompt.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default StreamingText;