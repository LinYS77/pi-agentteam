import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { compactPanelReadModelFingerprint, compactReadModelProjection } from './readModelFingerprint.js'

export const AGENTTEAM_KERNEL_PROTOCOL_VERSION = 1

export const AGENTTEAM_KERNEL_ADAPTER_VERSION = '0.3.0-read-model-shadow'
export const AGENTTEAM_KERNEL_HELPER_VERSION = '0.3.0-read-model-shadow'
export const AGENTTEAM_KERNEL_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint'] as const
export const AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED = false

export type AgentTeamKernelKnownMode = 'disabled' | 'typescript' | 'go' | 'auto' | 'go-cutover' | 'go-packaged-preview'
export type AgentTeamKernelActiveMode = 'typescript' | 'go'
export type AgentTeamKernelCapability = typeof AGENTTEAM_KERNEL_CAPABILITIES[number]
export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const
export const AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS = [
  'missing-helper',
  'disabled-helper',
  'helper-unsupported-protocol',
  'helper-unsupported-version',
  'helper-unsupported-capability',
  'helper-timeout',
  'helper-spawn-error',
  'helper-crash',
  'helper-nonzero-exit',
  'helper-empty-response',
  'helper-malformed-json',
  'helper-jsonrpc-error',
  'helper-incompatible-response',
  'helper-unsafe-response-shape',
  'previous-helper-failure',
] as const
export type AgentTeamKernelCutoverFailureKind = typeof AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS[number]
export type AgentTeamKernelCutoverStatus = 'active' | 'unavailable'
export type AgentTeamKernelFallbackKind =
  | 'unsupported-mode'
  | 'missing-helper'
  | 'helper-timeout'
  | 'helper-spawn-error'
  | 'helper-nonzero-exit'
  | 'helper-empty-response'
  | 'helper-malformed-json'
  | 'helper-jsonrpc-error'
  | 'helper-incompatible-response'
  | 'helper-unsupported-protocol'
  | 'helper-unsupported-version'
  | 'helper-unsupported-capability'

type AgentTeamKernelHelperFailureKind = AgentTeamKernelFallbackKind | 'helper-crash' | 'helper-unsafe-response-shape' | 'previous-helper-failure'

export type AgentTeamKernelMetadata = {
  implementation: AgentTeamKernelActiveMode
  kernel: {
    requestedMode: string
    mode: AgentTeamKernelActiveMode
    enabled: boolean
    calls: number
    fallbacks: number
    requestedKnownKernel: boolean
    protocolVersion: number
    adapterVersion: string
    helperVersion: string
    capabilities: AgentTeamKernelCapability[]
    businessPathsConnected: false
    helperPath?: string
    fallbackReason?: string
    fallbackKind?: AgentTeamKernelFallbackKind
    cutoverModule?: typeof AGENTTEAM_KERNEL_CUTOVER_MODULE
    cutoverStatus?: AgentTeamKernelCutoverStatus
    cutoverFailureKind?: AgentTeamKernelCutoverFailureKind
    cutoverReason?: string
  }
}

export type AgentTeamKernelJsonRpcRequest = {
  jsonrpc: '2.0'
  id: string | number
  method: AgentTeamKernelCapability
  params?: Record<string, unknown>
}

export type AgentTeamKernelJsonRpcError = {
  code: number
  message: string
}

export type AgentTeamKernelJsonRpcResponse<T = unknown> = {
  jsonrpc: '2.0'
  id?: string | number | null
  result?: T
  error?: AgentTeamKernelJsonRpcError
}

export type AgentTeamKernelHealth = {
  ok: true
  implementation: AgentTeamKernelActiveMode
  protocolVersion: number
  adapterVersion: string
  helperVersion: string
  capabilities: AgentTeamKernelCapability[]
  businessPathsConnected: false
  kernel: AgentTeamKernelMetadata['kernel']
}

export type AgentTeamKernelProfile = AgentTeamKernelHealth & {
  profile: {
    scope: 'skeleton-only'
    params: Record<string, unknown>
    stateConnected: false
    tmuxConnected: false
    tmuxSnapshotParseConnected: boolean
    compactReadModelFingerprintConnected: boolean
    panelConnected: false
    taskReportPlanRunConnected: false
  }
}

