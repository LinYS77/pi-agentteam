import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { TeamState, TeamTask, TeamMessageType } from '../internalTypes.js'
import type { OutboxEffectRunnerDeps } from './effectRunner.js'

export type AppendStructuredTaskNote = (
  task: TeamTask,
  author: string,
  text: string,
  details?: {
    threadId?: string
    messageType?: TeamMessageType
    requestId?: string
    linkedMessageId?: string
    metadata?: Record<string, unknown>
    hidden?: boolean
  },
) => void

export type MessageApplicationDeps = OutboxEffectRunnerDeps & {
  sanitizeWorkerName: (name: string) => string
  ensureTeamForSession: (ctx: ExtensionContext) => TeamState | null
  currentActor: (ctx: ExtensionContext) => string
  invalidateStatus: (ctx: ExtensionContext) => void
}

export type TaskApplicationDeps = OutboxEffectRunnerDeps & {
  normalizeOwnerName: (name: string) => string
  assertValidOwner: (team: TeamState, owner: string) => void
  ensureTeamForSession: (ctx: ExtensionContext) => TeamState | null
  currentActor: (ctx: ExtensionContext) => string
  appendStructuredTaskNote: AppendStructuredTaskNote
  invalidateStatus: (ctx: ExtensionContext) => void
}
