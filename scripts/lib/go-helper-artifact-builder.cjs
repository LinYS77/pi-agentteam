const cp = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const MODULE = 'tmuxSnapshotParse'
const PACKAGE_NAME = 'pi-agentteam'
const BUILDER_VERSION = '0.6.29-slice1-local-builder'
const REPO_ARTIFACT_DIR = '.agentteam-artifacts'
const HELPER_BASE = 'agentteam-tmuxSnapshotParse'
const ARTIFACT_INDEX_FILENAME = 'artifact-index.json'
const CI_REVIEW_RETENTION_DAYS = 7
const FAILURE_KINDS = new Set([
  'go-unavailable',
  'go-build-failed',
  'go-health-failed',
  'metadata-invalid',
  'output-root-forbidden',
  'unsupported-platform',
])

class GoHelperArtifactBuilderError extends Error {
  constructor(failureKind, remediation, hint) {
    super(failureKind)
    this.name = 'GoHelperArtifactBuilderError'
    this.failureKind = failureKind
    this.remediation = remediation
    this.hint = hint
  }

  toDiagnostic() {
    return compactFailure(this.failureKind, this.remediation, this.hint)
  }
}

function compactFailure(failureKind, remediation, hint) {
  if (!FAILURE_KINDS.has(failureKind)) throw new Error(`unexpected failureKind ${failureKind}`)
  return {
    ok: false,
    status: 'unavailable',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'fail-closed',
    failureKind,
    remediation,
    hint,
  }
}

function fail(failureKind, remediation, hint) {
  throw new GoHelperArtifactBuilderError(failureKind, remediation, hint)
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
}

function isInside(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function safeSegment(value, label) {
  const text = String(value || '')
  if (!/^[A-Za-z0-9._-]+$/.test(text)) fail('metadata-invalid', `regenerate safe ${label} metadata`, label)
  return text
}

function packageRelative(outputRoot, filePath) {
  const root = path.resolve(outputRoot)
  const resolved = path.resolve(filePath)
  if (!isInside(root, resolved)) fail('metadata-invalid', 'regenerate package-relative artifact paths', 'path')
  return toPosix(path.relative(root, resolved))
}

function classifyOutputRoot(outputRoot, extRoot) {
  const resolved = path.resolve(outputRoot)
  const repoArtifactRoot = path.resolve(extRoot, REPO_ARTIFACT_DIR)
  if (isInside(repoArtifactRoot, resolved)) return 'repo-ignored-artifacts'
  return 'os-temp'
}

function assertAllowedOutputRoot(outputRoot, extRoot) {
  const resolved = path.resolve(outputRoot)
  const root = path.resolve(extRoot)
  const repoArtifactRoot = path.resolve(root, REPO_ARTIFACT_DIR)
  const tmpRoot = path.resolve(os.tmpdir())

  if (isInside(root, resolved) && !isInside(repoArtifactRoot, resolved)) {
    fail('output-root-forbidden', `write only under OS temp or ignored ${REPO_ARTIFACT_DIR}`, 'repo-output')
  }
  if (!isInside(tmpRoot, resolved) && !isInside(repoArtifactRoot, resolved)) {
    fail('output-root-forbidden', `write only under OS temp or ignored ${REPO_ARTIFACT_DIR}`, 'output-root')
  }
}

function resolveOutputRoot(options) {
  const extRoot = path.resolve(options.extRoot || path.resolve(__dirname, '..', '..'))
  const outputRoot = options.outputRoot
    ? path.resolve(options.outputRoot)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0629-helper-artifact-'))
  assertAllowedOutputRoot(outputRoot, extRoot)
  fs.mkdirSync(outputRoot, { recursive: true })
  return { extRoot, outputRoot, outputRootKind: classifyOutputRoot(outputRoot, extRoot) }
}

function detectLinuxLibc(env = process.env) {
  try {
    const report = typeof process.report?.getReport === 'function' ? process.report.getReport() : null
    if (report?.header?.glibcVersionRuntime) return 'glibc'
  } catch (_) {}

  const result = cp.spawnSync('ldd', ['--version'], {
    encoding: 'utf8',
    timeout: 5_000,
    env: { ...process.env, ...env },
  })
  const text = `${result.stdout || ''}\n${result.stderr || ''}`.toLowerCase()
  if (text.includes('musl')) return 'musl'
  if (text.includes('glibc') || text.includes('gnu libc')) return 'glibc'
  return 'unknown'
}

function resolveHostTarget(options = {}) {
  const platform = options.platform || process.platform
  const arch = options.arch || process.arch
  const supportedArch = new Set(['x64', 'arm64'])
  if (!supportedArch.has(arch)) fail('unsupported-platform', 'add an explicit supported host target before building', 'arch')

  if (platform === 'linux') {
    const libc = options.libc || detectLinuxLibc(options.env)
    const target = `linux-${safeSegment(arch, 'arch')}-${safeSegment(libc, 'libc')}`
    return { os: 'linux', arch, libc, target, helperFile: HELPER_BASE }
  }
  if (platform === 'darwin') return { os: 'darwin', arch, target: `darwin-${safeSegment(arch, 'arch')}`, helperFile: HELPER_BASE }
  if (platform === 'win32') return { os: 'win32', arch, target: `win32-${safeSegment(arch, 'arch')}`, helperFile: `${HELPER_BASE}.exe` }
  fail('unsupported-platform', 'add an explicit supported host target before building', 'os')
}

function readPackageVersion(extRoot) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(extRoot, 'package.json'), 'utf8'))
    return String(packageJson.version || '')
  } catch (_) {
    fail('metadata-invalid', 'read package version before generating artifact metadata', 'package')
  }
}

