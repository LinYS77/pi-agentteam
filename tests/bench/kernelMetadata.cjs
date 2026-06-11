const VALID_KERNEL_MODES = new Set(['disabled', 'typescript', 'go', 'auto', 'go-cutover'])
const KERNEL_PROTOCOL_VERSION = 1
const KERNEL_ADAPTER_VERSION = '0.3.0-read-model-shadow'
const KERNEL_HELPER_VERSION = '0.3.0-read-model-shadow'
const KERNEL_CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'compactReadModelFingerprint']

function normalizeKernelMode(value = process.env.PI_AGENTTEAM_KERNEL) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw || raw === 'ts' || raw === 'typescript') return 'typescript'
  if (raw === 'none' || raw === 'off' || raw === 'disabled') return 'disabled'
  const sanitized = raw.replace(/[^a-z0-9_-]/g, '').slice(0, 32)
  return sanitized || 'typescript'
}

function buildKernelMetadata(options = {}) {
  const requestedMode = normalizeKernelMode(options.requestedMode)
  const requestedKnownKernel = VALID_KERNEL_MODES.has(requestedMode)
  const helperPath = String(process.env.PI_AGENTTEAM_KERNEL_HELPER || process.env.AGENTTEAM_GO_KERNEL_HELPER || '').trim()
  const fallbackKind = !requestedKnownKernel
    ? 'unsupported-mode'
    : requestedMode === 'go' && !helperPath
      ? 'missing-helper'
      : undefined
  const fallbackReason = fallbackKind === 'unsupported-mode'
    ? `Go kernel fallback (unsupported-mode): PI_AGENTTEAM_KERNEL=${requestedMode}; using TypeScript fallback`
    : fallbackKind === 'missing-helper'
      ? 'Go kernel fallback (missing-helper): PI_AGENTTEAM_KERNEL_HELPER is not set; using TypeScript fallback'
      : undefined

  return {
    implementation: 'typescript',
    kernel: {
      requestedMode,
      mode: 'typescript',
      enabled: false,
      calls: 0,
      fallbacks: fallbackReason ? 1 : 0,
      requestedKnownKernel,
      protocolVersion: KERNEL_PROTOCOL_VERSION,
      adapterVersion: KERNEL_ADAPTER_VERSION,
      helperVersion: KERNEL_HELPER_VERSION,
      capabilities: [...KERNEL_CAPABILITIES],
      businessPathsConnected: false,
      ...(fallbackReason ? { fallbackReason } : {}),
      ...(fallbackKind ? { fallbackKind } : {}),
    },
  }
}

function normalizeFixtureProfileName(value = 'baseline') {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw || raw === 'default') return 'baseline'
  return raw.replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'baseline'
}

function buildFixtureProfileMetadata(profileName) {
  const name = normalizeFixtureProfileName(profileName)
  return {
    name,
    stress: name !== 'baseline',
  }
}

module.exports = {
  buildFixtureProfileMetadata,
  buildKernelMetadata,
  normalizeFixtureProfileName,
  normalizeKernelMode,
}
