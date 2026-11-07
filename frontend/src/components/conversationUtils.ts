import type { ChatSession } from '../api/client';
import type { ConversationEntry } from './ConversationList';

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
