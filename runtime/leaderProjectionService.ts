import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { ensureMailbox } from '../state/mailboxStore.js'
import { getMailboxPath } from '../state/paths.js'
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
import { getSessionFile } from '../session.js'
import { TEAM_LEAD, type TeamMessagePriority, type TeamMessageType, type TeamMessageWakeHint } from '../internalTypes.js'
import { displayMessageType } from '../protocol.js'
import { oneLine } from '../utils.js'
import { isLeaderAttentionMessageType, resetLeaderAttentionThrottle, sendLeaderAttentionMessage } from './leaderAttention.js'
import { watchFileDebounced } from './watchFileDebounced.js'
import type { DebouncedFileWatcher } from './watchFileDebounced.js'

export type LeaderMailboxProjectionWatcher = {
  stop: () => void
}

export type LeaderMailboxProjectionItem = {
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

export type AttachedLeaderSessionContext = {
  context: { teamName: string | null; memberName: string | null }
  source: 'cached' | 'derived' | 'cleared' | 'none'
}

export type LeaderProjectionServiceDeps = {
  attachCurrentSessionIfNeeded(ctx: ExtensionContext): AttachedLeaderSessionContext
  deliverLeaderMailbox(ctx: ExtensionContext): LeaderMailboxProjectionItem[]
}

export type LeaderProjectionService = {
  runMailboxSync: (ctx: ExtensionContext) => void
  startLeaderMailboxProjectionWatcher: (ctx: ExtensionContext, attached?: AttachedLeaderSessionContext) => LeaderMailboxProjectionWatcher | null
  stopLeaderMailboxProjectionWatcher: (ctx: ExtensionContext) => void
  resetMailboxSyncKey: () => void
}

const LEADER_MAILBOX_WATCH_DEBOUNCE_MS = 150
const LEADER_MAILBOX_WATCH_RETRY_MS = 1_000

type ProjectLeaderMailboxMessageResult = {
  projected: boolean
}

function leaderProjectionWatcherKey(sessionFile: string, teamName: string): string {
  return JSON.stringify([sessionFile, teamName])
}

function compactField(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  return oneLine(String(value))
}

function compactLeaderMailboxProjectionContent(item: LeaderMailboxProjectionItem): string {
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

function compactLeaderMailboxProjectionDetails(
  item: LeaderMailboxProjectionItem,
  projectionKey: string,
  generation: string | number,
): Record<string, unknown> {
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

function projectionGeneration(item: LeaderMailboxProjectionItem): string | number {
  return item.requestId ?? item.createdAt
}

function projectedMailboxSetKey(item: LeaderMailboxProjectionItem): string {
  return `${item.teamName}:${item.id}:${projectionGeneration(item)}`
}

function projectLeaderMailboxMessage(
  pi: ExtensionAPI,
  item: LeaderMailboxProjectionItem,
  projectedMailboxIds: Set<string>,
): ProjectLeaderMailboxMessageResult {
  const generation = projectionGeneration(item)
  const projectionKey = `${item.teamName}:${item.id}:${generation}`
  const claimed = claimLeaderProjection(item.teamName, item.id, generation)
  if (!claimed) return { projected: false }
  try {
    const options = { triggerTurn: false }
    pi.sendMessage(
      {
        customType: 'agentteam-mailbox',
        content: compactLeaderMailboxProjectionContent(item),
        display: true,
        details: compactLeaderMailboxProjectionDetails(item, projectionKey, generation),
      },
      options,
    )
    markLeaderProjectionProjected(item.teamName, claimed.projectionKey)
    projectedMailboxIds.add(projectedMailboxSetKey(item))
    return { projected: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    markLeaderProjectionFailed(item.teamName, claimed.projectionKey, message)
    // Best-effort transcript projection only. Leave unprojected so next sync can retry.
    return { projected: false }
  }
}

function isMailboxProjectionComplete(
  item: LeaderMailboxProjectionItem,
  projectedMailboxIds: Set<string>,
): boolean {
  if (projectedMailboxIds.has(projectedMailboxSetKey(item))) return true
  const generation = projectionGeneration(item)
  const projection = getLeaderProjection(item.teamName, item.id, generation)
  if (projection?.status !== 'projected') return false
  projectedMailboxIds.add(projectedMailboxSetKey(item))
  return true
}

function requestLeaderAttentionForProjectedMessage(
  pi: ExtensionAPI,
  item: LeaderMailboxProjectionItem,
): boolean {
  const type = item.type ?? 'inform'
  if (!isLeaderAttentionMessageType(type)) return false
  const generation = projectionGeneration(item)
  const existing = getLeaderAttention(item.teamName, item.id, generation)
  if (existing?.status === 'sent' || existing?.status === 'skipped') return false
  const claimed = claimLeaderAttention(item.teamName, item.id, generation)
  if (!claimed) return false

  const attention = sendLeaderAttentionMessage(pi, item)
  if (attention.ok) {
    markLeaderAttentionSent(item.teamName, claimed.attentionKey)
    return true
  }

  if (attention.reason === 'leader attention sendMessage failed') {
    markLeaderAttentionFailed(item.teamName, claimed.attentionKey, attention.error ?? attention.reason)
    return false
  }

  markLeaderAttentionSkipped(item.teamName, claimed.attentionKey, attention.reason)
  return false
}

export function createLeaderProjectionService(pi: ExtensionAPI, deps: LeaderProjectionServiceDeps): LeaderProjectionService {
  const projectedMailboxIds = new Set<string>()
  const leaderProjectionWatchers = new Map<string, LeaderMailboxProjectionWatcher>()

  function runMailboxSync(ctx: ExtensionContext): void {
    const unread = deps.deliverLeaderMailbox(ctx)
    if (unread.length === 0) return
    let projectedCount = 0
    let attentionCount = 0
    for (const item of unread) {
      if (!isMailboxProjectionComplete(item, projectedMailboxIds)) {
        const result = projectLeaderMailboxMessage(pi, item, projectedMailboxIds)
        if (!result.projected) continue
        projectedCount += 1
      }
      if (requestLeaderAttentionForProjectedMessage(pi, item)) attentionCount += 1
    }
    if (projectedCount > 0) ctx.ui.notify(`agentteam: ${projectedCount} new teammate message(s)${attentionCount > 0 ? '; bounded leader attention requested' : ''}`, 'info')
  }

  function startLeaderMailboxProjectionWatcher(
    ctx: ExtensionContext,
    attached = deps.attachCurrentSessionIfNeeded(ctx),
  ): LeaderMailboxProjectionWatcher | null {
    const { teamName, memberName } = attached.context
    if (!teamName || memberName !== TEAM_LEAD) return null

    const sessionFile = getSessionFile(ctx)
    const key = leaderProjectionWatcherKey(sessionFile, teamName)
    const existing = leaderProjectionWatchers.get(key)
    if (existing) return existing

    ensureMailbox(teamName, TEAM_LEAD)
    const mailboxPath = getMailboxPath(teamName, TEAM_LEAD)
    let fileWatcher: DebouncedFileWatcher | null = null
    const controller: LeaderMailboxProjectionWatcher = {
      stop() {
        fileWatcher?.stop()
        fileWatcher = null
        leaderProjectionWatchers.delete(key)
      },
    }
    leaderProjectionWatchers.set(key, controller)
    fileWatcher = watchFileDebounced(mailboxPath, {
      debounceMs: LEADER_MAILBOX_WATCH_DEBOUNCE_MS,
      retryMs: LEADER_MAILBOX_WATCH_RETRY_MS,
      onChange: () => runMailboxSync(ctx),
    })
    return controller
  }

  function stopLeaderMailboxProjectionWatcher(ctx: ExtensionContext): void {
    const sessionFile = getSessionFile(ctx)
    for (const [key, watcher] of [...leaderProjectionWatchers.entries()]) {
      let parsed: unknown
      try {
        parsed = JSON.parse(key)
      } catch {
        parsed = null
      }
      if (!Array.isArray(parsed) || parsed[0] !== sessionFile) continue
      watcher.stop()
    }
  }

  function resetMailboxSyncKey(): void {
    projectedMailboxIds.clear()
    resetLeaderAttentionThrottle()
  }

  return {
    runMailboxSync,
    startLeaderMailboxProjectionWatcher,
    stopLeaderMailboxProjectionWatcher,
    resetMailboxSyncKey,
  }
}
