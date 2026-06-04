import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { decideMessagePolicy } from '../core/messagePolicy.js'
import { isMessageType, isTaskReportType } from '../core/publicModel.js'
import type { MailboxMessage, TeamMessagePriority, TeamMessageType, TeamMessageWakeHint } from '../internalTypes.js'
import {
  claimLeaderProjection,
  getLeaderProjection,
  markLeaderProjectionFailed,
  markLeaderProjectionProjected,
} from '../state/leaderProjectionStore.js'
import {
  claimLeaderAttention,
  getLeaderAttention,
  markLeaderAttentionFailed,
  markLeaderAttentionSent,
  markLeaderAttentionSkipped,
} from '../state/leaderAttentionStore.js'
import { displayMessageType, normalizePriority, parsePersistedMessageType } from '../protocol.js'
import { oneLine } from '../utils.js'
import {
  isLeaderAttentionMessageType,
  resetLeaderAttentionThrottle,
  sendLeaderAttentionMessage as sendNativeLeaderAttentionMessage,
  type SendLeaderAttentionResult,
} from './leaderAttention.js'

export type LeaderMailboxSignalSourceMessage = Pick<MailboxMessage,
  | 'id'
  | 'from'
  | 'text'
  | 'summary'
  | 'taskId'
  | 'threadId'
  | 'requestId'
  | 'replyTo'
  | 'priority'
  | 'wakeHint'
  | 'createdAt'
> & { type?: unknown }

export type LeaderMailboxSignalItem = {
  id: string
  teamName: string
  from: string
  text: string
  summary?: string
  type?: TeamMessageType
  taskId?: string
  threadId?: string
  requestId?: string
  replyTo?: string
  priority?: TeamMessagePriority
  wakeHint?: TeamMessageWakeHint
  createdAt: number
}

export type LeaderMailboxProjectionDetails = {
  id: string
  teamName: string
  from: string
  summary?: string
  type?: TeamMessageType
  taskId?: string
  threadId?: string
  requestId?: string
  replyTo?: string
  priority?: TeamMessagePriority
  wakeHint?: TeamMessageWakeHint
  createdAt: number
  projectionKey: string
  generation: string | number
  bridgeOnly: true
  compact: true
}

export type LeaderMailboxSignalSyncResult = {
  projectedCount: number
  attentionCount: number
}

export type LeaderMailboxProjectionStorePort = {
  claimLeaderProjection: typeof claimLeaderProjection
  getLeaderProjection: typeof getLeaderProjection
  markLeaderProjectionProjected: typeof markLeaderProjectionProjected
  markLeaderProjectionFailed: typeof markLeaderProjectionFailed
}

export type LeaderMailboxAttentionStorePort = {
  claimLeaderAttention: typeof claimLeaderAttention
  getLeaderAttention: typeof getLeaderAttention
  markLeaderAttentionSent: typeof markLeaderAttentionSent
  markLeaderAttentionFailed: typeof markLeaderAttentionFailed
  markLeaderAttentionSkipped: typeof markLeaderAttentionSkipped
}

export type LeaderMailboxSignalAttentionPort = {
  isLeaderAttentionMessageType(type: TeamMessageType): boolean
  sendLeaderAttentionMessage(item: LeaderMailboxSignalItem): SendLeaderAttentionResult
  resetLeaderAttentionThrottle(): void
}

export type LeaderMailboxSignalRuntimeDeps = {
  nativeSender: Pick<ExtensionAPI, 'sendMessage'>
  projectionStore?: LeaderMailboxProjectionStorePort
  attentionStore?: LeaderMailboxAttentionStorePort
  attention?: LeaderMailboxSignalAttentionPort
}

export type LeaderMailboxSignalRuntime = {
  sync(items: readonly LeaderMailboxSignalItem[]): LeaderMailboxSignalSyncResult
  resetVolatileState(): void
}

type ProjectLeaderMailboxMessageResult = {
  projected: boolean
}

const DEFAULT_PROJECTION_STORE: LeaderMailboxProjectionStorePort = {
  claimLeaderProjection,
  getLeaderProjection,
  markLeaderProjectionProjected,
  markLeaderProjectionFailed,
}

