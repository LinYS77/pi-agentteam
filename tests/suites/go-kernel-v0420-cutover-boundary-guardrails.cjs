const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EXPECTED_VERSION = '0.6.8'
const GO_HELPER = 'kernel/go/agentteam-kernel/main.go'
const RUNTIME_AUTHORITY_PATHS = [
  'teamPanel/dataSource.ts',
  'teamPanel/viewModel.ts',
  'teamPanel/readModel.ts',
  'state/repository.ts',
  'runtime/repository.ts',
  'adapters/tmux/teamPanes.ts',
  'adapters/tmux/index.ts',
  'tools/workerSpawnService.ts',
  'app/taskApplication.ts',
  'app/taskReportWorkflow.ts',
  'app/planRunApplication.ts',
]
const RUNTIME_UI_PATHS = [
  'teamPanel/dataSource.ts',
  'teamPanel/viewModel.ts',
  'teamPanel/readModel.ts',
  'teamPanel.ts',
  'renderers.ts',
]
const NATIVE_EXTENSIONS = /\.(?:exe|dll|so|dylib)$/i

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.turbo')) continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function assertNoMatches(label, source, rows) {
  for (const [name, pattern] of rows) {
    assert.equal(pattern.test(source), false, `${label} must not contain ${name}`)
  }
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, EXPECTED_VERSION, 'package version must remain unchanged')
  assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'package.json#files must exclude kernel/')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  const scripts = Object.entries(packageJson.scripts || {})
  for (const [name, command] of scripts) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    assert.equal(/go\s+(?:build|install)\b/.test(command), false, `${name} must not build/install native helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not download/build native helper`)
    assert.equal(/kernel\//i.test(command) && /pack|publish|files|npm/i.test(command), false, `${name} must not package kernel/`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
  const nativeArtifacts = walkFiles(root)
    .filter(file => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}.git${path.sep}`))
    .filter(file => NATIVE_EXTENSIONS.test(file))
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
  assert.deepEqual(nativeArtifacts, [], 'native artifacts must not be checked in')
  const helperArtifacts = walkFiles(path.join(root, 'kernel'))
    .filter(file => path.basename(file) !== 'main.go')
    .filter(file => /agentteam.*kernel|kernel.*helper|\.exe$/i.test(path.basename(file)))
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
  assert.deepEqual(helperArtifacts, [], 'temporary/helper native artifacts must not be checked in under kernel/')
}

function assertGoHelperBoundaries(root) {
  const source = read(root, GO_HELPER)
  assert.match(source, /func run\(input io\.Reader, output io\.Writer\)/, 'Go helper should remain stdio reader/writer scoped')
  assert.match(source, /run\(os\.Stdin, os\.Stdout\)/, 'Go helper should remain stdio-only')
  assert.match(source, /func parseTmuxSnapshot\(params map\[string\]any\)/, 'Go helper should parse supplied tmuxSnapshotParse params')
  assert.match(source, /stdout := stringParam\(params, "stdout"\)/, 'Go helper should parse snapshot stdout')
  assert.match(source, /case "tmuxSnapshotCapture"/, 'post-v0.6.49 Go helper may own narrow tmux snapshot capture')
  assert.match(source, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat\)/, 'Go tmux command must be limited to snapshot capture')
  assertNoMatches(GO_HELPER, source, [
    ['broad tmux subprocess command', /display-message|send-keys|kill-pane|split-window|new-window/],
    ['shell execution API', /\bexec\.Command\s*\(|\b(?:sh|bash|zsh|fish)\b/],
    ['worker spawn/lifecycle authority', /worker\s*spawn|spawnWorker|WorkerSpawn|workerLifecycle|paneLost|forceReconcile|lightReconcile/],
    ['network/listener authority', /"net"|"net\/http"|\b(?:Listen|ListenAndServe|Accept|Dial|Serve)\s*\(/],
    ['repository file reads/writes', /\bos\.(?:Open|OpenFile|ReadFile|WriteFile|Create|CreateTemp|Remove|RemoveAll|Rename|Mkdir|MkdirAll)\s*\(/],
    ['agentteam home/state files', /PI_AGENTTEAM_HOME|team\.json|inboxes|outbox|reports|taskReports|(?:planRunWrite|PlanRunWrite|planRuns|activePlanRunId)|sidecar|cache(?:\.json|s)|(?:index\.json|indexes|indices)|package\.json/],
    ['package/release authority', /npm\s+(?:version|publish)|go\s+(?:build|install)|native packaging|package native/],
  ])
}

function assertRuntimeBoundaryFacts(root) {
  for (const rel of RUNTIME_AUTHORITY_PATHS) {
    const source = read(root, rel)
    if (rel !== 'teamPanel/dataSource.ts' && rel !== 'tmux/snapshot.ts') {
      assert.equal(source.includes('go-cutover'), false, `${rel} must not branch runtime authority on go-cutover`)
    }
    assert.equal(source.includes('PI_AGENTTEAM_KERNEL'), false, `${rel} must not read kernel env directly`)
    assert.equal(source.includes('PI_AGENTTEAM_KERNEL_HELPER'), false, `${rel} must not read helper env directly`)
    assert.equal(source.includes('fallbackKind'), false, `${rel} must not expose migration fallback diagnostics`)
    assert.equal(source.includes('fallbackReason'), false, `${rel} must not expose migration fallback diagnostics`)
  }

  const dataSource = read(root, 'teamPanel/dataSource.ts')
  assert.match(dataSource, /snapshotForOrphanDiscovery/, 'data source should isolate cutover orphan-discovery selection')
  assert.match(dataSource, /snapshot\.module === 'tmuxSnapshotParse'/, 'cutover orphan discovery should require tmuxSnapshotParse module marker')
  assert.match(dataSource, /snapshot\.capability === 'tmuxSnapshotParse'/, 'cutover orphan discovery should require tmuxSnapshotParse capability marker')
  assert.match(dataSource, /snapshot\.module === 'tmuxSnapshotCapture'/, 'cutover orphan discovery should also recognize tmuxSnapshotCapture unavailable marker')
  assert.match(dataSource, /snapshot\.capability === 'tmuxSnapshotCapture'/, 'cutover orphan discovery should also recognize tmuxSnapshotCapture capability marker')
  assert.match(dataSource, /Boolean\(snapshot\.cutoverFailureKind\)/, 'cutover orphan discovery should require cutoverFailureKind marker')
  assert.match(dataSource, /snapshot\?\.ok === false \? undefined : snapshot/, 'generic ok:false orphan fallback should remain undefined')

  const kernelSource = read(root, 'core/kernel.ts')
  assert.match(kernelSource, /compactReadModelFingerprint\(input/, 'adapter should still expose compactReadModelFingerprint')
  assert.match(kernelSource, /if \(cutoverRequested\) return fallback\(compactInput\)/, 'cutover compactReadModelFingerprint must remain TS fallback/non-cutover')
  assert.match(kernelSource, /parseTmuxPaneSnapshot\(stdout, capturedAt, fallback\)/, 'tmuxSnapshotParse remains the cutover seam')
  assert.match(kernelSource, /AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse'/, 'cutover module should be tmuxSnapshotParse only')
  assert.equal(/AGENTTEAM_KERNEL_CUTOVER_MODULE\s*=\s*'compactReadModelFingerprint'/.test(kernelSource), false, 'compactReadModelFingerprint must not become cutover module')

  const snapshotSource = read(root, 'tmux/snapshot.ts')
  assert.equal(snapshotSource.includes('parseTmuxPaneSnapshotWithTypeScript'), false, 'TypeScript parser fallback must be deleted after v0.6.48 cutover')
  assert.match(snapshotSource, /createAgentTeamKernelAdapter\(\)\.parseTmuxPaneSnapshot\(stdout, capturedAt\)/, 'tmux parser should route through adapter seam without TS fallback')
}

function assertRuntimeUiNoDiagnosticsLeak(root) {
  const forbidden = [
    ['cutoverReason', /cutoverReason/],
    ['helper path', /helperPath|PI_AGENTTEAM_KERNEL_HELPER|AGENTTEAM_GO_KERNEL_HELPER/],
    ['helper stdout/stderr', /stdout|stderr/],
    ['repo path diagnostics', /repo path|repository path|leaderCwd.*cutover|cutover.*leaderCwd/],
    ['mailbox/report full text diagnostics', /MailboxMessage\.text|TaskReport\.text|mailbox\/report text|fullText/],
    ['raw cutover error rendering', /cutoverFailureKind.*render|render.*cutoverFailureKind|cutover unavailable/],
  ]
  for (const rel of RUNTIME_UI_PATHS) {
    const source = read(root, rel)
    assertNoMatches(rel, source, forbidden)
  }
}

function assertModeBehavior(kernel) {
  for (const mode of ['default', 'disabled', 'typescript', 'go', 'auto', 'go-cutover', 'go-packaged-preview']) {
    assert.equal(kernel.isKnownAgentTeamKernelMode(mode), true, `${mode} should remain known`)
    assert.equal(kernel.normalizeAgentTeamKernelMode(mode.toUpperCase()), mode, `${mode} normalization should be explicit`)
  }
  const defaultMetadata = kernel.createAgentTeamKernelAdapter({ env: {} }).metadata()
  assert.equal(defaultMetadata.kernel.requestedMode, 'default', 'unset mode should normalize to default')
  assert.equal(defaultMetadata.kernel.mode, 'go', 'unset/default mode should use embedded Go helper')
  assert.equal(defaultMetadata.kernel.enabled, true, 'default tmuxSnapshotParse parser should be Go-enabled')
  assert.equal(defaultMetadata.kernel.cutoverModule, 'tmuxSnapshotParse', 'default should stay scoped to tmuxSnapshotParse')
  assert.equal(defaultMetadata.kernel.cutoverStatus, 'active', 'default embedded helper should resolve')
  for (const mode of ['go', 'go-cutover', 'go-packaged-preview']) {
    const cutoverMissing = kernel.createAgentTeamKernelAdapter({ mode, helperPath: path.join(process.cwd(), `missing-${mode}-helper`) })
    assert.equal(cutoverMissing.metadata().kernel.requestedKnownKernel, true, `${mode} should be known explicit mode`)
    assert.equal(cutoverMissing.metadata().kernel.fallbacks, 0, `${mode} should not use migration fallback count`)
    assert.equal(cutoverMissing.metadata().kernel.cutoverModule, 'tmuxSnapshotParse', `${mode} should stay scoped to tmuxSnapshotParse`)
    assert.equal(Object.prototype.hasOwnProperty.call(cutoverMissing.metadata().kernel, 'fallbackKind'), false, `${mode} should not expose migration fallbackKind`)
  }
}

module.exports = {
  name: 'Go kernel v0.4.20 cutover boundary and package guardrails',
  async run(env) {
    const root = env.helpers.extRoot
    assertPackageNativeSanity(root)
    assertGoHelperBoundaries(root)
    assertRuntimeBoundaryFacts(root)
    assertRuntimeUiNoDiagnosticsLeak(root)
    assertModeBehavior(env.helpers.requireDist('core/kernel.js'))
  },
}
