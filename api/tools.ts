// Extension composition helper surface.
//
// Used by the default extension facade to register AgentTeam tools with Pi.
// Kept stable for extension composition, but not intended as a broad end-user API.

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { registerTeamTools } from '../tools/team.js'
import { registerMessageTools } from '../tools/message.js'
import { registerTaskTools } from '../tools/task.js'
import type { ToolHandlerDeps } from '../tools/shared.js'

export function registerAgentTeamTools(pi: ExtensionAPI, deps: ToolHandlerDeps): void {
  registerTeamTools(pi, deps)
  registerMessageTools(pi, deps)
  registerTaskTools(pi, deps)
}
