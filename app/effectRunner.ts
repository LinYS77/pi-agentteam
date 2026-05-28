import type { TeamMessageType, TeamState } from '../internalTypes.js'
import { appendTaskNote, appendTeamEvent } from '../state/taskStore.js'
import { appendCommunicationRefNote, isCommunicationReferenceNote } from '../state/taskNotes.js'
import { pushMailboxMessage, readMailbox } from '../state/mailboxStore.js'
import { readTeamState, updateTeamState } from '../state/teamStore.js'
import { validatePersistedMailbox } from '../state/validation.js'
import type { DeliveryResult } from './deliveryTypes.js'
import {
  claimOutboxEffects,
  markOutboxEffectDone,
  markOutboxEffectFailed,
} from '../state/outboxStore.js'
import type { OutboxEffect } from './outbox.js'

export type OutboxEffectRunnerDeps = {
  pushMailboxMessage?: typeof pushMailboxMessage
  requestWorkerDelivery: (
    team: TeamState,
    memberName: string,
    explicitTask?: string,
    options?: {
      requestedBy?: string
      reason?: string
      messageIds?: string[]
      wakeHint?: 'none' | 'soft' | 'hard'
    },
  ) => Promise<DeliveryResult>
  requestLeaderAttentionIfNeeded: (team: TeamState, message: {
    type?: TeamMessageType
    wakeHint?: 'none' | 'soft' | 'hard'
    from?: string
    summary?: string
    text?: string
    messageId?: string
    taskId?: string
    threadId?: string
  }) => Promise<DeliveryResult>
  appendTeamEvent?: typeof appendTeamEvent
  readTeamState?: typeof readTeamState
  now?: () => number
}

function mailboxIdFromPayload(effectId: string, payload: OutboxEffect<'inbox_item_append_requested'>['payload']): string {
  const existing = payload.message.metadata?.outboxMailboxId
  return typeof existing === 'string' && existing.trim() ? existing.trim() : `mailbox-${effectId}`
}

export type RunOutboxInput = {
  teamName: string
  workerId: string
  limit?: number
  claimTtlMs?: number
  now?: number
  effectIds?: string[]
}

export type OutboxRunResult = {
  claimed: number
  done: number
  failed: number
  retried: number
  terminalFailed: number
  results: OutboxRunEffectResult[]
}

export type OutboxRunEffectResult = {
  effectId: string
  kind: OutboxEffect['kind']
  ok: boolean
  terminal?: boolean
  error?: string
  value?: unknown
}

