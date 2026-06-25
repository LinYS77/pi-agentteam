const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.6.28-final-prep-and-v0.6.29-entry.md'
const PLAN = 'docs/agentteam方案书.md'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_DOC_ITEMS = [
  'v0.6.28 Final Prep and v0.6.29 Entry',
  'short docs/tests-only final-prep checkpoint',
  'Version Namespace Correction',
  '`v0.4.27` is a legacy/misnamed GitHub tag',
  'the canonical roadmap checkpoint is `v0.6.27`',
  '`v0.4.27` and `v0.6.27` point to commit `bc25c3c`',
  'do not delete or move `v0.4.27`',
  'do not amend `bc25c3c`',
  'historical v0427 files/tests are not batch-renamed',
  'from v0.6.28/v0628 onward',
  '`package.json` remains `0.6.8`',
  'roadmap checkpoint tags and npm package version remain separate',
  'v0.6.28 Final-Prep Decision',
  'v0.6.28 is the last small preparation version before the formal implementation refactor',
  'v0.6.29 is GO for real local/reviewer-controlled Go helper artifact builder and explicit preview manifest resolver',
  'The first target module is `tmuxSnapshotParse`',
  'only existing cutover-owned candidate',
  'Go helper/adapter/diagnostics scaffolding already exists',
  'v0.6.29 Entry Plan Summary',
  'real local helper artifact builder',
  '`GO111MODULE=off go build`',
  'OS temp or ignored `.agentteam-artifacts/`',
  'real artifact validation/smoke',
  'JSON-RPC `health` and `tmuxSnapshotParse`',
  'explicit manifest resolver module',
  'future `core/kernelPackagedResolver.ts`',
  'used only on explicit preview paths',
  'integrate resolver into `go-packaged-preview` only when explicit manifest/root input is set',
  'keep default/go/auto/current `go-cutover` from discovering packaged layout',
  'real clean-install preview smoke',
  'real artifact → temp installed layout → explicit resolver → adapter preview parse',
  'v0.6.28 STOP',
]
const STOP_ITEMS = [
  'implementing v0.6.29 builder/resolver/smoke',
  'running `go build`',
  'adding CI workflow',
  'adding artifact upload',
  'adding release assets',
  'changing package metadata',
  'adding `optionalDependencies`',
  'adding package scripts',
  'adding lifecycle hooks',
  'adding postinstall/download/install-time build',
  'adding go.mod/go.sum',
  'adding lockfiles',
  'checking in native binaries',
  'checking in tarballs',
  'checking in generated artifacts/manifests',
  'default Go',
  'default resolver',
  'TypeScript fallback deletion',
  '`go-cutover` behavior changes',
  '`go-packaged-preview` semantic changes beyond future plan text',
  '`/team readiness` expansion',
  'normal-user UI/tool/runtime diagnostics',
  'npm version/publish',
  'commit/tag/push',
]
const FORBIDDEN_DOC_PHRASES = [
  'v0.6.28 implements builder',
  'v0.6.28 implements resolver',
  'v0.6.28 implements smoke',
  'builder is implemented',
  'resolver is implemented',
  'go build was run',
  'generated artifacts are checked in',
  'default Go is enabled',
  'TypeScript fallback is deleted',
  'npm package is approved',
  'package metadata is approved',
  'npm publish is approved',
  'npm version is approved',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
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

function assertPackageJsonGuardrails(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated outputs')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not run npm pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b/.test(command), false, `${name} must not build/install/module-manage helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild|postinstall/i.test(command), false, `${name} must not download/build native helper`)
  }
}

function assertNoGeneratedOrNativeOutputs(root) {
  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|pipeline-manifest|clean-install-consumption-manifest|artifact-bundle-manifest|install-layout-manifest|consumption-failure-manifest|rollback-manifest|no-leak-manifest|generated-package-manifest|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|v0628-builder-output|v0628-resolver-output)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts\//.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated artifacts/manifests from v0.6.28 work')
}

function assertNoLockfilesOrGoModules(root) {
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
}

module.exports = {
  name: 'Go kernel v0.6.28 final prep entry guard',
  async run(env) {
    const root = env.helpers.extRoot
    assert.equal(fs.existsSync(path.join(root, DOC)), true, `${DOC} should exist`)
    const doc = read(root, DOC)
    const plan = fs.existsSync(path.join(root, PLAN)) ? read(root, PLAN) : ''
    const planSection = plan.match(/^### v0\.6\.28 — Final Prep and v0\.6\.29 Entry[\s\S]*?(?=^### |\z)/m)?.[0] || ''

    for (const expected of REQUIRED_DOC_ITEMS) assertIncludes(doc, expected, 'v0.6.28 final prep doc')
    for (const expected of STOP_ITEMS) assertIncludes(doc, expected, 'v0.6.28 STOP')
    for (const forbidden of FORBIDDEN_DOC_PHRASES) assert.equal(doc.includes(forbidden), false, `doc must not claim forbidden implementation: ${forbidden}`)
    assert.ok(doc.includes('v0.6.28'), 'doc should use v0.6.28 namespace')
    assert.ok(doc.includes('v0628'), 'doc should use v0628 namespace')
    assert.equal(/v0\.4\.28/.test(doc), false, 'new doc must not use v0.4.28 namespace')
    assert.equal(/v0\.4\.28/.test(doc), false, `${DOC} must not mention v0.4.28`)
    if (plan) {
      assert.ok(planSection, 'roadmap should include v0.6.28 final prep section')
      assert.equal(/v0\.4\.28/.test(planSection), false, 'v0.6.28 roadmap update must not mention v0.4.28')
    }
    assertPackageJsonGuardrails(root)
    assertNoLockfilesOrGoModules(root)
    assertNoGeneratedOrNativeOutputs(root)
  },
}
