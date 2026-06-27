import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AGENTTEAM_KERNEL_ADAPTER_VERSION,
  AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED,
  AGENTTEAM_KERNEL_CAPABILITIES,
  AGENTTEAM_KERNEL_EMBEDDED_HELPER_MANIFEST_PATH,
  AGENTTEAM_KERNEL_HELPER_VERSION,
  AGENTTEAM_KERNEL_PROTOCOL_VERSION,
} from './kernelContract.js'
import { resolveAgentTeamPackagedHelperManifest } from './kernelPackagedResolver.js'
import { compactPanelReadModelFingerprint, compactReadModelProjection } from './readModelFingerprint.js'

export {
  AGENTTEAM_KERNEL_ADAPTER_VERSION,
  AGENTTEAM_KERNEL_BUSINESS_PATHS_CONNECTED,
  AGENTTEAM_KERNEL_CAPABILITIES,
  AGENTTEAM_KERNEL_HELPER_VERSION,
  AGENTTEAM_KERNEL_PROTOCOL_VERSION,
} from './kernelContract.js'

export type AgentTeamKernelKnownMode = 'default' | 'disabled' | 'typescript' | 'go' | 'auto' | 'go-cutover' | 'go-packaged-preview'
export type AgentTeamKernelActiveMode = 'typescript' | 'go'
export type AgentTeamKernelCapability = typeof AGENTTEAM_KERNEL_CAPABILITIES[number]
export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const
export const AGENTTEAM_KERNEL_TMUX_SNAPSHOT_CAPTURE_MODULE = 'tmuxSnapshotCapture' as const
export type AgentTeamKernelTmuxSnapshotCapability = typeof AGENTTEAM_KERNEL_CUTOVER_MODULE | typeof AGENTTEAM_KERNEL_TMUX_SNAPSHOT_CAPTURE_MODULE
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
  'tmux-command-timeout',
  'tmux-command-failed',
  'tmux-unavailable',
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
    tmuxSnapshotCaptureConnected: boolean
    compactReadModelFingerprintConnected: boolean
    workerLifecycleInspectPaneConnected?: boolean
    workerLifecycleListAgentTeamPanesConnected?: boolean
    workerLifecycleCaptureCurrentPaneBindingConnected?: boolean
    workerLifecycleListPanesInWindowConnected?: boolean
    workerLifecycleFindAgentTeamWindowTargetConnected?: boolean
    workerLifecycleSessionExistsConnected?: boolean
    tmuxAvailabilityConnected?: boolean
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
  module?: AgentTeamKernelTmuxSnapshotCapability
  capability?: AgentTeamKernelTmuxSnapshotCapability
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

export type AgentTeamKernelWorkerLifecycleFailureKind =
  | AgentTeamKernelCutoverFailureKind
  | 'unsupported-operation'
  | 'pane-not-found'
  | 'invalid-pane-id'
  | 'invalid-target'
  | 'invalid-session'

export type AgentTeamKernelWorkerPaneInspection = {
  ok: boolean
  operation: 'inspectPane'
  capability: 'workerLifecycle'
  paneId: string
  requestedPaneId: string
  exists: boolean
  target?: string
  currentCommand?: string
  inMode?: boolean
  mode?: string
  copyMode?: boolean
  status?: 'unknown'
  resultMarker?: 'stale'
  failureKind?: AgentTeamKernelWorkerLifecycleFailureKind
  reason?: string
  error?: string
  readOnly: true
  stateFilesRead: false
  stateFilesWritten: false
  tmuxMutation: false
}

export type AgentTeamKernelWorkerPaneList = {
  ok: boolean
  operation: 'listAgentTeamPanes'
  capability: 'workerLifecycle'
  panes: AgentTeamKernelTmuxPaneSnapshotItem[]
  byPaneId: Record<string, AgentTeamKernelTmuxPaneSnapshotItem>
  status?: 'unknown'
  resultMarker?: 'stale'
  failureKind?: AgentTeamKernelWorkerLifecycleFailureKind
  reason?: string
  error?: string
  readOnly: true
  stateFilesRead: false
  stateFilesWritten: false
  tmuxMutation: false
}

export type AgentTeamKernelCurrentPaneBinding = {
  ok: boolean
  operation: 'captureCurrentPaneBinding'
  capability: 'workerLifecycle'
  paneId?: string
  target?: string
  status?: 'unknown'
  resultMarker?: 'stale'
  failureKind?: AgentTeamKernelWorkerLifecycleFailureKind
  reason?: string
  error?: string
  readOnly: true
  stateFilesRead: false
  stateFilesWritten: false
  tmuxMutation: false
}

export type AgentTeamKernelWindowPaneList = {
  ok: boolean
  operation: 'listPanesInWindow'
  capability: 'workerLifecycle'
  target: string
  exists: boolean
  paneIds: string[]
  status?: 'unknown'
  resultMarker?: 'stale'
  failureKind?: AgentTeamKernelWorkerLifecycleFailureKind
  reason?: string
  error?: string
  readOnly: true
  stateFilesRead: false
  stateFilesWritten: false
  tmuxMutation: false
}

export type AgentTeamKernelAgentTeamWindowTarget = {
  ok: boolean
  operation: 'findAgentTeamWindowTarget'
  capability: 'workerLifecycle'
  sessionName: string
  exists: boolean
  target?: string
  windowId?: string
  status?: 'unknown'
  resultMarker?: 'stale'
  failureKind?: AgentTeamKernelWorkerLifecycleFailureKind
  reason?: string
  error?: string
  readOnly: true
  stateFilesRead: false
  stateFilesWritten: false
  tmuxMutation: false
}

export type AgentTeamKernelSessionExistence = {
  ok: boolean
  operation: 'sessionExists'
  capability: 'workerLifecycle'
  sessionName: string
  exists: boolean
  status?: 'unknown'
  resultMarker?: 'stale'
  failureKind?: AgentTeamKernelWorkerLifecycleFailureKind
  reason?: string
  error?: string
  readOnly: true
  stateFilesRead: false
  stateFilesWritten: false
  tmuxMutation: false
}

