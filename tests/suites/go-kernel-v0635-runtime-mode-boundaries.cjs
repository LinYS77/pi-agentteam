const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DOC = 'docs/perf/v0.6.35-pi-extension-compliance-package-surface.md'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const EXPECTED_COMMANDS = ['team']
const EXPECTED_TOOLS = [
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
]
const CORE_TS_FILES = [
  'core/readModelFingerprint.ts',
  'core/kernelPackagedResolver.ts',
  'core/kernel.ts',
]
const COMMAND_TOOL_FILES = [
  'commands/team.ts',
  'commands/readiness.ts',
  'api/commands.ts',
  'api/tools.ts',
  'tools/team.ts',
  'tools/message.ts',
  'tools/task.ts',
  'tools/planRun.ts',
]
const RUNTIME_AUTHORITY_FILES = [
  'teamPanel/dataSource.ts',
  'teamPanel/viewModel.ts',
  'teamPanel/readModel.ts',
  'teamPanel.ts',
  'renderers.ts',
  'adapters/runtime/service.ts',
  'adapters/runtime/session.ts',
  'state/repository.ts',
  'runtime/repository.ts',
  'app/taskApplication.ts',
  'app/planRunApplication.ts',
]
const REQUIRED_DOC = [
  '## Slice 5 — Pi Extension Runtime Mode Boundaries',
  'Slice 5 guards runtime mode boundaries from the pi TypeScript extension load perspective.',
  'It is docs/tests only and does not change production runtime behavior, default resolver behavior, package behavior, readiness behavior, commands, tools, workflows, release behavior, signing behavior, or native helper behavior.',
  'Default/unset pi extension load remains TypeScript/non-native: `PI_AGENTTEAM_KERNEL` unset normalizes to `disabled`, `mode` remains `typescript`, and Go is not enabled.',
  '`go-packaged-preview` remains explicit-only and non-default.',
  '`go-cutover` remains explicit/local-only and helper-path based.',
  '`tmuxSnapshotParse` remains the only cutover candidate/module.',
  'Explicit `go-cutover` and explicit `go-packaged-preview` failures for `tmuxSnapshotParse` fail closed with compact cutover diagnostics and do not silently call the TypeScript parser fallback callback.',
  '`compactReadModelFingerprint` remains TypeScript fallback / non-cutover under explicit cutover/preview modes.',
  'Default, disabled, typescript, go, auto, and current `go-cutover` modes must not discover installed package roots, manifests, packaged helper layouts, hosted artifacts, or release assets by default.',
  'Installed-layout/package-manifest resolver use remains gated to explicit `go-packaged-preview` inputs only.',
  '`index.ts` remains the pi extension factory and does not read `PI_AGENTTEAM_KERNEL`, spawn Go, run tmux, query package resolvers, inspect native artifacts, or expose native diagnostics during extension load.',
  'Runtime mode remains non-UI-controlled: `/team`, `/team readiness`, and agentteam tools must not expose default Go, default resolver, packaged-native, release, signing, install-source, platform, download, or artifact controls.',
  '`/team readiness` remains explicit compact reviewer diagnostics, not normal-user native availability UI or default/native/release control UI.',
  'Go remains a bounded helper behind the TypeScript adapter seam and has no pi extension lifecycle, command, tool, renderer, provider, package/release, state, mailbox, task/report, PlanRun, tmux execution, worker lifecycle, or full-text authority.',
  'Slice 5 guard: `tests/suites/go-kernel-v0635-runtime-mode-boundaries.cjs` verifies default TypeScript mode, explicit preview/cutover boundaries, `compactReadModelFingerprint` fallback, extension-load source boundaries, readiness/tool non-expansion, and no broad Go control-plane authority.',
  'No native helper delivery or package-manager native delivery.',
  'No normal-user native helper availability proof.',
  'No default Go approval or enablement.',
  'No default resolver approval or enablement.',
  'No TypeScript fallback deletion or `compactReadModelFingerprint` cutover.',
  'No package release, install source, release asset, signing, cosign, SLSA, or security attestation proof or approval.',
  'No second-platform support or platform-matrix expansion.',
  'No `/team readiness`, command, tool, model-callable, UI, package, workflow, runtime, production source, package metadata, dependency, lifecycle hook, or native artifact change.',
  'Do not start Slice 6 final checkpoint/tag policy work in Slice 5.',
  '`node --check tests/suites/go-kernel-v0635-runtime-mode-boundaries.cjs`.',
  'direct focused guard suite.',
  'direct Slice 1–5 v0.6.35 guards.',
  '`git diff --check`.',
  'repo/temp/artifact scans for no temp tarballs, locks, Go modules, native archives/binaries, signing material, attestations, raw records, generated manifests, checksums, release bundles, or v0.6.35 temp roots.',
]
const FORBIDDEN_DOC_CLAIMS = [
  'native helper delivery is complete',
  'native package delivery is complete',
  'normal-user native helper availability is proven',
  'default Go is enabled',
  'default resolver is enabled',
  'fallback deletion is approved',
  'package release is approved',
  'install source is approved',
  'release asset is approved',
  'signing is approved',
  'cosign is approved',
  'SLSA is approved',
  'second platform support is approved',
]
const FORBIDDEN_UI_CONTROL_TERMS = /\b(?:default Go|default resolver|go-packaged-preview|go-cutover|PI_AGENTTEAM_KERNEL|native helper|native package|package-manager native|normal-user native availability UI|release asset|install source|signing|cosign|SLSA|platform matrix|second platform|download artifact|artifact download|package publish|npm publish|npm version|package native controls|provider ABI)\b/i

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
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

