import type { TeamMessageType, TeamState } from '../../internalTypes.js'
import { pushMailboxMessage, readMailbox } from '../../state/mailboxStore.js'
import { appendTeamEvent } from '../../state/taskStore.js'
import { appendTaskMessageRef } from '../../state/taskHistory.js'
import { readTeamState, updateTeamState } from '../../state/teamStore.js'
import { validatePersistedMailbox } from '../../state/validation.js'
import type { DeliveryResult } from '../../app/deliveryTypes.js'
import type { OutboxEffect } from '../../app/outbox.js'
import type { EffectHandlerResult, OutboxEffectHandlers } from '../../app/ports.js'

export type FileBackedOutboxEffectHandlerDeps = {
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
  appendTaskMessageRef?: typeof appendTaskMessageRef
  readTeamState?: typeof readTeamState
  now?: () => number
}

function success(result: unknown): EffectHandlerResult {
  return { ok: true, result }
}

function deliveryFailure(value: DeliveryResult): string | null {
  if (value.ok !== false) return null
  if (typeof value.requestId === 'string' && value.requestId.trim()) return null
  return typeof value.error === 'string'
    ? value.error
    : typeof value.reason === 'string'
      ? value.reason
      : 'outbox effect reported failure'
}

function deliveryResult(value: DeliveryResult): EffectHandlerResult {
  const error = deliveryFailure(value)
  return error ? { ok: false, error, result: value } : success(value)
}

function mailboxIdFromPayload(effectId: string, payload: OutboxEffect<'inbox_item_append_requested'>['payload']): string {
  const existing = payload.message.metadata?.outboxMailboxId
  return typeof existing === 'string' && existing.trim() ? existing.trim() : `mailbox-${effectId}`
}

export function createFileBackedOutboxEffectHandlers(
  deps: FileBackedOutboxEffectHandlerDeps,
): OutboxEffectHandlers {
  return {
    inbox_item_append_requested: effect => {
      const payload = effect.payload
      const invalid = validatePersistedMailbox([payload.message], `outbox:${effect.effectId}`)
      if (invalid.length > 0) throw new Error(`Unsupported outbox mailbox payload: ${invalid[0]?.field}=${String(invalid[0]?.value)}`)
      const deterministicId = mailboxIdFromPayload(effect.effectId, payload)
      const existing = readMailbox(payload.teamName, payload.recipient).find(item => item.id === deterministicId)
      if (existing) return success(existing)
      const push = deps.pushMailboxMessage ?? pushMailboxMessage
      const pushed = push(payload.teamName, payload.recipient, {
        ...payload.message,
        id: deterministicId,
        metadata: {
          ...(payload.message.metadata ?? {}),
          outboxEffectId: effect.effectId,
          outboxMailboxId: deterministicId,
        },
      }) as unknown
      if (pushed && typeof (pushed as PromiseLike<unknown>).then === 'function') {
        return Promise.resolve(pushed).then(success)
      }
      return success(pushed)
    },

    worker_delivery_requested: async effect => {
      const payload = effect.payload
      const readTeam = deps.readTeamState ?? readTeamState
      const team = readTeam(payload.teamName)
      if (!team) throw new Error(`Team ${payload.teamName} not found for outbox worker delivery`)
      return deliveryResult(await deps.requestWorkerDelivery(team, payload.memberName, payload.explicitTask, payload.options))
    },

    leader_attention_requested: async effect => {
      const payload = effect.payload
      const readTeam = deps.readTeamState ?? readTeamState
      const team = readTeam(payload.teamName)
      if (!team) throw new Error(`Team ${payload.teamName} not found for outbox leader attention`)
      return deliveryResult(await deps.requestLeaderAttentionIfNeeded(team, payload.message))
    },

    task_message_ref_append_requested: effect => {
      const payload = effect.payload
      const append = deps.appendTaskMessageRef ?? appendTaskMessageRef
      let refId: string | undefined
      const updated = updateTeamState(payload.teamName, latest => {
        if (!latest.tasks[payload.taskId]) throw new Error(`task not found: ${payload.taskId}`)
        const ref = append(latest, {
          taskId: payload.taskId,
          mailboxMessageId: payload.mailboxMessageId,
          from: payload.from,
          to: payload.to,
          type: payload.type,
          createdAt: payload.createdAt,
          threadId: payload.threadId,
          summary: payload.summary,
          priority: payload.priority,
          wakeHint: payload.wakeHint,
          reportId: payload.reportId,
          diagnostic: payload.diagnostic,
          metadata: payload.metadata,
        })
        refId = ref.id
      })
      if (!updated) throw new Error(`Team ${payload.teamName} not found for outbox task message ref append`)
      return success({ taskId: payload.taskId, mailboxMessageId: payload.mailboxMessageId, refId })
    },

    append_event_requested: effect => {
      const payload = effect.payload
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
      return success({ eventId })
    },
  }
}
