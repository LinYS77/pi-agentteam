import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { registerTeamCommands } from '../commands/team.js'
import type { CommandHandlerDeps } from '../commands/shared.js'

export function registerAgentTeamCommands(pi: ExtensionAPI, deps: CommandHandlerDeps): void {
  registerTeamCommands(pi, deps)
}
