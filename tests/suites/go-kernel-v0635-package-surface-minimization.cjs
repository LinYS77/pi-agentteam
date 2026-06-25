const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.6.35-pi-extension-compliance-package-surface.md'
const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const EXPECTED_PEERS = {
  '@earendil-works/pi-ai': '*',
  '@earendil-works/pi-coding-agent': '*',
  '@earendil-works/pi-tui': '*',
  typebox: '*',
}
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'
const APPROVED_EMBEDDED_NATIVE_FILES = [
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/agentteam-tmuxSnapshotParse',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/manifest.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/SHA256SUMS',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/provenance.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/LICENSE',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/license.json',
  'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/attestation.intoto.jsonl',
]
function isApprovedEmbeddedNative(rel) {
  return APPROVED_EMBEDDED_NATIVE_FILES.includes(rel) || rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX)
}
const EXPECTED_PACKAGE_FILES = [
  'index.ts',
  'types.ts',
  'internalTypes.ts',
  'config.ts',
  'agents.ts',
  'deliveryPolicy.ts',
  'messageLifecycle.ts',
  'orchestration.ts',
  'policy.ts',
  'protocol.ts',
  'renderers.ts',
  'session.ts',
  'teamPanel.ts',
  'utils.ts',
  'workerTurnPrompt.ts',
  'agents/',
  'api/',
  'app/',
  'adapters/',
  '!/commands.ts',
  '!/tools.ts',
  '!state.ts',
  '!tmux.ts',
  '!runtime.ts',
  '!runtimeBridge.ts',
  '!runtimeDelivery.ts',
  '!runtimePanes.ts',
  '!runtimeRules.ts',
  '!runtimeService.ts',
  '!runtimeStorage.ts',
  '!runtimeWake.ts',
  'commands/',
  'hooks/',
  'core/',
  'runtime/',
  '!runtime/teamSideEffects.ts',
  '!core/taskNoteModel.ts',
  'state/',
  '!state/taskNotes.ts',
  'teamPanel/',
  'tmux/',
  'tools/',
  ...APPROVED_EMBEDDED_NATIVE_FILES,
  '!tools/messageDelivery.ts',
  '!tools/messagePolicy.ts',
  '!tools/messageRouting.ts',
  '!tools/taskCommands.ts',
  '!tools/taskPolicy.ts',
  '!tools/taskActionability.ts',
  'config.example.json',
  'tsconfig.json',
  'README.md',
  'LICENSE',
]
const REQUIRED_PACKAGE_SURFACE = [
  'index.ts',
  'types.ts',
  'api/commands.ts',
  'api/tools.ts',
  'commands/team.ts',
  'commands/readiness.ts',
  'tools/team.ts',
  'tools/message.ts',
  'tools/task.ts',
  'tools/planRun.ts',
  'hooks/session.ts',
  'hooks/context.ts',
  'hooks/agent.ts',
  'hooks/toolGuard.ts',
  'teamPanel.ts',
  'teamPanel/layout.ts',
  'teamPanel/input.ts',
  'renderers.ts',
  'policy.ts',
  'config.example.json',
  'tsconfig.json',
  'README.md',
  'LICENSE',
]
const FORBIDDEN_PACKAGE_ENTRY = /(?:^|\/)(?:\.github|docs|tests|fixtures|scripts|kernel)(?:\/|$)|(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|go\.mod|go\.sum)$|(?:native|native-helper|go-helper|artifact|bundle|checksum|provenance|attestation|hosted-observation|raw-record|release-asset|release-bundle|signing|cosign|slsa|platform-matrix|downloaded|generated)|\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig)$/i
const FORBIDDEN_INCLUDED_SURFACE = /(?:^|\/)(?:\.github|docs|tests|fixtures|scripts|kernel)(?:\/|$)|(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|go\.mod|go\.sum)$|(?:^|\/)(?:native|native-helper|go-helper|artifact|bundle|checksum|provenance|attestation|hosted-observation|raw-record|release-asset|release-bundle|signing|cosign|slsa|platform-matrix|downloaded|generated)(?:[-_.\/]|$)|\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig)$/i
const FORBIDDEN_REPO_ARTIFACT = /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig)$/i
const FORBIDDEN_REPO_RECORD = /(?:^|\/)(?:artifact-index|generated-manifest|checksum|provenance|attestation|hosted-observation|raw-record|release-bundle|release-asset|signature-material)(?:[-_.\/]|$)/i
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]
const LIFECYCLE_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepublish',
  'prepublishOnly',
  'publish',
  'postpublish',
  'prepack',
  'postpack',
]
const FORBIDDEN_PACKAGE_KEYS = [
  'optionalDependencies',
  'bundledDependencies',
  'bundleDependencies',
  'agentteamGoHelper',
  'binary',
  'os',
  'cpu',
  'native',
  'nativeHelper',
]
const REQUIRED_DOC = [
  '## Slice 4 — Package Files / Surface Minimization and No Native Artifacts',
  'Slice 4 statically guards the package files allowlist and repository artifact surface for the pi TypeScript extension package.',
  'It is docs/tests only and does not change `package.json`, package files, production source, workflows, runtime behavior, readiness behavior, commands, tools, release behavior, signing behavior, or native helper behavior.',
  'The package manifest remains `pi-agentteam` / `0.6.8` / `module`.',
  '`package.json#pi.extensions` remains exactly `["./index.ts"]`.',
  '`package.json` still has no `main`, `exports`, or `types` field.',
  '`dependencies` remains empty or absent.',
  'Pi packages and `typebox` remain peer dependencies with `"*"` ranges: `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox`.',
  'Native/package metadata remains absent: `optionalDependencies`, `bundledDependencies`, `bundleDependencies`, `binary`, `os`, `cpu`, `native`, `nativeHelper`, and `agentteamGoHelper`.',
  'Lifecycle and publish hooks remain absent: `preinstall`, `install`, `postinstall`, `prepare`, `prepublish`, `prepublishOnly`, `publish`, `postpublish`, `prepack`, and `postpack`.',
  'Package scripts must not run `npm version`, `npm publish`, non-dry-run `npm pack`, `go build`, `go install`, `go mod`, `curl`, `wget`, `node-gyp`, or `prebuild`.',
  '`release:check` remains allowed only as `npm pack --dry-run --ignore-scripts` after local checks.',
  '`package.json#files` exists and remains an explicit allowlist for the TypeScript/pi facade surface.',
  'Required facade entries include `index.ts`, `types.ts`, `api/`, `commands/`, `tools/`, `hooks/`, `teamPanel/`, `renderers.ts`, `config.example.json`, `tsconfig.json`, `README.md`, and `LICENSE`.',
  'Current support directories remain TypeScript source directories only: `agents/`, `app/`, `adapters/`, `core/`, `runtime/`, `state/`, and `tmux/`.',
  'The allowlist must not include `.github`, workflows, `docs/perf`, tests, fixtures, proof scripts, temp roots, Go module roots, native/helper layouts, generated manifests, checksums, provenance, attestations, hosted observations, raw records, release bundles, signing material, platform-matrix assets, archives, or native binaries.',
  'The expanded static package surface must not include native/helper/generated/release/signing/platform artifacts or package lock/module files.',
  'The repo root must not contain `pi-agentteam-*.tgz`, `package-lock.json`, `npm-shrinkwrap.json`, `go.mod`, or `go.sum`.',
  'The repository scan excludes `.git`, `node_modules`, and `data`, and must find no checked-in native binaries, archives, tarballs, signatures, attestations, raw records, generated manifests, checksums, or release bundles.',
  'Slice 4 guard: `tests/suites/go-kernel-v0635-package-surface-minimization.cjs` verifies manifest/package files minimization, expanded package surface boundaries, no metadata/hooks/locks/native artifacts, and no repo artifact residue.',
  'No package release approval.',
  'No install source approval.',
  'No release asset approval.',
  'No native helper delivery.',
  'No package-manager native delivery.',
  'No normal-user native helper availability proof.',
  'No default Go approval or enablement.',
  'No default resolver approval or enablement.',
  'No TypeScript fallback deletion or `compactReadModelFingerprint` cutover.',
  'No signing, cosign, SLSA, or security attestation proof or approval.',
  'No second-platform support or platform-matrix expansion.',
  'Do not start Slice 5 runtime mode boundary work or Slice 6 checkpoint work in Slice 4.',
  '`node --check tests/suites/go-kernel-v0635-package-surface-minimization.cjs`.',
  'direct focused guard suite.',
  'direct Slice 1–4 v0.6.35 guards.',
  '`git diff --check`.',
  'repo scan for temp tarballs, lockfiles, Go modules, native archives/binaries, signing material, attestations, raw records, generated manifests, checksums, and release bundles.',
]
const FORBIDDEN_DOC_CLAIMS = [
  'package release is approved',
  'install source is approved',
  'release asset is approved',
  'native helper delivery is complete',
  'native package delivery is complete',
  'normal-user native helper availability is proven',
  'default Go is enabled',
  'default resolver is enabled',
  'fallback deletion is approved',
  'signing is approved',
  'cosign is approved',
  'SLSA is approved',
  'second platform support is approved',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
}

