import type { TeamMessageType, TeamState } from '../../internalTypes.js'
import { pushMailboxMessage, readMailbox } from '../../state/mailboxStore.js'
import { appendTaskNote, appendTeamEvent } from '../../state/taskStore.js'
import { appendCommunicationRefNote, isCommunicationReferenceNote } from '../../state/taskNotes.js'
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

    task_note_append_requested: effect => {
      const payload = effect.payload
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
      return success({ taskId: payload.taskId })
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
