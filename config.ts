import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfigPath } from './state/paths.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export type AgentTeamConfigDiagnosticLevel = 'info' | 'warning' | 'error'

export type AgentTeamConfigDiagnostic = {
  level: AgentTeamConfigDiagnosticLevel
  code: string
  message: string
  path: string
  jsonPath?: string
}

export function isActionableConfigDiagnostic(diagnostic: AgentTeamConfigDiagnostic): boolean {
  return diagnostic.code !== 'config_missing'
}

export function summarizeConfigDiagnostics(
  diagnostics: AgentTeamConfigDiagnostic[],
): { level: 'info' | 'warning' | 'error'; text: string; actionable: AgentTeamConfigDiagnostic[] } {
  const actionable = diagnostics.filter(isActionableConfigDiagnostic)
  if (actionable.some(item => item.level === 'error')) return { level: 'error', text: 'errors found', actionable }
  if (actionable.some(item => item.level === 'warning')) return { level: 'warning', text: 'warnings found', actionable }
  return { level: 'info', text: 'valid', actionable }
}

export function formatConfigDiagnostic(diagnostic: AgentTeamConfigDiagnostic): string {
  const where = diagnostic.jsonPath ? ` ${diagnostic.jsonPath}` : ''
  return `${diagnostic.level.toUpperCase()} ${diagnostic.code}${where}: ${diagnostic.message}`
}

export type AgentTeamRoleConfig = {
  model?: string | null
}

export type AgentTeamConfig = {
  version?: number
  agents?: Record<string, AgentTeamRoleConfig>
  /**
   * Legacy schema and effective compatibility map used by existing spawn code.
   * New persisted configs should prefer version: 1 + agents.<role>.model.
   */
  agentModels?: Record<string, string | null>
}

export const DEFAULT_AGENT_MODEL_ROLES = ['planner', 'researcher', 'implementer'] as const

export function createDefaultAgentConfig(): AgentTeamConfig {
  return {
    version: 1,
    agents: Object.fromEntries(DEFAULT_AGENT_MODEL_ROLES.map(role => [role, { model: null }])),
  }
}

export function stringifyAgentConfig(config: AgentTeamConfig = createDefaultAgentConfig()): string {
  return `${JSON.stringify(config, null, 2)}\n`
}

export function getBundledConfigExamplePath(): string {
  return path.join(moduleDir, 'config.example.json')
}

export function readBundledConfigExample(): AgentTeamConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(getBundledConfigExamplePath(), 'utf8'))
    return isObjectRecord(parsed) ? parsed as AgentTeamConfig : createDefaultAgentConfig()
  } catch {
    return createDefaultAgentConfig()
  }
}

export type LoadedAgentTeamConfig = {
  path: string
  exists: boolean
  config: AgentTeamConfig
  diagnostics: AgentTeamConfigDiagnostic[]
}

export type LoadAgentConfigOptions = {
  knownRoles?: Iterable<string>
}