function stat(root, rel) {
  return fs.statSync(path.join(root, ...rel.split('/')))
}

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'data') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_CLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
}

function normalizePackageEntry(entry) {
  return entry.replace(/\\/g, '/').replace(/^\.\//, '')
}

function normalizeExclusion(entry) {
  return normalizePackageEntry(entry.slice(1)).replace(/^\//, '')
}

function assertPackageManifest(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, PACKAGE_NAME)
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.type, 'module')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
  for (const field of ['main', 'exports', 'types']) assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  assert.deepEqual(Object.keys(packageJson.dependencies || {}).sort(), [], 'dependencies must remain empty or absent')
  for (const [name, range] of Object.entries(EXPECTED_PEERS)) assert.equal(packageJson.peerDependencies?.[name], range, `${name} must remain peer dependency ${range}`)
  assert.deepEqual(Object.keys(packageJson.peerDependencies || {}).sort(), Object.keys(EXPECTED_PEERS).sort(), 'peer dependency surface must remain limited to pi packages and typebox')
  for (const key of FORBIDDEN_PACKAGE_KEYS) assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package.json must not define ${key}`)

  const scripts = packageJson.scripts || {}
  for (const lifecycle of LIFECYCLE_SCRIPTS) assert.equal(Object.prototype.hasOwnProperty.call(scripts, lifecycle), false, `package.json scripts must not define ${lifecycle}`)
  for (const [scriptName, command] of Object.entries(scripts)) {
    assert.equal(/\bnpm\s+version\b/i.test(command), false, `${scriptName} must not run npm version`)
    assert.equal(/\bnpm\s+publish\b/i.test(command), false, `${scriptName} must not run npm publish`)
    if (/\bnpm\s+pack\b/i.test(command)) {
      assert.match(command, /--dry-run\b/, `${scriptName} may only run npm pack as a dry run`)
      assert.match(command, /--ignore-scripts\b/, `${scriptName} npm pack dry run must ignore scripts`)
    }
    assert.equal(/\bgo\s+(?:build|install|mod)\b/i.test(command), false, `${scriptName} must not run go build/install/mod`)
    assert.equal(/\b(?:curl|wget|node-gyp|prebuild)\b/i.test(command), false, `${scriptName} must not run network/native build helpers`)
  }

  assert.ok(Array.isArray(packageJson.files), 'package.json#files must exist')
  assert.deepEqual(packageJson.files, EXPECTED_PACKAGE_FILES, 'package.json#files must remain the explicit TS/pi facade allowlist')
  assert.equal(new Set(packageJson.files).size, packageJson.files.length, 'package.json#files must not contain duplicate entries')
  for (const entry of packageJson.files) {
    assert.equal(typeof entry, 'string', 'package files entries must be strings')
    assert.notEqual(entry.trim(), '', 'package files entries must be non-empty')
    assert.equal(path.isAbsolute(entry), false, `package files entry must be relative: ${entry}`)
    assert.equal(entry.includes('..'), false, `package files entry must not traverse: ${entry}`)
    assert.equal(entry.includes('\\'), false, `package files entry must use posix separators: ${entry}`)
    assert.equal(FORBIDDEN_PACKAGE_ENTRY.test(normalizePackageEntry(entry)) && !isApprovedEmbeddedNative(normalizePackageEntry(entry)), false, `package files entry must not expose unapproved native/generated/release/platform surface: ${entry}`)
    if (!entry.startsWith('!')) assert.equal(exists(root, entry.replace(/\/$/, '')), true, `package files entry must exist: ${entry}`)
  }
}

function expandPackageFiles(root, entries) {
  const included = new Set()
  for (const entry of entries) {
    if (entry.startsWith('!')) continue
    const normalized = normalizePackageEntry(entry).replace(/\/$/, '')
    const full = path.join(root, ...normalized.split('/'))
    if (!fs.existsSync(full)) continue
    const stats = fs.statSync(full)
    if (stats.isDirectory()) {
      for (const file of walkFiles(full)) included.add(toRel(root, file))
    } else if (stats.isFile()) {
      included.add(normalized)
    }
  }
  for (const entry of entries) {
    if (!entry.startsWith('!')) continue
    const excluded = normalizeExclusion(entry).replace(/\/$/, '')
    for (const rel of Array.from(included)) {
      if (rel === excluded || rel.startsWith(`${excluded}/`)) included.delete(rel)
    }
  }
  return Array.from(included).sort()
}

function assertPackageFilesAllowlist(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  const expanded = expandPackageFiles(root, packageJson.files)
  for (const rel of REQUIRED_PACKAGE_SURFACE) assert.ok(expanded.includes(rel), `expanded package surface should include required TS/pi facade file: ${rel}`)
  for (const rel of expanded) assert.equal(FORBIDDEN_INCLUDED_SURFACE.test(rel) && !isApprovedEmbeddedNative(rel), false, `expanded package surface must not include unapproved native/generated/release/platform artifact: ${rel}`)
  for (const excluded of ['commands.ts', 'tools.ts', 'state.ts', 'tmux.ts', 'runtime.ts', 'runtimeBridge.ts', 'runtimeDelivery.ts', 'runtimePanes.ts', 'runtimeRules.ts', 'runtimeService.ts', 'runtimeStorage.ts', 'runtimeWake.ts', 'runtime/teamSideEffects.ts', 'core/taskNoteModel.ts', 'state/taskNotes.ts', 'tools/messageDelivery.ts', 'tools/messagePolicy.ts', 'tools/messageRouting.ts', 'tools/taskCommands.ts', 'tools/taskPolicy.ts', 'tools/taskActionability.ts']) {
    assert.equal(expanded.includes(excluded), false, `expanded package surface must respect explicit exclusion: ${excluded}`)
  }
  for (const rel of packageJson.files.filter(entry => !entry.startsWith('!'))) {
    const trimmed = rel.replace(/\/$/, '')
    const stats = stat(root, trimmed)
    if (rel.endsWith('/')) assert.equal(stats.isDirectory(), true, `allowlist directory must be a directory: ${rel}`)
    else assert.equal(stats.isFile(), true, `allowlist file must be a file: ${rel}`)
  }
}

function assertRepoArtifactGuard(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  const rootTarballs = fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort()
  assert.deepEqual(rootTarballs, [], 'repo root must not contain pi-agentteam temp tarballs')

  const forbiddenArtifacts = []
  const forbiddenRecords = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (FORBIDDEN_REPO_ARTIFACT.test(rel) && !isApprovedEmbeddedNative(rel)) forbiddenArtifacts.push(rel)
    const reviewHelper = rel.startsWith('docs/') || rel.startsWith('tests/') || rel.startsWith('scripts/') || rel.startsWith('.github/workflows/') || isApprovedEmbeddedNative(rel)
    if (!reviewHelper && FORBIDDEN_REPO_RECORD.test(rel)) forbiddenRecords.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain checked-in native/archive/signing artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain generated manifests/checksums/provenance/attestation/raw release records outside review helper areas')
}

module.exports = {
  name: 'Go kernel v0.6.35 package surface minimization',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertPackageManifest(root)
    assertPackageFilesAllowlist(root)
    assertRepoArtifactGuard(root)
  },
}
