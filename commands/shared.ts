import type { ExtensionContext } from '@mariozechner/pi-coding-agent'
import type { TeamPaneCleanupOptions } from '../runtime.js'
import type { TeamState } from '../types.js'

export type CommandHandlerDeps = {
  deleteTeamRuntime: (team: TeamState, options?: TeamPaneCleanupOptions) => void
  invalidateStatus: (ctx: ExtensionContext) => void
  resetMailboxSyncKey: () => void
  runMailboxSync: (ctx: ExtensionContext) => void
}