export type AgentTeamKernelTmuxPaneSnapshotItem = {
  paneId: string
  target: string
  label: string
  currentCommand: string
}

export type AgentTeamKernelTmuxSnapshot = {
  capturedAt: number
  panes: AgentTeamKernelTmuxPaneSnapshotItem[]
  byPaneId: Record<string, AgentTeamKernelTmuxPaneSnapshotItem>
  ok?: boolean
  error?: string
  status?: 'unknown'
  resultMarker?: 'stale'
  module?: typeof AGENTTEAM_KERNEL_CUTOVER_MODULE
  capability?: typeof AGENTTEAM_KERNEL_CUTOVER_MODULE
  cutoverFailureKind?: AgentTeamKernelCutoverFailureKind
  reason?: string
}

export type AgentTeamKernelCompactReadModelResult = {
  ok: true
  projection: unknown
  fingerprint: string
  inputKind: 'compact-panel-data'
  readOnly: true
  fullTextIncluded: false
  stateFilesRead: false
  stateFilesWritten: false
}

export type AgentTeamKernelAdapter = {
  metadata(): AgentTeamKernelMetadata
  health(): AgentTeamKernelHealth
  profile(params?: Record<string, unknown>): AgentTeamKernelProfile
  parseTmuxPaneSnapshot(stdout: string, capturedAt: number, fallback: (stdout: string, capturedAt: number) => AgentTeamKernelTmuxSnapshot): AgentTeamKernelTmuxSnapshot
  compactReadModelFingerprint(input: unknown, fallback?: (input: unknown) => AgentTeamKernelCompactReadModelResult): AgentTeamKernelCompactReadModelResult
}

export type AgentTeamKernelPackagedHelperStatus = 'available' | 'unsupported-platform' | 'integrity-failed'

export type AgentTeamKernelAdapterOptions = {
  mode?: string | null
  env?: Record<string, string | undefined>
  helperPath?: string | null
  packagedHelperPath?: string | null
  packagedHelperStatus?: AgentTeamKernelPackagedHelperStatus | string | null
  timeoutMs?: number
}

const KNOWN_MODES = new Set(['disabled', 'typescript', 'go', 'auto', 'go-cutover', 'go-packaged-preview'])
const KERNEL_DIAGNOSTIC_TEXT_LIMIT = 160

function compactKernelText(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim()
  return (text || fallback).replace(/[^a-zA-Z0-9_./:=@%+ -]/g, '').replace(/\s+/g, ' ').slice(0, KERNEL_DIAGNOSTIC_TEXT_LIMIT)
}

function compactHelperPath(value: unknown): string {
  const text = compactKernelText(value, 'helper')
  const normalized = text.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : 'helper'
}

function fallbackMessage(kind: AgentTeamKernelFallbackKind, detail?: unknown): string {
  const safeDetail = compactKernelText(detail)
  const suffix = safeDetail ? `: ${safeDetail}` : ''
  return `Go kernel fallback (${kind})${suffix}; using TypeScript fallback`
}

function cutoverMessage(kind: AgentTeamKernelCutoverFailureKind, detail?: unknown): string {
  const safeDetail = compactKernelText(detail)
  const suffix = safeDetail ? `: ${safeDetail}` : ''
  return `Go kernel cutover unavailable (${kind})${suffix}`
}

function toCutoverFailureKind(kind: AgentTeamKernelHelperFailureKind): AgentTeamKernelCutoverFailureKind {
  if (kind === 'unsupported-mode') return 'disabled-helper'
  return kind
}

function toMigrationFallbackKind(kind: AgentTeamKernelHelperFailureKind): AgentTeamKernelFallbackKind {
  if (kind === 'helper-crash') return 'helper-nonzero-exit'
  if (kind === 'helper-unsafe-response-shape') return 'helper-incompatible-response'
  if (kind === 'previous-helper-failure') return 'missing-helper'
  return kind
}

export function normalizeAgentTeamKernelMode(value?: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw || raw === 'none' || raw === 'off' || raw === 'disabled') return 'disabled'
  if (raw === 'ts' || raw === 'typescript') return 'typescript'
  const sanitized = raw.replace(/[^a-z0-9_-]/g, '').slice(0, 32)
  return sanitized || 'disabled'
}

