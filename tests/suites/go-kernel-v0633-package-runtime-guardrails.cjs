const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  APPROVED_REVIEW_WORKFLOW,
  REQUIRED_MATRIX_TARGET,
  STRICT_VERIFIER_EXPECTED_CONTEXT_LINES,
  VERIFIER_COMMAND_BASE,
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('../helpers/reviewArtifactWorkflowGuard.cjs')

const DOC = 'docs/perf/v0.6.33-clean-install-native-helper-consumption.md'
const ROADMAP_DOC = 'docs/agentteam方案书.md'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const HELPER_VERSION = '0.3.0-read-model-shadow'

const EXPECTED_TOOLS = [
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
]

const DOC_REQUIRED = [
  'Slice 1 — contract docs/guard.',
  'Slice 2 — temp npm clean-install baseline.',
  'Slice 3 — verified artifact → installed package layout → explicit `go-packaged-preview` consumption.',
  'Slice 4 — fail-closed/no-leak negative cases.',
  'Slice 5 — package/runtime guardrails.',
  'Slice 6 — final checkpoint/tag policy.',
  'v0.6.33 is still not real native package delivery.',
  'v0.6.33 is still not normal-user native helper availability.',
  'v0.6.33 predates the v0.6.48 approved embedded default-Go cutover and still is not release evidence, signing/security proof, or second-platform support.',
  '`package.json` remains `0.6.8`.',
  '`go-packaged-preview` remains explicit-only and non-default.',
  '`compactReadModelFingerprint` remains TypeScript fallback / non-cutover.',
  '`/team readiness` is not expanded.',
]

const SLICE5_DOC_REQUIRED = [
  '## Slice 5 — Package / Runtime Guardrail Consolidation',
  '`tests/suites/go-kernel-v0633-package-runtime-guardrails.cjs`',
  'Package/repo invariants stay unchanged: `package.json` remains `0.6.8`, package files include only the approved embedded tmuxSnapshotParse native layout, no native metadata or lifecycle hooks are added, and lockfiles plus `go.mod` / `go.sum` stay absent.',
  'Artifact invariants stay unchanged: no root `pi-agentteam-*.tgz`, no unapproved checked-in native binaries, no generated manifests/checksums/provenance/attestations/verifier output/raw hosted records outside approved source, test, embedded helper, and bounded docs.',
  'Runtime/kernel invariants stay updated for v0.6.48: `go-packaged-preview` is explicit-only; default/unset and `go` use only the approved embedded helper and ignore packaged install roots/manifests/layouts; `disabled`, `typescript`, and `auto` modes do not consume packaged install roots/manifests/layouts; explicit helper precedence stays first; current `go-cutover` helper-path semantics stay unchanged; explicit helper failures do not silently become successful TS parser results in cutover/preview modes; `compactReadModelFingerprint` remains TypeScript fallback / non-cutover.',
  'Workflow/release/signing invariants stay unchanged: the only workflow is the review-only Go Helper Review Artifact workflow, contents permission is read-only, the matrix remains one `linux-x64-glibc` row, upload/download is artifact-review-only, and no release assets, npm publish/version, git tag/push, cosign, SLSA, signing, download, or install behavior is introduced.',
  'Readiness/UI/tool/control-plane invariants stay unchanged: `/team readiness` remains explicit transitional reviewer diagnostics and not normal-user native availability UI; no new command, tool, model-callable surface, runtime diagnostic surface, package/release control plane, tmux execution/capture authority, worker lifecycle authority, task/report/PlanRun governance, UI rendering authority, or full-text/state/mailbox/report access moves to Go.',
  'Docs consistency stays updated: this v0.6.33 contract records historical Slice 1–5 prototype/review-only evidence, while v0.6.48 owns the approved embedded default-Go cutover and TypeScript tmux parser fallback deletion evidence.',
]

