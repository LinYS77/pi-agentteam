const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.21-go-native-artifact-contract.md'
const AVAILABILITY = 'docs/perf/v0.4.21-go-runtime-availability.md'
const V0420_CHECKPOINT = 'docs/perf/v0.4.20-go-cutover-checkpoint.md'
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
  name: 'Go kernel v0.4.21 native artifact contract docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [DOC, AVAILABILITY, V0420_CHECKPOINT, PLAN]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const packageJson = JSON.parse(read(root, 'package.json'))
    const combined = [doc, plan].join('\n\n')

    assertIncludes(doc, AVAILABILITY, 'native artifact contract should reference Slice 1 availability doc')
    assertIncludes(doc, V0420_CHECKPOINT, 'native artifact contract should reference v0.4.20 checkpoint')
    assertIncludes(plan, DOC, 'plan should reference native artifact contract doc')

    for (const expected of [
      'v0.4.21 Go Native Artifact Contract',
      'Slice 2 docs/tests contract only',
      'does not change `package.json`',
      'add package metadata',
      'add native artifacts',
      'implement a resolver',
      'package the helper',
      'run `npm version`',
      'run `npm publish`',
      'approve native packaging',
      'make Go default',
      'delete the TypeScript parser fallback',
      'docs/perf/v0.4.21-go-runtime-availability.md',
      'docs/perf/v0.4.20-go-cutover-checkpoint.md',
      'Builds remain source-only/manual for reviewers',
      'PI_AGENTTEAM_KERNEL=go-cutover` remains explicit/local-only',
      'npm/default/native cutover remains STOP',
      'tmuxSnapshotParse` is the only current cutover-owned module',
      'compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
      'module/platform/version identity',
      'agentteam-kernel-tmuxSnapshotParse-v0.3.0-read-model-shadow-<os>-<arch>[-<libc>][.exe]',
      'native/tmuxSnapshotParse/<helperVersion>/<os>-<arch>[-<libc>]/agentteam-kernel[.exe]',
      'artifact identity includes module `tmuxSnapshotParse`',
      'helper version',
      'OS, CPU architecture',
      'Linux libc target',
      'package name/version',
      'checksum',
      'provenance identifier',
      'license metadata',
      'build source revision',
      'Supported Platform Matrix',
      'executable extension and permission expectations',
      'tmux availability assumptions',
      'pi extension support assumptions',
      'Unsupported-platform policy',
      'fail closed with compact diagnostics',
      'unsupported-platform',
      'must not silently run the TypeScript parser fallback',
      'JSON-RPC protocol version `1`',
      'helper version currently `0.3.0-read-model-shadow`',
      'capability includes `tmuxSnapshotParse`',
      'businessPathsConnected:false',
      'Package/helper version skew must be detected',
      'Direct `health` smoke expectations',
      '"protocolVersion": 1',
      '"helperVersion": "0.3.0-read-model-shadow"',
      '"businessPathsConnected": false',
      'Direct `tmuxSnapshotParse` smoke expectations',
      'response preserves `capturedAt`',
      'response returns `ok:true`',
      'panes` array and `byPaneId` map',
      'missing helper fails closed',
      'corrupt helper fails closed',
      'wrong-platform helper fails closed',
      'non-executable helper fails closed',
      'wrong-version helper fails closed',
      'incompatible helper response fails closed',
      'no silent TS parser fallback',
      'ok:false',
      'status:"unknown"',
      'resultMarker:"stale"',
      'empty panes',
      'empty `byPaneId`',
      'checksum manifest',
      'SHA-256',
      'provenance or attestation',
      'license metadata',
      'executable-bit validation',
      'native binaries are not committed into the source repo',
      'offline/CI tarball or cache workflow',
      'clean install on supported OS/arch',
      'without Go toolchain, source checkout, manual `/tmp` build, or `PI_AGENTTEAM_KERNEL_HELPER` override',
      'uninstall removes package-owned helper files',
      'upgrade replaces stale helper artifacts',
      'cleanup does not remove user-provided external helpers',
      'parser-only/stdin-stdout',
      'tmux execution or tmux capture',
      'state or repository reads/writes',
      'network clients, servers, or listeners',
      'worker lifecycle authority',
      'PlanRun, task/report governance',
      'mailbox/report full-text access',
      'package/release authority',
      'STOP future native implementation or default/native cutover',
      'platform matrix is vague',
      'package/helper version skew detection is missing',
      'checksum manifest, provenance/attestation',
      'postinstall/preinstall/prepare download',
      'install-time `go build`',
      'native binaries are checked into the source repo',
      'lifecycle hooks, package scripts, lockfiles, `go.mod`, `go.sum`, or `kernel/` package inclusion',
      'diagnostics leak helper path, stdout/stderr, repo path, mailbox/report text, raw `cutoverReason`',
      'Go helper authority broadens beyond parser-only stdin/stdout',
    ]) {
      assertIncludes(doc, expected, 'native artifact contract doc')
    }

    for (const [label, pattern] of [
      ['scope', /Slice 2 docs\/tests contract only[\s\S]*does not change `package\.json`[\s\S]*add native artifacts[\s\S]*implement a resolver[\s\S]*package the helper[\s\S]*run `npm version`[\s\S]*run `npm publish`[\s\S]*approve native packaging/i],
      ['identity path', /agentteam-kernel-tmuxSnapshotParse-v0\.3\.0-read-model-shadow-<os>-<arch>\[-<libc>\]\[\.exe\][\s\S]*native\/tmuxSnapshotParse\/<helperVersion>\/<os>-<arch>\[-<libc>\]\/agentteam-kernel\[\.exe\]/i],
      ['module only', /helper belongs to `tmuxSnapshotParse` only[\s\S]*`compactReadModelFingerprint` remains non-cutover TypeScript fallback[\s\S]*must not require a native artifact/i],
      ['platform matrix', /OS[\s\S]*CPU architecture[\s\S]*Linux libc target[\s\S]*executable extension and permission expectations[\s\S]*tmux availability assumptions[\s\S]*pi extension support assumptions[\s\S]*CI\/install smoke coverage/i],
      ['unsupported platform', /unsupported platforms must fail closed[\s\S]*`unsupported-platform`[\s\S]*must not silently run the TypeScript parser fallback[\s\S]*default\/native cutover and global TypeScript fallback deletion remain STOP/i],
      ['version protocol', /JSON-RPC protocol version `1`[\s\S]*helper version currently `0\.3\.0-read-model-shadow`[\s\S]*capability includes `tmuxSnapshotParse`[\s\S]*`businessPathsConnected:false`[\s\S]*Package\/helper version skew must be detected/i],
      ['health smoke', /Direct `health` smoke expectations[\s\S]*"ok": true[\s\S]*"implementation": "go"[\s\S]*"protocolVersion": 1[\s\S]*"helperVersion": "0\.3\.0-read-model-shadow"[\s\S]*"businessPathsConnected": false/i],
      ['tmux smoke', /Direct `tmuxSnapshotParse` smoke expectations[\s\S]*method is `tmuxSnapshotParse`[\s\S]*already-captured tmux `list-panes` stdout[\s\S]*response preserves `capturedAt`[\s\S]*response returns `ok:true`[\s\S]*`panes` array and `byPaneId` map/i],
      ['fail closed', /missing helper fails closed[\s\S]*corrupt helper fails closed[\s\S]*wrong-platform helper fails closed[\s\S]*non-executable helper fails closed[\s\S]*wrong-version helper fails closed[\s\S]*incompatible helper response fails closed[\s\S]*future packaged\/default cutover path must not silently invoke the TypeScript parser fallback/i],
      ['integrity', /checksum manifest[\s\S]*SHA-256[\s\S]*manifest binds helper version[\s\S]*package version[\s\S]*OS[\s\S]*CPU architecture[\s\S]*libc target[\s\S]*provenance or attestation[\s\S]*license metadata[\s\S]*executable-bit validation/i],
      ['offline install cleanup', /clean install on supported OS\/arch[\s\S]*without Go toolchain[\s\S]*source checkout[\s\S]*manual `\/tmp` build[\s\S]*`PI_AGENTTEAM_KERNEL_HELPER` override[\s\S]*offline\/CI tarball or cache workflow[\s\S]*uninstall removes package-owned helper files[\s\S]*upgrade replaces stale helper artifacts/i],
      ['boundaries', /Go helper remains parser-only\/stdin-stdout[\s\S]*tmux execution or tmux capture[\s\S]*state or repository reads\/writes[\s\S]*network clients, servers, or listeners[\s\S]*worker lifecycle authority[\s\S]*PlanRun, task\/report governance[\s\S]*mailbox\/report full-text access[\s\S]*package\/release authority/i],
      ['stop conditions', /STOP future native implementation or default\/native cutover[\s\S]*platform matrix is vague[\s\S]*version skew detection is missing[\s\S]*checksum manifest[\s\S]*postinstall\/preinstall\/prepare download[\s\S]*install-time `go build`[\s\S]*native binaries are checked into the source repo[\s\S]*diagnostics leak helper path[\s\S]*Go helper authority broadens/i],
    ]) {
      assertMatches(doc, pattern, `native artifact contract doc: ${label}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'Go runtime is required',
      'native packaging is approved',
      'native implementation is approved',
      'checked-in binary is allowed',
      'postinstall download is allowed',
      'preinstall download is allowed',
      'prepare download is allowed',
      'install-time Go build is allowed',
      'run `npm version` to release',
      'run `npm publish` to release',
      'fallback deletion is approved',
      'delete the TypeScript fallback now',
      'Model B is enough for default users',
      'source-only helper is enough for default users',
      'commit/tag/push as part of this checkpoint',
      'compactReadModelFingerprint becomes cutover-owned',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go owns state writes',
      'Go owns task/report governance',
      'Go reads mailbox full text',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.21 native artifact contract docs must not imply forbidden policy: ${forbiddenPhrase}`)
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
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist for v0.4.21 native artifact contract docs`)
    }
    const nativeArtifacts = walkFiles(root)
      .filter(file => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}.git${path.sep}`))
      .filter(file => /\.(?:exe|dll|so|dylib)$/i.test(file))
      .map(file => path.relative(root, file).replace(/\\/g, '/'))
    assert.deepEqual(nativeArtifacts, [], 'native artifacts must not be checked in')
  },
}
