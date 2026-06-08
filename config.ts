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

export type AgentTeamAutomationConfig = {
  mode: 'manual'
  approvedPlan: {
    enabled: boolean
    maxConsecutiveSteps: number
  }
}

export type AgentTeamUiConfig = {
  teamPanel: {
    refreshMode: 'debounced'
    minRefreshMs: number
  }
}

export type AgentTeamConfig = {
  version?: number
  agents?: Record<string, AgentTeamRoleConfig>
  automation?: AgentTeamAutomationConfig
  ui?: AgentTeamUiConfig
  /**
   * Legacy schema and effective compatibility map used by existing spawn code.
   * New persisted configs should prefer version: 1 + agents.<role>.model.
   */
  agentModels?: Record<string, string | null>
}

export type EffectiveAgentModelSource = 'v1' | 'legacy' | 'null' | 'default'

export type EffectiveAgentModel = {
  role: string
  model?: string
  modelLabel: string
  source: EffectiveAgentModelSource
}

export const DEFAULT_AGENT_MODEL_ROLES = ['researcher', 'planner', 'implementer'] as const

export function createDefaultAgentConfig(): AgentTeamConfig {
  return {
    version: 1,
    agents: Object.fromEntries(DEFAULT_AGENT_MODEL_ROLES.map(role => [role, { model: null }])),
    automation: {
      mode: 'manual',
      approvedPlan: {
        enabled: true,
        maxConsecutiveSteps: 5,
      },
    },
    ui: {
      teamPanel: {
        refreshMode: 'debounced',
        minRefreshMs: 250,
      },
    },
  }
}

export function stringifyAgentConfig(config: AgentTeamConfig = createDefaultAgentConfig()): string {
  return `${JSON.stringify(config, null, 2)}\n`
}

function effectiveModelLabel(model?: string): string {
  return model && model.trim() ? model.trim() : 'default'
}