function stringLiteralNames(source, pattern) {
  return [...source.matchAll(pattern)].map(match => match[1]).sort()
}

function requireTypeScript() {
  try {
    return require('typescript')
  } catch (_) {
    return require('/home/linyusheng/.nvm/versions/node/v24.9.0/lib/node_modules/typescript')
  }
}

function loadKernel(root, env) {
  if (env.helpers.requireDist) return { kernel: env.helpers.requireDist('core/kernel.js'), cleanup() {} }
  const ts = requireTypeScript()
  const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0635-runtime-boundary-core-'))
  for (const rel of CORE_TS_FILES) {
    const sourceFile = path.join(root, rel)
    const output = ts.transpileModule(fs.readFileSync(sourceFile, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: sourceFile,
      reportDiagnostics: false,
    }).outputText
    const target = path.join(distRoot, rel.replace(/\.ts$/, '.js'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, output, 'utf8')
  }
  return {
    kernel: require(path.join(distRoot, 'core/kernel.js')),
    cleanup() {
      fs.rmSync(distRoot, { recursive: true, force: true })
    },
  }
}

function assertDoc(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_CLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
}

function assertPackageStillFacade(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.type, 'module')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
  for (const field of ['main', 'exports', 'types']) assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
}

function assertKernelSourceBoundaries(root) {
  const kernel = read(root, 'core/kernel.ts')
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  const readModel = read(root, 'core/readModelFingerprint.ts')

  assertIncludes(kernel, "export type AgentTeamKernelKnownMode = 'default' | 'disabled' | 'typescript' | 'go' | 'auto' | 'go-cutover' | 'go-packaged-preview'", 'core/kernel.ts')
  assertIncludes(kernel, "export const AGENTTEAM_KERNEL_CUTOVER_MODULE = 'tmuxSnapshotParse' as const", 'core/kernel.ts')
  assertIncludes(kernel, "const requestedMode = normalizeAgentTeamKernelMode(options.mode ?? env.PI_AGENTTEAM_KERNEL)", 'core/kernel.ts')
  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'core/kernel.ts')
  assertIncludes(kernel, 'const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure', 'core/kernel.ts')
  assertIncludes(kernel, 'const packagedManifestPath = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure', 'core/kernel.ts')
  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperManifestPath()', 'core/kernel.ts')
  assertIncludes(kernel, 'const packagedManifestRequested = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath', 'core/kernel.ts')
  assertIncludes(kernel, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'core/kernel.ts')
  assertIncludes(kernel, 'const startupFallback = cutoverRequested ? undefined : initialFallback', 'core/kernel.ts')
  assertIncludes(kernel, 'if (cutoverRequested || !fallback) return cutoverUnavailableSnapshot(capturedAt)', 'core/kernel.ts')
  assertIncludes(kernel, 'compactReadModelFingerprint(input, fallback = fallbackCompactReadModelFingerprint)', 'core/kernel.ts')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'core/kernel.ts')
  assert.equal(/AGENTTEAM_KERNEL_CUTOVER_MODULE\s*=\s*'compactReadModelFingerprint'/.test(kernel), false, 'compactReadModelFingerprint must not become cutover module')
  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperRoot()', 'core/kernel.ts')
  assert.equal(/node_modules|package\.json|process\.cwd\(\)|require\.resolve|import\.meta\.resolve/i.test(kernel), false, 'kernel must not discover unapproved installed package layout by default')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|cosign|slsa|curl\b|wget\b|node-gyp|prebuild|postinstall|preinstall/i.test(`${kernel}\n${resolver}`), false, 'kernel/resolver must not expose package/release/signing controls')
  assert.equal(/PI_AGENTTEAM_KERNEL|PI_AGENTTEAM_KERNEL_HELPER|AGENTTEAM_GO_KERNEL_HELPER|process\.env/i.test(resolver), false, 'packaged resolver must not read mode env or enable default discovery')
  assertIncludes(resolver, "export const AGENTTEAM_PACKAGED_RESOLVER_MODULE = 'tmuxSnapshotParse'", 'core/kernelPackagedResolver.ts')
  assertIncludes(readModel, 'export function compactPanelReadModelFingerprint', 'core/readModelFingerprint.ts')
  assert.equal(/createAgentTeamKernelAdapter|spawnSync|child_process|tmuxSnapshotParse|PI_AGENTTEAM_KERNEL/i.test(readModel), false, 'read-model fingerprint module must remain TypeScript fallback logic only')
}