const DEFAULT_ATTENTION_STORE: LeaderMailboxAttentionStorePort = {
  claimLeaderAttention,
  getLeaderAttention,
  markLeaderAttentionSent,
  markLeaderAttentionFailed,
  markLeaderAttentionSkipped,
}

function compactField(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  return oneLine(String(value))
}

export function leaderMailboxSignalGeneration(item: Pick<LeaderMailboxSignalItem, 'requestId' | 'createdAt'>): string | number {
  return item.requestId ?? item.createdAt
}

export function leaderMailboxSignalKey(teamName: string, messageId: string, generation: string | number): string {
  return `${teamName}:${messageId}:${generation}`
}

function leaderMailboxSignalWakeHint(type: TeamMessageType | null, wakeHint?: TeamMessageWakeHint): TeamMessageWakeHint {
  if (wakeHint) return wakeHint
  const decision = type && isTaskReportType(type)
    ? decideMessagePolicy({ kind: 'task_report', reportType: type, recipientKind: 'leader' })
    : type && isMessageType(type)
      ? decideMessagePolicy({ kind: 'message', messageType: type, recipientKind: 'leader' })
      : undefined
  return decision?.wakeHint ?? 'none'
}

export function leaderMailboxSignalItemFromMailboxMessage(
  teamName: string,
  message: LeaderMailboxSignalSourceMessage,
): LeaderMailboxSignalItem {
  const type = parsePersistedMessageType(message.type)
  return {
    id: message.id,
    teamName,
    from: message.from,
    text: message.text,
    summary: message.summary,
    type: type ?? undefined,
    taskId: message.taskId,
    threadId: message.threadId,
    requestId: message.requestId,
    replyTo: message.replyTo,
    priority: normalizePriority(message.priority),
    wakeHint: leaderMailboxSignalWakeHint(type, message.wakeHint),
    createdAt: message.createdAt,
  }
}

export function compactLeaderMailboxProjectionContent(item: LeaderMailboxSignalItem): string {
  return [
    'AgentTeam leader mailbox notification.',
    [
      `id=${compactField(item.id)}`,
      `type=${compactField(displayMessageType(item.type))}`,
      `from=${compactField(item.from)}`,
      `task=${compactField(item.taskId)}`,
      `thread=${compactField(item.threadId)}`,
      `summary=${compactField(item.summary)}`,
      `priority=${compactField(item.priority)}`,
      `wakeHint=${compactField(item.wakeHint)}`,
    ].join(' '),
    'Full directed body/report notification is in the persistent mailbox. Call agentteam_receive({ markRead: true }) for full details; use agentteam_task show/history/reports/report for referenced task artifacts.',
  ].join('\n')
}

export function compactLeaderMailboxProjectionDetails(
  item: LeaderMailboxSignalItem,
  projectionKey: string,
  generation: string | number,
): LeaderMailboxProjectionDetails {
  return {
    id: item.id,
    teamName: item.teamName,
    from: item.from,
    summary: item.summary,
    type: item.type,
    taskId: item.taskId,
    threadId: item.threadId,
    requestId: item.requestId,
    replyTo: item.replyTo,
    priority: item.priority,
    wakeHint: item.wakeHint,
    createdAt: item.createdAt,
    projectionKey,
    generation,
    bridgeOnly: true,
    compact: true,
  }
}

function projectedMailboxSetKey(item: LeaderMailboxSignalItem): string {
  return leaderMailboxSignalKey(item.teamName, item.id, leaderMailboxSignalGeneration(item))
}

