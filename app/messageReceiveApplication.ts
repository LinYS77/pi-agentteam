import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { displayMessageType } from '../protocol.js'
import { unreadMailboxMessages } from '../messageLifecycle.js'
import { oneLine } from '../utils.js'
import type { MailboxMessage } from '../internalTypes.js'
import type { MessageReceiveApplicationDeps } from './types.js'

const PREVIEW_MAX = 120

export type ReceiveMessagesApplicationInput = {
  markRead?: boolean
  limit?: number
}

export type ReceiveMessagesApplicationResult = {
  text: string
  details: {
    recipient?: string
    teamName?: string
    unreadCount?: number
    returnedCount?: number
    markRead?: boolean
    messages?: MailboxMessage[]
  }
}

function clip(text: string, max = PREVIEW_MAX): string {
  const compact = oneLine(text)
  if (compact.length <= max) return compact
  return `${compact.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function messagePreview(item: MailboxMessage): string {
  return clip(item.summary || item.text)
}

function messageGroupLabel(item: MailboxMessage): string {
  const task = item.taskId ? `task=${clip(item.taskId, 60)}` : ''
  const thread = item.threadId ? `thread=${clip(item.threadId, 80)}` : ''
  const label = [task, thread].filter(Boolean).join(' ')
  return label || 'unscoped'
}

function messageGroupKey(item: MailboxMessage): string {
  return `${item.taskId || ''}\u0000${item.threadId || ''}`
}

function formatCompactMessageItem(item: MailboxMessage): string {
  const type = displayMessageType(item.type as string)
  const task = item.taskId ? ` task=${clip(item.taskId, 60)}` : ''
  const thread = item.threadId ? ` thread=${clip(item.threadId, 80)}` : ''
  const priority = item.priority ? ` priority=${item.priority}` : ''
  const wakeHint = item.wakeHint ? ` wakeHint=${item.wakeHint}` : ''
  const summary = item.summary ? ` summary=${clip(item.summary)}` : ''
  return `  - id=${item.id} [${type}] from=${clip(item.from, 80)}${task}${thread}${priority}${wakeHint}${summary} preview=${messagePreview(item)}`
}

function formatFullMessageItem(item: MailboxMessage): string {
  const type = displayMessageType(item.type as string)
  const task = item.taskId ? ` task=${item.taskId}` : ''
  const thread = item.threadId ? ` thread=${item.threadId}` : ''
  return `- [${type}] from ${item.from}${task}${thread}: ${item.text}`
}

function formatGroupedMessages(returned: MailboxMessage[]): string[] {
  const groups: Array<{ label: string, messages: MailboxMessage[] }> = []
  const byKey = new Map<string, { label: string, messages: MailboxMessage[] }>()
  for (const item of returned) {
    const key = messageGroupKey(item)
    let group = byKey.get(key)
    if (!group) {
      group = { label: messageGroupLabel(item), messages: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.messages.push(item)
  }

  const lines = [
    'Grouped by task/thread. Human output is compact; details.messages contains the full returned mailbox messages.',
  ]
  for (const group of groups) {
    const latest = group.messages[group.messages.length - 1]!
    const countLabel = group.messages.length === 1 ? '1 message' : `${group.messages.length} messages`
    lines.push(`- ${group.label} (${countLabel}; latest preview=${messagePreview(latest)})`)
    for (const item of group.messages) {
      lines.push(formatCompactMessageItem(item))
    }
  }
  return lines
}

export function executeReceiveMessagesApplication(
  input: { params: ReceiveMessagesApplicationInput; ctx: ExtensionContext },
  deps: MessageReceiveApplicationDeps,
): ReceiveMessagesApplicationResult {
  const { params, ctx } = input
  const team = deps.ensureTeamForSession(ctx)
  if (!team) {
    return { text: 'No current team context.', details: {} }
  }
  const recipient = deps.currentActor(ctx)
  if (!team.members[recipient]) {
    return {
      text: `Current actor ${recipient} is not a member of team ${team.name}.`,
      details: { recipient, teamName: team.name },
    }
  }

  const limit = Math.max(1, Math.min(50, Math.floor(params.limit ?? 8)))
  const markRead = params.markRead !== false

  const unread = unreadMailboxMessages(deps.mailboxRepository.readMailbox(team.name, recipient))
    .sort((a, b) => a.createdAt - b.createdAt)
  const returned = unread.slice(0, limit)
  const returnedIds = returned.map(item => item.id)

  if (returned.length > 0) {
    deps.mailboxRepository.markDelivered(team.name, recipient, returnedIds)
  }
  if (markRead && returned.length > 0) {
    deps.mailboxRepository.markRead(team.name, recipient, returnedIds)
  }

  const fromSet = new Set(returned.map(item => item.from))
  const fromPreview = [...fromSet].slice(0, 3).join(', ')
  const receipt =
    returned.length === 0
      ? `No unread messages for ${recipient}`
      : returned.length === 1
        ? `Received 1 message from ${returned[0]!.from}`
        : `Received ${returned.length} messages from ${fromPreview}${fromSet.size > 3 ? ', ...' : ''}`

  const detailLines = returned.length <= 1
    ? returned.map(formatFullMessageItem)
    : formatGroupedMessages(returned)

  return {
    text: returned.length > 0
      ? `${receipt}\n${detailLines.join('\n')}`
      : receipt,
    details: {
      recipient,
      unreadCount: unread.length,
      returnedCount: returned.length,
      markRead,
      messages: returned,
    },
  }
}