async function executeOutboxEffect(effect: OutboxEffect, deps: OutboxEffectRunnerDeps): Promise<unknown> {
  switch (effect.kind) {
    case 'inbox_item_append_requested': {
      const payload = effect.payload as OutboxEffect<'inbox_item_append_requested'>['payload']
      const invalid = validatePersistedMailbox([payload.message], `outbox:${effect.effectId}`)
      if (invalid.length > 0) throw new Error(`Unsupported outbox mailbox payload: ${invalid[0]?.field}=${String(invalid[0]?.value)}`)
      const deterministicId = mailboxIdFromPayload(effect.effectId, payload)
      const existing = readMailbox(payload.teamName, payload.recipient).find(item => item.id === deterministicId)
      if (existing) return existing
      const push = deps.pushMailboxMessage ?? pushMailboxMessage
      return push(payload.teamName, payload.recipient, {
        ...payload.message,
        id: deterministicId,
        metadata: {
          ...(payload.message.metadata ?? {}),
          outboxEffectId: effect.effectId,
          outboxMailboxId: deterministicId,
        },
      })
    }
    case 'worker_delivery_requested': {
      const payload = effect.payload as OutboxEffect<'worker_delivery_requested'>['payload']
      const readTeam = deps.readTeamState ?? readTeamState
      const team = readTeam(payload.teamName)
      if (!team) throw new Error(`Team ${payload.teamName} not found for outbox worker delivery`)
      return deps.requestWorkerDelivery(team, payload.memberName, payload.explicitTask, payload.options)
    }
    case 'leader_attention_requested': {
      const payload = effect.payload as OutboxEffect<'leader_attention_requested'>['payload']
      const readTeam = deps.readTeamState ?? readTeamState
      const team = readTeam(payload.teamName)
      if (!team) throw new Error(`Team ${payload.teamName} not found for outbox leader attention`)
      return deps.requestLeaderAttentionIfNeeded(team, payload.message)
    }
    case 'task_note_append_requested': {
      const payload = effect.payload as OutboxEffect<'task_note_append_requested'>['payload']
      const updated = updateTeamState(payload.teamName, latest => {
        const task = latest.tasks[payload.taskId]
        if (!task) throw new Error(`task not found: ${payload.taskId}`)
        const linkedMessageId = payload.details?.linkedMessageId
        const communicationRef = isCommunicationReferenceNote({
          at: 0,
          author: payload.author,
          text: payload.text,
          threadId: payload.details?.threadId,
          messageType: payload.details?.messageType,
          linkedMessageId,
          metadata: payload.details?.metadata,
          hidden: payload.details?.hidden,
        })
        const duplicate = linkedMessageId
          ? task.notes.some(note => note.linkedMessageId === linkedMessageId)
          : task.notes.some(note => note.author === payload.author && note.text === payload.text)
        if (duplicate) return
        if (communicationRef && linkedMessageId) {
          appendCommunicationRefNote(task, {
            author: payload.author,
            linkedMessageId,
            messageType: payload.details?.messageType,
            threadId: payload.details?.threadId,
            metadata: payload.details?.metadata,
          })
          return
        }
        if (payload.details?.hidden) {
          appendTaskNote(task, payload.author, payload.text, {
            ...payload.details,
            metadata: {
              ...(payload.details.metadata ?? {}),
              hidden: true,
            },
          })
          return
        }
        appendTaskNote(task, payload.author, payload.text, payload.details)
      })
      if (!updated) throw new Error(`Team ${payload.teamName} not found for outbox task note append`)
      return { taskId: payload.taskId }
    }
    case 'append_event_requested': {
      const payload = effect.payload as OutboxEffect<'append_event_requested'>['payload']
      const append = deps.appendTeamEvent ?? appendTeamEvent
      let eventId: string | undefined
      const updated = updateTeamState(payload.teamName, latest => {
        const event = append(latest, {
          id: `outbox-event-${effect.effectId}`,
          at: (deps.now ?? Date.now)(),
          ...payload.event,
        })
        eventId = event.id
      })
      if (!updated) throw new Error(`Team ${payload.teamName} not found for outbox event append`)
      return { eventId }
    }
    default: {
      const exhaustive: never = effect.kind
      throw new Error(`Unsupported outbox effect kind ${String(exhaustive)}`)
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function resultFailed(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const maybe = value as { ok?: unknown; error?: unknown; reason?: unknown; requestId?: unknown }
  if (maybe.ok !== false) return null
  if (typeof maybe.requestId === 'string' && maybe.requestId.trim()) return null
  return typeof maybe.error === 'string'
    ? maybe.error
    : typeof maybe.reason === 'string'
      ? maybe.reason
      : 'outbox effect reported failure'
}

export async function runOutboxOnce(input: RunOutboxInput, deps: OutboxEffectRunnerDeps): Promise<OutboxRunResult> {
  const now = input.now ?? (deps.now ?? Date.now)()
  const claimed = claimOutboxEffects({
    teamName: input.teamName,
    workerId: input.workerId,
    limit: input.limit,
    claimTtlMs: input.claimTtlMs,
    now,
    effectIds: input.effectIds,
  })
  const summary: OutboxRunResult = {
    claimed: claimed.length,
    done: 0,
    failed: 0,
    retried: 0,
    terminalFailed: 0,
    results: [],
  }

  for (const effect of claimed) {
    const claimId = effect.claim?.claimId
    try {
      const result = await executeOutboxEffect(effect, deps)
      const reportedFailure = resultFailed(result)
      if (reportedFailure) {
        const failed = markOutboxEffectFailed({
          teamName: input.teamName,
          effectId: effect.effectId,
          claimId,
          error: reportedFailure,
          result,
          now: input.now ?? (deps.now ?? Date.now)(),
        })
        const terminal = failed?.status === 'failed'
        summary.failed += 1
        summary.terminalFailed += terminal ? 1 : 0
        summary.retried += terminal ? 0 : 1
        summary.results.push({ effectId: effect.effectId, kind: effect.kind, ok: false, terminal, error: reportedFailure, value: result })
        continue
      }
      markOutboxEffectDone({
        teamName: input.teamName,
        effectId: effect.effectId,
        claimId,
        result,
        now: input.now ?? (deps.now ?? Date.now)(),
      })
      summary.done += 1
      summary.results.push({ effectId: effect.effectId, kind: effect.kind, ok: true, value: result })
    } catch (error) {
      const message = errorMessage(error)
      const failed = markOutboxEffectFailed({
        teamName: input.teamName,
        effectId: effect.effectId,
        claimId,
        error: message,
        now: input.now ?? (deps.now ?? Date.now)(),
      })
      const terminal = failed?.status === 'failed'
      summary.failed += 1
      summary.terminalFailed += terminal ? 1 : 0
      summary.retried += terminal ? 0 : 1
      summary.results.push({ effectId: effect.effectId, kind: effect.kind, ok: false, terminal, error: message })
    }
  }

  return summary
}

export function createOutboxRunner(deps: OutboxEffectRunnerDeps): (input: RunOutboxInput) => Promise<OutboxRunResult> {
  return input => runOutboxOnce(input, deps)
}