export type AgentTeamKernelTmuxAvailability = {
  ok: boolean
  capability: 'tmuxAvailability'
  available: boolean
  version?: string
  status?: 'unknown'
  resultMarker?: 'stale'
  failureKind?: AgentTeamKernelCutoverFailureKind
  reason?: string
  error?: string
  readOnly: true
  stateFilesRead: false
  stateFilesWritten: false
  tmuxMutation: false
}

export type AgentTeamKernelAdapter = {
  metadata(): AgentTeamKernelMetadata
  health(): AgentTeamKernelHealth
  profile(params?: Record<string, unknown>): AgentTeamKernelProfile
  parseTmuxPaneSnapshot(stdout: string, capturedAt: number, fallback?: (stdout: string, capturedAt: number) => AgentTeamKernelTmuxSnapshot): AgentTeamKernelTmuxSnapshot
  captureTmuxSnapshot(capturedAt: number): AgentTeamKernelTmuxSnapshot
  inspectWorkerPane(paneId: string): AgentTeamKernelWorkerPaneInspection
  inspectWorkerPaneAsync(paneId: string, signal?: AbortSignal): Promise<AgentTeamKernelWorkerPaneInspection>
  listAgentTeamPanes(): AgentTeamKernelWorkerPaneList
  captureCurrentPaneBinding(): AgentTeamKernelCurrentPaneBinding
  listPanesInWindowAsync(target: string, signal?: AbortSignal): Promise<AgentTeamKernelWindowPaneList>
  findAgentTeamWindowTargetAsync(sessionName: string, signal?: AbortSignal): Promise<AgentTeamKernelAgentTeamWindowTarget>
  sessionExistsAsync(sessionName: string, signal?: AbortSignal): Promise<AgentTeamKernelSessionExistence>
  checkTmuxAvailableAsync(signal?: AbortSignal): Promise<AgentTeamKernelTmuxAvailability>
  compactReadModelFingerprint(input: unknown, fallback?: (input: unknown) => AgentTeamKernelCompactReadModelResult): AgentTeamKernelCompactReadModelResult
}

export type AgentTeamKernelPackagedHelperStatus = 'available' | 'unsupported-platform' | 'integrity-failed'

export type AgentTeamKernelAdapterOptions = {
  mode?: string | null
  env?: Record<string, string | undefined>
  helperPath?: string | null
  packagedHelperPath?: string | null
  packagedHelperStatus?: AgentTeamKernelPackagedHelperStatus | string | null
  packagedHelperManifestPath?: string | null
  packagedHelperInstallRoot?: string | null
  timeoutMs?: number
}

const KNOWN_MODES = new Set(['default', 'disabled', 'typescript', 'go', 'auto', 'go-cutover', 'go-packaged-preview'])
const DEFAULT_EMBEDDED_HELPER_MANIFEST_PATH = AGENTTEAM_KERNEL_EMBEDDED_HELPER_MANIFEST_PATH
const KERNEL_DIAGNOSTIC_TEXT_LIMIT = 160

function compactKernelText(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim()
  return (text || fallback).replace(/[^a-zA-Z0-9_./:=@%+ -]/g, '').replace(/\s+/g, ' ').slice(0, KERNEL_DIAGNOSTIC_TEXT_LIMIT)
}

function compactTmuxWindowTarget(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw || raw.length > KERNEL_DIAGNOSTIC_TEXT_LIMIT) return ''
  if (raw !== compactKernelText(raw)) return ''
  return /^[a-zA-Z0-9_./:=@%+-]+$/.test(raw) ? raw : ''
}

function compactTmuxSessionName(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw || raw.length > KERNEL_DIAGNOSTIC_TEXT_LIMIT) return ''
  if (raw !== compactKernelText(raw)) return ''
  return /^[a-zA-Z0-9_./=%+-]+$/.test(raw) ? raw : ''
}

function compactHelperPath(value: unknown): string {
  const raw = String(value ?? '').trim().replace(/\\/g, '/')
  const parts = raw.split('/').filter(Boolean)
  const basename = parts.length > 0 ? parts[parts.length - 1] : raw
  return compactKernelText(basename, 'helper')
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
  if (!raw || raw === 'default') return 'default'
  if (raw === 'none' || raw === 'off' || raw === 'disabled') return 'disabled'
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

export function defaultAgentTeamKernelPackagedHelperManifestPath(env: Record<string, string | undefined> = process.env): string | undefined {
  const path = env.PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST
  const trimmed = path?.trim()
  return trimmed || undefined
}

export function defaultAgentTeamKernelPackagedHelperRoot(env: Record<string, string | undefined> = process.env): string | undefined {
  const path = env.PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT
  const trimmed = path?.trim()
  return trimmed || undefined
}

export function defaultAgentTeamKernelEmbeddedHelperRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

export function defaultAgentTeamKernelEmbeddedHelperManifestPath(): string {
  return DEFAULT_EMBEDDED_HELPER_MANIFEST_PATH
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

function packagedManifestResolverFailure(input: { manifestPath?: string; installRoot?: string }): { kind: AgentTeamKernelCutoverFailureKind; detail: string } | undefined {
  if (input.manifestPath && !input.installRoot) return { kind: 'missing-helper', detail: 'packaged manifest root missing' }
  if (input.installRoot && !input.manifestPath) return { kind: 'missing-helper', detail: 'packaged manifest path missing' }
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
      tmuxSnapshotCaptureConnected: metadata.kernel.enabled && metadata.kernel.capabilities.includes('tmuxSnapshotCapture'),
      compactReadModelFingerprintConnected: metadata.kernel.enabled && metadata.kernel.capabilities.includes('compactReadModelFingerprint'),
      workerLifecycleInspectPaneConnected: metadata.kernel.enabled && metadata.kernel.capabilities.includes('workerLifecycle'),
      workerLifecycleListAgentTeamPanesConnected: metadata.kernel.enabled && metadata.kernel.capabilities.includes('workerLifecycle'),
      workerLifecycleCaptureCurrentPaneBindingConnected: metadata.kernel.enabled && metadata.kernel.capabilities.includes('workerLifecycle'),
      workerLifecycleListPanesInWindowConnected: metadata.kernel.enabled && metadata.kernel.capabilities.includes('workerLifecycle'),
      workerLifecycleFindAgentTeamWindowTargetConnected: metadata.kernel.enabled && metadata.kernel.capabilities.includes('workerLifecycle'),
      workerLifecycleSessionExistsConnected: metadata.kernel.enabled && metadata.kernel.capabilities.includes('workerLifecycle'),
      tmuxAvailabilityConnected: metadata.kernel.enabled && metadata.kernel.capabilities.includes('tmuxAvailability'),
      panelConnected: false,
      taskReportPlanRunConnected: false,
    },
  }
}

