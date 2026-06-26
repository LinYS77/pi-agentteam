const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const GO_HELPER_SOURCE = 'kernel/go/agentteam-kernel/main.go'
const CONTRACT_DOC = 'docs/perf/v0.4.17-kernel-contract-hardening.md'
const RUNTIME_AUTHORITY_PATHS = [
  'teamPanel/dataSource.ts',
  'state/repository.ts',
  'app/taskApplication.ts',
  'app/taskReportWorkflow.ts',
  'app/planRunApplication.ts',
  'runtime/leaderAttention.ts',
  'tools/workerSpawnService.ts',
  'adapters/tmux/teamPanes.ts',
  'runtime/repository.ts',
]

const GO_FORBIDDEN_LITERAL_PATTERNS = [
  ['PI_AGENTTEAM_HOME', /PI_AGENTTEAM_HOME/],
  ['team.json', /team\.json/],
  ['inboxes', /\binboxes\b/],
  ['outbox', /\boutbox\b/],
  ['reports', /\breports\b/],
  ['sidecar', /\bsidecar\b/],
  ['cache file authority', /\bcache(?:\.json|s)\b/],
  ['index file authority', /\b(?:index\.json|indexes|indices)\b/],
  ['repository authority', /\brepository\b/],
]

const GO_FORBIDDEN_API_PATTERNS = [
  ['os.Open', /\bos\.Open(?:File)?\s*\(/],
  ['os.ReadFile', /\bos\.ReadFile\s*\(/],
  ['os.WriteFile', /\bos\.WriteFile\s*\(/],
  ['os.Create', /\bos\.Create(?:Temp)?\s*\(/],
  ['os.Remove', /\bos\.Remove(?:All)?\s*\(/],
  ['os.Rename', /\bos\.Rename\s*\(/],
  ['os.Mkdir', /\bos\.Mkdir(?:All)?\s*\(/],
  ['exec.Command', /\bexec\.Command\s*\(/],
  ['net import', /"net"/],
  ['net/http import', /"net\/http"/],
  ['listener API', /\b(?:Listen|ListenAndServe|Accept|Dial|Serve)\s*\(/],
]

const GO_FORBIDDEN_RUNTIME_PATTERNS = [
  ['send-keys', /send-keys/],
  ['display-message', /display-message/],
  ['kill-pane', /kill-pane/],
  ['new-window', /new-window/],
  ['split-window', /split-window/],
  ['worker spawn', /\bworker\s+spawn\b|\bspawnWorker\b|\bWorkerSpawn\b|\bworkerSpawn\b/],
  ['worker spawn mutation', /\bworker\s+spawn\b|\bspawnWorker\b|\bWorkerSpawn\b|\bworkerSpawn\b/],
  ['force reconcile', /\bforce\s+reconcile\b|forceReconcile/],
  ['light reconcile', /\blight\s+reconcile\b|lightReconcile/],
]

const RUNTIME_FORBIDDEN_PATTERNS = [
  ['core/kernel import', /(?:from\s+['"].*core\/kernel(?:\.js)?['"]|require\(['"].*core\/kernel(?:\.js)?['"]\))/],
  ['PI_AGENTTEAM_KERNEL env', /PI_AGENTTEAM_KERNEL/],
  ['kernel helper env', /AGENTTEAM_GO_KERNEL_HELPER|PI_AGENTTEAM_KERNEL_HELPER/],
  ['fallbackKind diagnostics', /fallbackKind/],
  ['fallbackReason diagnostics', /fallbackReason/],
  ['compactReadModelFingerprint call', /compactReadModelFingerprint/],
  ['Go kernel docs/runtime reference', /go-kernel|Go kernel|kernel-contract-hardening/],
]

const DOC_REQUIRED_PHRASES = [
  'Go remains optional, source-only, read-only, benchmark/shadow-scoped, and non-authoritative.',
  'Go must not become a daemon, worker, scheduler, second control plane, repository owner, full-text reader, runtime UI source, or governance actor.',
  'It may only transform TypeScript-authorized compact inputs and return validated compact outputs for optional helper-backed paths.',
  'No `package.json` version change',
  'No `npm version`, `npm publish`',
  'No `go.mod`, `go.sum`, checked-in native binary',
  '`package.json#files` must not package `kernel/`',
  '`/team` runtime UI, panel data source authority, and user-facing diagnostics',
  'tmux subprocess execution, pane creation, pane labels, pane lifecycle, light/force reconcile, and worker spawn',
]

const DOC_FORBIDDEN_PHRASES = [
  'Go is default',
  'Go remains default',
  'Go is authoritative',
  'Go remains authoritative',
  'package native binary',
  'run `npm version`',
  'npm publish this',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertNoMatches(label, source, patterns) {
  for (const [name, pattern] of patterns) {
    assert.equal(pattern.test(source), false, `${label} must not contain ${name}`)
  }
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      walkFiles(full, out)
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

module.exports = {
  name: 'Go kernel boundary guardrails',
  async run(env) {
    const root = env.helpers.extRoot
    const goSource = read(root, GO_HELPER_SOURCE)
    assertNoMatches(GO_HELPER_SOURCE, goSource, GO_FORBIDDEN_LITERAL_PATTERNS)
    assertNoMatches(GO_HELPER_SOURCE, goSource, GO_FORBIDDEN_API_PATTERNS)
    assertNoMatches(GO_HELPER_SOURCE, goSource, GO_FORBIDDEN_RUNTIME_PATTERNS)
    assert.match(goSource, /"os\/exec"/, 'post-v0.6.49 Go helper may import os/exec for narrow tmux snapshot capture')
    assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", tmuxPaneSnapshotFormat\)/, 'Go tmux command authority must include list-panes snapshot capture')
    assert.match(goSource, /exec\.CommandContext\(ctx, "tmux", "list-panes", "-a", "-F", workerLifecycleInspectPaneFormat\)/, 'Go worker lifecycle authority must be limited to read-only list-panes inspectPane')
    assert.match(goSource, /operation\s*!=\s*"inspectPane"/, 'Go worker lifecycle must reject non-inspectPane operations')
    assert.match(goSource, /func run\(input io\.Reader, output io\.Writer\)/, 'Go helper should remain stdio reader/writer scoped')
    assert.match(goSource, /run\(os\.Stdin, os\.Stdout\)/, 'Go helper should remain stdio-only')

    for (const rel of RUNTIME_AUTHORITY_PATHS) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist for guard scanning`)
      const source = read(root, rel)
      assertNoMatches(rel, source, RUNTIME_FORBIDDEN_PATTERNS)
    }

    const packageJson = JSON.parse(read(root, 'package.json'))
    assert.equal(packageJson.version, '0.6.8', 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'package files must not include kernel/')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const lockfile of ['package-lock.json', 'npm-shrinkwrap.json']) {
      assert.equal(fs.existsSync(path.join(root, lockfile)), false, `${lockfile} is not expected for this source-only helper guard`)
    }

    for (const rel of ['go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
    }

    const nativeArtifacts = walkFiles(root)
      .filter(file => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}.git${path.sep}`))
      .filter(file => /\.(?:exe|dll|so|dylib)$/.test(file))
    assert.deepEqual(nativeArtifacts.map(file => path.relative(root, file)), [], 'native artifacts must not be checked in')

    const tempHelperArtifacts = walkFiles(path.join(root, 'kernel'))
      .filter(file => /(?:agentteam-(?:read-model-)?kernel|agentteam-kernel)(?:\.exe)?$/.test(path.basename(file)))
      .filter(file => path.basename(file) !== 'main.go')
    assert.deepEqual(tempHelperArtifacts.map(file => path.relative(root, file)), [], 'temporary helper artifacts must not be checked in under kernel/')

    const doc = read(root, CONTRACT_DOC)
    for (const phrase of DOC_REQUIRED_PHRASES) {
      assert.ok(doc.includes(phrase), `contract doc should state: ${phrase}`)
    }
    for (const phrase of DOC_FORBIDDEN_PHRASES) {
      assert.equal(doc.includes(phrase), false, `contract doc must not imply: ${phrase}`)
    }
  },
}
