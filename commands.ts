import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { registerTeamCommands } from './commands/team.js'
import type { CommandHandlerDeps } from './commands/shared.js'

export type { CommandHandlerDeps }

export function registerAgentTeamCommands(pi: ExtensionAPI, deps: CommandHandlerDeps): void {
  registerTeamCommands(pi, deps)
}
