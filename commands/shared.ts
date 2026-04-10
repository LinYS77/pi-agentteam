import type { ExtensionContext } from '@mariozechner/pi-coding-agent'
import type { TeamState } from '../types.js'
import type {
  AppendStructuredTaskNote,
  MaybeLinkTaskNoteToMessage,
} from '../tools/shared.js'

export type CommandHandlerDeps = {
  sanitizeTeamName: (name: string) => string
  sanitizeWorkerName: (name: string) => string
  ensureTeamForSession: (ctx: ExtensionContext) => TeamState | null
  deleteTeamRuntime: (team: TeamState, options?: { includeLeaderPane?: boolean }) => void
  invalidateStatus: (ctx: ExtensionContext) => void
  resetMailboxSyncKey: () => void
  runMailboxSync: (ctx: ExtensionContext) => void
  wakeWorker: (team: TeamState, memberName: string, explicitTask?: string) => boolean
  appendStructuredTaskNote: AppendStructuredTaskNote
  maybeLinkTaskNoteToMessage: MaybeLinkTaskNoteToMessage
}
