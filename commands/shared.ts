import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { TeamPaneCleanupOptions } from '../adapters/runtime/session.js'
import type { TeamState } from '../internalTypes.js'

export type CommandHandlerDeps = {
  deleteTeamRuntime: (team: TeamState, options?: TeamPaneCleanupOptions) => void
  invalidateStatus: (ctx: ExtensionContext) => void
  resetMailboxSyncKey: () => void
  runMailboxSync: (ctx: ExtensionContext) => void
  runOutboxMaintenance?: (ctx: ExtensionContext) => void
}
