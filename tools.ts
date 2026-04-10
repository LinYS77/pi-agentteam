import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { registerTeamTools } from './tools/team.js'
import { registerMessageTools } from './tools/message.js'
import { registerTaskTools } from './tools/task.js'
import type { ToolHandlerDeps } from './tools/shared.js'

export type { ToolHandlerDeps }

export function registerAgentTeamTools(pi: ExtensionAPI, deps: ToolHandlerDeps): void {
  registerTeamTools(pi, deps)
  registerMessageTools(pi, deps)
  registerTaskTools(pi, deps)
}