function readGoSourceMetadata(extRoot) {
  const sourcePath = path.join(extRoot, 'kernel', 'go', 'agentteam-kernel', 'main.go')
  let source
  try {
    source = fs.readFileSync(sourcePath, 'utf8')
  } catch (_) {
    fail('metadata-invalid', 'read Go helper source before generating artifact metadata', 'source')
  }
  const helperVersion = source.match(/const\s+helperVersion\s*=\s*"([^"]+)"/)?.[1]
  const protocolVersion = Number(source.match(/const\s+protocolVersion\s*=\s*(\d+)/)?.[1])
  const capabilitiesBody = source.match(/var\s+capabilities\s*=\s*\[\]string\{([^}]+)\}/s)?.[1] || ''
  const capabilities = [...capabilitiesBody.matchAll(/"([^"]+)"/g)].map(match => match[1])
  if (!helperVersion || !Number.isInteger(protocolVersion) || capabilities.length === 0) {
    fail('metadata-invalid', 'read helper version/protocol/capabilities from Go source', 'source-metadata')
  }
  return { helperVersion, protocolVersion, capabilities, sourceRel: 'kernel/go/agentteam-kernel' }
}

function readSourceRevision(extRoot, env) {
  const result = cp.spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: extRoot,
    encoding: 'utf8',
    timeout: 5_000,
    env: { ...process.env, ...env },
  })
  const revision = String(result.stdout || '').trim()
  return result.status === 0 && /^[0-9a-f]{7,40}$/i.test(revision) ? revision : 'unknown-local-revision'
}

function goVersion(env, cwd) {
  const result = cp.spawnSync('go', ['version'], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, ...env },
  })
  if (result.error || result.status !== 0) fail('go-unavailable', 'install Go or run on a reviewer/CI host with Go available', 'go-version')
  const version = String(result.stdout || '').trim()
  return version || 'go-version-unknown'
}

function buildHelper(helperDir, helperPath, env, timeoutMs) {
  const result = cp.spawnSync('go', ['build', '-trimpath', '-o', helperPath, '.'], {
    cwd: helperDir,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...env, GO111MODULE: 'off' },
  })
  if (result.error || result.status !== 0) fail('go-build-failed', 'fix local Go build inputs and rerun the explicit artifact builder', 'go-build')
}

function normalizeHelperExecutable(helperPath, target) {
  if (target.os === 'win32') return
  try {
    fs.chmodSync(helperPath, 0o755)
  } catch (_) {
    fail('metadata-invalid', 'normalize helper executable bit before smoke validation', 'executable')
  }
}

function runJsonRpc(helperPath, request, env, timeoutMs, failureHint) {
  const input = `${JSON.stringify(request)}\n`
  const result = cp.spawnSync(helperPath, [], {
    input,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...env, PATH: env.PATH || process.env.PATH || '' },
  })
  if (result.error || result.status !== 0) fail('go-health-failed', 'reject helper artifact that cannot answer smoke RPC', failureHint)
  try {
    const line = String(result.stdout || '').split('\n').find(value => value.trim())
    const response = JSON.parse(line || '')
    if (!response || response.jsonrpc !== '2.0' || response.error || !response.result) {
      fail('go-health-failed', 'reject helper artifact with invalid smoke RPC envelope', failureHint)
    }
    return response.result
  } catch (error) {
    if (error instanceof GoHelperArtifactBuilderError) throw error
    fail('go-health-failed', 'reject helper artifact with non-JSON smoke RPC response', failureHint)
  }
}

function runHealth(helperPath, env, timeoutMs) {
  return runJsonRpc(helperPath, { jsonrpc: '2.0', id: 'health', method: 'health', params: {} }, env, timeoutMs, 'health')
}

function runTmuxSnapshotParseSmoke(helperPath, env, timeoutMs) {
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'tmuxSnapshotParse',
    method: 'tmuxSnapshotParse',
    params: {
      stdout: '%1\ttest:@1\tteam-lead\tpi',
      capturedAt: 1700000000000,
    },
  }, env, timeoutMs, 'tmuxSnapshotParse')
  if (result.ok !== true || result.capturedAt !== 1700000000000 || !Array.isArray(result.panes) || !result.byPaneId || !result.byPaneId['%1']) {
    fail('go-health-failed', 'reject helper artifact with invalid tmuxSnapshotParse smoke result', 'tmuxSnapshotParse')
  }
  return { ok: true, paneCount: result.panes.length, capturedAt: result.capturedAt }
}

function runWorkerLifecycleInspectPaneSmoke(helperPath, env, timeoutMs) {
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'workerLifecycleInspectPane',
    method: 'workerLifecycle',
    params: {
      operation: 'inspectPane',
      paneId: '%agentteam-builder-smoke-missing',
    },
  }, env, timeoutMs, 'workerLifecycle')
  if (result.operation !== 'inspectPane' || result.capability !== 'workerLifecycle' || result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle inspectPane smoke result', 'workerLifecycle')
  }
  const acceptedFailureKinds = ['pane-not-found', 'tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout']
  if (result.ok !== true && !acceptedFailureKinds.includes(result.failureKind)) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle inspectPane failure', 'workerLifecycle')
  }
  return { ok: result.ok === true, acceptedFailureKinds }
}

