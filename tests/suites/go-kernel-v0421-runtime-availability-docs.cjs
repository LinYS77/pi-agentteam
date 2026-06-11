const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.21-go-runtime-availability.md'
const V0419_PREREQ = 'docs/perf/v0.4.19-go-runtime-prerequisites.md'
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
  name: 'Go kernel v0.4.21 runtime availability decision docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [DOC, V0419_PREREQ, V0420_CHECKPOINT, PLAN]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const packageJson = JSON.parse(read(root, 'package.json'))
    const combined = [doc, plan].join('\n\n')

    assertIncludes(doc, V0419_PREREQ, 'runtime availability doc should reference v0.4.19 prerequisites')
    assertIncludes(doc, V0420_CHECKPOINT, 'runtime availability doc should reference v0.4.20 checkpoint')
    assertIncludes(plan, DOC, 'plan should reference v0.4.21 runtime availability doc')

    for (const expected of [
      'v0.4.21 Go Runtime Availability Decision Matrix',
      'Model C0 decision/signoff planning only',
      'does not implement a runtime resolver',
      'native packaging',
      'helper downloads',
      'install-time builds',
      'default Go runtime',
      'TypeScript fallback deletion',
      'v0.4.20 completed the GitHub-only `go-cutover` checkpoint',
      'PI_AGENTTEAM_KERNEL=go-cutover` remains explicit/local-only',
      'npm/default/native cutover remains STOP',
      'tmuxSnapshotParse` is the only cutover-owned module',
      'compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
      'Model B explicit helper path remains local/reviewer-only',
      'cannot justify deleting the TypeScript parser fallback',
      'v0.4.19 runtime prerequisites',
      'normal-user runtime availability',
      'Native companion packages per supported platform',
      'generated release artifacts with checksums/provenance',
      'Main-package bundled prebuilt binaries are a possible second-choice design',
      'Postinstall/preinstall/prepare downloads and install-time `go build` are rejected',
      'Source package / user-built helper remains useful for development',
      'GO for Model C0 docs/tests signoff; STOP for native implementation',
      'Model B explicit user-provided helper path',
      'Model C0 design/signoff only',
      'Future companion native packages with `os`/`cpu` metadata',
      'Future main-package bundled prebuilt binaries',
      'Source package / user builds helper',
      'Postinstall/preinstall/prepare download',
      'Install-time `go build`',
      'Fresh install on every supported OS/arch',
      'without a Go toolchain, source checkout, manual `/tmp` build, or `PI_AGENTTEAM_KERNEL_HELPER` override',
      'Platform matrix is explicit',
      'OS, CPU architecture, Linux libc target',
      'Unsupported-platform policy is explicit',
      'Helper health/protocol/capability/version check',
      'protocol version `1`',
      'helper version `0.3.0-read-model-shadow`',
      'tmuxSnapshotParse` capability',
      'businessPathsConnected:false',
      'Package/helper version skew is detected',
      'Offline/CI behavior is documented',
      'v0.4.21 Slice 1 makes no package behavior changes',
      'package.json` version remains `0.6.8`',
      'no `npm version`',
      'no `npm publish`',
      'no npm lifecycle hooks',
      'no helper build/download/package scripts',
      'no `package-lock.json` or `npm-shrinkwrap.json`',
      'no root or helper `go.mod`',
      'no root or helper `go.sum`',
      'no checked-in native binaries or helper artifacts',
      'no `kernel/` package inclusion',
      'No TypeScript runtime fallback deletion is allowed until normal-user availability signoff passes',
      'Future shipped/default diagnostics may need a compact `/team` signal',
      'Forbidden diagnostic leaks',
      'raw helper path',
      'helper stdout/stderr bodies',
      'repository path or cwd path',
      'mailbox/report text',
      'raw `cutoverReason`',
      'Rollback for default/native cutover must be via GitHub tag/npm corrected release',
      'STOP npm/default/native cutover',
      'helper availability is only source-only',
      'explicit-helper-path',
      'local Go-toolchain based',
      'any supported platform lacks a normal install helper path',
      'unsupported-platform policy is unresolved',
      'postinstall/preinstall/prepare downloads or install-time `go build`',
      'helper binaries lack checksum/provenance/version compatibility checks',
      'missing, incompatible, corrupted, wrong-platform, blocked, or non-executable helper can silently invoke the TypeScript parser fallback',
      'parser failure can cause pane loss',
      'Go gains tmux execution/capture',
      'state writes',
      'worker lifecycle',
      'PlanRun/governance',
      'full-text boundary',
      'package/release control',
      'downstream runtime/package implementation starts before leader-approved signoff',
    ]) {
      assertIncludes(doc, expected, 'runtime availability doc')
    }

    for (const [label, pattern] of [
      ['decision language', /v0\.4\.21 Slice 1 is Model C0: decision\/signoff docs\/tests only[\s\S]*Preferred future Model C direction[\s\S]*Native companion packages[\s\S]*generated release artifacts with checksums\/provenance/i],
      ['matrix rows', /Model B explicit user-provided helper path[\s\S]*Model C0 design\/signoff only[\s\S]*Future companion native packages with `os`\/`cpu` metadata[\s\S]*Future main-package bundled prebuilt binaries[\s\S]*Source package \/ user builds helper[\s\S]*Postinstall\/preinstall\/prepare download[\s\S]*Install-time `go build`/i],
      ['normal user evidence', /Fresh install on every supported OS\/arch[\s\S]*without a Go toolchain[\s\S]*source checkout[\s\S]*manual `\/tmp` build[\s\S]*`PI_AGENTTEAM_KERNEL_HELPER` override[\s\S]*Platform matrix is explicit[\s\S]*Unsupported-platform policy is explicit/i],
      ['health and skew', /Helper health\/protocol\/capability\/version check[\s\S]*protocol version `1`[\s\S]*helper version `0\.3\.0-read-model-shadow`[\s\S]*`tmuxSnapshotParse` capability[\s\S]*`businessPathsConnected:false`[\s\S]*Package\/helper version skew is detected/i],
      ['package policy unchanged', /v0\.4\.21 Slice 1 makes no package behavior changes[\s\S]*package\.json` version remains `0\.6\.8`[\s\S]*no `npm version`[\s\S]*no `npm publish`[\s\S]*no npm lifecycle hooks[\s\S]*no helper build\/download\/package scripts[\s\S]*no `package-lock\.json`[\s\S]*no root or helper `go\.mod`[\s\S]*no checked-in native binaries[\s\S]*no `kernel\/` package inclusion/i],
      ['diagnostics policy', /Future shipped\/default diagnostics may need a compact `\/team` signal[\s\S]*Forbidden diagnostic leaks[\s\S]*raw helper path[\s\S]*helper stdout\/stderr bodies[\s\S]*repository path or cwd path[\s\S]*mailbox\/report text[\s\S]*raw `cutoverReason`/i],
      ['rollback', /Rollback for default\/native cutover must be via GitHub tag\/npm corrected release[\s\S]*not a hidden runtime TypeScript parser fallback/i],
      ['stop gates', /STOP npm\/default\/native cutover[\s\S]*helper availability is only source-only[\s\S]*any supported platform lacks a normal install helper path[\s\S]*postinstall\/preinstall\/prepare downloads or install-time `go build`[\s\S]*helper binaries lack checksum\/provenance[\s\S]*silently invoke the TypeScript parser fallback[\s\S]*parser failure can cause pane loss[\s\S]*Go gains tmux execution\/capture/i],
      ['links', /v0\.4\.19 runtime prerequisites:[\s\S]*docs\/perf\/v0\.4\.19-go-runtime-prerequisites\.md[\s\S]*v0\.4\.20 final checkpoint:[\s\S]*docs\/perf\/v0\.4\.20-go-cutover-checkpoint\.md/i],
    ]) {
      assertMatches(doc, pattern, `runtime availability doc: ${label}`)
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
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.21 availability docs must not imply forbidden policy: ${forbiddenPhrase}`)
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
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist for v0.4.21 runtime availability docs`)
    }
    const nativeArtifacts = walkFiles(root)
      .filter(file => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}.git${path.sep}`))
      .filter(file => /\.(?:exe|dll|so|dylib)$/i.test(file))
      .map(file => path.relative(root, file).replace(/\\/g, '/'))
    assert.deepEqual(nativeArtifacts, [], 'native artifacts must not be checked in')
  },
}