export function isKnownAgentTeamKernelMode(mode: string): mode is AgentTeamKernelKnownMode {
  return KNOWN_MODES.has(mode)
}

export function defaultAgentTeamKernelHelperPath(env: Record<string, string | undefined> = process.env): string | undefined {
  const path = env.PI_AGENTTEAM_KERNEL_HELPER || env.AGENTTEAM_GO_KERNEL_HELPER
  const trimmed = path?.trim()
  return trimmed || undefined
}

export function defaultAgentTeamKernelPackagedHelperPath(env: Record<string, string | undefined> = process.env): string | undefined {
  const path = env.PI_AGENTTEAM_KERNEL_PACKAGED_HELPER
  const trimmed = path?.trim()
  return trimmed || undefined
}

function normalizeAgentTeamKernelPackagedHelperStatus(value?: unknown): AgentTeamKernelPackagedHelperStatus {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'unsupported-platform') return 'unsupported-platform'
  if (raw === 'integrity-failed') return 'integrity-failed'
  return 'available'
}

function packagedPreviewResolverFailure(status: AgentTeamKernelPackagedHelperStatus): { kind: AgentTeamKernelCutoverFailureKind; detail: string } | undefined {
  if (status === 'unsupported-platform') return { kind: 'missing-helper', detail: 'unsupported platform' }
  if (status === 'integrity-failed') return { kind: 'helper-incompatible-response', detail: 'integrity check failed' }
  return undefined
}

export function createKernelJsonRpcRequest(
  method: AgentTeamKernelCapability,
  params: Record<string, unknown> | undefined = undefined,
  id: string | number = `agentteam-kernel-${method}`,
): AgentTeamKernelJsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id,
    method,
    ...(params ? { params } : {}),
  }
}

function initialFallback(input: {
  requestedMode: string
  helperPath?: string
  helperAvailable: boolean
}): { kind: AgentTeamKernelFallbackKind; reason: string } | undefined {
  if (!isKnownAgentTeamKernelMode(input.requestedMode)) {
    return {
      kind: 'unsupported-mode',
      reason: fallbackMessage('unsupported-mode', `PI_AGENTTEAM_KERNEL=${compactKernelText(input.requestedMode, 'unknown')}`),
    }
  }
  if (input.requestedMode === 'go' && !input.helperAvailable) {
    return {
      kind: 'missing-helper',
      reason: fallbackMessage('missing-helper', input.helperPath ? `helper not found: ${compactHelperPath(input.helperPath)}` : 'PI_AGENTTEAM_KERNEL_HELPER is not set'),
    }
  }
  if (input.requestedMode === 'auto' && !input.helperAvailable) {
    return undefined
  }
  return undefined
}

function fallbackHealth(metadata: AgentTeamKernelMetadata): AgentTeamKernelHealth {
  return {
    ok: true,
    implementation: metadata.implementation,
    protocolVersion: AGENTTEAM_KERNEL_PROTOCOL_VERSION,
    adapterVersion: AGENTTEAM_KERNEL_ADAPTER_VERSION,
    helperVersion: AGENTTEAM_KERNEL_HELPER_VERSION,
    capabilities: [...AGENTTEAM_KERNEL_CAPABILITIES],
    businessPathsConnected: AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED,
    kernel: metadata.kernel,
  }
}

function fallbackProfile(metadata: AgentTeamKernelMetadata, params: Record<string, unknown> = {}): AgentTeamKernelProfile {
  return {
    ...fallbackHealth(metadata),
    profile: {
      scope: 'skeleton-only',
      params: { ...params },
      stateConnected: false,
      tmuxConnected: false,
      tmuxSnapshotParseConnected: metadata.kernel.enabled && metadata.kernel.capabilities.includes('tmuxSnapshotParse'),
      compactReadModelFingerprintConnected: metadata.kernel.enabled && metadata.kernel.capabilities.includes('compactReadModelFingerprint'),
      panelConnected: false,
      taskReportPlanRunConnected: false,
    },
  }
}

