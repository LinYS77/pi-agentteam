import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '@earendil-works/pi-coding-agent'
import { loadAgentConfig, resolveEffectiveAgentModel } from './config.js'
import type { AgentTeamConfig, AgentTeamConfigDiagnostic, EffectiveAgentModel } from './config.js'

export type AgentDefinition = {
  name: string
  description: string
  tools?: string[]
  model?: string
  modelLabel?: string
  modelSource?: EffectiveAgentModel['source']
  effectiveModel?: EffectiveAgentModel
  systemPrompt: string
}

export type { AgentTeamConfig, AgentTeamConfigDiagnostic, EffectiveAgentModel }

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export type AgentsDiscoveryResult = {
  agents: AgentDefinition[]
  configPath: string
  configExists: boolean
  config: AgentTeamConfig
  diagnostics: AgentTeamConfigDiagnostic[]
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function applyModelOverrides(
  agents: AgentDefinition[],
  config: AgentTeamConfig,
): AgentDefinition[] {
  return agents.map(agent => {
    const effectiveModel = resolveEffectiveAgentModel(agent.name, config)
    return {
      ...agent,
      model: effectiveModel.model,
      modelLabel: effectiveModel.modelLabel,
      modelSource: effectiveModel.source,
      effectiveModel,
    }
  })
}

function loadAgentsFromDir(dir: string): AgentDefinition[] {
  if (!isDirectory(dir)) return []
  const out: AgentDefinition[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.name.endsWith('.md')) continue
    if (!entry.isFile() && !entry.isSymbolicLink()) continue
    const filePath = path.join(dir, entry.name)
    let content = ''
    try {
      content = fs.readFileSync(filePath, 'utf8')
    } catch {
      continue
    }
    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content)
    if (!frontmatter.name || !frontmatter.description) continue
    const tools = frontmatter.tools
      ?.split(',')
      .map(t => t.trim())
      .filter(Boolean)
    out.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : undefined,
      model: undefined,
      systemPrompt: body,
    })
  }
  return out
}

export function discoverAgentsWithDiagnostics(): AgentsDiscoveryResult {
  const builtinDir = path.join(moduleDir, 'agents')
  const baseAgents = loadAgentsFromDir(builtinDir).sort((a, b) => a.name.localeCompare(b.name))
  const loadedConfig = loadAgentConfig({ knownRoles: baseAgents.map(agent => agent.name) })
  return {
    agents: applyModelOverrides(baseAgents, loadedConfig.config),
    configPath: loadedConfig.path,
    configExists: loadedConfig.exists,
    config: loadedConfig.config,
    diagnostics: loadedConfig.diagnostics,
  }
}

export function discoverAgents(): AgentDefinition[] {
  return discoverAgentsWithDiagnostics().agents
}
