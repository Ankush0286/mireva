import React, { useState } from 'react';
import { MessageSquare, Pin, Trash2 } from 'lucide-react';
import type { ChatSession } from '../api/client';

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export interface ConversationEntry {
  id: string;
  title: string;
  group: string;
  pinned?: boolean;
}

export type ConversationListVariant = 'Default' | 'Compact';

export interface ConversationListProps {
  conversations: ConversationEntry[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onDelete?: (id: string) => void;
  variant?: ConversationListVariant;
  className?: string;
}

export function groupSessionsByDate(
  sessions: ChatSession[],
  pinnedIds: Set<string> = new Set()
): ConversationEntry[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const sevenDaysAgo = today - 7 * 86400000;

  return sessions.map((sess) => {
    const isPinned = pinnedIds.has(sess.id) || Boolean(sess.extra_metadata?.pinned);
    if (isPinned) {
      return { id: sess.id, title: sess.title, group: 'Pinned', pinned: true };
    }

    const sessTime = new Date(sess.updated_at || sess.created_at).getTime();
    let group = 'Older';
    if (sessTime >= today) {
      group = 'Today';
    } else if (sessTime >= yesterday) {
      group = 'Yesterday';
    } else if (sessTime >= sevenDaysAgo) {
      group = 'Previous 7 Days';
    }

    return { id: sess.id, title: sess.title, group, pinned: false };
  });
}

export function ConversationList({
  conversations,
  activeId: activeProp,
  onSelect,
  onTogglePin,
  onDelete,
  variant = 'Default',
  className,
}: ConversationListProps) {
  const [activeState, setActiveState] = useState(conversations[0]?.id);
  const [pins, setPins] = useState<Set<string>>(
    () => new Set(conversations.filter((c) => c.pinned).map((c) => c.id))
  );

  const active = activeProp !== undefined ? activeProp : activeState;
  const compact = variant === 'Compact';

  function select(id: string) {
    setActiveState(id);
    onSelect?.(id);
  }

  function togglePin(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setPins((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    onTogglePin?.(id);
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    onDelete?.(id);
  }

  const groups: string[] = [];
  for (const conversation of conversations) {
    if (!groups.includes(conversation.group)) groups.push(conversation.group);
  }

  return (
    <nav
      aria-label="Conversation History"
      className={cn(
        'w-full max-w-[320px] rounded-[20px] bg-white/95 border border-[#DCE7F5] p-2 shadow-2xs font-sans select-none text-[#09122A]',
        className
      )}
    >
      {groups.map((group) => (
        <div key={group} className="[&:not(:first-child)]:mt-3">
          <p className="px-2 pb-1 font-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
            {group}
          </p>
          <ul className="space-y-0.5">
            {conversations
              .filter((conversation) => conversation.group === group)
              .map((conversation) => {
                const isActive = conversation.id === active;
                const pinned = pins.has(conversation.id);

                return (
                  <li key={conversation.id} className="group/item relative">
                    <button
                      type="button"
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => select(conversation.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xl px-2.5 text-left transition-all duration-150 cursor-pointer',
                        compact ? 'py-1.5' : 'py-2',
                        isActive
                          ? 'bg-[#EBF3FC] text-[#0E3A75] font-semibold shadow-2xs'
                          : 'text-slate-600 hover:bg-[#F8FAFD] hover:text-[#09122A]'
                      )}
                    >
                      <MessageSquare
                        className={cn(
                          'w-3.5 h-3.5 shrink-0 transition-colors',
                          isActive ? 'text-[#0E3A75]' : 'text-slate-400 group-hover/item:text-slate-600'
                        )}
                      />
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate pr-14',
                          compact ? 'text-[11.5px]' : 'text-[12.5px]',
                          isActive ? 'font-semibold text-[#0E3A75]' : 'text-slate-600'
                        )}
                      >
                        {conversation.title}
                      </span>
                    </button>

                    {/* Action Buttons (Pin & Delete) */}
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={pinned ? `Unpin ${conversation.title}` : `Pin ${conversation.title}`}
                        aria-pressed={pinned}
                        onClick={(e) => togglePin(conversation.id, e)}
                        title={pinned ? 'Unpin chat' : 'Pin chat'}
                        className={cn(
                          'grid w-6 h-6 place-items-center rounded-lg cursor-pointer transition-all duration-150 active:scale-90',
                          pinned
                            ? 'text-[#0E3A75] bg-blue-50/80 hover:bg-blue-100 opacity-100'
                            : 'text-slate-300 opacity-0 group-hover/item:opacity-100 hover:text-slate-600 hover:bg-slate-100'
                        )}
                      >
                        <Pin className={cn('w-3 h-3', pinned && 'fill-current')} />
                      </button>

                      {onDelete && (
                        <button
                          type="button"
                          aria-label={`Delete ${conversation.title}`}
                          onClick={(e) => handleDelete(conversation.id, e)}
                          title="Delete chat"
                          className="grid w-6 h-6 place-items-center rounded-lg text-slate-300 opacity-0 group-hover/item:opacity-100 hover:text-rose-600 hover:bg-rose-50 transition-all duration-150 active:scale-90 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default ConversationList;