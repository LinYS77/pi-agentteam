const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.25-native-helper-availability-proof.md'
const PACKAGE_VERSION = '0.6.8'
const GATES = [
  'generated artifacts',
  'manifest/checksum/provenance/license/executable validation',
  'clean install',
  'compact diagnostics/no-leak',
  'unsupported-platform policy',
  'rollback/default-disable/deprecation',
  'package release ownership',
  'parser failure policy in normal-user default path',
  'package metadata/companion package ownership',
  'explicit user approval',
  'fallback deletion readiness',
]
const FORBIDDEN_PHRASES = [
  'native/default cutover is approved',
  'fallback deletion is approved',
  'normal-user availability is proven',
  'normal-user native availability is proven',
  'native packaging is approved',
  'npm publish is approved',
  'npm version is approved',
  'Go is default',
  'Go remains default',
  'Go is a pi extension',
  'native Go pi extension is assumed',
  'broader Go authority is approved',
  'Go owns tmux execution',
  'Go owns tmux capture',
  'Go owns worker lifecycle',
  'Go owns task/report governance',
  'Go owns UI rendering',
  'Go owns command control plane',
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

function assertRepoArtifactSanity(root) {
  const generatedManifestNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|clean-install-manifest|rollback-manifest|cutover-gate-manifest)\.(?:json|jsonc|yaml|yml)$/i
  const forbidden = walkFiles(root)
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz)$/i.test(rel) || generatedManifestNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/tarball/generated manifest/package artifacts')
}

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated artifacts')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    assert.equal(/go\s+(?:build|install)\b/.test(command), false, `${name} must not build/install helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not download/build native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
}

function assertKernelSourceInvariants(root) {
  const source = read(root, 'core/kernel.ts')
  assertIncludes(source, "if (!raw || raw === 'default') return 'default'", 'kernel source')
  assertIncludes(source, "if (raw === 'none' || raw === 'off' || raw === 'disabled') return 'disabled'", 'kernel source')
  assertIncludes(source, 'const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)', 'kernel source')
  assertIncludes(source, "const activeMode: AgentTeamKernelActiveMode = usesGo() ? 'go' : 'typescript'", 'kernel source')
  assertIncludes(source, "enabled: activeMode === 'go'", 'kernel source')
  assertIncludes(source, "'go-packaged-preview'", 'kernel source')
  assertIncludes(source, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel source')
  assertIncludes(source, "const packagedResolverFailure = packagedResolverRequested && !explicitHelperPath", 'kernel source')
  assertIncludes(source, "const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure", 'kernel source')
  assertIncludes(source, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel source')
  assertIncludes(source, 'const startupFallback = cutoverRequested ? undefined', 'kernel source')
  assertIncludes(source, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'kernel source')
  assertIncludes(source, 'if (cutoverRequested) return fallback(compactInput)', 'kernel source')
  assertIncludes(source, "callHelper<unknown>('tmuxSnapshotParse'", 'kernel source')
  assertIncludes(source, 'AGENTTEAM_KERNEL_CUTOVER_MODULE', 'kernel source')
}

function assertReadinessNotExpanded(root) {
  const readiness = fs.existsSync(path.join(root, 'commands/readiness.ts')) ? read(root, 'commands/readiness.ts') : ''
  const team = read(root, 'commands/team.ts')
  assertIncludes(readiness, "return args.trim().toLowerCase() === 'readiness'", 'readiness command')
  assert.equal(/readiness\s+--|readiness\s+(?:native|availability|resolver|default|cutover|package|artifact)/i.test(readiness), false, '/team readiness should not gain options/subcommands')
  assert.equal(/registerTool|model-callable|native availability tool/i.test(readiness), false, 'readiness must not become model-callable tool')
  assert.equal(/openTeamPanel\([^)]*readiness|render.*readiness/i.test(team), false, 'readiness must not be ambient panel rendering')
}

module.exports = {
  name: 'Go kernel v0.4.25 resolver default cutover gate',
  async run(env) {
    const root = env.helpers.extRoot
    const doc = read(root, DOC)
    const lower = doc.toLowerCase()

    for (const expected of [
      'Slice 5 — Resolver/Default and Module Cutover Gate',
      'Resolver/default and module cutover gate matrix',
      'current state',
      'required evidence before packaged/default resolver can be considered',
      'required evidence before `tmuxSnapshotParse` TypeScript fallback deletion can be considered',
      'v0.4.25 does not pass the gate',
      'defines the gate and gathers temp/prototype evidence only',
      'does not approve packaged/default resolver',
      'does not approve fallback deletion',
      'default/unset remains disabled/TypeScript',
      '`go-packaged-preview` remains explicit-only/non-default and its availability semantics remain unchanged',
      'current `go-cutover` remains helper-path based and unchanged',
      'packaged helper discovery does not run in default/disabled/typescript/go/auto/current `go-cutover`',
      '`tmuxSnapshotParse` remains the only cutover-owned module under discussion',
      '`compactReadModelFingerprint` remains TypeScript fallback/non-cutover',
      'Go authority stays parser-only stdin/stdout',
      'does not own tmux execution/capture',
      'does not own state',
      'does not own worker lifecycle',
      'does not own task/report governance',
      'does not own PlanRun',
      'does not own full-text boundaries',
      'does not own package/release authority',
      'does not own UI rendering',
      'does not own command control plane',
      'No hidden TS fallback after cutover',
      'rollback must be release/tag/package/deprecation/default-disable policy',
      'STOP for Slice 6 work',
      'tests/suites/go-kernel-v0425-resolver-default-cutover-gate.cjs',
    ]) {
      assert.ok(lower.includes(expected.toLowerCase()), `doc should include ${expected}`)
    }

    for (const gate of GATES) {
      assert.ok(lower.includes(gate.toLowerCase()), `doc should include gate ${gate}`)
    }

    const gateSection = doc.slice(doc.indexOf('## Slice 5'))
    for (const gate of GATES) {
      const row = new RegExp(`\\| ${gate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|[\\s\\S]*?\\|`, 'i')
      assert.match(gateSection, row, `gate matrix should include row for ${gate}`)
    }

    for (const forbidden of FORBIDDEN_PHRASES) {
      assert.equal(doc.includes(forbidden), false, `doc must not imply forbidden approval: ${forbidden}`)
    }

    assertKernelSourceInvariants(root)
    assertRepoArtifactSanity(root)
    assertPackageNativeSanity(root)
    assertReadinessNotExpanded(root)
  },
}
