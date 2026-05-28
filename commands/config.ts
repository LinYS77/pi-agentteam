import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { discoverAgentsWithDiagnostics } from '../agents.js'
import {
  createDefaultAgentConfig,
  formatConfigDiagnostic,
  readBundledConfigExample,
  stringifyAgentConfig,
  summarizeConfigDiagnostics,
} from '../config.js'
import { ensureDir } from '../state/fsStore.js'

export type TeamConfigCommandResult = {
  handled: boolean
  text?: string
  level?: 'info' | 'warning' | 'error'
}

function parseConfigArgs(args: string): string | null {
  const trimmed = args.trim()
  if (!trimmed) return null
  const [scope, action, ...rest] = trimmed.split(/\s+/)
  if (scope.toLowerCase() !== 'config') return null
  if (rest.length > 0) return '__usage__'
  return action?.toLowerCase() || 'show'
}

function notify(ctx: ExtensionContext, result: TeamConfigCommandResult): TeamConfigCommandResult {
  if (result.text) ctx.ui.notify(result.text, result.level ?? 'info')
  return result
}

function formatModel(model?: string): string {
  return model && model.trim() ? model.trim() : '(default)'
}

function formatHeader(title: string): string {
  return `[agentteam config] ${title}`
}

export function buildConfigShowText(): { text: string; level: 'info' | 'warning' | 'error' } {
  const discovery = discoverAgentsWithDiagnostics()
  const summary = summarizeConfigDiagnostics(discovery.diagnostics)
  const lines = [
    formatHeader('show'),
    `Path: ${discovery.configPath}`,
    `Exists: ${discovery.configExists ? 'yes' : 'no'}`,
    `Status: ${summary.text}`,
    'Effective role models:',
  ]
  for (const agent of discovery.agents) {
    lines.push(`- ${agent.name}: ${formatModel(agent.model)}`)
  }
  if (!discovery.configExists) {
    lines.push('Run /team config init to create config.json. npm/pi install does not create runtime config.')
  }
  lines.push('Changes apply only to future spawns/respawns.')
  return { text: lines.join('\n'), level: summary.level }
}

export function buildConfigValidateText(): { text: string; level: 'info' | 'warning' | 'error' } {
  const discovery = discoverAgentsWithDiagnostics()
  const summary = summarizeConfigDiagnostics(discovery.diagnostics)
  const lines = [
    formatHeader('validate'),
    `Path: ${discovery.configPath}`,
    `Exists: ${discovery.configExists ? 'yes' : 'no'}`,
  ]
  if (discovery.diagnostics.length === 0) {
    lines.push('Diagnostics: none')
  } else {
    lines.push('Diagnostics:')
    lines.push(...discovery.diagnostics.map(item => `- ${formatConfigDiagnostic(item)}`))
  }
  lines.push('Changes apply only to future spawns/respawns; existing workers keep their current model until respawned.')
  return { text: lines.join('\n'), level: summary.level }
}

export function initConfigText(): { text: string; level: 'info' | 'warning' | 'error' } {
  const discovery = discoverAgentsWithDiagnostics()
  const configPath = discovery.configPath
  if (fs.existsSync(configPath)) {
    return {
      text: `${formatHeader('init')}\nConfig already exists: ${configPath}\nRefusing to overwrite. Edit it manually or remove it first.`,
      level: 'warning',
    }
  }
  const example = readBundledConfigExample()
  const config = Object.keys(example.agentModels ?? {}).length > 0 ? example : createDefaultAgentConfig()
  ensureDir(path.dirname(configPath))
  fs.writeFileSync(configPath, stringifyAgentConfig(config), 'utf8')
  return {
    text: `${formatHeader('init')}\nCreated ${configPath}\nSet role-level model selectors, then spawn or respawn teammates for changes to apply.`,
    level: 'info',
  }
}

export function handleTeamConfigCommand(args: string, ctx: ExtensionContext): TeamConfigCommandResult {
  const action = parseConfigArgs(args)
  if (!action) return { handled: false }
  if (action === 'init') return notify(ctx, { handled: true, ...initConfigText() })
  if (action === 'show') return notify(ctx, { handled: true, ...buildConfigShowText() })
  if (action === 'validate') return notify(ctx, { handled: true, ...buildConfigValidateText() })
  return notify(ctx, {
    handled: true,
    level: 'warning',
    text: `${formatHeader('usage')}\nUsage: /team config init|show|validate`,
  })
}