const FORBIDDEN_DOC_OVERCLAIMS = [
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'native availability proof is complete',
  'package-manager-delivered native helper is proven',
  'real package-manager native delivery is complete',
  'default resolver is enabled',
  'default resolver is approved',
  'default Go is enabled',
  'default Go is approved',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'release asset is approved',
  'release evidence is complete',
  'install source is approved',
  'signing is approved',
  'signing proof is complete',
  'cosign is approved',
  'cosign proof is complete',
  'SLSA is approved',
  'SLSA proof is complete',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel))
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
  const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0633-guardrails-core-'))
  for (const rel of ['core/readModelFingerprint.ts', 'core/kernelPackagedResolver.ts', 'core/kernel.ts']) {
    const sourceFile = path.join(root, rel)
    const out = ts.transpileModule(fs.readFileSync(sourceFile, 'utf8'), {
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
    fs.writeFileSync(target, out, 'utf8')
  }
  return {
    kernel: require(path.join(distRoot, 'core/kernel.js')),
    cleanup() {
      fs.rmSync(distRoot, { recursive: true, force: true })
    },
  }
}

function assertPackageRepoInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.equal(packageJson.type, 'module')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'], 'package remains TS/pi facade')

  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  for (const dependencyBag of [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies]) {
    for (const name of Object.keys(dependencyBag || {})) {
      assert.equal(/node-gyp|prebuild|prebuildify|node-pre-gyp|pkg|napi|native|binary/i.test(name), false, `package dependency must not introduce native helper package: ${name}`)
    }
  }

  const files = packageJson.files || []
  assert.ok(files.includes('core/'), 'package still includes TS core facade sources')
  assert.equal(files.includes('kernel/'), false, 'package must not include Go source/kernel directory')
  assert.equal(files.some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|hosted-observation|record|\.exe|\.dll|\.so|\.dylib|\.tgz|kernel\/go)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include unapproved native/helper/generated artifacts')

  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define lifecycle script ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not publish/version package`)
    assert.equal(/npm\s+pack\b/.test(command) && !packAllowed, false, `${name} must not pack except dry-run release check`)
    assert.equal(/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild|postinstall|preinstall|install-time build/i.test(command), false, `${name} must not build/download/install native helper`)
  }

  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(exists(root, rel), false, `${rel} must not exist`)
  }
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain temp npm tarballs')
}

function assertCheckedInArtifactInvariants(root) {
  const generatedNames = /(?:^|\/)(?:agentteam-native-manifest|native-manifest|generated-manifest|artifact-manifest|review-artifact-index|artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|workflow-summary|verifier-output|hosted-observation-record|workflow-run|raw-payload|api-payload)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|md)$/i
  const forbidden = walkFiles(root)
    .map(file => toRel(root, file))
    .filter(rel => !rel.startsWith('tests/suites/'))
    .filter(rel => !rel.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'))
    .filter(rel => !rel.startsWith('tests/helpers/'))
    .filter(rel => !rel.startsWith('docs/perf/') && !rel.startsWith('docs/agentteam'))
    .filter(rel => !rel.startsWith('scripts/lib/go-helper-hosted-observation-record.cjs'))
    .filter(rel => !rel.startsWith('scripts/verify-go-helper-hosted-observation-record.cjs'))
    .filter(rel => /(?:^|\/)\.agentteam-artifacts(?:\/|$)/.test(rel) || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip)$/i.test(rel) || generatedNames.test(rel))
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in native/generated/hosted/raw artifacts outside approved docs/tests/source')

  const v0633Doc = read(root, DOC)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(v0633Doc), false, 'v0.6.33 doc must not embed raw hosted/artifact/verifier JSON bodies')
}

function assertRuntimeSourceInvariants(root) {
  const kernel = read(root, 'core/kernel.ts')
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  const runtimeSources = `${kernel}\n${resolver}`

  assertIncludes(kernel, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel explicit preview gate')
  assertIncludes(kernel, "const packagedResolverFailure = packagedResolverRequested && !explicitHelperPath", 'kernel preview/default resolver gate')
  assertIncludes(kernel, 'const packagedHelperPath = packagedPreviewRequested && !explicitHelperPath && !packagedResolverFailure', 'kernel direct packaged helper gate')
  assertIncludes(kernel, 'const packagedManifestPath = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure', 'kernel manifest path gate')
  assertIncludes(kernel, 'const packagedManifestInstallRoot = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath && !packagedResolverFailure', 'kernel manifest root gate')
  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperManifestPath()', 'kernel embedded manifest fallback')
  assertIncludes(kernel, 'const packagedManifestRequested = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath', 'kernel manifest resolver gate')
  assertIncludes(kernel, 'const helperPath = explicitHelperPath || packagedHelperPath || packagedManifestHelperPath', 'kernel helper precedence')
  assertIncludes(kernel, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel cutover modes')
  assertIncludes(kernel, 'if (cutoverRequested) return fallback(compactInput)', 'kernel fingerprint TS fallback')

  assertIncludes(kernel, 'defaultAgentTeamKernelEmbeddedHelperRoot()', 'kernel embedded helper root')
  assert.equal(/package\.json|node_modules|__dirname|process\.cwd\(\)/i.test(kernel), false, 'kernel must not discover unapproved installed package layout by default')
  assert.equal(/download-artifact|artifact-index|artifactIndex|artifact URL|artifactUrl|go-helper-review-artifact|hosted-observation|workflow-run|github\.run_id|github\.run_attempt|github\.sha|workflow_dispatch|actions\/download-artifact/i.test(runtimeSources), false, 'runtime/resolver must not consume hosted workflow/artifact metadata')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|actions\/upload-artifact|cosign|slsa|postinstall|preinstall|install-time build|curl\b|wget\b|node-gyp|prebuild/i.test(runtimeSources), false, 'runtime/resolver must not contain release/npm/download/install behavior')
  assert.equal(/signed:\s*true|cosign|slsa|signing proof|signing approved/i.test(runtimeSources), false, 'runtime/resolver must not contain real signing approval behavior')
  assert.equal(/normal-user native availability|package-manager native delivery|release asset is approved/i.test(runtimeSources), false, 'runtime/resolver must not claim package/release availability beyond approved embedded default cutover')

  for (const rel of ['core/kernel.ts', 'core/kernelPackagedResolver.ts']) {
    const source = read(root, rel)
    assert.equal(/from ['"]\.\.\/(?:tmux|state|tools|commands|teamPanel|app)|require\(['"]\.\.\/(?:tmux|state|tools|commands|teamPanel|app)/.test(source), false, `${rel} must not import control-plane/state/tmux authority`)
    assert.equal(/execFile|execSync|createServer|listen\(|fetch\(|http:|https:|net\.|dgram\./.test(source), false, `${rel} must not add network/server/package-control behavior`)
  }
}

function assertKernelRuntimeBehavior(root, env) {
  const loaded = loadKernel(root, env)
  try {
    const kernel = loaded.kernel
    const packagedEnv = {
      PATH: process.env.PATH || '',
      PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_ROOT: '/tmp/v0633-should-not-read-root',
      PI_AGENTTEAM_KERNEL_PACKAGED_HELPER_MANIFEST: 'native/tmuxSnapshotParse/manifest.json',
      PI_AGENTTEAM_KERNEL_PACKAGED_HELPER: '/tmp/v0633-should-not-run-helper',
    }

    for (const mode of [undefined, 'go']) {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode, env: packagedEnv })
      const metadata = adapter.metadata()
      const label = mode || 'default'
      assert.equal(metadata.kernel.mode, 'go', `${label} must use approved embedded helper without packaged env`)
      assert.equal(metadata.kernel.enabled, true, `${label} must enable Go from embedded helper`)
      assert.equal(metadata.kernel.calls, 0, `${label} must not call helper before parser invocation`)
      assert.equal(metadata.kernel.cutoverStatus, 'active', `${label} must enter active cutover status`)
    }
    for (const mode of ['disabled', 'typescript', 'auto']) {
      const adapter = kernel.createAgentTeamKernelAdapter({ mode, env: packagedEnv })
      const metadata = adapter.metadata()
      assert.equal(metadata.kernel.mode, 'typescript', `${mode} must remain TypeScript without explicit helper`)
      assert.equal(metadata.kernel.enabled, false, `${mode} must not enable Go from packaged env`)
      assert.equal(metadata.kernel.calls, 0, `${mode} must not call packaged helper`)
      assert.equal(metadata.kernel.cutoverStatus, undefined, `${mode} must not enter cutover status`)
    }

    const preview = kernel.createAgentTeamKernelAdapter({ mode: 'go-packaged-preview', env: {} })
    const previewMetadata = preview.metadata()
    assert.equal(previewMetadata.kernel.requestedMode, 'go-packaged-preview')
    assert.equal(previewMetadata.kernel.mode, 'typescript')
    assert.equal(previewMetadata.kernel.cutoverStatus, 'unavailable')
    assert.equal(previewMetadata.kernel.cutoverFailureKind, 'missing-helper')
    const previewSnapshot = preview.parseTmuxPaneSnapshot('raw tmux should not parse as success', 123, () => {
      throw new Error('explicit packaged preview must not call TS parser fallback')
    })
    assert.equal(previewSnapshot.ok, false)
    assert.equal(previewSnapshot.status, 'unknown')
    assert.equal(previewSnapshot.resultMarker, 'stale')
    assert.equal(previewSnapshot.module, MODULE)
    assert.equal(previewSnapshot.capability, MODULE)
    assert.deepEqual(previewSnapshot.panes, [])
    assert.deepEqual(previewSnapshot.byPaneId, {})

    const cutover = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', env: {} })
    const cutoverSnapshot = cutover.parseTmuxPaneSnapshot('%1 x y z', 456, () => {
      throw new Error('go-cutover must not silently call TS parser fallback on missing helper')
    })
    assert.equal(cutover.metadata().kernel.cutoverFailureKind, 'missing-helper')
    assert.equal(cutoverSnapshot.ok, false)
    assert.equal(cutoverSnapshot.resultMarker, 'stale')

    let fingerprintFallbackCalls = 0
    const fingerprint = preview.compactReadModelFingerprint({ teams: [{ name: 'a', text: 'secret should be stripped' }] }, input => {
      fingerprintFallbackCalls += 1
      return {
        ok: true,
        projection: input,
        fingerprint: 'typescript-fallback-preview',
        inputKind: 'compact-panel-data',
        readOnly: true,
        fullTextIncluded: false,
        stateFilesRead: false,
        stateFilesWritten: false,
      }
    })
    assert.equal(fingerprintFallbackCalls, 1, 'packaged preview fingerprint must stay TS fallback')
    assert.equal(fingerprint.fingerprint, 'typescript-fallback-preview')
    assert.equal(fingerprint.readOnly, true)
    assert.equal(fingerprint.fullTextIncluded, false)
  } finally {
    loaded.cleanup()
  }
}

function assertWorkflowReleaseSigningInvariants(root) {
  assertWorkflowContract(root)
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
  assert.deepEqual(workflowFiles(root), [APPROVED_REVIEW_WORKFLOW], 'only review artifact workflow should exist')
  const source = readWorkflow(root)
  assertIncludes(source, `target: ${REQUIRED_MATRIX_TARGET}`, APPROVED_REVIEW_WORKFLOW)
  assertIncludes(source, VERIFIER_COMMAND_BASE, APPROVED_REVIEW_WORKFLOW)
  for (const expected of STRICT_VERIFIER_EXPECTED_CONTEXT_LINES) assertIncludes(source, expected, APPROVED_REVIEW_WORKFLOW)
  assert.equal(/target:\s*(?!linux-x64-glibc\b)[a-z0-9-]+/i.test(source), false, 'workflow must not add second platform target')
  assert.equal(/gh\s+release|npm\s+(?:publish|version|pack)|git\s+(?:tag|push|commit)|cosign|slsa|id-token|packages:\s*write|contents:\s*write|curl\b|wget\b|postinstall|preinstall|node-gyp|prebuild/i.test(source), false, 'workflow must not add release/signing/npm/install behavior')
}

function assertReadinessToolControlPlaneInvariants(root, env) {
  const readiness = read(root, 'commands/readiness.ts')
  const teamCommand = read(root, 'commands/team.ts')
  assertIncludes(readiness, 'Explicit reviewer readiness summary; not normal-user native availability proof.', 'readiness text')
  assertIncludes(readiness, 'tmuxSnapshotParse compact diagnostics', 'readiness text')
  assert.equal(/go-packaged-preview|package-manager|native availability|normal-user|release|signing|cosign|SLSA|install source/i.test(readiness.replace('not normal-user native availability proof', '')), false, 'readiness must not expand into package/native availability UI')
  assertIncludes(teamCommand, "const options = ['config init', 'config show', 'config validate', 'config migrate --dry-run', 'readiness']", 'team command completions')
  assert.equal(/native availability|go-packaged-preview|release|publish|signing|cosign|SLSA/i.test(teamCommand), false, '/team command must not expose native availability/release controls')

  const toolSources = walkFiles(path.join(root, 'tools'))
    .filter(file => file.endsWith('.ts'))
    .map(file => read(root, toRel(root, file)))
    .join('\n')
  for (const name of EXPECTED_TOOLS) assertIncludes(toolSources, `name: '${name}'`, 'tool registrations')
  assert.equal(/\bgo-packaged-preview\b|native availability|release asset|npm publish|package artifact|\bsigning\b|\bcosign\b|\bSLSA\b|artifact download|install source/i.test(toolSources), false, 'tools must not add native/release/signing/package control plane')

  if (env.pi?.__tools) {
    assert.deepEqual([...env.pi.__tools.keys()].sort(), EXPECTED_TOOLS.slice().sort(), 'registered model-callable tool surface must not expand')
  }
  if (env.pi?.__commands) {
    assert.deepEqual([...env.pi.__commands.keys()].sort(), ['team'], 'registered command surface must not expand')
  }

  const goBoundarySources = ['core/kernel.ts', 'core/kernelPackagedResolver.ts', 'kernel/go/agentteam-kernel/main.go']
    .filter(rel => exists(root, rel))
    .map(rel => read(root, rel))
    .join('\n')
  assert.equal(/capturePane|capture-pane|tmux\s+capture|send-keys|kill-pane|agentteam_task|agentteam_receive|report_done|report_blocked|mailbox|full-text reader|full text reader|stateFilesWritten:\s*true|fullTextIncluded:\s*true|taskReportPlanRunConnected:\s*true|panelConnected:\s*true|tmuxConnected:\s*true|repository write|npm publish|package release|renderPanel|openTeamPanel/i.test(goBoundarySources), false, 'Go/kernel boundary must not expand to tmux/control-plane/UI/full-text/package authority')
  assertIncludes(goBoundarySources, 'exec.CommandContext(ctx, "tmux", "new-window", "-t", sessionName, "-n", windowName)', 'later v0.6.84 permits only detached swarm new-window')
}

function assertDocsConsistency(root) {
  const doc = read(root, DOC)
  const roadmap = read(root, ROADMAP_DOC)
  for (const expected of DOC_REQUIRED) assertIncludes(doc, expected, DOC)
  for (const expected of SLICE5_DOC_REQUIRED) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(doc), false, `${DOC} must not include raw verifier/hosted/artifact JSON bodies`)

  assertIncludes(roadmap, '`package.json` 当前声明版本为 `0.6.8`', ROADMAP_DOC)
  assertIncludes(roadmap, 'Go kernel 一旦通过某个模块的 cutover gate', ROADMAP_DOC)
  assertIncludes(roadmap, 'release rollback 通过 GitHub tag/npm version，而不是 runtime 中长期偷偷走旧 TS path。', ROADMAP_DOC)
  assertIncludes(roadmap, 'fallback deletion remains blocked until runtime prerequisite signoff', ROADMAP_DOC)
  assertIncludes(roadmap, 'STOP gates：no TS fallback deletion until normal-user availability signoff', ROADMAP_DOC)
  assert.equal(/v0\.6\.33[\s\S]{0,240}(?:normal-user native availability is proven|npm publish|cosign is approved|SLSA is approved)/i.test(`${doc}\n${roadmap}`), false, 'docs must not convert v0.6.33 prototype evidence into release/security approval')
}

module.exports = {
  name: 'Go kernel v0.6.33 package/runtime guardrails',
  async run(env) {
    const root = env.helpers.extRoot
    assertPackageRepoInvariants(root)
    assertCheckedInArtifactInvariants(root)
    assertRuntimeSourceInvariants(root)
    assertKernelRuntimeBehavior(root, env)
    assertWorkflowReleaseSigningInvariants(root)
    assertReadinessToolControlPlaneInvariants(root, env)
    assertDocsConsistency(root)
  },
}