function runWorkerLifecycleListAgentTeamPanesSmoke(helperPath, env, timeoutMs) {
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'workerLifecycleListAgentTeamPanes',
    method: 'workerLifecycle',
    params: {
      operation: 'listAgentTeamPanes',
    },
  }, env, timeoutMs, 'workerLifecycle')
  if (result.operation !== 'listAgentTeamPanes' || result.capability !== 'workerLifecycle' || result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle listAgentTeamPanes smoke result', 'workerLifecycle')
  }
  const acceptedFailureKinds = ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout']
  if (result.ok === true) {
    if (!Array.isArray(result.panes) || !result.byPaneId || typeof result.byPaneId !== 'object') {
      fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle listAgentTeamPanes pane list', 'workerLifecycle')
    }
  } else if (!acceptedFailureKinds.includes(result.failureKind)) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle listAgentTeamPanes failure', 'workerLifecycle')
  }
  return { ok: result.ok === true, acceptedFailureKinds }
}

function runWorkerLifecycleCaptureCurrentPaneBindingSmoke(helperPath, env, timeoutMs) {
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'workerLifecycleCaptureCurrentPaneBinding',
    method: 'workerLifecycle',
    params: {
      operation: 'captureCurrentPaneBinding',
    },
  }, env, timeoutMs, 'workerLifecycle')
  if (result.operation !== 'captureCurrentPaneBinding' || result.capability !== 'workerLifecycle' || result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle captureCurrentPaneBinding smoke result', 'workerLifecycle')
  }
  const acceptedFailureKinds = ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found']
  if (result.ok === true) {
    if (typeof result.paneId !== 'string' || !result.paneId || typeof result.target !== 'string' || !result.target) {
      fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle captureCurrentPaneBinding binding', 'workerLifecycle')
    }
  } else if (!acceptedFailureKinds.includes(result.failureKind)) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle captureCurrentPaneBinding failure', 'workerLifecycle')
  }
  return { ok: result.ok === true, acceptedFailureKinds }
}

function runWorkerLifecycleListPanesInWindowSmoke(helperPath, env, timeoutMs) {
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'workerLifecycleListPanesInWindow',
    method: 'workerLifecycle',
    params: {
      operation: 'listPanesInWindow',
      target: 'agentteam-builder-smoke:@missing',
    },
  }, env, timeoutMs, 'workerLifecycle')
  if (result.operation !== 'listPanesInWindow' || result.capability !== 'workerLifecycle' || result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle listPanesInWindow smoke result', 'workerLifecycle')
  }
  const acceptedFailureKinds = ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout']
  if (result.ok === true) {
    if (result.target !== 'agentteam-builder-smoke:@missing' || result.exists !== true || !Array.isArray(result.paneIds)) {
      fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle listPanesInWindow pane list', 'workerLifecycle')
    }
  } else if (!acceptedFailureKinds.includes(result.failureKind)) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle listPanesInWindow failure', 'workerLifecycle')
  }
  return { ok: result.ok === true, acceptedFailureKinds }
}

function runWorkerLifecycleFindAgentTeamWindowTargetSmoke(helperPath, env, timeoutMs) {
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'workerLifecycleFindAgentTeamWindowTarget',
    method: 'workerLifecycle',
    params: {
      operation: 'findAgentTeamWindowTarget',
      sessionName: 'agentteam-builder-smoke-missing',
    },
  }, env, timeoutMs, 'workerLifecycle')
  if (result.operation !== 'findAgentTeamWindowTarget' || result.capability !== 'workerLifecycle' || result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle findAgentTeamWindowTarget smoke result', 'workerLifecycle')
  }
  const acceptedFailureKinds = ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found']
  if (result.ok === true) {
    if (result.sessionName !== 'agentteam-builder-smoke-missing' || result.exists !== true || typeof result.target !== 'string' || !result.target || typeof result.windowId !== 'string' || !result.windowId) {
      fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle findAgentTeamWindowTarget target', 'workerLifecycle')
    }
  } else if (result.exists !== false || !acceptedFailureKinds.includes(result.failureKind)) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle findAgentTeamWindowTarget failure', 'workerLifecycle')
  }
  return { ok: result.ok === true, acceptedFailureKinds }
}

function runWorkerLifecycleFindWindowTargetByNameSmoke(helperPath, env, timeoutMs) {
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'workerLifecycleFindWindowTargetByName',
    method: 'workerLifecycle',
    params: {
      operation: 'findWindowTargetByName',
      sessionName: 'agentteam-builder-smoke-missing',
      windowName: 'agentteam-builder-smoke-window',
    },
  }, env, timeoutMs, 'workerLifecycle')
  if (result.operation !== 'findWindowTargetByName' || result.capability !== 'workerLifecycle' || result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle findWindowTargetByName smoke result', 'workerLifecycle')
  }
  const acceptedFailureKinds = ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found']
  if (result.ok === true) {
    if (result.sessionName !== 'agentteam-builder-smoke-missing' || result.windowName !== 'agentteam-builder-smoke-window' || result.exists !== true || typeof result.target !== 'string' || !result.target || typeof result.windowId !== 'string' || !result.windowId) {
      fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle findWindowTargetByName target', 'workerLifecycle')
    }
  } else if (result.exists !== false || !acceptedFailureKinds.includes(result.failureKind)) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle findWindowTargetByName failure', 'workerLifecycle')
  }
  return { ok: result.ok === true, acceptedFailureKinds }
}