function assertDynamicRuntimeModes(root, env) {
  const loaded = loadKernel(root, env)
  try {
    const kernel = loaded.kernel
    assert.equal(kernel.normalizeAgentTeamKernelMode(undefined), 'default')
    assert.equal(kernel.normalizeAgentTeamKernelMode(''), 'default')
    for (const mode of ['default', 'disabled', 'typescript', 'go', 'auto', 'go-cutover', 'go-packaged-preview']) {
      assert.equal(kernel.isKnownAgentTeamKernelMode(mode), true, `${mode} remains known`)
    }
    assert.equal(kernel.AGENTTEAM_KERNEL_CUTOVER_MODULE, MODULE)

    const packagedEnv = {
      PATH: process.env.PATH || '',
      PI_AGENTTEAM_KERNEL_PACKAGED_HELPER: path.join(os.tmpdir(), 'v0635-should-not-run-packaged-helper'),
      PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT: path.join(os.tmpdir(), 'v0635-should-not-read-installed-root'),
      PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST: 'native/tmuxSnapshotParse/manifest.json',
    }
    const defaultAdapter = kernel.createAgentTeamKernelAdapter({ env: packagedEnv })
    const defaultMetadata = defaultAdapter.metadata().kernel
    assert.equal(defaultMetadata.requestedMode, 'default')
    assert.equal(defaultMetadata.mode, 'go')
    assert.equal(defaultMetadata.enabled, true)
    assert.equal(defaultMetadata.calls, 0)
    assert.equal(defaultMetadata.fallbacks, 0)
    assert.equal(defaultMetadata.cutoverStatus, 'active', 'default must enter active cutover')
    const defaultSnapshot = defaultAdapter.parseTmuxPaneSnapshot('%go\tgo:@1\tEmbedded helper\tpi', 1700009000000, () => {
      throw new Error('default must not use TypeScript parser fallback')
    })
    assert.equal(defaultSnapshot.panes[0].paneId, '%go')
    assert.equal(defaultAdapter.metadata().kernel.calls, 2, 'default must call embedded helper health and parser')

    for (const mode of ['go']) {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode, env: packagedEnv })
      const metadata = adapter.metadata().kernel
      assert.equal(metadata.mode, 'go', `${mode} must use approved embedded helper without packaged env`)
      assert.equal(metadata.enabled, true, `${mode} must enable Go from embedded helper`)
      assert.equal(metadata.calls, 0, `${mode} must not call helper before parser invocation`)
      assert.equal(metadata.cutoverStatus, 'active', `${mode} must enter active cutover`)
    }

    for (const mode of ['disabled', 'typescript', 'auto']) {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode, env: packagedEnv })
      const metadata = adapter.metadata().kernel
      assert.equal(metadata.mode, 'typescript', `${mode} must remain TypeScript without explicit helper`)
      assert.equal(metadata.enabled, false, `${mode} must not enable Go from packaged env`)
      assert.equal(metadata.calls, 0, `${mode} must not call packaged helper`)
      assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'cutoverStatus'), false, `${mode} must not enter cutover`)
    }

    for (const mode of ['go-cutover', 'go-packaged-preview']) {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode, helperPath: path.join(os.tmpdir(), `missing-v0635-${mode}-helper`), env: { PATH: process.env.PATH || '' } })
      const snapshot = adapter.parseTmuxPaneSnapshot('%ts\tts:@1\tTypeScript fallback\tpi', 1700009000001, () => {
        throw new Error(`${mode} must not call TypeScript parser fallback for tmuxSnapshotParse failure`)
      })
      assert.equal(snapshot.ok, false, `${mode} must fail closed for missing helper`)
      assert.equal(snapshot.status, 'unknown', `${mode} status`)
      assert.equal(snapshot.resultMarker, 'stale', `${mode} result marker`)
      assert.equal(snapshot.module, MODULE, `${mode} module`)
      assert.equal(snapshot.capability, MODULE, `${mode} capability`)
      assert.equal(snapshot.cutoverFailureKind, 'missing-helper', `${mode} failure kind`)
      assert.deepEqual(snapshot.panes, [], `${mode} panes`)
      assert.deepEqual(snapshot.byPaneId, {}, `${mode} byPaneId`)
      const metadata = adapter.metadata().kernel
      assert.equal(metadata.requestedMode, mode)
      assert.equal(metadata.mode, 'typescript')
      assert.equal(metadata.enabled, false)
      assert.equal(metadata.calls, 0)
      assert.equal(metadata.fallbacks, 0, `${mode} must not increment migration fallbacks`)
      assert.equal(metadata.cutoverModule, MODULE)
      assert.equal(metadata.cutoverStatus, 'unavailable')
      assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'fallbackKind'), false, `${mode} must not expose migration fallbackKind`)
      assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'fallbackReason'), false, `${mode} must not expose migration fallbackReason`)

      const beforeReadModelCalls = adapter.metadata().kernel.calls
      const readModel = adapter.compactReadModelFingerprint({ mode: 'attached', team: { name: 'slice5' }, mailbox: [{ text: 'must-strip' }], tasks: [] }, input => ({
        ok: true,
        projection: input,
        fingerprint: `slice5-ts-fallback:${mode}`,
        inputKind: 'compact-panel-data',
        readOnly: true,
        fullTextIncluded: false,
        stateFilesRead: false,
        stateFilesWritten: false,
      }))
      assert.equal(readModel.fingerprint, `slice5-ts-fallback:${mode}`, `${mode} read-model must use TS fallback`)
      assert.equal(readModel.readOnly, true)
      assert.equal(readModel.fullTextIncluded, false)
      assert.equal(JSON.stringify(readModel.projection).includes('must-strip'), false, `${mode} read-model projection must be compacted`)
      assert.equal(adapter.metadata().kernel.calls, beforeReadModelCalls, `${mode} read-model must not call helper`)
    }
  } finally {
    loaded.cleanup()
  }
}

