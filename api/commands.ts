// Extension composition helper surface.
//
// Used by the default extension facade to register AgentTeam commands with Pi.
// Kept stable for extension composition, but not intended as a broad end-user API.

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { registerTeamCommands } from '../commands/team.js'
import type { CommandHandlerDeps } from '../commands/shared.js'

export function registerAgentTeamCommands(pi: ExtensionAPI, deps: CommandHandlerDeps): void {
  registerTeamCommands(pi, deps)
}