function runWorkerLifecycleSessionExistsSmoke(helperPath, env, timeoutMs) {
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'workerLifecycleSessionExists',
    method: 'workerLifecycle',
    params: {
      operation: 'sessionExists',
      sessionName: 'agentteam-builder-smoke-missing',
    },
  }, env, timeoutMs, 'workerLifecycle')
  if (result.operation !== 'sessionExists' || result.capability !== 'workerLifecycle' || result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle sessionExists smoke result', 'workerLifecycle')
  }
  const acceptedFailureKinds = ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout', 'pane-not-found']
  if (result.ok === true) {
    if (result.sessionName !== 'agentteam-builder-smoke-missing' || result.exists !== true) {
      fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle sessionExists positive result', 'workerLifecycle')
    }
  } else if (result.exists !== false || !acceptedFailureKinds.includes(result.failureKind)) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle sessionExists failure', 'workerLifecycle')
  }
  return { ok: result.ok === true, acceptedFailureKinds }
}

function runWorkerLifecycleMarkWindowAsAgentTeamSmoke(helperPath, env, timeoutMs) {
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'workerLifecycleMarkWindowAsAgentTeam',
    method: 'workerLifecycle',
    params: {
      operation: 'markWindowAsAgentTeam',
      target: 'agentteam builder smoke invalid target',
    },
  }, env, timeoutMs, 'workerLifecycle')
  if (result.operation !== 'markWindowAsAgentTeam' || result.capability !== 'workerLifecycle' || result.readOnly !== false || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== true) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle markWindowAsAgentTeam smoke result', 'workerLifecycle')
  }
  const acceptedFailureKinds = ['invalid-target']
  if (result.ok !== false || result.marked !== false || !acceptedFailureKinds.includes(result.failureKind)) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle markWindowAsAgentTeam failure', 'workerLifecycle')
  }
  return { ok: false, acceptedFailureKinds }
}

function runWorkerLifecycleRefreshWindowPaneLabelsSmoke(helperPath, env, timeoutMs) {
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'workerLifecycleRefreshWindowPaneLabels',
    method: 'workerLifecycle',
    params: {
      operation: 'refreshWindowPaneLabels',
      target: 'agentteam builder smoke invalid target',
    },
  }, env, timeoutMs, 'workerLifecycle')
  if (result.operation !== 'refreshWindowPaneLabels' || result.capability !== 'workerLifecycle' || result.readOnly !== false || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== true) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle refreshWindowPaneLabels smoke result', 'workerLifecycle')
  }
  const acceptedFailureKinds = ['invalid-target']
  if (result.ok !== false || result.refreshed !== false || !acceptedFailureKinds.includes(result.failureKind)) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle refreshWindowPaneLabels failure', 'workerLifecycle')
  }
  return { ok: false, acceptedFailureKinds }
}

function runWorkerLifecycleSetPaneLabelSmoke(helperPath, env, timeoutMs) {
  const rawLabelCanary = 'agentteam raw label canary 🚫'
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'workerLifecycleSetPaneLabel',
    method: 'workerLifecycle',
    params: {
      operation: 'setPaneLabel',
      paneId: 'agentteam builder smoke invalid pane',
      label: rawLabelCanary,
    },
  }, env, timeoutMs, 'workerLifecycle')
  if (JSON.stringify(result).includes(rawLabelCanary)) {
    fail('go-health-failed', 'reject helper artifact with raw label leakage in workerLifecycle setPaneLabel smoke result', 'workerLifecycle')
  }
  if (result.operation !== 'setPaneLabel' || result.capability !== 'workerLifecycle' || result.readOnly !== false || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== true) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle setPaneLabel smoke result', 'workerLifecycle')
  }
  const acceptedFailureKinds = ['invalid-pane-id']
  if (result.ok !== false || result.labeled !== false || !acceptedFailureKinds.includes(result.failureKind)) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle setPaneLabel failure', 'workerLifecycle')
  }
  return { ok: false, acceptedFailureKinds }
}

function runWorkerLifecycleClearPaneLabelSmoke(helperPath, env, timeoutMs) {
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'workerLifecycleClearPaneLabel',
    method: 'workerLifecycle',
    params: {
      operation: 'clearPaneLabel',
      paneId: 'agentteam builder smoke invalid pane',
    },
  }, env, timeoutMs, 'workerLifecycle')
  if (result.operation !== 'clearPaneLabel' || result.capability !== 'workerLifecycle' || result.readOnly !== false || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== true) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle clearPaneLabel smoke result', 'workerLifecycle')
  }
  const acceptedFailureKinds = ['invalid-pane-id']
  if (result.ok !== false || result.cleared !== false || !acceptedFailureKinds.includes(result.failureKind)) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle clearPaneLabel failure', 'workerLifecycle')
  }
  return { ok: false, acceptedFailureKinds }
}

function runWorkerLifecycleCreateTeammatePaneSmoke(helperPath, env, timeoutMs) {
  const rawCreateCanary = 'agentteam raw create pane canary 🚫'
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'workerLifecycleCreateTeammatePane',
    method: 'workerLifecycle',
    params: {
      operation: 'createTeammatePane',
      target: 'agentteam builder smoke invalid target!',
      leaderPaneId: '%123',
      hasLeaderLayout: true,
      cwd: rawCreateCanary,
      startCommand: rawCreateCanary,
    },
  }, env, timeoutMs, 'workerLifecycle')
  if (JSON.stringify(result).includes(rawCreateCanary)) {
    fail('go-health-failed', 'reject helper artifact with raw cwd/startCommand leakage in workerLifecycle createTeammatePane smoke result', 'workerLifecycle')
  }
  if (result.operation !== 'createTeammatePane' || result.capability !== 'workerLifecycle' || result.readOnly !== false || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== true) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle createTeammatePane smoke result', 'workerLifecycle')
  }
  const acceptedFailureKinds = ['invalid-target']
  if (result.ok !== false || result.created !== false || !acceptedFailureKinds.includes(result.failureKind)) {
    fail('go-health-failed', 'reject helper artifact with invalid workerLifecycle createTeammatePane failure', 'workerLifecycle')
  }
  return { ok: false, acceptedFailureKinds }
}

