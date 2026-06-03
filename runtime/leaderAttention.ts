import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { decideMessagePolicy } from '../core/messagePolicy.js'
import { isMessageType, isTaskReportType } from '../core/publicModel.js'
import type { MailboxMessage, TeamMessageType, TeamMessageWakeHint } from '../internalTypes.js'
import { displayMessageType, parsePersistedMessageType } from '../protocol.js'
import { oneLine } from '../utils.js'

export const LEADER_ATTENTION_MESSAGE_TYPE = 'agentteam-leader-attention'
export const LEADER_ATTENTION_THROTTLE_MS = 30_000

export type LeaderAttentionDecision = {
  shouldRequest: boolean
  reason: string
  triggerTurn: boolean
}

export type SendLeaderAttentionResult =
  | { ok: true; reason: string }
  | { ok: false; reason: string; error?: string }

export type LeaderAttentionMessage = {
  id?: string
  teamName: string
  from?: string
  text?: string
  summary?: string
  type?: TeamMessageType
  taskId?: string
  threadId?: string
  requestId?: string
  priority?: MailboxMessage['priority']
  wakeHint?: TeamMessageWakeHint
  createdAt?: number
}

const LAST_ATTENTION_BY_TEAM = new Map<string, number>()

export function resetLeaderAttentionThrottle(): void {
  LAST_ATTENTION_BY_TEAM.clear()
}

export function isLeaderAttentionMessageType(type: TeamMessageType): boolean {
  if (isTaskReportType(type)) {
    return decideMessagePolicy({ kind: 'task_report', reportType: type, recipientKind: 'leader' }).intent === 'leader_attention'
  }
  if (isMessageType(type)) {
    return decideMessagePolicy({ kind: 'message', messageType: type, recipientKind: 'leader' }).intent === 'leader_attention'
  }
  return false
}

export function shouldRequestLeaderAttention(
  input: {
    teamName: string
    type?: TeamMessageType
    wakeHint?: TeamMessageWakeHint
    now?: number
  },
): LeaderAttentionDecision {
  const type = parsePersistedMessageType(input.type)
  const decision = type && isTaskReportType(type)
    ? decideMessagePolicy({ kind: 'task_report', reportType: type, recipientKind: 'leader' })
    : type && isMessageType(type)
      ? decideMessagePolicy({ kind: 'message', messageType: type, recipientKind: 'leader' })
      : undefined
  if (!decision || decision.intent !== 'leader_attention' || !decision.shouldWake) {
    return { shouldRequest: false, reason: `${type ?? 'inform'} does not request leader attention`, triggerTurn: false }
  }
  const wakeHint = input.wakeHint ?? decision.wakeHint
  if (wakeHint === 'none') {
    return { shouldRequest: false, reason: 'wake hint does not require wake', triggerTurn: false }
  }
  const now = input.now ?? Date.now()
  const last = LAST_ATTENTION_BY_TEAM.get(input.teamName) ?? 0
  if (last > 0 && now - last < LEADER_ATTENTION_THROTTLE_MS) {
    return { shouldRequest: false, reason: `leader attention already requested recently for ${input.teamName}`, triggerTurn: false }
  }
  return { shouldRequest: true, reason: `leader attention requested ${type}`, triggerTurn: true }
}

function commitLeaderAttentionThrottle(teamName: string, now: number): void {
  LAST_ATTENTION_BY_TEAM.set(teamName, now)
}

function compactField(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  return oneLine(String(value))
}

function boundedLeaderAttentionPrompt(item: LeaderAttentionMessage): string {
  const type = displayMessageType(item.type)
  return [
    `AgentTeam bounded leader attention wake for ${item.teamName}.`,
    [
      `messageId=${compactField(item.id)}`,
      `type=${compactField(type)}`,
      `from=${compactField(item.from ?? 'teammate')}`,
      `task=${compactField(item.taskId)}`,
      `thread=${compactField(item.threadId)}`,
      `summary=${compactField(item.summary)}`,
      `priority=${compactField(item.priority)}`,
      `wakeHint=${compactField(item.wakeHint)}`,
    ].join(' '),
    'Full directed body/report notification is in the persistent leader mailbox. Call agentteam_receive({ markRead: true }) for full details.',
    'Referenced task report/history artifacts can be inspected with agentteam_task show/history/reports/report.',
    '',
    'Do exactly one bounded attention turn:',
    '1. Call agentteam_receive({ markRead: true }) to read the leader mailbox.',
    '2. Review the referenced task report/history/context as needed.',
    '3. Decide the next explicit leader action or answer the user.',
    '4. Stop. Do not auto-spawn, auto-create downstream tasks, broadcast, or start worker-to-worker chains. Use inform/question only for context unless you intentionally delegate.',
  ].join('\n')
}

export function sendLeaderAttentionMessage(
  pi: Pick<ExtensionAPI, 'sendMessage'>,
  item: LeaderAttentionMessage,
): SendLeaderAttentionResult {
  const now = Date.now()
  const decision = shouldRequestLeaderAttention({
    teamName: item.teamName,
    type: item.type,
    wakeHint: item.wakeHint,
    now,
  })
  if (!decision.shouldRequest) return { ok: false, reason: decision.reason }
  try {
    pi.sendMessage(
      {
        customType: LEADER_ATTENTION_MESSAGE_TYPE,
        content: boundedLeaderAttentionPrompt(item),
        display: true,
        details: {
          id: item.id,
          teamName: item.teamName,
          from: item.from,
          summary: item.summary,
          type: item.type,
          taskId: item.taskId,
          threadId: item.threadId,
          requestId: item.requestId,
          priority: item.priority,
          wakeHint: item.wakeHint,
          createdAt: item.createdAt,
          bounded: true,
          compact: true,
          attentionReason: decision.reason,
          triggerTurn: decision.triggerTurn,
        },
      },
      { triggerTurn: decision.triggerTurn, deliverAs: 'followUp' },
    )
    commitLeaderAttentionThrottle(item.teamName, now)
    return { ok: true, reason: decision.reason }
  } catch (error) {
    return { ok: false, reason: 'leader attention sendMessage failed', error: error instanceof Error ? error.message : String(error) }
  }
}