export function resolveEffectiveAgentModel(role: string, config: AgentTeamConfig): EffectiveAgentModel {
  const v1RoleConfig = config.agents?.[role]
  if (v1RoleConfig && Object.prototype.hasOwnProperty.call(v1RoleConfig, 'model')) {
    const model = v1RoleConfig.model
    if (typeof model === 'string' && model.trim()) {
      const normalized = model.trim()
      return { role, model: normalized, modelLabel: normalized, source: 'v1' }
    }
    return { role, modelLabel: 'default', source: 'null' }
  }
  if (config.agentModels && Object.prototype.hasOwnProperty.call(config.agentModels, role)) {
    const model = config.agentModels[role]
    if (typeof model === 'string' && model.trim()) {
      const normalized = model.trim()
      return { role, model: normalized, modelLabel: normalized, source: 'legacy' }
    }
    return { role, modelLabel: 'default', source: 'null' }
  }
  return { role, modelLabel: effectiveModelLabel(undefined), source: 'default' }
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

export type AgentTeamConfigMigrationPreview = {
  path: string
  exists: boolean
  proposed: AgentTeamConfig
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

function schemaRoleSet(roles?: Iterable<string>): Set<string> {
  const out = new Set<string>(DEFAULT_AGENT_MODEL_ROLES)
  for (const role of roles ?? []) {
    const normalized = String(role ?? '').trim()
    if (normalized) out.add(normalized)
  }
  return out
}

function createDefaultV1ConfigForRoles(roles: Iterable<string>): AgentTeamConfig {
  const defaults = createDefaultAgentConfig()
  const agents: Record<string, AgentTeamRoleConfig> = {}
  for (const [role, roleConfig] of Object.entries(defaults.agents ?? {})) {
    agents[role] = { model: roleConfig.model ?? null }
  }
  for (const role of roles) {
    if (!Object.prototype.hasOwnProperty.call(agents, role)) agents[role] = { model: null }
  }
  return {
    version: 1,
    agents,
    automation: {
      mode: 'manual',
      approvedPlan: { ...defaults.automation!.approvedPlan },
    },
    ui: {
      teamPanel: { ...defaults.ui!.teamPanel },
    },
  }
}

function addTopLevelDiagnostics(parsed: Record<string, unknown>, configPath: string, diagnostics: AgentTeamConfigDiagnostic[]): void {
  const knownTopLevel = new Set(['version', 'agents', 'agentModels', 'automation', 'ui', 'deliveryMode'])
  for (const key of Object.keys(parsed)) {
    if (!knownTopLevel.has(key)) {
      diagnostics.push(diagnostic(
        'warning',
        'config_unknown_field',
        `Ignoring ${key} in ${configPath}: unknown top-level config field.`,
        configPath,
        key,
      ))
    }
  }
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

function normalizeAutomationConfig(
  rawAutomation: unknown,
  configPath: string,
  diagnostics: AgentTeamConfigDiagnostic[],
): AgentTeamAutomationConfig | undefined {
  if (rawAutomation === undefined) return undefined
  const defaults = createDefaultAgentConfig().automation!
  if (!isObjectRecord(rawAutomation)) {
    diagnostics.push(diagnostic('warning', 'automation_invalid_shape', `Ignoring ${configPath}: automation must be an object; using safe defaults.`, configPath, 'automation'))
    return defaults
  }
  const out: AgentTeamAutomationConfig = {
    mode: 'manual',
    approvedPlan: { ...defaults.approvedPlan },
  }
  if (rawAutomation.mode !== undefined && rawAutomation.mode !== 'manual') {
    diagnostics.push(diagnostic('warning', 'automation_mode_invalid_value', `Ignoring automation.mode in ${configPath}: only manual mode is supported.`, configPath, 'automation.mode'))
  }
  const approvedPlan = rawAutomation.approvedPlan
  if (approvedPlan !== undefined) {
    if (!isObjectRecord(approvedPlan)) {
      diagnostics.push(diagnostic('warning', 'automation_approvedPlan_invalid_shape', `Ignoring automation.approvedPlan in ${configPath}: approvedPlan must be an object; using safe defaults.`, configPath, 'automation.approvedPlan'))
    } else {
      if (approvedPlan.enabled !== undefined) {
        if (typeof approvedPlan.enabled === 'boolean') out.approvedPlan.enabled = approvedPlan.enabled
        else diagnostics.push(diagnostic('warning', 'automation_approvedPlan_enabled_invalid_value', `Ignoring automation.approvedPlan.enabled in ${configPath}: expected boolean.`, configPath, 'automation.approvedPlan.enabled'))
      }
      if (approvedPlan.maxConsecutiveSteps !== undefined) {
        const maxConsecutiveSteps = approvedPlan.maxConsecutiveSteps
        if (typeof maxConsecutiveSteps === 'number' && Number.isInteger(maxConsecutiveSteps) && maxConsecutiveSteps > 0) out.approvedPlan.maxConsecutiveSteps = maxConsecutiveSteps
        else diagnostics.push(diagnostic('warning', 'automation_approvedPlan_maxConsecutiveSteps_invalid_value', `Ignoring automation.approvedPlan.maxConsecutiveSteps in ${configPath}: expected positive integer.`, configPath, 'automation.approvedPlan.maxConsecutiveSteps'))
      }
      for (const key of Object.keys(approvedPlan)) {
        if (key !== 'enabled' && key !== 'maxConsecutiveSteps') {
          diagnostics.push(diagnostic('warning', 'automation_approvedPlan_unknown_field', `Ignoring automation.approvedPlan.${key} in ${configPath}: unknown approvedPlan field.`, configPath, `automation.approvedPlan.${key}`))
        }
      }
    }
  }
  for (const key of Object.keys(rawAutomation)) {
    if (key !== 'mode' && key !== 'approvedPlan') {
      diagnostics.push(diagnostic('warning', 'automation_unknown_field', `Ignoring automation.${key} in ${configPath}: unknown automation field.`, configPath, `automation.${key}`))
    }
  }
  return out
}

function normalizeUiConfig(
  rawUi: unknown,
  configPath: string,
  diagnostics: AgentTeamConfigDiagnostic[],
): AgentTeamUiConfig | undefined {
  if (rawUi === undefined) return undefined
  const defaults = createDefaultAgentConfig().ui!
  if (!isObjectRecord(rawUi)) {
    diagnostics.push(diagnostic('warning', 'ui_invalid_shape', `Ignoring ${configPath}: ui must be an object; using safe defaults.`, configPath, 'ui'))
    return defaults
  }
  const out: AgentTeamUiConfig = {
    teamPanel: { ...defaults.teamPanel },
  }
  const teamPanel = rawUi.teamPanel
  if (teamPanel !== undefined) {
    if (!isObjectRecord(teamPanel)) {
      diagnostics.push(diagnostic('warning', 'ui_teamPanel_invalid_shape', `Ignoring ui.teamPanel in ${configPath}: teamPanel must be an object; using safe defaults.`, configPath, 'ui.teamPanel'))
    } else {
      if (teamPanel.refreshMode !== undefined) {
        if (teamPanel.refreshMode === 'debounced') out.teamPanel.refreshMode = 'debounced'
        else diagnostics.push(diagnostic('warning', 'ui_teamPanel_refreshMode_invalid_value', `Ignoring ui.teamPanel.refreshMode in ${configPath}: only debounced is supported.`, configPath, 'ui.teamPanel.refreshMode'))
      }
      if (teamPanel.minRefreshMs !== undefined) {
        if (Number.isFinite(teamPanel.minRefreshMs) && typeof teamPanel.minRefreshMs === 'number' && teamPanel.minRefreshMs > 0) out.teamPanel.minRefreshMs = teamPanel.minRefreshMs
        else diagnostics.push(diagnostic('warning', 'ui_teamPanel_minRefreshMs_invalid_value', `Ignoring ui.teamPanel.minRefreshMs in ${configPath}: expected positive number.`, configPath, 'ui.teamPanel.minRefreshMs'))
      }
      for (const key of Object.keys(teamPanel)) {
        if (key !== 'refreshMode' && key !== 'minRefreshMs') {
          diagnostics.push(diagnostic('warning', 'ui_teamPanel_unknown_field', `Ignoring ui.teamPanel.${key} in ${configPath}: unknown teamPanel field.`, configPath, `ui.teamPanel.${key}`))
        }
      }
    }
  }
  for (const key of Object.keys(rawUi)) {
    if (key !== 'teamPanel') {
      diagnostics.push(diagnostic('warning', 'ui_unknown_field', `Ignoring ui.${key} in ${configPath}: unknown ui field.`, configPath, `ui.${key}`))
    }
  }
  return out
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

export function buildProposedV1AgentConfig(options: LoadAgentConfigOptions = {}): AgentTeamConfigMigrationPreview {
  const configPath = getConfigPath()
  const diagnostics: AgentTeamConfigDiagnostic[] = []
  const roles = knownRoleSet(options.knownRoles)
  const proposed = createDefaultV1ConfigForRoles(schemaRoleSet(options.knownRoles))

  if (!fs.existsSync(configPath)) {
    diagnostics.push(diagnostic(
      'info',
      'config_missing',
      `AgentTeam config not found at ${configPath}; dry-run preview shows the default v1 config that could be created with /team config init.`,
      configPath,
    ))
    return { path: configPath, exists: false, proposed, diagnostics }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    diagnostics.push(diagnostic(
      'error',
      'config_invalid_json',
      `Failed to parse AgentTeam config at ${configPath}; dry-run did not write anything. Fix the JSON before migrating. ${message}`,
      configPath,
    ))
    return { path: configPath, exists: true, proposed, diagnostics }
  }

  if (!isObjectRecord(parsed)) {
    diagnostics.push(diagnostic(
      'error',
      'config_invalid_root',
      `Ignoring ${configPath}: config root must be a JSON object. Dry-run did not write anything.`,
      configPath,
    ))
    return { path: configPath, exists: true, proposed, diagnostics }
  }

  const legacyAgentModels = normalizeAgentModels(parsed.agentModels, roles, configPath, diagnostics)
  const v1Agents = normalizeAgentsConfig(parsed.agents, roles, configPath, diagnostics)
  const automation = normalizeAutomationConfig(parsed.automation, configPath, diagnostics)
  const ui = normalizeUiConfig(parsed.ui, configPath, diagnostics)
  if (automation) proposed.automation = automation
  if (ui) proposed.ui = ui
  const agents = proposed.agents ?? {}
  for (const [role, model] of Object.entries(legacyAgentModels ?? {})) {
    if (typeof model === 'string' && model.trim()) agents[role] = { model }
  }
  for (const [role, roleConfig] of Object.entries(v1Agents.agents ?? {})) {
    agents[role] = { model: roleConfig.model ?? null }
  }
  proposed.agents = agents
  addTopLevelDiagnostics(parsed, configPath, diagnostics)
  return { path: configPath, exists: true, proposed, diagnostics }
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
  const automation = normalizeAutomationConfig(parsed.automation, configPath, diagnostics)
  const ui = normalizeUiConfig(parsed.ui, configPath, diagnostics)
  const config: AgentTeamConfig = {}
  if (typeof parsed.version === 'number') config.version = parsed.version
  else if (parsed.version !== undefined) diagnostics.push(diagnostic('warning', 'version_invalid_value', `Ignoring version in ${configPath}: version must be a number.`, configPath, 'version'))
  if (v1Agents.agents) config.agents = v1Agents.agents
  if (automation) config.automation = automation
  if (ui) config.ui = ui
  const effectiveAgentModels = v1Agents.agentModels ?? legacyAgentModels
  if (effectiveAgentModels) config.agentModels = effectiveAgentModels
  addTopLevelDiagnostics(parsed, configPath, diagnostics)
  return { path: configPath, exists: true, config, diagnostics }
}