function projectLeaderMailboxMessage(
  nativeSender: Pick<ExtensionAPI, 'sendMessage'>,
  projectionStore: LeaderMailboxProjectionStorePort,
  item: LeaderMailboxSignalItem,
  projectedMailboxIds: Set<string>,
): ProjectLeaderMailboxMessageResult {
  const generation = leaderMailboxSignalGeneration(item)
  const projectionKey = leaderMailboxSignalKey(item.teamName, item.id, generation)
  const claimed = projectionStore.claimLeaderProjection(item.teamName, item.id, generation)
  if (!claimed) return { projected: false }
  try {
    const options = { triggerTurn: false }
    nativeSender.sendMessage(
      {
        customType: 'agentteam-mailbox',
        content: compactLeaderMailboxProjectionContent(item),
        display: true,
        details: compactLeaderMailboxProjectionDetails(item, projectionKey, generation),
      },
      options,
    )
    projectionStore.markLeaderProjectionProjected(item.teamName, claimed.projectionKey)
    projectedMailboxIds.add(projectedMailboxSetKey(item))
    return { projected: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    projectionStore.markLeaderProjectionFailed(item.teamName, claimed.projectionKey, message)
    // Best-effort transcript projection only. Leave unprojected so next sync can retry.
    return { projected: false }
  }
}

function isMailboxProjectionComplete(
  projectionStore: LeaderMailboxProjectionStorePort,
  item: LeaderMailboxSignalItem,
  projectedMailboxIds: Set<string>,
): boolean {
  if (projectedMailboxIds.has(projectedMailboxSetKey(item))) return true
  const generation = leaderMailboxSignalGeneration(item)
  const projection = projectionStore.getLeaderProjection(item.teamName, item.id, generation)
  if (projection?.status !== 'projected') return false
  projectedMailboxIds.add(projectedMailboxSetKey(item))
  return true
}

function requestLeaderAttentionForProjectedMessage(
  attentionStore: LeaderMailboxAttentionStorePort,
  attention: LeaderMailboxSignalAttentionPort,
  item: LeaderMailboxSignalItem,
): boolean {
  const type = item.type ?? 'inform'
  if (!attention.isLeaderAttentionMessageType(type)) return false
  const generation = leaderMailboxSignalGeneration(item)
  const existing = attentionStore.getLeaderAttention(item.teamName, item.id, generation)
  if (existing?.status === 'sent' || existing?.status === 'skipped') return false
  const claimed = attentionStore.claimLeaderAttention(item.teamName, item.id, generation)
  if (!claimed) return false

  const result = attention.sendLeaderAttentionMessage(item)
  if (result.ok) {
    attentionStore.markLeaderAttentionSent(item.teamName, claimed.attentionKey)
    return true
  }

  if (result.reason === 'leader attention sendMessage failed') {
    attentionStore.markLeaderAttentionFailed(item.teamName, claimed.attentionKey, result.error ?? result.reason)
    return false
  }

  attentionStore.markLeaderAttentionSkipped(item.teamName, claimed.attentionKey, result.reason)
  return false
}

export function createLeaderMailboxSignalRuntime(deps: LeaderMailboxSignalRuntimeDeps): LeaderMailboxSignalRuntime {
  const projectedMailboxIds = new Set<string>()
  const projectionStore = deps.projectionStore ?? DEFAULT_PROJECTION_STORE
  const attentionStore = deps.attentionStore ?? DEFAULT_ATTENTION_STORE
  const attention = deps.attention ?? {
    isLeaderAttentionMessageType,
    sendLeaderAttentionMessage: (item: LeaderMailboxSignalItem) => sendNativeLeaderAttentionMessage(deps.nativeSender, item),
    resetLeaderAttentionThrottle,
  }

  function sync(items: readonly LeaderMailboxSignalItem[]): LeaderMailboxSignalSyncResult {
    let projectedCount = 0
    let attentionCount = 0
    for (const item of items) {
      if (!isMailboxProjectionComplete(projectionStore, item, projectedMailboxIds)) {
        const result = projectLeaderMailboxMessage(deps.nativeSender, projectionStore, item, projectedMailboxIds)
        if (!result.projected) continue
        projectedCount += 1
      }
      if (requestLeaderAttentionForProjectedMessage(attentionStore, attention, item)) attentionCount += 1
    }
    return { projectedCount, attentionCount }
  }

  function resetVolatileState(): void {
    projectedMailboxIds.clear()
    attention.resetLeaderAttentionThrottle()
  }

  return { sync, resetVolatileState }
}