function runTmuxAvailabilitySmoke(helperPath, env, timeoutMs) {
  const result = runJsonRpc(helperPath, {
    jsonrpc: '2.0',
    id: 'tmuxAvailability',
    method: 'tmuxAvailability',
  }, env, timeoutMs, 'tmuxAvailability')
  if (result.capability !== 'tmuxAvailability' || result.readOnly !== true || result.stateFilesRead !== false || result.stateFilesWritten !== false || result.tmuxMutation !== false) {
    fail('go-health-failed', 'reject helper artifact with invalid tmuxAvailability smoke result', 'tmuxAvailability')
  }
  const acceptedFailureKinds = ['tmux-command-failed', 'tmux-unavailable', 'tmux-command-timeout']
  if (result.ok === true) {
    if (result.available !== true || typeof result.version !== 'string' || !result.version) {
      fail('go-health-failed', 'reject helper artifact with invalid tmuxAvailability version result', 'tmuxAvailability')
    }
  } else if (result.available !== false || !acceptedFailureKinds.includes(result.failureKind)) {
    fail('go-health-failed', 'reject helper artifact with invalid tmuxAvailability failure', 'tmuxAvailability')
  }
  return { ok: result.ok === true, acceptedFailureKinds }
}

function assertHealthMatchesSource(health, sourceMetadata) {
  if (health.implementation !== 'go') fail('go-health-failed', 'reject non-Go helper health response', 'implementation')
  if (health.helperVersion !== sourceMetadata.helperVersion) fail('metadata-invalid', 'reject helper version skew before writing metadata', 'helper-version')
  if (health.protocolVersion !== sourceMetadata.protocolVersion) fail('metadata-invalid', 'reject protocol skew before writing metadata', 'protocol')
  const capabilities = Array.isArray(health.capabilities) ? health.capabilities : []
  if (!capabilities.includes(MODULE)) fail('metadata-invalid', 'reject helper without tmuxSnapshotParse capability', 'capability')
  if (!capabilities.includes('workerLifecycle')) fail('metadata-invalid', 'reject helper without workerLifecycle capability', 'capability')
  if (!capabilities.includes('tmuxAvailability')) fail('metadata-invalid', 'reject helper without tmuxAvailability capability', 'capability')
}

function assertNoMetadataLeaks(values, forbiddenRoots) {
  const text = values.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join('\n')
  for (const forbiddenRoot of forbiddenRoots) {
    if (!forbiddenRoot) continue
    const normalized = path.resolve(forbiddenRoot)
    if (text.includes(normalized)) fail('metadata-invalid', 'regenerate metadata without absolute paths', 'path-leak')
  }
}

function safeMetadataString(value, fallback) {
  const text = String(value || '').trim()
  const safe = text || fallback
  return safe.replace(/[^A-Za-z0-9._/@:-]/g, '-').slice(0, 200) || fallback
}

function githubMetadata(env) {
  return {
    repository: safeMetadataString(env.GITHUB_REPOSITORY, 'unknown-repository'),
    workflow: safeMetadataString(env.GITHUB_WORKFLOW, 'unknown-workflow'),
    runId: safeMetadataString(env.GITHUB_RUN_ID, 'unknown-run-id'),
    runAttempt: safeMetadataString(env.GITHUB_RUN_ATTEMPT, 'unknown-run-attempt'),
    sha: safeMetadataString(env.GITHUB_SHA, 'unknown-sha'),
    ref: safeMetadataString(env.GITHUB_REF, 'unknown-ref'),
  }
}

function artifactIndexFile(outputRoot, relPath, kind) {
  const filePath = path.join(outputRoot, relPath)
  const stat = fs.statSync(filePath)
  return {
    kind,
    path: relPath,
    sha256: sha256File(filePath),
    size: stat.size,
  }
}

function writeArtifactIndex(input) {
  const {
    extRoot,
    outputRoot,
    target,
    health,
    packageVersion,
    sourceRevision,
    env,
    generatedAt,
    summary,
  } = input
  const artifactDir = path.dirname(path.join(outputRoot, summary.artifact))
  const indexPath = path.join(artifactDir, ARTIFACT_INDEX_FILENAME)
  const files = [
    artifactIndexFile(outputRoot, summary.artifact, 'helper'),
    artifactIndexFile(outputRoot, summary.files.manifest, 'manifest'),
    artifactIndexFile(outputRoot, summary.files.checksums, 'checksums'),
    artifactIndexFile(outputRoot, summary.files.provenance, 'provenance'),
    artifactIndexFile(outputRoot, summary.files.license, 'license'),
    artifactIndexFile(outputRoot, summary.files.licenseMetadata, 'license-metadata'),
    artifactIndexFile(outputRoot, summary.files.attestation, 'attestation'),
  ]
  const indexRel = packageRelative(outputRoot, indexPath)
  const index = {
    schemaVersion: 1,
    packageName: PACKAGE_NAME,
    packageVersion,
    module: MODULE,
    capability: MODULE,
    helperVersion: health.helperVersion,
    protocolVersion: health.protocolVersion,
    target: target.target,
    platform: {
      os: target.os,
      arch: target.arch,
      libc: target.libc || 'not-applicable',
    },
    sourceRevision,
    generatedAt,
    github: githubMetadata(env),
    files,
    reviewOnly: true,
    releaseAsset: false,
    installSource: false,
    normalUserAvailability: false,
    retentionHint: {
      kind: 'github-actions-artifact',
      days: CI_REVIEW_RETENTION_DAYS,
    },
    expiresHint: `retention-days:${CI_REVIEW_RETENTION_DAYS}`,
  }
  writeJson(indexPath, index)
  assertNoMetadataLeaks([index], [extRoot, outputRoot, process.cwd()])
  return { artifactIndexPath: indexPath, artifactIndex: index, artifactIndexRel: indexRel }
}