function assertExtensionLoadNoNativeAuthority(root) {
  const index = read(root, 'index.ts')
  assertIncludes(index, 'export default function agentTeamExtension(pi: ExtensionAPI): void {', 'index.ts')
  assertIncludes(index, 'registerAgentTeamCommands(pi, {', 'index.ts')
  assertIncludes(index, 'registerAgentTeamTools(pi, {', 'index.ts')
  for (const [name, pattern] of [
    ['kernel env', /PI_AGENTTEAM_KERNEL|PI_AGENTTEAM_KERNEL_HELPER|AGENTTEAM_GO_KERNEL_HELPER/],
    ['kernel adapter', /createAgentTeamKernelAdapter|defaultAgentTeamKernel|kernelPackagedResolver|resolveAgentTeamPackagedHelperManifest/],
    ['Go/native process spawn', /spawnSync|execFile|execSync|child_process|go\s+(?:build|run|install)/],
    ['tmux capture', /captureTmuxSnapshot|runTmux|list-panes|tmuxSnapshotParse/],
    ['native artifacts', /artifact|provenance|attestation|checksum|native helper|release asset|install source|cosign|SLSA/i],
    ['mode controls', /go-cutover|go-packaged-preview|default Go|default resolver/i],
  ]) {
    assert.equal(pattern.test(index), false, `index.ts must not expose ${name} during extension load`)
  }
}