function diagnostic(
  level: AgentTeamConfigDiagnosticLevel,
  code: string,
  message: string,
  configPath: string,
  jsonPath?: string,
): AgentTeamConfigDiagnostic {
  return {
    level,
    code,
    message,
    path: configPath,
    ...(jsonPath ? { jsonPath } : {}),
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function knownRoleSet(roles?: Iterable<string>): Set<string> | undefined {
  if (!roles) return undefined
  const out = new Set<string>()
  for (const role of roles) {
    const normalized = String(role ?? '').trim()
    if (normalized) out.add(normalized)
  }
  return out
}

function availableRolesText(roles: Set<string> | undefined): string {
  return [...(roles ?? [])].sort((a, b) => a.localeCompare(b)).join(', ') || '(none)'
}

function normalizeModelValue(
  rawValue: unknown,
  input: { roleName: string; configPath: string; valuePath: string; diagnostics: AgentTeamConfigDiagnostic[]; codePrefix: 'agentModels' | 'agents' },
): string | null | undefined {
  if (rawValue !== null && typeof rawValue !== 'string') {
    input.diagnostics.push(diagnostic(
      'warning',
      `${input.codePrefix}_invalid_value`,
      `Ignoring ${input.valuePath} in ${input.configPath}: model value must be a string or null.`,
      input.configPath,
      input.valuePath,
    ))
    return undefined
  }
  if (rawValue === null) return null
  const trimmed = rawValue.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeAgentModels(
  rawAgentModels: unknown,
  roles: Set<string> | undefined,
  configPath: string,
  diagnostics: AgentTeamConfigDiagnostic[],
): Record<string, string | null> | undefined {
  if (rawAgentModels === undefined) return undefined
  if (!isObjectRecord(rawAgentModels)) {
    diagnostics.push(diagnostic(
      'warning',
      'agentModels_invalid_shape',
      `Ignoring ${configPath}: agentModels must be an object whose values are model strings or null.`,
      configPath,
      'agentModels',
    ))
    return undefined
  }

  diagnostics.push(diagnostic(
    'warning',
    'agentModels_legacy_schema',
    'Legacy agentModels config is still supported, but migrate to version: 1 with agents.<role>.model.',
    configPath,
    'agentModels',
  ))

  const normalized: Record<string, string | null> = {}
  for (const [roleName, rawValue] of Object.entries(rawAgentModels)) {
    const valuePath = `agentModels.${roleName}`
    const unknownRole = Boolean(roles && !roles.has(roleName))
    if (unknownRole) {
      diagnostics.push(diagnostic(
        'warning',
        'agentModels_unknown_role',
        `Ignoring ${valuePath} in ${configPath}: unknown role '${roleName}'. Available roles: ${availableRolesText(roles)}.`,
        configPath,
        valuePath,
      ))
    }
    const normalizedValue = normalizeModelValue(rawValue, { roleName, configPath, valuePath, diagnostics, codePrefix: 'agentModels' })
    if (normalizedValue === undefined || unknownRole) continue
    normalized[roleName] = normalizedValue
  }

  return normalized
}

function normalizeAgentsConfig(
  rawAgents: unknown,
  roles: Set<string> | undefined,
  configPath: string,
  diagnostics: AgentTeamConfigDiagnostic[],
): { agents?: Record<string, AgentTeamRoleConfig>; agentModels?: Record<string, string | null> } {
  if (rawAgents === undefined) return {}
  if (!isObjectRecord(rawAgents)) {
    diagnostics.push(diagnostic(
      'warning',
      'agents_invalid_shape',
      `Ignoring ${configPath}: agents must be an object whose role values contain model strings or null.`,
      configPath,
      'agents',
    ))
    return {}
  }

  const agents: Record<string, AgentTeamRoleConfig> = {}
  const agentModels: Record<string, string | null> = {}
  for (const [roleName, rawRoleConfig] of Object.entries(rawAgents)) {
    const rolePath = `agents.${roleName}`
    const unknownRole = Boolean(roles && !roles.has(roleName))
    if (unknownRole) {
      diagnostics.push(diagnostic(
        'warning',
        'agents_unknown_role',
        `Ignoring ${rolePath} in ${configPath}: unknown role '${roleName}'. Available roles: ${availableRolesText(roles)}.`,
        configPath,
        rolePath,
      ))
    }
    if (!isObjectRecord(rawRoleConfig)) {
      diagnostics.push(diagnostic(
        'warning',
        'agents_invalid_shape',
        `Ignoring ${rolePath} in ${configPath}: role config must be an object with optional model string or null.`,
        configPath,
        rolePath,
      ))
      continue
    }
    const rawModel = rawRoleConfig.model
    const model = normalizeModelValue(rawModel, { roleName, configPath, valuePath: `${rolePath}.model`, diagnostics, codePrefix: 'agents' })
    if (model === undefined || unknownRole) continue
    agents[roleName] = { model }
    agentModels[roleName] = model
  }

  return {
    ...(Object.keys(agents).length > 0 ? { agents } : {}),
    ...(Object.keys(agentModels).length > 0 ? { agentModels } : {}),
  }
}

export function loadAgentConfig(options: LoadAgentConfigOptions = {}): LoadedAgentTeamConfig {
  const configPath = getConfigPath()
  const diagnostics: AgentTeamConfigDiagnostic[] = []
  const roles = knownRoleSet(options.knownRoles)

  if (!fs.existsSync(configPath)) {
    diagnostics.push(diagnostic(
      'info',
      'config_missing',
      `AgentTeam config not found at ${configPath}; using defaults.`,
      configPath,
    ))
    return { path: configPath, exists: false, config: {}, diagnostics }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    diagnostics.push(diagnostic(
      'error',
      'config_invalid_json',
      `Failed to parse AgentTeam config at ${configPath}; using defaults. ${message}`,
      configPath,
    ))
    return { path: configPath, exists: true, config: {}, diagnostics }
  }

  if (!isObjectRecord(parsed)) {
    diagnostics.push(diagnostic(
      'error',
      'config_invalid_root',
      `Ignoring ${configPath}: config root must be a JSON object.`,
      configPath,
    ))
    return { path: configPath, exists: true, config: {}, diagnostics }
  }

  const legacyAgentModels = normalizeAgentModels(parsed.agentModels, roles, configPath, diagnostics)
  const v1Agents = normalizeAgentsConfig(parsed.agents, roles, configPath, diagnostics)
  const config: AgentTeamConfig = {}
  if (typeof parsed.version === 'number') config.version = parsed.version
  if (v1Agents.agents) config.agents = v1Agents.agents
  const effectiveAgentModels = v1Agents.agentModels ?? legacyAgentModels
  if (effectiveAgentModels) config.agentModels = effectiveAgentModels
  if (parsed.deliveryMode !== undefined) {
    const rawMode = typeof parsed.deliveryMode === 'string' ? parsed.deliveryMode.trim() : String(parsed.deliveryMode)
    diagnostics.push(diagnostic(
      'error',
      'deliveryMode_unsupported',
      `Unsupported ${configPath}: deliveryMode=${rawMode || '(empty)'} is not a vNext config key. AgentTeam delivery is bridge-only; remove deliveryMode or roll back by pinning npm pi-agentteam@0.5.0 instead of selecting legacy terminal transport.`,
      configPath,
      'deliveryMode',
    ))
  }
  return { path: configPath, exists: true, config, diagnostics }
}