function writeMetadata(input) {
  const {
    extRoot,
    outputRoot,
    outputRootKind,
    target,
    helperPath,
    health,
    sourceMetadata,
    packageVersion,
    sourceRevision,
    toolchain,
    generatedAt,
    runIdentity,
    parserSmoke,
    workerLifecycleSmoke,
    workerLifecycleListSmoke,
    workerLifecycleCurrentPaneBindingSmoke,
    workerLifecycleWindowPaneListSmoke,
    workerLifecycleFindAgentTeamWindowTargetSmoke,
    workerLifecycleFindWindowTargetByNameSmoke,
    workerLifecycleSessionExistsSmoke,
    workerLifecycleMarkWindowAsAgentTeamSmoke,
    workerLifecycleRefreshWindowPaneLabelsSmoke,
    workerLifecycleSetPaneLabelSmoke,
    workerLifecycleClearPaneLabelSmoke,
    workerLifecycleCreateTeammatePaneSmoke,
    tmuxAvailabilitySmoke,
  } = input
  const artifactDir = path.dirname(helperPath)
  const helperStat = fs.statSync(helperPath)
  if (target.os !== 'win32') fs.chmodSync(helperPath, 0o755)
  const normalizedStat = fs.statSync(helperPath)
  const executable = target.os === 'win32' ? target.helperFile.endsWith('.exe') : (normalizedStat.mode & 0o111) !== 0
  if (!executable) fail('metadata-invalid', 'normalize helper executable bit before writing metadata', 'executable')

  const helperRel = packageRelative(outputRoot, helperPath)
  const licenseSource = path.join(extRoot, 'LICENSE')
  const licensePath = path.join(artifactDir, 'LICENSE')
  fs.copyFileSync(licenseSource, licensePath)
  const licenseRel = packageRelative(outputRoot, licensePath)
  const helperSha = sha256File(helperPath)
  const licenseSha = sha256File(licensePath)

  const provenancePath = path.join(artifactDir, 'provenance.json')
  const provenanceRel = packageRelative(outputRoot, provenancePath)
  const provenance = {
    schemaVersion: 1,
    builderVersion: BUILDER_VERSION,
    packageName: PACKAGE_NAME,
    packageVersion,
    module: MODULE,
    source: {
      path: sourceMetadata.sourceRel,
      revision: sourceRevision,
    },
    build: {
      command: ['go', 'build', '-trimpath', '-o', helperRel, '.'],
      env: { GO111MODULE: 'off' },
      cwd: sourceMetadata.sourceRel,
      toolchain,
      runIdentity,
      generatedAt,
    },
    smoke: {
      health: true,
      tmuxSnapshotParse: parserSmoke,
      workerLifecycleInspectPane: workerLifecycleSmoke,
      workerLifecycleListAgentTeamPanes: workerLifecycleListSmoke,
      workerLifecycleCaptureCurrentPaneBinding: workerLifecycleCurrentPaneBindingSmoke,
      workerLifecycleListPanesInWindow: workerLifecycleWindowPaneListSmoke,
      workerLifecycleFindAgentTeamWindowTarget: workerLifecycleFindAgentTeamWindowTargetSmoke,
      workerLifecycleFindWindowTargetByName: workerLifecycleFindWindowTargetByNameSmoke,
      workerLifecycleSessionExists: workerLifecycleSessionExistsSmoke,
      workerLifecycleMarkWindowAsAgentTeam: workerLifecycleMarkWindowAsAgentTeamSmoke,
      workerLifecycleRefreshWindowPaneLabels: workerLifecycleRefreshWindowPaneLabelsSmoke,
      workerLifecycleSetPaneLabel: workerLifecycleSetPaneLabelSmoke,
      workerLifecycleClearPaneLabel: workerLifecycleClearPaneLabelSmoke,
      workerLifecycleCreateTeammatePane: workerLifecycleCreateTeammatePaneSmoke,
      tmuxAvailability: tmuxAvailabilitySmoke,
    },
    outputRootKind,
  }
  writeJson(provenancePath, provenance)

  const licenseMetadataPath = path.join(artifactDir, 'license.json')
  const licenseMetadataRel = packageRelative(outputRoot, licenseMetadataPath)
  const licenseMetadata = {
    schemaVersion: 1,
    name: 'MIT',
    packageName: PACKAGE_NAME,
    module: MODULE,
    path: licenseRel,
    sha256: licenseSha,
  }
  writeJson(licenseMetadataPath, licenseMetadata)

  const attestationPath = path.join(artifactDir, 'attestation.intoto.jsonl')
  const attestationRel = packageRelative(outputRoot, attestationPath)
  const attestation = {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: helperRel, digest: { sha256: helperSha } }],
    predicateType: 'https://pi-agentteam.local/placeholder-attestation/v0.6.29',
    predicate: {
      placeholderOnly: true,
      signed: false,
      signing: 'not-real-signing',
      reason: 'reviewer-local-build-only',
    },
  }
  fs.writeFileSync(attestationPath, `${JSON.stringify(attestation)}\n`, 'utf8')

  const manifestPath = path.join(artifactDir, 'manifest.json')
  const manifestRel = packageRelative(outputRoot, manifestPath)
  const manifest = {
    schemaVersion: 1,
    packageName: PACKAGE_NAME,
    packageVersion,
    module: MODULE,
    helperVersion: health.helperVersion,
    protocolVersion: health.protocolVersion,
    capabilities: health.capabilities,
    businessPathsConnected: health.businessPathsConnected === true,
    target: target.target,
    platform: {
      os: target.os,
      arch: target.arch,
      libc: target.libc || 'not-applicable',
    },
    artifact: {
      path: helperRel,
      filename: target.helperFile,
      size: helperStat.size,
      sha256: helperSha,
      executable: true,
      mode: target.os === 'win32' ? 'extension-policy' : `0${(normalizedStat.mode & 0o777).toString(8)}`,
    },
    files: {
      helper: helperRel,
      manifest: manifestRel,
      checksums: packageRelative(outputRoot, path.join(artifactDir, 'SHA256SUMS')),
      provenance: provenanceRel,
      license: licenseRel,
      licenseMetadata: licenseMetadataRel,
      attestation: attestationRel,
    },
    source: {
      path: sourceMetadata.sourceRel,
      revision: sourceRevision,
    },
    build: {
      command: ['go', 'build', '-trimpath', '-o', helperRel, '.'],
      env: { GO111MODULE: 'off' },
      cwd: sourceMetadata.sourceRel,
      toolchain,
      runIdentity,
      generatedAt,
    },
    smoke: {
      health: true,
      tmuxSnapshotParse: parserSmoke,
      workerLifecycleInspectPane: workerLifecycleSmoke,
      workerLifecycleListAgentTeamPanes: workerLifecycleListSmoke,
      workerLifecycleCaptureCurrentPaneBinding: workerLifecycleCurrentPaneBindingSmoke,
      workerLifecycleListPanesInWindow: workerLifecycleWindowPaneListSmoke,
      workerLifecycleFindAgentTeamWindowTarget: workerLifecycleFindAgentTeamWindowTargetSmoke,
      workerLifecycleFindWindowTargetByName: workerLifecycleFindWindowTargetByNameSmoke,
      workerLifecycleSessionExists: workerLifecycleSessionExistsSmoke,
      workerLifecycleMarkWindowAsAgentTeam: workerLifecycleMarkWindowAsAgentTeamSmoke,
      workerLifecycleRefreshWindowPaneLabels: workerLifecycleRefreshWindowPaneLabelsSmoke,
      workerLifecycleSetPaneLabel: workerLifecycleSetPaneLabelSmoke,
      workerLifecycleClearPaneLabel: workerLifecycleClearPaneLabelSmoke,
      workerLifecycleCreateTeammatePane: workerLifecycleCreateTeammatePaneSmoke,
      tmuxAvailability: tmuxAvailabilitySmoke,
    },
    attestation: {
      path: attestationRel,
      kind: 'placeholder-only',
      signed: false,
      sha256: sha256File(attestationPath),
    },
    license: {
      name: 'MIT',
      path: licenseRel,
      sha256: licenseSha,
      metadataPath: licenseMetadataRel,
      metadataSha256: sha256File(licenseMetadataPath),
    },
  }
  writeJson(manifestPath, manifest)

  const checksumPath = path.join(artifactDir, 'SHA256SUMS')
  const checksumRows = [
    [helperSha, helperRel],
    [sha256File(manifestPath), manifestRel],
    [sha256File(provenancePath), provenanceRel],
    [licenseSha, licenseRel],
    [sha256File(licenseMetadataPath), licenseMetadataRel],
    [sha256File(attestationPath), attestationRel],
  ]
  fs.writeFileSync(checksumPath, checksumRows.map(([hash, rel]) => `${hash}  ${rel}`).join('\n') + '\n', 'utf8')

  assertNoMetadataLeaks([manifest, provenance, licenseMetadata, attestation, fs.readFileSync(checksumPath, 'utf8')], [extRoot, outputRoot, process.cwd()])

  return {
    helperPath,
    manifestPath,
    checksumPath,
    provenancePath,
    licensePath,
    licenseMetadataPath,
    attestationPath,
    manifest,
    summary: {
      ok: true,
      status: 'available',
      module: MODULE,
      capability: MODULE,
      resultMarker: 'local-helper-artifact-built',
      builderVersion: BUILDER_VERSION,
      outputRootKind,
      target: target.target,
      helperVersion: health.helperVersion,
      protocolVersion: health.protocolVersion,
      smoke: {
        health: true,
        tmuxSnapshotParse: true,
        workerLifecycleInspectPane: true,
        workerLifecycleListAgentTeamPanes: true,
        workerLifecycleCaptureCurrentPaneBinding: true,
        workerLifecycleListPanesInWindow: true,
        workerLifecycleFindAgentTeamWindowTarget: true,
        workerLifecycleFindWindowTargetByName: true,
        workerLifecycleSessionExists: true,
        workerLifecycleMarkWindowAsAgentTeam: true,
        workerLifecycleRefreshWindowPaneLabels: true,
        workerLifecycleSetPaneLabel: true,
        workerLifecycleClearPaneLabel: true,
        workerLifecycleCreateTeammatePane: true,
        tmuxAvailability: true,
      },
      artifact: helperRel,
      files: {
        manifest: manifestRel,
        checksums: packageRelative(outputRoot, checksumPath),
        provenance: provenanceRel,
        license: licenseRel,
        licenseMetadata: licenseMetadataRel,
        attestation: attestationRel,
      },
    },
  }
}

