import {
  markMailboxMessagesDelivered,
  markMailboxMessagesRead,
  readMailbox,
} from '../state.js'
import { normalizeMessageType } from '../protocol.js'
import { unreadMailboxMessages } from '../messageLifecycle.js'
import type { ToolHandlerDeps } from './shared.js'
import type { TeamReceiveInput } from './messageTypes.js'
import type { ExtensionContext } from '@mariozechner/pi-coding-agent'

export function executeReceiveMessages(
  params: TeamReceiveInput,
  ctx: ExtensionContext,
  deps: ToolHandlerDeps,
) {
  const team = deps.ensureTeamForSession(ctx)
  if (!team) {
    return { content: [{ type: 'text', text: 'No current team context.' }], details: {} }
  }
  const recipient = deps.currentActor(ctx)
  if (!team.members[recipient]) {
    return {
      content: [{ type: 'text', text: `Current actor ${recipient} is not a member of team ${team.name}.` }],
      details: { recipient, teamName: team.name },
    }
  }

  const limit = Math.max(1, Math.min(50, Math.floor(params.limit ?? 8)))
  const markRead = params.markRead !== false

  const unread = unreadMailboxMessages(readMailbox(team.name, recipient))
    .sort((a, b) => a.createdAt - b.createdAt)
  const returned = unread.slice(0, limit)
  const returnedIds = returned.map(item => item.id)

  if (returned.length > 0) {
    markMailboxMessagesDelivered(team.name, recipient, returnedIds)
  }
  if (markRead && returned.length > 0) {
    markMailboxMessagesRead(team.name, recipient, returnedIds)
  }

  const fromSet = new Set(returned.map(item => item.from))
  const fromPreview = [...fromSet].slice(0, 3).join(', ')
  const receipt =
    returned.length === 0
      ? `No unread messages for ${recipient}`
      : returned.length === 1
        ? `Received 1 message from ${returned[0]!.from}`
        : `Received ${returned.length} messages from ${fromPreview}${fromSet.size > 3 ? ', ...' : ''}`

  const detailLines = returned.map(item => {
    const type = normalizeMessageType(item.type as string)
    const task = item.taskId ? ` task=${item.taskId}` : ''
    const thread = item.threadId ? ` thread=${item.threadId}` : ''
    const summary = item.summary ?? item.text
    return `- [${type}] from ${item.from}${task}${thread}: ${summary}`
  })

  return {
    content: [{
      type: 'text',
      text: returned.length > 0
        ? `${receipt}\n${detailLines.join('\n')}`
        : receipt,
    }],
    details: {
      recipient,
      unreadCount: unread.length,
      returnedCount: returned.length,
      markRead,
      messages: returned,
    },
  }
}