function assertCommandToolReadinessNoModeControls(root) {
  const teamSource = read(root, 'commands/team.ts')
  const commandNames = stringLiteralNames(teamSource, /registerCommand\('([^']+)'/g)
  assert.deepEqual(commandNames, EXPECTED_COMMANDS, 'registered command names must remain stable')
  assertIncludes(teamSource, "const options = ['config init', 'config show', 'config validate', 'config migrate --dry-run', 'readiness']", 'commands/team.ts')
  assert.equal(/go-cutover|go-packaged-preview|default Go|default resolver|PI_AGENTTEAM_KERNEL|native helper|release asset|install source|signing|cosign|SLSA/i.test(teamSource), false, '/team command must not expose runtime mode controls')

  const readiness = read(root, 'commands/readiness.ts')
  assertIncludes(readiness, '[agentteam readiness] tmuxSnapshotParse compact diagnostics', 'commands/readiness.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'commands/readiness.ts')
  const readinessWithoutBoundary = readiness.replace('not normal-user native availability proof', '')
  assert.equal(/default Go|default resolver|go-packaged-preview|go-cutover|package release|release asset|install source|signing|cosign|SLSA|platform matrix|second platform|product availability|normal-user native availability UI/i.test(readinessWithoutBoundary), false, 'readiness must stay reviewer diagnostics only')

  const toolSources = ['tools/team.ts', 'tools/message.ts', 'tools/task.ts', 'tools/planRun.ts'].map(rel => read(root, rel)).join('\n')
  const toolNames = stringLiteralNames(toolSources, /name:\s*'([^']+)'/g).filter(name => name.startsWith('agentteam_')).sort()
  assert.deepEqual(toolNames, EXPECTED_TOOLS.slice().sort(), 'registered tool names must remain stable')
  for (const rel of COMMAND_TOOL_FILES) {
    const source = read(root, rel)
      .replace('Explicit reviewer readiness summary; not normal-user native availability proof.', '')
      .replace(/source label such as npm test or CI/g, '')
    assert.equal(FORBIDDEN_UI_CONTROL_TERMS.test(source), false, `${rel} must not expose runtime/native/default/release controls`)
  }
}

function assertNoBroadGoControlPlane(root) {
  const goSource = read(root, 'kernel/go/agentteam-kernel/main.go')
  assert.equal(/registerCommand|registerTool|registerMessageRenderer|registerProvider|ExtensionAPI|pi\.register/i.test(goSource), false, 'Go helper must not register pi surfaces')
  assert.equal(/"os\/exec"|exec\.Command\s*\(|list-panes|send-keys|split-window|new-window|kill-pane|display-message/i.test(goSource), false, 'Go helper must not execute tmux or shells')
  assert.equal(/PI_AGENTTEAM_HOME|team\.json|inboxes|outbox|mailbox|taskReports|taskReportBody|planRuns|activePlanRunId|package\.json|npm\s+(?:publish|version|pack)|gh\s+release|cosign|slsa/i.test(goSource), false, 'Go helper must not own state/package/release/control-plane authority')

  for (const rel of RUNTIME_AUTHORITY_FILES) {
    const source = read(root, rel)
    assert.equal(/PI_AGENTTEAM_KERNEL|PI_AGENTTEAM_KERNEL_HELPER|AGENTTEAM_GO_KERNEL_HELPER|go-packaged-preview|default Go|default resolver|native helper package|release asset|install source/i.test(source), false, `${rel} must not read or expose runtime mode/package controls`)
  }

  const refs = []
  for (const file of [...walkFiles(path.join(root, 'core')), ...walkFiles(path.join(root, 'kernel'))]) {
    const rel = toRel(root, file)
    if (!/\.(?:ts|go|js)$/i.test(rel)) continue
    const source = fs.readFileSync(file, 'utf8')
    for (const token of ['registerCommand', 'registerTool', 'registerMessageRenderer', 'registerProvider', 'ExtensionAPI', 'pi.register']) {
      if (source.includes(token)) refs.push([rel, token])
    }
  }
  assert.deepEqual(refs, [], 'core/kernel/Go code must not register pi commands/tools/renderers/providers')
}

function assertRepoNoRuntimeArtifacts(root) {
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain temp npm tarballs')
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig)$/i.test(rel))
  assert.deepEqual(forbidden.sort(), [], 'repo must not contain checked-in native/archive/signing artifacts')
}

module.exports = {
  name: 'Go kernel v0.6.35 pi extension runtime mode boundaries',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertPackageStillFacade(root)
    assertKernelSourceBoundaries(root)
    assertDynamicRuntimeModes(root, env)
    assertExtensionLoadNoNativeAuthority(root)
    assertCommandToolReadinessNoModeControls(root)
    assertNoBroadGoControlPlane(root)
    assertRepoNoRuntimeArtifacts(root)
  },
}