function buildGoHelperArtifact(options = {}) {
  const { extRoot, outputRoot, outputRootKind } = resolveOutputRoot(options)
  const env = { ...process.env, ...(options.env || {}) }
  const timeoutMs = options.timeoutMs || 30_000
  const sourceMetadata = readGoSourceMetadata(extRoot)
  const packageVersion = readPackageVersion(extRoot)
  const target = resolveHostTarget({
    platform: options.platform,
    arch: options.arch,
    libc: options.libc,
    env,
  })

  const helperVersion = safeSegment(sourceMetadata.helperVersion, 'helper-version')
  const artifactDir = path.join(outputRoot, 'native', MODULE, helperVersion, safeSegment(target.target, 'target'))
  fs.mkdirSync(artifactDir, { recursive: true })
  const helperPath = path.join(artifactDir, target.helperFile)
  const helperDir = path.join(extRoot, 'kernel', 'go', 'agentteam-kernel')
  const toolchain = options.toolchain || goVersion(env, helperDir)
  const sourceRevision = options.sourceRevision || readSourceRevision(extRoot, env)
  const generatedAt = options.generatedAt || new Date().toISOString()
  const runIdentity = options.runIdentity || (env.GITHUB_RUN_ID ? `github-run-${env.GITHUB_RUN_ID}` : 'local-reviewer-run')

  buildHelper(helperDir, helperPath, env, timeoutMs)
  normalizeHelperExecutable(helperPath, target)
  const health = runHealth(helperPath, env, timeoutMs)
  assertHealthMatchesSource(health, sourceMetadata)
  const parserSmoke = runTmuxSnapshotParseSmoke(helperPath, env, timeoutMs)
  const workerLifecycleSmoke = runWorkerLifecycleInspectPaneSmoke(helperPath, env, timeoutMs)
  const workerLifecycleListSmoke = runWorkerLifecycleListAgentTeamPanesSmoke(helperPath, env, timeoutMs)
  const workerLifecycleCurrentPaneBindingSmoke = runWorkerLifecycleCaptureCurrentPaneBindingSmoke(helperPath, env, timeoutMs)
  const workerLifecycleWindowPaneListSmoke = runWorkerLifecycleListPanesInWindowSmoke(helperPath, env, timeoutMs)
  const workerLifecycleFindAgentTeamWindowTargetSmoke = runWorkerLifecycleFindAgentTeamWindowTargetSmoke(helperPath, env, timeoutMs)
  const workerLifecycleFindWindowTargetByNameSmoke = runWorkerLifecycleFindWindowTargetByNameSmoke(helperPath, env, timeoutMs)
  const workerLifecycleSessionExistsSmoke = runWorkerLifecycleSessionExistsSmoke(helperPath, env, timeoutMs)
  const workerLifecycleMarkWindowAsAgentTeamSmoke = runWorkerLifecycleMarkWindowAsAgentTeamSmoke(helperPath, env, timeoutMs)
  const workerLifecycleRefreshWindowPaneLabelsSmoke = runWorkerLifecycleRefreshWindowPaneLabelsSmoke(helperPath, env, timeoutMs)
  const workerLifecycleSetPaneLabelSmoke = runWorkerLifecycleSetPaneLabelSmoke(helperPath, env, timeoutMs)
  const workerLifecycleClearPaneLabelSmoke = runWorkerLifecycleClearPaneLabelSmoke(helperPath, env, timeoutMs)
  const workerLifecycleCreateTeammatePaneSmoke = runWorkerLifecycleCreateTeammatePaneSmoke(helperPath, env, timeoutMs)
  const tmuxAvailabilitySmoke = runTmuxAvailabilitySmoke(helperPath, env, timeoutMs)

  const metadata = writeMetadata({
    extRoot,
    outputRoot,
    outputRootKind,
    target,
    helperPath,
    health,
    sourceMetadata,
    packageVersion,
    sourceRevision,
    toolchain,
    generatedAt,
    runIdentity,
    parserSmoke,
    workerLifecycleSmoke,
    workerLifecycleListSmoke,
    workerLifecycleCurrentPaneBindingSmoke,
    workerLifecycleWindowPaneListSmoke,
    workerLifecycleFindAgentTeamWindowTargetSmoke,
    workerLifecycleFindWindowTargetByNameSmoke,
    workerLifecycleSessionExistsSmoke,
    workerLifecycleMarkWindowAsAgentTeamSmoke,
    workerLifecycleRefreshWindowPaneLabelsSmoke,
    workerLifecycleSetPaneLabelSmoke,
    workerLifecycleClearPaneLabelSmoke,
    workerLifecycleCreateTeammatePaneSmoke,
    tmuxAvailabilitySmoke,
  })
  const result = {
    extRoot,
    outputRoot,
    outputRootKind,
    target,
    ...metadata,
  }
  if (options.artifactIndex || options.ciReview) {
    const index = writeArtifactIndex({
      extRoot,
      outputRoot,
      target,
      health,
      packageVersion,
      sourceRevision,
      env,
      generatedAt,
      summary: metadata.summary,
    })
    result.artifactIndexPath = index.artifactIndexPath
    result.artifactIndex = index.artifactIndex
    result.summary.files.artifactIndex = index.artifactIndexRel
  }
  return result
}

module.exports = {
  ARTIFACT_INDEX_FILENAME,
  BUILDER_VERSION,
  CI_REVIEW_RETENTION_DAYS,
  FAILURE_KINDS,
  MODULE,
  REPO_ARTIFACT_DIR,
  GoHelperArtifactBuilderError,
  assertAllowedOutputRoot,
  buildGoHelperArtifact,
  compactFailure,
  detectLinuxLibc,
  resolveHostTarget,
  resolveOutputRoot,
}
