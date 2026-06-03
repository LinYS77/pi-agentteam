import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { displayMessageType } from '../protocol.js'
import { unreadMailboxMessages } from '../messageLifecycle.js'
import { oneLine } from '../utils.js'
import type { MailboxMessage, TaskReport } from '../internalTypes.js'
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
    hydratedReports?: Record<string, HydratedTaskReport>
    hydrationWarnings?: HydrationWarning[]
  }
}

type HydratedTaskReport = {
  id: string
  taskId: string
  type: TaskReport['type']
  author: string
  text: string
  summary: string
  createdAt: number
  statusAtReport: TaskReport['statusAtReport']
  ownerAtReport?: string
  reportedBlockedBy?: string[]
}

type HydrationWarning = {
  messageId: string
  reportId: string
  reason: 'task_report_not_found'
}

type HydratedMailboxMessage = {
  message: MailboxMessage
  report?: HydratedTaskReport
  warning?: HydrationWarning
}

function clip(text: string, max = PREVIEW_MAX): string {
  const compact = oneLine(text)
  if (compact.length <= max) return compact
  return `${compact.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function metadataReportId(item: MailboxMessage): string | undefined {
  const value = item.metadata?.reportId
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function compactHydratedReport(report: TaskReport): HydratedTaskReport {
  return {
    id: report.id,
    taskId: report.taskId,
    type: report.type,
    author: report.author,
    text: report.text,
    summary: report.summary,
    createdAt: report.createdAt,
    statusAtReport: report.statusAtReport,
    ownerAtReport: report.ownerAtReport,
    reportedBlockedBy: report.reportedBlockedBy,
  }
}

function messagePreview(item: MailboxMessage, report?: HydratedTaskReport): string {
  return clip(report?.summary || item.summary || item.text)
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

function formatReportHydration(report: HydratedTaskReport): string {
  const blockedBy = report.reportedBlockedBy?.length ? `; blockedBy=${report.reportedBlockedBy.join(', ')}` : ''
  return `\n  Hydrated report ${report.id} (${report.type}; statusAtReport=${report.statusAtReport}${blockedBy})\n  Report text:\n${report.text}`
}

function formatCompactMessageItem(item: HydratedMailboxMessage): string {
  const { message, report, warning } = item
  const type = displayMessageType(message.type as string)
  const task = message.taskId ? ` task=${clip(message.taskId, 60)}` : ''
  const thread = message.threadId ? ` thread=${clip(message.threadId, 80)}` : ''
  const priority = message.priority ? ` priority=${message.priority}` : ''
  const wakeHint = message.wakeHint ? ` wakeHint=${message.wakeHint}` : ''
  const reportId = metadataReportId(message)
  const reportTag = reportId ? ` reportId=${clip(reportId, 60)}` : ''
  const summary = message.summary ? ` summary=${clip(message.summary)}` : ''
  const warningText = warning ? ` hydrationWarning=${warning.reason}` : ''
  const hydration = report ? formatReportHydration(report) : ''
  return `  - id=${message.id} [${type}] from=${clip(message.from, 80)}${task}${thread}${priority}${wakeHint}${reportTag}${summary}${warningText} preview=${messagePreview(message, report)}${hydration}`
}

function formatFullMessageItem(item: HydratedMailboxMessage): string {
  const { message, report, warning } = item
  const type = displayMessageType(message.type as string)
  const task = message.taskId ? ` task=${message.taskId}` : ''
  const thread = message.threadId ? ` thread=${message.threadId}` : ''
  const reportId = metadataReportId(message)
  const reportTag = reportId ? ` reportId=${reportId}` : ''
  const warningText = warning ? ` (warning: ${warning.reason})` : ''
  const body = report ? `${message.text}${formatReportHydration(report)}` : message.text
  return `- [${type}] from ${message.from}${task}${thread}${reportTag}${warningText}: ${body}`
}

function formatGroupedMessages(returned: HydratedMailboxMessage[]): string[] {
  const groups: Array<{ label: string, messages: HydratedMailboxMessage[] }> = []
  const byKey = new Map<string, { label: string, messages: HydratedMailboxMessage[] }>()
  for (const item of returned) {
    const key = messageGroupKey(item.message)
    let group = byKey.get(key)
    if (!group) {
      group = { label: messageGroupLabel(item.message), messages: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.messages.push(item)
  }

  const lines = [
    'Grouped by task/thread. Human output is compact; details.messages contains the full returned mailbox messages; details.hydratedReports contains hydrated task-report bodies when referenced.',
  ]
  for (const group of groups) {
    const latest = group.messages[group.messages.length - 1]!
    const countLabel = group.messages.length === 1 ? '1 message' : `${group.messages.length} messages`
    lines.push(`- ${group.label} (${countLabel}; latest preview=${messagePreview(latest.message, latest.report)})`)
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

  const hydratedReports: Record<string, HydratedTaskReport> = {}
  const hydrationWarnings: HydrationWarning[] = []
  const hydratedReturned: HydratedMailboxMessage[] = returned.map(message => {
    const reportId = metadataReportId(message)
    if (!reportId) return { message }
    const report = deps.taskHistory.findTaskReport(team, reportId)
    if (!report) {
      const warning: HydrationWarning = { messageId: message.id, reportId, reason: 'task_report_not_found' }
      hydrationWarnings.push(warning)
      return { message, warning }
    }
    const hydrated = compactHydratedReport(report)
    hydratedReports[report.id] = hydrated
    return { message, report: hydrated }
  })

  const fromSet = new Set(returned.map(item => item.from))
  const fromPreview = [...fromSet].slice(0, 3).join(', ')
  const receipt =
    returned.length === 0
      ? `No unread messages for ${recipient}`
      : returned.length === 1
        ? `Received 1 message from ${returned[0]!.from}`
        : `Received ${returned.length} messages from ${fromPreview}${fromSet.size > 3 ? ', ...' : ''}`

  const detailLines = returned.length <= 1
    ? hydratedReturned.map(formatFullMessageItem)
    : formatGroupedMessages(hydratedReturned)

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
      ...(Object.keys(hydratedReports).length > 0 ? { hydratedReports } : {}),
      ...(hydrationWarnings.length > 0 ? { hydrationWarnings } : {}),
    },
  }
}