export function createAgentTeamKernelAdapter(options: AgentTeamKernelAdapterOptions = {}): AgentTeamKernelAdapter {
  const env = options.env ?? process.env
  const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)
  const explicitHelperPath = options.helperPath === null ? undefined : (options.helperPath?.trim() || defaultAgentTeamKernelHelperPath(env))
  const defaultRequested = requestedMode === 'default'
  const packagedPreviewRequested = requestedMode === 'go-packaged-preview'
  const defaultCutoverRequested = defaultRequested || requestedMode === 'go'
  const packagedResolverRequested = packagedPreviewRequested || defaultCutoverRequested
  const packagedHelperStatus = normalizeAgentTeamKernelPackagedHelperStatus(options.packagedHelperStatus ?? env.PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_STATUS)
  const packagedResolverFailure = packagedResolverRequested && !explicitHelperPath ? packagedPreviewResolverFailure(packagedHelperStatus) : undefined
  const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure
    ? (options.packagedHelperPath === null ? undefined : (options.packagedHelperPath?.trim() || defaultAgentTeamKernelPackagedHelperPath(env)))
    : undefined
  const packagedManifestPath = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure
    ? (packagedPreviewRequested
      ? (options.packagedHelperManifestPath === null ? undefined : (options.packagedHelperManifestPath?.trim() || defaultAgentTeamKernelPackagedHelperManifestPath(env)))
      : defaultAgentTeamKernelEmbeddedHelperManifestPath())
    : undefined
  const packagedManifestInstallRoot = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure
    ? (packagedPreviewRequested
      ? (options.packagedHelperInstallRoot === null ? undefined : (options.packagedHelperInstallRoot?.trim() || defaultAgentTeamKernelPackagedHelperRoot(env)))
      : defaultAgentTeamKernelEmbeddedHelperRoot())
    : undefined
  const packagedManifestRequested = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure && Boolean(packagedManifestPath || packagedManifestInstallRoot)
  const packagedManifestResult = packagedManifestRequested && packagedManifestPath && packagedManifestInstallRoot
    ? resolveAgentTeamPackagedHelperManifest({ installedRoot: packagedManifestInstallRoot, manifestPath: packagedManifestPath })
    : undefined
  const packagedManifestFailure = packagedManifestResult?.status === 'unavailable'
    ? { kind: packagedManifestResult.cutoverFailureKind, detail: `packaged manifest ${packagedManifestResult.failureKind}` }
    : (packagedManifestRequested && !packagedManifestResult) ? packagedManifestResolverFailure({ manifestPath: packagedManifestPath, installRoot: packagedManifestInstallRoot }) : undefined
  const packagedManifestHelperPath = packagedManifestResult?.status === 'available' ? packagedManifestResult.helperPath : undefined
  const helperPath = explicitHelperPath || packagedHelperPath || packagedManifestHelperPath
  const helperAvailable = Boolean(helperPath && !packagedResolverFailure && !packagedManifestFailure && existsSync(helperPath))
  const requestedKnownKernel = isKnownAgentTeamKernelMode(requestedMode)
  const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested
  const initialUseGo = requestedKnownKernel && (defaultCutoverRequested || requestedMode === 'auto' || cutoverRequested) && helperAvailable
  const timeoutMs = Math.max(100, Math.min(10_000, Math.floor(options.timeoutMs ?? 2_000)))
  const startupFallback = cutoverRequested ? undefined : initialFallback({ requestedMode, helperPath, helperAvailable })
  const startupCutoverFailure = cutoverRequested
    ? packagedResolverFailure ?? packagedManifestFailure ?? (!helperAvailable ? {
      kind: 'missing-helper' as const,
      detail: helperPath ? 'helper not found' : (packagedResolverRequested ? 'packaged helper not configured' : 'PI_AGENTTEAM_KERNEL_HELPER is not set'),
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
    if (profile.tmuxSnapshotParseConnected !== true || profile.tmuxSnapshotCaptureConnected !== true || profile.compactReadModelFingerprintConnected !== true) return undefined
    if (profile.workerLifecycleInspectPaneConnected !== true || profile.workerLifecycleListAgentTeamPanesConnected !== true) return undefined
    if (profile.workerLifecycleCaptureCurrentPaneBindingConnected !== undefined && profile.workerLifecycleCaptureCurrentPaneBindingConnected !== true) return undefined
    if (profile.workerLifecycleListPanesInWindowConnected !== undefined && profile.workerLifecycleListPanesInWindowConnected !== true) return undefined
    if (profile.workerLifecycleFindAgentTeamWindowTargetConnected !== undefined && profile.workerLifecycleFindAgentTeamWindowTargetConnected !== true) return undefined
    if (profile.workerLifecycleSessionExistsConnected !== undefined && profile.workerLifecycleSessionExistsConnected !== true) return undefined
    if (profile.tmuxAvailabilityConnected !== undefined && profile.tmuxAvailabilityConnected !== true) return undefined
    if (profile.panelConnected !== false || profile.taskReportPlanRunConnected !== false) return undefined
    return {
      ...health,
      profile: {
        scope: 'skeleton-only',
        params: { ...(params ?? {}) },
        stateConnected: false,
        tmuxConnected: false,
        tmuxSnapshotParseConnected: true,
        tmuxSnapshotCaptureConnected: true,
        compactReadModelFingerprintConnected: true,
        workerLifecycleInspectPaneConnected: true,
        workerLifecycleListAgentTeamPanesConnected: true,
        workerLifecycleCaptureCurrentPaneBindingConnected: profile.workerLifecycleCaptureCurrentPaneBindingConnected === true,
        workerLifecycleListPanesInWindowConnected: profile.workerLifecycleListPanesInWindowConnected === true,
        workerLifecycleFindAgentTeamWindowTargetConnected: profile.workerLifecycleFindAgentTeamWindowTargetConnected === true,
        workerLifecycleSessionExistsConnected: profile.workerLifecycleSessionExistsConnected === true,
        tmuxAvailabilityConnected: profile.tmuxAvailabilityConnected === true,
        panelConnected: false,
        taskReportPlanRunConnected: false,
      },
    }
  }

  function cutoverUnavailableSnapshot(capturedAt: number, capability: AgentTeamKernelTmuxSnapshotCapability = AGENTTEAM_KERNEL_CUTOVER_MODULE): AgentTeamKernelTmuxSnapshot {
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
      module: capability,
      capability,
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
    const ok = snapshot.ok === undefined ? true : Boolean(snapshot.ok)
    if (ok) {
      return { capturedAt: snapshot.capturedAt, panes, byPaneId, ok: true }
    }
    const capability = snapshot.capability === AGENTTEAM_KERNEL_TMUX_SNAPSHOT_CAPTURE_MODULE
      ? AGENTTEAM_KERNEL_TMUX_SNAPSHOT_CAPTURE_MODULE
      : AGENTTEAM_KERNEL_CUTOVER_MODULE
    const failureKind = AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS.includes(snapshot.cutoverFailureKind as AgentTeamKernelCutoverFailureKind)
      ? snapshot.cutoverFailureKind as AgentTeamKernelCutoverFailureKind
      : 'previous-helper-failure'
    const reason = compactKernelText(snapshot.reason || snapshot.error || cutoverMessage(failureKind), cutoverMessage(failureKind))
    return {
      capturedAt: snapshot.capturedAt,
      panes,
      byPaneId,
      ok: false,
      status: 'unknown',
      resultMarker: 'stale',
      module: capability,
      capability,
      cutoverFailureKind: failureKind,
      reason,
      error: reason,
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

  function workerLifecycleUnavailableInspection(paneId: string, kind: AgentTeamKernelWorkerLifecycleFailureKind, detail?: unknown): AgentTeamKernelWorkerPaneInspection {
    const safePaneId = compactKernelText(paneId, 'unknown')
    const reason = kind === 'pane-not-found'
      ? `Go worker lifecycle inspectPane unavailable (pane-not-found)`
      : cutoverMessage(kind as AgentTeamKernelCutoverFailureKind, detail)
    const safeReason = compactKernelText(reason, cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      operation: 'inspectPane',
      capability: 'workerLifecycle',
      paneId: safePaneId,
      requestedPaneId: safePaneId,
      exists: false,
      status: 'unknown',
      resultMarker: 'stale',
      failureKind: kind,
      reason: safeReason,
      error: safeReason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    }
  }

  function workerLifecycleUnavailablePaneList(kind: AgentTeamKernelWorkerLifecycleFailureKind, detail?: unknown): AgentTeamKernelWorkerPaneList {
    const reason = cutoverMessage(kind as AgentTeamKernelCutoverFailureKind, detail)
    const safeReason = compactKernelText(reason, cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      operation: 'listAgentTeamPanes',
      capability: 'workerLifecycle',
      panes: [],
      byPaneId: {},
      status: 'unknown',
      resultMarker: 'stale',
      failureKind: kind,
      reason: safeReason,
      error: safeReason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    }
  }

  function workerLifecycleUnavailableCurrentPaneBinding(kind: AgentTeamKernelWorkerLifecycleFailureKind, detail?: unknown): AgentTeamKernelCurrentPaneBinding {
    const reason = kind === 'pane-not-found'
      ? `Go worker lifecycle captureCurrentPaneBinding unavailable (pane-not-found)`
      : cutoverMessage(kind as AgentTeamKernelCutoverFailureKind, detail)
    const safeReason = compactKernelText(reason, cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      operation: 'captureCurrentPaneBinding',
      capability: 'workerLifecycle',
      status: 'unknown',
      resultMarker: 'stale',
      failureKind: kind,
      reason: safeReason,
      error: safeReason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    }
  }

  function workerLifecycleUnavailableWindowPaneList(target: string, kind: AgentTeamKernelWorkerLifecycleFailureKind, detail?: unknown): AgentTeamKernelWindowPaneList {
    const safeTarget = compactTmuxWindowTarget(target)
    const reason = kind === 'invalid-target'
      ? 'Go worker lifecycle listPanesInWindow unavailable (invalid-target)'
      : cutoverMessage(kind as AgentTeamKernelCutoverFailureKind, detail)
    const safeReason = compactKernelText(reason, cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      operation: 'listPanesInWindow',
      capability: 'workerLifecycle',
      target: safeTarget,
      exists: false,
      paneIds: [],
      status: 'unknown',
      resultMarker: 'stale',
      failureKind: kind,
      reason: safeReason,
      error: safeReason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    }
  }

  function workerLifecycleUnavailableAgentTeamWindowTarget(sessionName: string, kind: AgentTeamKernelWorkerLifecycleFailureKind, detail?: unknown): AgentTeamKernelAgentTeamWindowTarget {
    const safeSessionName = compactTmuxSessionName(sessionName)
    const reason = kind === 'invalid-session'
      ? 'Go worker lifecycle findAgentTeamWindowTarget unavailable (invalid-session)'
      : kind === 'pane-not-found'
        ? 'Go worker lifecycle findAgentTeamWindowTarget unavailable (pane-not-found)'
        : cutoverMessage(kind as AgentTeamKernelCutoverFailureKind, detail)
    const safeReason = compactKernelText(reason, cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      operation: 'findAgentTeamWindowTarget',
      capability: 'workerLifecycle',
      sessionName: safeSessionName,
      exists: false,
      status: 'unknown',
      resultMarker: 'stale',
      failureKind: kind,
      reason: safeReason,
      error: safeReason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    }
  }

  function workerLifecycleUnavailableSessionExistence(sessionName: string, kind: AgentTeamKernelWorkerLifecycleFailureKind, detail?: unknown): AgentTeamKernelSessionExistence {
    const safeSessionName = compactTmuxSessionName(sessionName)
    const reason = kind === 'invalid-session'
      ? 'Go worker lifecycle sessionExists unavailable (invalid-session)'
      : kind === 'pane-not-found'
        ? 'Go worker lifecycle sessionExists unavailable (pane-not-found)'
        : cutoverMessage(kind as AgentTeamKernelCutoverFailureKind, detail)
    const safeReason = compactKernelText(reason, cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      operation: 'sessionExists',
      capability: 'workerLifecycle',
      sessionName: safeSessionName,
      exists: false,
      status: 'unknown',
      resultMarker: 'stale',
      failureKind: kind,
      reason: safeReason,
      error: safeReason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    }
  }

  function unavailableTmuxAvailability(kind: AgentTeamKernelCutoverFailureKind, detail?: unknown): AgentTeamKernelTmuxAvailability {
    const reason = cutoverMessage(kind, detail)
    const safeReason = compactKernelText(reason, cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      capability: 'tmuxAvailability',
      available: false,
      status: 'unknown',
      resultMarker: 'stale',
      failureKind: kind,
      reason: safeReason,
      error: safeReason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    }
  }

  function validateWorkerPaneSnapshotItem(value: unknown): AgentTeamKernelTmuxPaneSnapshotItem | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const pane = value as Partial<AgentTeamKernelTmuxPaneSnapshotItem>
    const paneId = compactKernelText(pane.paneId)
    if (!paneId) return undefined
    return {
      paneId,
      target: compactKernelText(pane.target),
      label: compactKernelText(pane.label),
      currentCommand: compactKernelText(pane.currentCommand),
    }
  }

  function validateWorkerPaneInspectionResult(value: unknown, requestedPaneId: string): AgentTeamKernelWorkerPaneInspection | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const result = value as Partial<AgentTeamKernelWorkerPaneInspection>
    if (result.operation !== 'inspectPane' || result.capability !== 'workerLifecycle') return undefined
    if (result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) return undefined
    const requested = compactKernelText(result.requestedPaneId || requestedPaneId, 'unknown')
    const paneId = compactKernelText(result.paneId || requested, requested)
    if (result.ok === true) {
      if (result.exists !== true || !paneId) return undefined
      const target = typeof result.target === 'string' ? compactKernelText(result.target) : ''
      return {
        ok: true,
        operation: 'inspectPane',
        capability: 'workerLifecycle',
        paneId,
        requestedPaneId: requested,
        exists: true,
        ...(target ? { target } : {}),
        ...(typeof result.currentCommand === 'string' && result.currentCommand ? { currentCommand: compactKernelText(result.currentCommand) } : {}),
        ...(typeof result.inMode === 'boolean' ? { inMode: result.inMode } : {}),
        ...(typeof result.mode === 'string' && result.mode ? { mode: compactKernelText(result.mode) } : {}),
        ...(typeof result.copyMode === 'boolean' ? { copyMode: result.copyMode } : {}),
        readOnly: true,
        stateFilesRead: false,
        stateFilesWritten: false,
        tmuxMutation: false,
      }
    }
    if (result.ok !== false || result.exists !== false) return undefined
    const failureKind = typeof result.failureKind === 'string' && ['unsupported-operation', 'pane-not-found', 'invalid-pane-id', ...AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS].includes(result.failureKind)
      ? result.failureKind as AgentTeamKernelWorkerLifecycleFailureKind
      : 'previous-helper-failure'
    const reason = compactKernelText(result.reason || result.error || cutoverMessage(failureKind as AgentTeamKernelCutoverFailureKind), cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      operation: 'inspectPane',
      capability: 'workerLifecycle',
      paneId,
      requestedPaneId: requested,
      exists: false,
      status: 'unknown',
      resultMarker: 'stale',
      failureKind,
      reason,
      error: reason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    }
  }

  function validateWorkerPaneListResult(value: unknown): AgentTeamKernelWorkerPaneList | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const result = value as Partial<AgentTeamKernelWorkerPaneList>
    if (result.operation !== 'listAgentTeamPanes' || result.capability !== 'workerLifecycle') return undefined
    if (result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) return undefined
    if (result.ok === true) {
      if (!Array.isArray(result.panes) || !result.byPaneId || typeof result.byPaneId !== 'object' || Array.isArray(result.byPaneId)) return undefined
      const panes: AgentTeamKernelTmuxPaneSnapshotItem[] = []
      const byPaneId: Record<string, AgentTeamKernelTmuxPaneSnapshotItem> = {}
      for (const rawPane of result.panes) {
        const pane = validateWorkerPaneSnapshotItem(rawPane)
        if (!pane) return undefined
        panes.push(pane)
        byPaneId[pane.paneId] = pane
      }
      return {
        ok: true,
        operation: 'listAgentTeamPanes',
        capability: 'workerLifecycle',
        panes,
        byPaneId,
        readOnly: true,
        stateFilesRead: false,
        stateFilesWritten: false,
        tmuxMutation: false,
      }
    }
    if (result.ok !== false) return undefined
    const failureKind = typeof result.failureKind === 'string' && ['unsupported-operation', 'pane-not-found', 'invalid-pane-id', ...AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS].includes(result.failureKind)
      ? result.failureKind as AgentTeamKernelWorkerLifecycleFailureKind
      : 'previous-helper-failure'
    const reason = compactKernelText(result.reason || result.error || cutoverMessage(failureKind as AgentTeamKernelCutoverFailureKind), cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      operation: 'listAgentTeamPanes',
      capability: 'workerLifecycle',
      panes: [],
      byPaneId: {},
      status: 'unknown',
      resultMarker: 'stale',
      failureKind,
      reason,
      error: reason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    }
  }

  function validateCurrentPaneBindingResult(value: unknown): AgentTeamKernelCurrentPaneBinding | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const result = value as Partial<AgentTeamKernelCurrentPaneBinding>
    if (result.operation !== 'captureCurrentPaneBinding' || result.capability !== 'workerLifecycle') return undefined
    if (result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) return undefined
    if (result.ok === true) {
      const paneId = compactKernelText(result.paneId)
      const target = compactKernelText(result.target)
      if (!paneId || !target) return undefined
      return {
        ok: true,
        operation: 'captureCurrentPaneBinding',
        capability: 'workerLifecycle',
        paneId,
        target,
        readOnly: true,
        stateFilesRead: false,
        stateFilesWritten: false,
        tmuxMutation: false,
      }
    }
    if (result.ok !== false) return undefined
    const failureKind = typeof result.failureKind === 'string' && ['unsupported-operation', 'pane-not-found', 'invalid-pane-id', ...AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS].includes(result.failureKind)
      ? result.failureKind as AgentTeamKernelWorkerLifecycleFailureKind
      : 'previous-helper-failure'
    const reason = compactKernelText(result.reason || result.error || cutoverMessage(failureKind as AgentTeamKernelCutoverFailureKind), cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      operation: 'captureCurrentPaneBinding',
      capability: 'workerLifecycle',
      status: 'unknown',
      resultMarker: 'stale',
      failureKind,
      reason,
      error: reason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    }
  }

  function validateWindowPaneListResult(value: unknown, requestedTarget: string): AgentTeamKernelWindowPaneList | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const result = value as Partial<AgentTeamKernelWindowPaneList>
    if (result.operation !== 'listPanesInWindow' || result.capability !== 'workerLifecycle') return undefined
    if (result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) return undefined
    const target = compactTmuxWindowTarget(result.target || requestedTarget)
    if (result.ok === true) {
      if (!target || result.exists !== true || !Array.isArray(result.paneIds)) return undefined
      const paneIds: string[] = []
      for (const rawPaneId of result.paneIds) {
        const paneId = compactKernelText(rawPaneId)
        if (!paneId) return undefined
        paneIds.push(paneId)
      }
      return {
        ok: true,
        operation: 'listPanesInWindow',
        capability: 'workerLifecycle',
        target,
        exists: true,
        paneIds,
        readOnly: true,
        stateFilesRead: false,
        stateFilesWritten: false,
        tmuxMutation: false,
      }
    }
    if (result.ok !== false || result.exists !== false) return undefined
    const failureKind = typeof result.failureKind === 'string' && ['unsupported-operation', 'pane-not-found', 'invalid-pane-id', 'invalid-target', ...AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS].includes(result.failureKind)
      ? result.failureKind as AgentTeamKernelWorkerLifecycleFailureKind
      : 'previous-helper-failure'
    const reason = compactKernelText(result.reason || result.error || cutoverMessage(failureKind as AgentTeamKernelCutoverFailureKind), cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      operation: 'listPanesInWindow',
      capability: 'workerLifecycle',
      target,
      exists: false,
      paneIds: [],
      status: 'unknown',
      resultMarker: 'stale',
      failureKind,
      reason,
      error: reason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    }
  }

  function validateAgentTeamWindowTargetResult(value: unknown, requestedSessionName: string): AgentTeamKernelAgentTeamWindowTarget | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const result = value as Partial<AgentTeamKernelAgentTeamWindowTarget>
    if (result.operation !== 'findAgentTeamWindowTarget' || result.capability !== 'workerLifecycle') return undefined
    if (result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) return undefined
    const sessionName = compactTmuxSessionName(result.sessionName || requestedSessionName)
    if (result.ok === true) {
      const windowId = compactKernelText(result.windowId)
      const target = compactTmuxWindowTarget(result.target)
      if (!sessionName || result.exists !== true || !windowId || !target || target !== `${sessionName}:${windowId}`) return undefined
      return {
        ok: true,
        operation: 'findAgentTeamWindowTarget',
        capability: 'workerLifecycle',
        sessionName,
        exists: true,
        target,
        windowId,
        readOnly: true,
        stateFilesRead: false,
        stateFilesWritten: false,
        tmuxMutation: false,
      }
    }
    if (result.ok !== false || result.exists !== false) return undefined
    const failureKind = typeof result.failureKind === 'string' && ['unsupported-operation', 'pane-not-found', 'invalid-pane-id', 'invalid-target', 'invalid-session', ...AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS].includes(result.failureKind)
      ? result.failureKind as AgentTeamKernelWorkerLifecycleFailureKind
      : 'previous-helper-failure'
    const reason = compactKernelText(result.reason || result.error || cutoverMessage(failureKind as AgentTeamKernelCutoverFailureKind), cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      operation: 'findAgentTeamWindowTarget',
      capability: 'workerLifecycle',
      sessionName,
      exists: false,
      status: 'unknown',
      resultMarker: 'stale',
      failureKind,
      reason,
      error: reason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    }
  }

  function validateSessionExistenceResult(value: unknown, requestedSessionName: string): AgentTeamKernelSessionExistence | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const result = value as Partial<AgentTeamKernelSessionExistence>
    if (result.operation !== 'sessionExists' || result.capability !== 'workerLifecycle') return undefined
    if (result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) return undefined
    const sessionName = compactTmuxSessionName(result.sessionName || requestedSessionName)
    if (result.ok === true) {
      if (!sessionName || result.exists !== true) return undefined
      return {
        ok: true,
        operation: 'sessionExists',
        capability: 'workerLifecycle',
        sessionName,
        exists: true,
        readOnly: true,
        stateFilesRead: false,
        stateFilesWritten: false,
        tmuxMutation: false,
      }
    }
    if (result.ok !== false || result.exists !== false) return undefined
    const failureKind = typeof result.failureKind === 'string' && ['unsupported-operation', 'pane-not-found', 'invalid-pane-id', 'invalid-target', 'invalid-session', ...AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS].includes(result.failureKind)
      ? result.failureKind as AgentTeamKernelWorkerLifecycleFailureKind
      : 'previous-helper-failure'
    const reason = compactKernelText(result.reason || result.error || cutoverMessage(failureKind as AgentTeamKernelCutoverFailureKind), cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      operation: 'sessionExists',
      capability: 'workerLifecycle',
      sessionName,
      exists: false,
      status: 'unknown',
      resultMarker: 'stale',
      failureKind,
      reason,
      error: reason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
    }
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

  function validateTmuxAvailabilityResult(value: unknown): AgentTeamKernelTmuxAvailability | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const result = value as Partial<AgentTeamKernelTmuxAvailability>
    if (result.capability !== 'tmuxAvailability') return undefined
    if (result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) return undefined
    if (result.ok === true) {
      if (result.available !== true) return undefined
      const version = compactKernelText(result.version)
      return {
        ok: true,
        capability: 'tmuxAvailability',
        available: true,
        ...(version ? { version } : {}),
        readOnly: true,
        stateFilesRead: false,
        stateFilesWritten: false,
        tmuxMutation: false,
      }
    }
    if (result.ok !== false || result.available !== false) return undefined
    const failureKind = typeof result.failureKind === 'string' && AGENTTEAM_KERNEL_CUTOVER_FAILURE_KINDS.includes(result.failureKind as AgentTeamKernelCutoverFailureKind)
      ? result.failureKind as AgentTeamKernelCutoverFailureKind
      : 'previous-helper-failure'
    const reason = compactKernelText(result.reason || result.error || cutoverMessage(failureKind), cutoverMessage('previous-helper-failure'))
    return {
      ok: false,
      capability: 'tmuxAvailability',
      available: false,
      status: 'unknown',
      resultMarker: 'stale',
      failureKind,
      reason,
      error: reason,
      readOnly: true,
      stateFilesRead: false,
      stateFilesWritten: false,
      tmuxMutation: false,
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
    if (code === 'ABORT_ERR' || /abort/i.test(message)) {
      return { kind: 'helper-spawn-error', detail: 'aborted' }
    }
    return { kind: 'helper-spawn-error', detail: code ? `code=${compactKernelText(code)}` : compactKernelText(err.name, 'spawn error') }
  }

  function helperSpawnEnv(): Record<string, string> {
    return {
      PATH: env.PATH ?? process.env.PATH ?? '',
      ...(env.TMUX ? { TMUX: env.TMUX } : {}),
      ...(env.TMUX_PANE ? { TMUX_PANE: env.TMUX_PANE } : {}),
    }
  }

  function parseHelperResponse<T>(stdout: unknown): { ok: true; result: T } | { ok: false; kind: AgentTeamKernelHelperFailureKind; detail?: string } {
    const responseText = String(stdout || '').split('\n').find(line => line.trim())
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
      env: helperSpawnEnv(),
    })
    if (result.error) {
      return { ok: false, ...classifySpawnError(result.error) }
    }
    if (result.status !== 0) {
      const signal = typeof result.signal === 'string' && result.signal ? result.signal : ''
      if (signal) return { ok: false, kind: 'helper-crash', detail: `signal=${compactKernelText(signal)}` }
      return { ok: false, kind: 'helper-nonzero-exit', detail: `status=${result.status ?? 'unknown'}` }
    }
    return parseHelperResponse<T>(result.stdout)
  }

  function invokeHelperAsync<T>(method: AgentTeamKernelCapability, params?: Record<string, unknown>, signal?: AbortSignal): Promise<{ ok: true; result: T } | { ok: false; kind: AgentTeamKernelHelperFailureKind; detail?: string }> {
    if (signal?.aborted) return Promise.resolve({ ok: false, kind: 'helper-spawn-error', detail: 'aborted' })
    if (helperDisabledAfterFailure) return Promise.resolve({ ok: false, kind: cutoverRequested ? 'previous-helper-failure' : 'missing-helper', detail: 'helper disabled after prior failure' })
    if (!usesGo() || !helperPath) return Promise.resolve({ ok: false, kind: 'missing-helper', detail: 'helper unavailable' })
    helperCalls += 1
    const request = createKernelJsonRpcRequest(method, params)
    return new Promise(resolve => {
      let settled = false
      let stdout = ''
      let stderrLength = 0
      const child = spawn(helperPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: helperSpawnEnv(),
        signal,
      })
      type TimerHandle = ReturnType<typeof setImmediate>
      const timers = globalThis as unknown as Record<string, unknown>
      const scheduleTimeout = timers['set' + 'Timeout'] as (callback: () => void, ms: number) => TimerHandle
      const cancelTimeout = timers['clear' + 'Timeout'] as (timer: TimerHandle) => void
      const helperTimer = scheduleTimeout(() => {
        if (settled) return
        child.kill('SIGTERM')
      }, timeoutMs)
      function finish(result: { ok: true; result: T } | { ok: false; kind: AgentTeamKernelHelperFailureKind; detail?: string }): void {
        if (settled) return
        settled = true
        cancelTimeout(helperTimer)
        resolve(result)
      }
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', chunk => {
        if (stdout.length < 1024 * 1024) stdout += String(chunk).slice(0, 1024 * 1024 - stdout.length)
      })
      child.stderr.on('data', chunk => {
        stderrLength += Buffer.byteLength(chunk)
      })
      child.on('error', error => {
        finish({ ok: false, ...classifySpawnError(error) })
      })
      child.on('close', (status, closeSignal) => {
        if (settled) return
        if (signal?.aborted) {
          finish({ ok: false, kind: 'helper-spawn-error', detail: 'aborted' })
          return
        }
        if (closeSignal) {
          finish({ ok: false, kind: closeSignal === 'SIGTERM' ? 'helper-timeout' : 'helper-crash', detail: closeSignal === 'SIGTERM' ? `timeoutMs=${timeoutMs}` : `signal=${compactKernelText(closeSignal)}` })
          return
        }
        if (status !== 0) {
          finish({ ok: false, kind: 'helper-nonzero-exit', detail: `status=${status ?? 'unknown'}${stderrLength ? '; stderr=redacted' : ''}` })
          return
        }
        finish(parseHelperResponse<T>(stdout))
      })
      child.stdin.end(`${JSON.stringify(request)}\n`)
    })
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

  async function ensureHelperCompatibleAsync(method: AgentTeamKernelCapability, signal?: AbortSignal): Promise<boolean> {
    if (!usesGo()) return false
    if (helperPreflightPassed) return true
    const healthCall = await invokeHelperAsync<unknown>('health', undefined, signal)
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

  async function callHelperAsync<T>(method: AgentTeamKernelCapability, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T | undefined> {
    if (helperDisabledAfterFailure && cutoverRequested) {
      recordCutoverUnavailable('previous-helper-failure', 'helper disabled after prior failure')
      return undefined
    }
    if (!usesGo() || !helperPath) return undefined
    if (method !== 'health' && !(await ensureHelperCompatibleAsync(method, signal))) return undefined
    const helperCall = await invokeHelperAsync<T>(method, params, signal)
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
      if (cutoverRequested || !fallback) return cutoverUnavailableSnapshot(capturedAt)
      return fallback(stdout, capturedAt)
    },
    captureTmuxSnapshot(capturedAt) {
      const helperResult = callHelper<unknown>('tmuxSnapshotCapture', { capturedAt })
      const unsafe = helperResult !== undefined ? classifyUnsafeTmuxSnapshotResult(helperResult) : undefined
      if (!unsafe) {
        const parsed = validateTmuxSnapshotResult(helperResult)
        if (parsed) return parsed
      }
      if (helperResult !== undefined) {
        recordRuntimeFallback(unsafe?.kind ?? 'helper-incompatible-response', unsafe?.detail ?? 'tmuxSnapshotCapture result shape')
      }
      return cutoverUnavailableSnapshot(capturedAt, AGENTTEAM_KERNEL_TMUX_SNAPSHOT_CAPTURE_MODULE)
    },
    inspectWorkerPane(paneId) {
      const requestedPaneId = compactKernelText(paneId, 'unknown')
      const helperResult = callHelper<unknown>('workerLifecycle', { operation: 'inspectPane', paneId: requestedPaneId })
      const parsed = validateWorkerPaneInspectionResult(helperResult, requestedPaneId)
      if (parsed) return parsed
      if (helperResult !== undefined) {
        recordRuntimeFallback('helper-incompatible-response', 'workerLifecycle inspectPane result shape')
      }
      return workerLifecycleUnavailableInspection(requestedPaneId, cutoverFailureKind ?? 'previous-helper-failure')
    },
    async inspectWorkerPaneAsync(paneId, signal) {
      const requestedPaneId = compactKernelText(paneId, 'unknown')
      const helperResult = await callHelperAsync<unknown>('workerLifecycle', { operation: 'inspectPane', paneId: requestedPaneId }, signal)
      const parsed = validateWorkerPaneInspectionResult(helperResult, requestedPaneId)
      if (parsed) return parsed
      if (helperResult !== undefined) {
        recordRuntimeFallback('helper-incompatible-response', 'workerLifecycle inspectPane async result shape')
      }
      return workerLifecycleUnavailableInspection(requestedPaneId, cutoverFailureKind ?? 'previous-helper-failure')
    },
    listAgentTeamPanes() {
      const helperResult = callHelper<unknown>('workerLifecycle', { operation: 'listAgentTeamPanes' })
      const parsed = validateWorkerPaneListResult(helperResult)
      if (parsed) return parsed
      if (helperResult !== undefined) {
        recordRuntimeFallback('helper-incompatible-response', 'workerLifecycle listAgentTeamPanes result shape')
      }
      return workerLifecycleUnavailablePaneList(cutoverFailureKind ?? 'previous-helper-failure')
    },
    captureCurrentPaneBinding() {
      const helperResult = callHelper<unknown>('workerLifecycle', { operation: 'captureCurrentPaneBinding' })
      const parsed = validateCurrentPaneBindingResult(helperResult)
      if (parsed) return parsed
      if (helperResult !== undefined) {
        recordRuntimeFallback('helper-incompatible-response', 'workerLifecycle captureCurrentPaneBinding result shape')
      }
      return workerLifecycleUnavailableCurrentPaneBinding(cutoverFailureKind ?? 'previous-helper-failure')
    },
    async listPanesInWindowAsync(target, signal) {
      const requestedTarget = compactTmuxWindowTarget(target)
      if (!requestedTarget) return workerLifecycleUnavailableWindowPaneList(target, 'invalid-target')
      const helperResult = await callHelperAsync<unknown>('workerLifecycle', { operation: 'listPanesInWindow', target: requestedTarget }, signal)
      const parsed = validateWindowPaneListResult(helperResult, requestedTarget)
      if (parsed) return parsed
      if (helperResult !== undefined) {
        recordRuntimeFallback('helper-incompatible-response', 'workerLifecycle listPanesInWindow async result shape')
      }
      return workerLifecycleUnavailableWindowPaneList(requestedTarget, cutoverFailureKind ?? 'previous-helper-failure')
    },
    async findAgentTeamWindowTargetAsync(sessionName, signal) {
      const requestedSessionName = compactTmuxSessionName(sessionName)
      if (!requestedSessionName) return workerLifecycleUnavailableAgentTeamWindowTarget(sessionName, 'invalid-session')
      const helperResult = await callHelperAsync<unknown>('workerLifecycle', { operation: 'findAgentTeamWindowTarget', sessionName: requestedSessionName }, signal)
      const parsed = validateAgentTeamWindowTargetResult(helperResult, requestedSessionName)
      if (parsed) return parsed
      if (helperResult !== undefined) {
        recordRuntimeFallback('helper-incompatible-response', 'workerLifecycle findAgentTeamWindowTarget async result shape')
      }
      return workerLifecycleUnavailableAgentTeamWindowTarget(requestedSessionName, cutoverFailureKind ?? 'previous-helper-failure')
    },
    async sessionExistsAsync(sessionName, signal) {
      const requestedSessionName = compactTmuxSessionName(sessionName)
      if (!requestedSessionName) return workerLifecycleUnavailableSessionExistence(sessionName, 'invalid-session')
      const helperResult = await callHelperAsync<unknown>('workerLifecycle', { operation: 'sessionExists', sessionName: requestedSessionName }, signal)
      const parsed = validateSessionExistenceResult(helperResult, requestedSessionName)
      if (parsed) return parsed
      if (helperResult !== undefined) {
        recordRuntimeFallback('helper-incompatible-response', 'workerLifecycle sessionExists async result shape')
      }
      return workerLifecycleUnavailableSessionExistence(requestedSessionName, cutoverFailureKind ?? 'previous-helper-failure')
    },
    async checkTmuxAvailableAsync(signal) {
      const helperResult = await callHelperAsync<unknown>('tmuxAvailability', undefined, signal)
      const parsed = validateTmuxAvailabilityResult(helperResult)
      if (parsed) return parsed
      if (helperResult !== undefined) {
        recordRuntimeFallback('helper-incompatible-response', 'tmuxAvailability result shape')
      }
      return unavailableTmuxAvailability(cutoverFailureKind ?? 'previous-helper-failure')
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
