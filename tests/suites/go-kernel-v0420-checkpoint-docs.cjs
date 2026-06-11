const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const CHECKPOINT = 'docs/perf/v0.4.20-go-cutover-checkpoint.md'
const HELPER_SMOKE = 'docs/perf/v0.4.20-go-cutover-helper-smoke.md'
const PLAN = 'docs/agentteam方案书.md'
const EXPECTED_VERSION = '0.6.8'

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} should match ${pattern}`)
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

module.exports = {
  name: 'Go kernel v0.4.20 final checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [CHECKPOINT, HELPER_SMOKE, PLAN]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const checkpoint = read(root, CHECKPOINT)
    const helperSmoke = read(root, HELPER_SMOKE)
    const plan = read(root, PLAN)
    const packageJson = JSON.parse(read(root, 'package.json'))
    const combined = [checkpoint, helperSmoke, plan].join('\n\n')

    assertIncludes(helperSmoke, CHECKPOINT, 'helper smoke doc should link final checkpoint')
    assertIncludes(plan, CHECKPOINT, 'plan should link final checkpoint')

    for (const expected of [
      'v0.4.20 Go Cutover Checkpoint',
      'GitHub-only experimental checkpoint',
      'STOP for npm/default/native cutover',
      'PI_AGENTTEAM_KERNEL=go-cutover',
      'explicit local/reviewer mode only',
      'tmuxSnapshotParse` is the only Go-owned cutover module',
      'Source-only helper smoke evidence',
      'GO111MODULE=off',
      'PI_AGENTTEAM_KERNEL_HELPER="$helper"',
      'TypeScript/pi control plane remains authoritative',
      'default Go runtime',
      'required Go runtime',
      'native helper packaging',
      'helper build/download/package scripts',
      'npm lifecycle hooks',
      'TypeScript fallback deletion outside explicit `go-cutover`',
      'unset/default remains `disabled`/TypeScript',
      'go`/`auto`/`typescript` behavior remains migration fail-open',
      'ok:false',
      'status:"unknown"',
      'resultMarker:"stale"',
      'module:"tmuxSnapshotParse"',
      'capability:"tmuxSnapshotParse"',
      'cutoverFailureKind',
      'empty `panes`',
      'empty `byPaneId`',
      'do not invoke the TypeScript parser fallback callback',
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
      'must not leak helper paths',
      'stdout/stderr bodies',
      'repo paths',
      'mailbox/report text',
      'raw `cutoverReason`',
      'attached and global `/team` light refresh',
      'avoid hidden live TypeScript orphan parsing for cutover-marked snapshots',
      'Go helper remains parser-only/stdin-stdout',
      'must not execute tmux',
      'read/write repository/state/package files',
      'open network listeners',
      'manage workers',
      'own PlanRun/governance',
      'move full text',
      'docs/perf/v0.4.20-go-cutover-helper-smoke.md',
      'AGENTTEAM_KERNEL_CUTOVER_MODULE` remains `tmuxSnapshotParse` only',
      'compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
      'go-cutover` uses separate cutover diagnostics',
      'fallbacks` and do not expose migration `fallbackKind`/`fallbackReason`',
      'Generic non-cutover `ok:false` snapshots keep prior orphan fallback behavior',
      'package.json` version remains `0.6.8`',
      'package.json#files` excludes `kernel/`',
      'no package scripts build, download, package, version, or publish the helper',
      'no npm lifecycle hooks exist',
      'no `package-lock.json` or `npm-shrinkwrap.json` exists',
      'no root or helper `go.mod` exists',
      'no root or helper `go.sum` exists',
      'no checked-in `.exe`, `.dll`, `.so`, `.dylib`',
      'node tests/run.cjs',
      'npm run typecheck',
      'npm run -s check:boundaries',
      'git diff --check',
      'npm run --silent bench:team-panel-tmux',
      'mktemp /tmp/agentteam-v0420-kernel.XXXXXX',
      '(cd kernel/go/agentteam-kernel && GO111MODULE=off go build -o "$helper" .)',
      '"method":"tmuxSnapshotParse"',
      '"capturedAt":1700000000000',
      'PI_AGENTTEAM_KERNEL=go-cutover PI_AGENTTEAM_KERNEL_HELPER="$helper" node tests/run.cjs',
      'no `/tmp/agentteam-v0420-kernel.*` artifact remains',
      'separate native packaging/runtime prerequisite signoff',
    ]) {
      assertIncludes(checkpoint, expected, 'v0.4.20 checkpoint doc')
    }

    for (const [label, pattern] of [
      ['decision split', /GO for a GitHub-only experimental checkpoint[\s\S]*STOP for npm\/default\/native cutover/i],
      ['slice summary', /Slice 1 mode plumbing[\s\S]*Slice 2 fail-closed parser[\s\S]*Slice 3 failure\/no-leak coverage[\s\S]*Slice 4 refresh safety[\s\S]*Slice 5 boundary guardrails[\s\S]*Slice 6 helper smoke/i],
      ['fail closed shape', /`ok:false`[\s\S]*`status:"unknown"`[\s\S]*`resultMarker:"stale"`[\s\S]*`module:"tmuxSnapshotParse"`[\s\S]*`capability:"tmuxSnapshotParse"`[\s\S]*compact `cutoverFailureKind`[\s\S]*empty `panes`[\s\S]*empty `byPaneId`[\s\S]*do not invoke the TypeScript parser fallback callback/i],
      ['refresh behavior', /attached and global `\/team` light refresh[\s\S]*unknown\/stale rather than pane loss[\s\S]*avoid hidden live TypeScript orphan parsing[\s\S]*cutover-marked snapshots/i],
      ['non-cutover orphan fallback', /Generic non-cutover `ok:false` snapshots keep prior orphan fallback behavior[\s\S]*passing `undefined` to explicit orphan discovery/i],
      ['package sanity', /package\.json` version remains `0\.6\.8`[\s\S]*package\.json#files` excludes `kernel\/`[\s\S]*no package scripts build, download, package, version, or publish[\s\S]*no npm lifecycle hooks[\s\S]*no `package-lock\.json`[\s\S]*no root or helper `go\.mod`[\s\S]*no checked-in `\.exe`, `\.dll`, `\.so`, `\.dylib`/i],
      ['validation matrix', /node tests\/run\.cjs[\s\S]*npm run typecheck[\s\S]*npm run -s check:boundaries[\s\S]*git diff --check[\s\S]*npm run --silent bench:team-panel-tmux/i],
      ['helper smoke commands', /helper="\$\(mktemp \/tmp\/agentteam-v0420-kernel\.XXXXXX\)"[\s\S]*GO111MODULE=off go build -o "\$helper" \.[\s\S]*"method":"tmuxSnapshotParse"[\s\S]*PI_AGENTTEAM_KERNEL=go-cutover PI_AGENTTEAM_KERNEL_HELPER="\$helper" node tests\/run\.cjs[\s\S]*rm -f "\$helper"/i],
      ['remaining risk', /explicit local helper path availability[\s\S]*not a shipped helper availability model[\s\S]*npm\/default\/native release requires a separate native packaging\/runtime prerequisite signoff/i],
    ]) {
      assertMatches(checkpoint, pattern, `v0.4.20 checkpoint doc: ${label}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'Go runtime is required',
      'native packaging is approved',
      'checked-in binary is allowed',
      'postinstall download is allowed',
      'run `npm version` to release',
      'run `npm publish` to release',
      'commit/tag/push as part of this checkpoint',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go owns state writes',
      'Go owns task/report governance',
      'Go reads mailbox full text',
      'compactReadModelFingerprint becomes cutover-owned',
      'all helper capabilities are cutover-owned',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.20 checkpoint docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assert.equal(packageJson.version, EXPECTED_VERSION, 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const [name, command] of Object.entries(packageJson.scripts || {})) {
      assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
      assert.equal(/go\s+(?:build|install)\b/.test(command), false, `${name} must not build/install helper`)
      assert.equal(/curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not download/build native helper`)
    }
    for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist for v0.4.20 checkpoint`)
    }
    const nativeArtifacts = walkFiles(root)
      .filter(file => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}.git${path.sep}`))
      .filter(file => /\.(?:exe|dll|so|dylib)$/i.test(file))
      .map(file => path.relative(root, file).replace(/\\/g, '/'))
    assert.deepEqual(nativeArtifacts, [], 'native artifacts must not be checked in')
  },
}