export function createAgentTeamKernelAdapter(options: AgentTeamKernelAdapterOptions = {}): AgentTeamKernelAdapter {
  const env = options.env ?? process.env
  const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)
  const explicitHelperPath = options.helperPath === null ? undefined : (options.helperPath?.trim() || defaultAgentTeamKernelHelperPath(env))
  const packagedPreviewRequested = requestedMode === 'go-packaged-preview'
  const packagedHelperStatus = normalizeAgentTeamKernelPackagedHelperStatus(options.packagedHelperStatus ?? env.PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_STATUS)
  const packagedResolverFailure = packagedPreviewRequested && !explicitHelperPath ? packagedPreviewResolverFailure(packagedHelperStatus) : undefined
  const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure
    ? (options.packagedHelperPath === null ? undefined : (options.packagedHelperPath?.trim() || defaultAgentTeamKernelPackagedHelperPath(env)))
    : undefined
  const helperPath = explicitHelperPath || packagedHelperPath
  const helperAvailable = Boolean(helperPath && !packagedResolverFailure && existsSync(helperPath))
  const requestedKnownKernel = isKnownAgentTeamKernelMode(requestedMode)
  const cutoverRequested = requestedMode === 'go-cutover' || packagedPreviewRequested
  const initialUseGo = requestedKnownKernel && (requestedMode === 'go' || requestedMode === 'auto' || cutoverRequested) && helperAvailable
  const timeoutMs = Math.max(100, Math.min(10_000, Math.floor(options.timeoutMs ?? 2_000)))
  const startupFallback = cutoverRequested ? undefined : initialFallback({ requestedMode, helperPath, helperAvailable })
  const startupCutoverFailure = cutoverRequested
    ? packagedResolverFailure ?? (!helperAvailable ? {
      kind: 'missing-helper' as const,
      detail: helperPath ? `helper not found: ${compactHelperPath(helperPath)}` : (packagedPreviewRequested ? 'packaged helper not configured' : 'PI_AGENTTEAM_KERNEL_HELPER is not set'),
    } : undefined)
    : undefined
  const startupCutoverFailureKind: AgentTeamKernelCutoverFailureKind | undefined = startupCutoverFailure?.kind
  let helperCalls = 0
  let fallbackCount = startupFallback ? 1 : 0
  let fallbackReason = startupFallback?.reason
  let fallbackKind = startupFallback?.kind
  let cutoverFailureKind: AgentTeamKernelCutoverFailureKind | undefined = startupCutoverFailureKind
  let cutoverReason = startupCutoverFailure
    ? cutoverMessage(startupCutoverFailure.kind, startupCutoverFailure.detail)
    : undefined
  let helperDisabledAfterFailure = false
  let helperPreflightPassed = false

  function usesGo(): boolean {
    return initialUseGo && !helperDisabledAfterFailure
  }

  function metadata(): AgentTeamKernelMetadata {
    const activeMode: AgentTeamKernelActiveMode = usesGo() ? 'go' : 'typescript'
    return {
      implementation: activeMode,
      kernel: {
        requestedMode,
        mode: activeMode,
        enabled: activeMode === 'go',
        calls: helperCalls,
        fallbacks: fallbackCount,
        requestedKnownKernel,
        protocolVersion: AGENTTEAM_KERNEL_PROTOCOL_VERSION,
        adapterVersion: AGENTTEAM_KERNEL_ADAPTER_VERSION,
        helperVersion: AGENTTEAM_KERNEL_HELPER_VERSION,
        capabilities: [...AGENTTEAM_KERNEL_CAPABILITIES],
        businessPathsConnected: AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED,
        ...(helperPath && activeMode === 'go' ? { helperPath: compactHelperPath(helperPath) } : {}),
        ...(fallbackReason ? { fallbackReason } : {}),
        ...(fallbackKind ? { fallbackKind } : {}),
        ...(cutoverRequested ? {
          cutoverModule: AGENTTEAM_KERNEL_CUTOVER_MODULE,
          cutoverStatus: cutoverFailureKind ? 'unavailable' as const : 'active' as const,
        } : {}),
        ...(cutoverFailureKind ? { cutoverFailureKind } : {}),
        ...(cutoverReason ? { cutoverReason } : {}),
      },
    }
  }

  function recordCutoverUnavailable(kind: AgentTeamKernelCutoverFailureKind, detail?: unknown): void {
    helperDisabledAfterFailure = true
    cutoverFailureKind = kind
    cutoverReason = cutoverMessage(kind, detail)
  }

  function recordRuntimeFallback(kind: AgentTeamKernelHelperFailureKind, detail?: unknown): void {
    if (cutoverRequested) {
      recordCutoverUnavailable(toCutoverFailureKind(kind), detail)
      return
    }
    const migrationKind = toMigrationFallbackKind(kind)
    if (!helperDisabledAfterFailure) {
      fallbackCount += 1
    }
    helperDisabledAfterFailure = true
    fallbackKind = migrationKind
    fallbackReason = fallbackMessage(migrationKind, detail)
  }

  function isCapability(value: unknown): value is AgentTeamKernelCapability {
    return typeof value === 'string' && (AGENTTEAM_KERNEL_CAPABILITIES as readonly string[]).includes(value)
  }

  function isJsonRpcResponse<T>(value: unknown): value is AgentTeamKernelJsonRpcResponse<T> {
    if (!value || typeof value !== 'object') return false
    const response = value as AgentTeamKernelJsonRpcResponse<T>
    if (response.jsonrpc !== '2.0') return false
    if (response.error !== undefined) {
      return Boolean(response.error)
        && typeof response.error === 'object'
        && Number.isFinite((response.error as AgentTeamKernelJsonRpcError).code)
        && typeof (response.error as AgentTeamKernelJsonRpcError).message === 'string'
    }
    return Object.prototype.hasOwnProperty.call(response, 'result')
  }

  function validateHealthResult(value: unknown): AgentTeamKernelHealth | undefined {
    if (!value || typeof value !== 'object') return undefined
    const health = value as AgentTeamKernelHealth
    if (health.ok !== true) return undefined
    if (health.implementation !== 'go') return undefined
    if (health.protocolVersion !== AGENTTEAM_KERNEL_PROTOCOL_VERSION) return undefined
    if (typeof health.helperVersion !== 'string' || health.helperVersion !== AGENTTEAM_KERNEL_HELPER_VERSION) return undefined
    if (!Array.isArray(health.capabilities)) return undefined
    if (!AGENTTEAM_KERNEL_CAPABILITIES.every(capability => health.capabilities.includes(capability))) return undefined
    if (health.businessPathsConnected !== false) return undefined
    return {
      ok: true,
      implementation: 'go',
      protocolVersion: AGENTTEAM_KERNEL_PROTOCOL_VERSION,
      adapterVersion: AGENTTEAM_KERNEL_ADAPTER_VERSION,
      helperVersion: AGENTTEAM_KERNEL_HELPER_VERSION,
      capabilities: [...AGENTTEAM_KERNEL_CAPABILITIES],
      businessPathsConnected: false,
      kernel: metadata().kernel,
    }
  }

  function validateProfileResult(value: unknown, params: Record<string, unknown>): AgentTeamKernelProfile | undefined {
    const health = validateHealthResult(value)
    if (!health || !value || typeof value !== 'object') return undefined
    const profile = (value as AgentTeamKernelProfile).profile
    if (!profile || typeof profile !== 'object') return undefined
    if (profile.scope !== 'skeleton-only') return undefined
    if (profile.stateConnected !== false || profile.tmuxConnected !== false) return undefined
    if (profile.tmuxSnapshotParseConnected !== true || profile.compactReadModelFingerprintConnected !== true) return undefined
    if (profile.panelConnected !== false || profile.taskReportPlanRunConnected !== false) return undefined
    return {
      ...health,
      profile: {
        scope: 'skeleton-only',
        params: { ...(params ?? {}) },
        stateConnected: false,
        tmuxConnected: false,
        tmuxSnapshotParseConnected: true,
        compactReadModelFingerprintConnected: true,
        panelConnected: false,
        taskReportPlanRunConnected: false,
      },
    }
  }

  function cutoverUnavailableSnapshot(capturedAt: number): AgentTeamKernelTmuxSnapshot {
    if (!cutoverFailureKind) {
      recordCutoverUnavailable('previous-helper-failure', 'helper unavailable')
    }
    const reason = cutoverReason ?? cutoverMessage(cutoverFailureKind ?? 'previous-helper-failure')
    return {
      capturedAt,
      panes: [],
      byPaneId: {},
      ok: false,
      status: 'unknown',
      resultMarker: 'stale',
      module: AGENTTEAM_KERNEL_CUTOVER_MODULE,
      capability: AGENTTEAM_KERNEL_CUTOVER_MODULE,
      cutoverFailureKind: cutoverFailureKind ?? 'previous-helper-failure',
      reason,
      error: reason,
    }
  }

  function classifyUnsafeTmuxSnapshotResult(value: unknown): { kind: AgentTeamKernelHelperFailureKind; detail: string } | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const snapshot = value as Record<string, unknown>
    const sensitiveKeys = [
      'text',
      'mail' + 'box',
      'reports',
      'report' + 'Text',
      'task' + 'Report' + 'Body',
      'state',
      'raw' + 'State',
      'side' + 'car',
      'ca' + 'che',
      'in' + 'dex',
      'hidden' + 'Runtime' + 'State',
    ]
    if (sensitiveKeys.some(key => Object.prototype.hasOwnProperty.call(snapshot, key))) return { kind: 'helper-unsafe-response-shape', detail: 'unsafe tmux snapshot fields' }
    if (Array.isArray(snapshot.panes) && snapshot.panes.some(item => item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'text'))) return { kind: 'helper-unsafe-response-shape', detail: 'unsafe pane fields' }
    if (snapshot.byPaneId && typeof snapshot.byPaneId === 'object' && Object.values(snapshot.byPaneId as Record<string, unknown>).some(item => item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'text'))) return { kind: 'helper-unsafe-response-shape', detail: 'unsafe byPaneId fields' }
    return undefined
  }

  function validateTmuxSnapshotResult(value: unknown): AgentTeamKernelTmuxSnapshot | undefined {
    if (!value || typeof value !== 'object') return undefined
    const snapshot = value as AgentTeamKernelTmuxSnapshot
    if (!Number.isFinite(snapshot.capturedAt)) return undefined
    if (!Array.isArray(snapshot.panes)) return undefined
    if (!snapshot.byPaneId || typeof snapshot.byPaneId !== 'object') return undefined
    const byPaneId: Record<string, AgentTeamKernelTmuxPaneSnapshotItem> = {}
    const panes: AgentTeamKernelTmuxPaneSnapshotItem[] = []
    for (const item of snapshot.panes) {
      if (!item || typeof item !== 'object') return undefined
      const paneId = typeof item.paneId === 'string' ? item.paneId : ''
      if (!paneId) return undefined
      const normalized = {
        paneId,
        target: typeof item.target === 'string' ? item.target : '',
        label: typeof item.label === 'string' ? item.label : '',
        currentCommand: typeof item.currentCommand === 'string' ? item.currentCommand : '',
      }
      panes.push(normalized)
      byPaneId[paneId] = normalized
    }
    return {
      capturedAt: snapshot.capturedAt,
      panes,
      byPaneId,
      ok: snapshot.ok === undefined ? true : Boolean(snapshot.ok),
    }
  }

  function sanitizeCompactReadModelInput(input: unknown): unknown {
    return compactReadModelProjection(input)
  }

  function fallbackCompactReadModelFingerprint(input: unknown): AgentTeamKernelCompactReadModelResult {
    const projection = sanitizeCompactReadModelInput(input)
    return {
      ok: true,
      projection,
      fingerprint: compactPanelReadModelFingerprint(projection),
      inputKind: 'compact-panel-data',
      readOnly: true,
      fullTextIncluded: false,
      stateFilesRead: false,
      stateFilesWritten: false,
    }
  }

  function containsTextField(value: unknown, depth = 0): boolean {
    if (!value || typeof value !== 'object' || depth > 12) return false
    if (Array.isArray(value)) return value.some(item => containsTextField(item, depth + 1))
    const record = value as Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(record, 'text')) return true
    return Object.values(record).some(item => containsTextField(item, depth + 1))
  }

  function validateCompactReadModelResult(value: unknown): AgentTeamKernelCompactReadModelResult | undefined {
    if (!value || typeof value !== 'object') return undefined
    const result = value as AgentTeamKernelCompactReadModelResult
    if (typeof result.fingerprint !== 'string') return undefined
    if (result.inputKind !== 'compact-panel-data') return undefined
    if (result.readOnly !== true || result.fullTextIncluded !== false || result.stateFilesRead !== false || result.stateFilesWritten !== false) return undefined
    if (containsTextField(result.projection)) return undefined
    return {
      ok: true,
      projection: result.projection,
      fingerprint: result.fingerprint,
      inputKind: 'compact-panel-data',
      readOnly: true,
      fullTextIncluded: false,
      stateFilesRead: false,
      stateFilesWritten: false,
    }
  }

  function classifyHealthCompatibility(value: unknown, desiredCapability?: AgentTeamKernelCapability): { kind: AgentTeamKernelFallbackKind; detail?: string } | undefined {
    if (!value || typeof value !== 'object') return { kind: 'helper-incompatible-response', detail: 'health result shape' }
    const health = value as Partial<AgentTeamKernelHealth>
    if (health.ok !== true || health.implementation !== 'go') return { kind: 'helper-incompatible-response', detail: 'health result shape' }
    if (health.protocolVersion !== AGENTTEAM_KERNEL_PROTOCOL_VERSION) return { kind: 'helper-unsupported-version', detail: 'protocolVersion mismatch' }
    if (typeof health.helperVersion !== 'string' || health.helperVersion !== AGENTTEAM_KERNEL_HELPER_VERSION) return { kind: 'helper-unsupported-version', detail: 'helperVersion mismatch' }
    if (!Array.isArray(health.capabilities)) return { kind: 'helper-incompatible-response', detail: 'capabilities shape' }
    const missingCapability = desiredCapability && !health.capabilities.includes(desiredCapability)
      ? desiredCapability
      : AGENTTEAM_KERNEL_CAPABILITIES.find(capability => !health.capabilities?.includes(capability))
    if (missingCapability || health.capabilities.some(capability => !isCapability(capability))) {
      return { kind: 'helper-unsupported-capability', detail: `capability=${compactKernelText(missingCapability ?? 'unknown')}` }
    }
    if (health.businessPathsConnected !== false) return { kind: 'helper-incompatible-response', detail: 'businessPathsConnected must be false' }
    return undefined
  }

  function classifySpawnError(error: unknown): { kind: AgentTeamKernelHelperFailureKind; detail: string } {
    const err = (error ?? {}) as { code?: unknown; message?: unknown; name?: unknown }
    const code = typeof err.code === 'string' ? err.code : ''
    const message = String(err.message ?? '')
    if (code === 'ETIMEDOUT' || /timed?\s*out|timeout/i.test(message)) {
      return { kind: 'helper-timeout', detail: `timeoutMs=${timeoutMs}` }
    }
    return { kind: 'helper-spawn-error', detail: code ? `code=${compactKernelText(code)}` : compactKernelText(err.name, 'spawn error') }
  }

  function invokeHelper<T>(method: AgentTeamKernelCapability, params?: Record<string, unknown>): { ok: true; result: T } | { ok: false; kind: AgentTeamKernelHelperFailureKind; detail?: string } {
    if (helperDisabledAfterFailure) return { ok: false, kind: cutoverRequested ? 'previous-helper-failure' : 'missing-helper', detail: 'helper disabled after prior failure' }
    if (!usesGo() || !helperPath) return { ok: false, kind: 'missing-helper', detail: 'helper unavailable' }
    helperCalls += 1
    const request = createKernelJsonRpcRequest(method, params)
    const result = spawnSync(helperPath, [], {
      input: `${JSON.stringify(request)}\n`,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: { PATH: env.PATH ?? process.env.PATH ?? '' },
    })
    if (result.error) {
      return { ok: false, ...classifySpawnError(result.error) }
    }
    if (result.status !== 0) {
      const signal = typeof result.signal === 'string' && result.signal ? result.signal : ''
      if (signal) return { ok: false, kind: 'helper-crash', detail: `signal=${compactKernelText(signal)}` }
      return { ok: false, kind: 'helper-nonzero-exit', detail: `status=${result.status ?? 'unknown'}` }
    }
    const responseText = String(result.stdout || '').split('\n').find(line => line.trim())
    if (!responseText) {
      return { ok: false, kind: 'helper-empty-response', detail: 'stdout empty' }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(responseText)
    } catch {
      return { ok: false, kind: 'helper-malformed-json', detail: 'parse error' }
    }
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, kind: 'helper-incompatible-response', detail: 'JSON-RPC response shape' }
    }
    const response = parsed as AgentTeamKernelJsonRpcResponse<T>
    if (response.jsonrpc !== '2.0') {
      return { ok: false, kind: 'helper-unsupported-protocol', detail: 'jsonrpc version mismatch' }
    }
    if (response.error !== undefined) {
      if (!response.error || typeof response.error !== 'object' || !Number.isFinite(response.error.code) || typeof response.error.message !== 'string') {
        return { ok: false, kind: 'helper-incompatible-response', detail: 'JSON-RPC error shape' }
      }
      return { ok: false, kind: 'helper-jsonrpc-error', detail: `code=${response.error.code}` }
    }
    if (!Object.prototype.hasOwnProperty.call(response, 'result')) {
      return { ok: false, kind: 'helper-incompatible-response', detail: 'missing result' }
    }
    if (!isJsonRpcResponse<T>(response)) {
      return { ok: false, kind: 'helper-incompatible-response', detail: 'JSON-RPC response shape' }
    }
    return { ok: true, result: response.result as T }
  }

  function ensureHelperCompatible(method: AgentTeamKernelCapability): boolean {
    if (!usesGo()) return false
    if (helperPreflightPassed) return true
    const healthCall = invokeHelper<unknown>('health')
    if (!healthCall.ok) {
      recordRuntimeFallback(healthCall.kind, healthCall.detail)
      return false
    }
    const failure = classifyHealthCompatibility(healthCall.result, method)
    if (failure) {
      recordRuntimeFallback(failure.kind, failure.detail)
      return false
    }
    helperPreflightPassed = true
    return true
  }

  function callHelper<T>(method: AgentTeamKernelCapability, params?: Record<string, unknown>): T | undefined {
    if (helperDisabledAfterFailure && cutoverRequested) {
      recordCutoverUnavailable('previous-helper-failure', 'helper disabled after prior failure')
      return undefined
    }
    if (!usesGo() || !helperPath) return undefined
    if (method !== 'health' && !ensureHelperCompatible(method)) return undefined
    const helperCall = invokeHelper<T>(method, params)
    if (!helperCall.ok) {
      recordRuntimeFallback(helperCall.kind, helperCall.detail)
      return undefined
    }
    return helperCall.result
  }

  return {
    metadata,
    health() {
      const helperResult = callHelper<unknown>('health')
      const failure = helperResult !== undefined ? classifyHealthCompatibility(helperResult) : undefined
      if (failure) {
        recordRuntimeFallback(failure.kind, failure.detail)
      } else {
        const parsed = validateHealthResult(helperResult)
        if (parsed) {
          helperPreflightPassed = true
          return parsed
        }
        if (helperResult !== undefined) {
          recordRuntimeFallback('helper-incompatible-response', 'health result shape')
        }
      }
      return fallbackHealth(metadata())
    },
    profile(params = {}) {
      const helperResult = callHelper<unknown>('profile', params)
      const parsed = validateProfileResult(helperResult, params)
      if (parsed) return parsed
      if (helperResult !== undefined) {
        recordRuntimeFallback('helper-incompatible-response', 'profile result shape')
      }
      return fallbackProfile(metadata(), params)
    },
    parseTmuxPaneSnapshot(stdout, capturedAt, fallback) {
      const helperResult = callHelper<unknown>('tmuxSnapshotParse', { stdout, capturedAt })
      const unsafe = helperResult !== undefined ? classifyUnsafeTmuxSnapshotResult(helperResult) : undefined
      if (!unsafe) {
        const parsed = validateTmuxSnapshotResult(helperResult)
        if (parsed) return parsed
      }
      if (helperResult !== undefined) {
        recordRuntimeFallback(unsafe?.kind ?? 'helper-incompatible-response', unsafe?.detail ?? 'tmuxSnapshotParse result shape')
      }
      if (cutoverRequested) return cutoverUnavailableSnapshot(capturedAt)
      return fallback(stdout, capturedAt)
    },
    compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint) {
      const compactInput = sanitizeCompactReadModelInput(input)
      if (cutoverRequested) return fallback(compactInput)
      const helperResult = callHelper<unknown>('compactReadModelFingerprint', { input: compactInput })
      const parsed = validateCompactReadModelResult(helperResult)
      if (parsed) return parsed
      if (helperResult !== undefined) {
        recordRuntimeFallback('helper-incompatible-response', 'compactReadModelFingerprint result shape')
      }
      return fallback(compactInput)
    },
  }
}
