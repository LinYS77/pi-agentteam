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
const CHECKPOINT = 'docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md'
const ROADMAP_DOC = 'docs/agentteam方案书.md'
const PACKAGE_VERSION = '0.6.8'
const MODULE = 'tmuxSnapshotParse'
const EXPECTED_TOOLS = [
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
]

const REQUIRED_SUMMARY = [
  'v0.6.33 theme: Clean-Install Native Helper Consumption Prototype.',
  'Main route B plus constrained Route E completed:',
  'Route B completed the package-manager clean-install proof prototype path.',
  'Constrained Route E completed installed-layout/resolver guardrails for explicit preview proof only.',
  'Optional Route A hosted facts were not supplied and remain unchanged; no hosted workflow was triggered, queried, fetched, or recorded locally.',
  'Slice 1 — contract docs/guard',
  'Slice 2 — temp npm clean-install baseline',
  'Slice 3 — verified installed-layout explicit preview consumption',
  'Slice 4 — installed-layout fail-closed/no-leak negatives',
  'Slice 5 — package/runtime guardrails',
  'Slice 6 adds this checkpoint and `tests/suites/go-kernel-v0633-clean-install-checkpoint-docs.cjs` only.',
]

const REQUIRED_EVIDENCE = [
  '## Evidence',
  '### Slice 2 — Temp NPM Clean-Install Baseline',
  '`npm pack <repo-root> --ignore-scripts --pack-destination <temp>` uses an OS temp pack root and a local temp tarball.',
  '`npm install <local temp tarball> --ignore-scripts --package-lock=false --legacy-peer-deps --no-audit --no-fund` uses a separate OS temp project.',
  'install scripts are ignored, package-lock creation is disabled, audit/fund are disabled, and peer dependency installation is kept local to the temp project.',
  'the installed package is `node_modules/pi-agentteam` with TypeScript/pi facade files present.',
  'the baseline intentionally proves no native delivery',
  '### Slice 3 — Verified Artifact to Installed Layout Consumption',
  'the existing strict review artifact verifier runs before any copy into the installed package shape.',
  'only the verified `native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc` layout is copied into the temp installed package root.',
  'transpiled kernel code is loaded from the temp installed package root, not the repo source checkout.',
  'only explicit `go-packaged-preview` consumes the helper from the installed layout.',
  '`compactReadModelFingerprint` remains TypeScript fallback / non-cutover and does not call the helper.',
  '### Slice 4 — Fail-Closed / No-Leak Negative Matrix',
  'missing helper, missing copied layout, traversal/backslash unsafe paths, wrong platform/libc, checksum mismatch, corrupt helper, missing provenance, missing license metadata, invalid placeholder attestation, package/helper/protocol/capability skew, non-executable POSIX helper, corrupt smoke output, and attempted default resolver use are covered.',
  'failures use bounded `artifact-verification-failed` or `installed-preview-smoke-failed` diagnostics.',
  'explicit preview and `go-cutover` failures do not hide behind a successful TypeScript `tmuxSnapshotParse` parser fallback.',
  '### Slice 5 — Package / Runtime Guardrails',
  'package/repo invariants: `package.json` remains `0.6.8`',
  'artifact invariants: no root `pi-agentteam-*.tgz`',
  'runtime/kernel invariants: `go-packaged-preview` is explicit-only',
  'workflow/release/signing invariants: the only workflow is review-only Go Helper Review Artifact',
  'readiness/UI/tool/control-plane invariants: `/team readiness` remains explicit transitional reviewer diagnostics and not normal-user native availability UI',
]

const REQUIRED_DISTANCE = [
  '## Distance After v0.6.33',
  'The prerequisite evidence chain moved from approximately 35% to approximately 45–50%.',
  'The normal-user native helper availability claim remains 0%.',
  'native layout is test-injected after install inside OS temp roots.',
  'there is no real package-manager native delivery.',
  'there is no approved install source ownership.',
  'there is no release asset or package source for native helper consumption.',
  'there is no signing/security ownership, cosign proof, SLSA proof, or security attestation approval.',
  'there is no default resolver or default Go approval.',
  'there is no platform support beyond the review-only `linux-x64-glibc` row.',
]

const REQUIRED_GO_STOP = [
  'GO for GitHub-only/main checkpoint commit after validation and leader review.',
  'GO scope is review-only prototype evidence:',
  'temp npm clean-install TypeScript/pi facade baseline.',
  'verified review artifact copied into temp installed package layout.',
  'explicit `go-packaged-preview` consumption of the injected installed layout.',
  'fail-closed/no-leak negative matrix.',
  'package/runtime/workflow/readiness/control-plane guardrail consolidation.',
  'STOP for:',
  '`npm version`, `npm publish`, package release, or package source approval.',
  'tag creation unless prior v0.6.31/v0.6.32 gates are satisfied or an explicit leader/user waiver is supplied.',
  'package metadata, native deps, optional native companion packages, package files native entries, lifecycle hooks, postinstall/preinstall/prepare downloads, or install-time build.',
  '`package-lock.json`, `npm-shrinkwrap.json`, `go.mod`, or `go.sum`.',
  'checked-in artifacts, tarballs, native binaries, generated manifests/checksums/provenance/attestations/verifier output, hosted records, raw API payloads, or downloaded bundles.',
  'default Go, default resolver, production package resolver discovery, or `go-packaged-preview` default behavior.',
  'current `go-cutover` semantic changes.',
  'TypeScript fallback deletion, hidden fallback rollback policy changes, or `compactReadModelFingerprint` cutover.',
  '`/team readiness` expansion, normal-user native availability UI, new tool/command/model-callable surface, or runtime diagnostic surface.',
  'broad Go authority over tmux execution/capture, worker lifecycle, task/report/PlanRun governance, UI rendering, package/release control plane, full-text boundaries, state, mailbox, or report access.',
  'hosted workflow trigger/query/fetch, `gh`, tokens, or network.',
  'commit/tag/push by the implementer.',
]

const REQUIRED_VALIDATION = [
  '## Validation Matrix',
  'Slice 1: `tests/suites/go-kernel-v0633-clean-install-proof-contract-docs.cjs`.',
  'Slice 2: `tests/suites/go-kernel-v0633-package-manager-clean-install-baseline.cjs`.',
  'Slice 3: `tests/suites/go-kernel-v0633-installed-layout-consumption.cjs`.',
  'Slice 4: `tests/suites/go-kernel-v0633-installed-layout-fail-closed.cjs`.',
  'Slice 5: `tests/suites/go-kernel-v0633-package-runtime-guardrails.cjs`.',
  'Slice 6: `tests/suites/go-kernel-v0633-clean-install-checkpoint-docs.cjs`.',
  '`node --check tests/suites/go-kernel-v0633-clean-install-checkpoint-docs.cjs`.',
  'direct checkpoint guard suite.',
  'direct Slice 1–5 suites.',
  '`node scripts/verify-go-helper-clean-install-proof.cjs --json`.',
  '`node scripts/verify-go-helper-clean-install-proof.cjs --build-review-artifact --json`.',
  '`npm run typecheck`.',
  '`npm run -s check:boundaries`.',
  '`git diff --check`.',
  'package/native sanity scans',
  '`node tests/run.cjs <suite>` ignores the suite-name argument',
  '`tests/suites/panel-renderer.cjs:401`',
  'AssertionError [ERR_ASSERTION]: member row should show stable health fields',
]

const REQUIRED_TAG_POLICY = [
  '## Tag Policy',
  'v0.6.31 and v0.6.32 tags remain pending unless the user/leader supplies exact hosted evidence or an explicit waiver.',
  'v0.6.33 can proceed as a `main` commit after validation and review.',
  'v0.6.33 tag should wait for prior gates or an explicit leader/user waiver.',
  'No worker should create, push, or move tags for v0.6.33.',
  'No worker should run `npm version`, `npm publish`, `git tag`, `git push`, `gh`, token-based commands, hosted workflow trigger/query, or network validation for this checkpoint.',
]

const REQUIRED_BLOCKERS = [
  'Hosted observations/tag backlog for prior v0.6.31/v0.6.32 gates.',
  'Real package-manager native delivery and install source ownership.',
  'Package/release ownership.',
  'Platform matrix beyond `linux-x64-glibc`.',
  'Default resolver/default Go approval.',
  'rollback/default-disable policy.',
  'TypeScript fallback deletion approval.',
  'signing/security ownership.',
]

const REQUIRED_MAIN_DOC = [
  '## Slice 6 — Final Checkpoint Status',
  '`docs/perf/v0.6.33-clean-install-native-helper-consumption-checkpoint.md`',
  '`tests/suites/go-kernel-v0633-clean-install-checkpoint-docs.cjs`',
  'The checkpoint summarizes Slice 1–5 evidence, validation, GO/STOP decision, distance after v0.6.33, tag policy, remaining blockers, and unchanged package/runtime/default/readiness/release/signing boundaries.',
  'the prerequisite evidence chain is approximately 45–50%, while the normal-user native helper availability claim remains 0%.',
  'Slice 6 is checkpoint docs/tests only.',
]

const FORBIDDEN_CLAIMS = [
  'normal-user native helper availability is proven',
  'normal-user native availability is proven',
  'native availability proof is complete',
  'package-manager native delivery complete',
  'package-manager native delivery is complete',
  'real package-manager native delivery is complete',
  'release asset approved',
  'release asset is approved',
  'release evidence is complete',
  'install source approved',
  'install source is approved',
  'default resolver enabled',
  'default resolver is enabled',
  'default resolver approved',
  'default resolver is approved',
  'default Go enabled',
  'default Go is enabled',
  'default Go approved',
  'default Go is approved',
  'fallback deletion approved',
  'fallback deletion is approved',
  'TypeScript fallback deletion is approved',
  'signing approved',
  'signing is approved',
  'signing proof is complete',
  'cosign approved',
  'cosign is approved',
  'cosign proof is complete',
  'SLSA approved',
  'SLSA is approved',
  'SLSA proof is complete',
  'second platform support is approved',
  'second platform is supported',
  'macOS is supported availability',
  'Windows is supported availability',
  'arm64 is supported availability',
  'musl is supported availability',
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
  const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0633-checkpoint-core-'))
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

function assertCheckpointDoc(root) {
  assert.equal(exists(root, CHECKPOINT), true, `${CHECKPOINT} should exist`)
  const checkpoint = read(root, CHECKPOINT)
  for (const expected of REQUIRED_SUMMARY) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_EVIDENCE) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_DISTANCE) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_GO_STOP) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_VALIDATION) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_TAG_POLICY) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const expected of REQUIRED_BLOCKERS) assertIncludes(checkpoint, expected, CHECKPOINT)
  for (const forbidden of FORBIDDEN_CLAIMS) assert.equal(checkpoint.includes(forbidden), false, `${CHECKPOINT} must not overclaim: ${forbidden}`)
  assert.equal(/"schemaVersion"\s*:|"artifact-index"\s*:|"manifest"\s*:|"provenance"\s*:|"attestation"\s*:|"runId"\s*:|"jobs"\s*:/i.test(checkpoint), false, `${CHECKPOINT} must not embed raw hosted/artifact/verifier JSON bodies`)
}

function assertMainDocAndGitignore(root) {
  const doc = read(root, DOC)
  for (const expected of REQUIRED_MAIN_DOC) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_CLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)

  const gitignore = read(root, '.gitignore')
  assertIncludes(gitignore, `!${DOC}`, '.gitignore')
  assertIncludes(gitignore, `!${CHECKPOINT}`, '.gitignore')
}

function assertPackageRepoInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION, 'package version must remain 0.6.8')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'], 'package remains TS/pi facade')

  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|hosted-observation|record|\.exe|\.dll|\.so|\.dylib|\.tgz|kernel\/go)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package files must not include native/helper/generated artifacts')
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

function assertNoCheckedInArtifacts(root) {
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
  assert.deepEqual(forbidden, [], 'repo must not contain checked-in generated/hosted/native artifacts or raw records')
}

function assertRuntimeKernelInvariants(root, env) {
  const kernelSource = read(root, 'core/kernel.ts')
  const resolver = read(root, 'core/kernelPackagedResolver.ts')
  const runtimeSources = `${kernelSource}\n${resolver}`

  assertIncludes(kernelSource, "const packagedPreviewRequested = requestedMode === 'go-packaged-preview'", 'kernel explicit preview gate')
  assertIncludes(kernelSource, "const packagedResolverFailure = packagedResolverRequested && !explicitHelperPath", 'kernel preview/default resolver gate')
  assertIncludes(kernelSource, 'const packagedManifestRequested = packagedResolverRequested && !explicitHelperPath && !packagedHelperPath', 'kernel manifest resolver gate')
  assertIncludes(kernelSource, 'const helperPath = explicitHelperPath || packagedHelperPath || packagedManifestHelperPath', 'kernel helper precedence')
  assertIncludes(kernelSource, "const cutoverRequested = defaultCutoverRequested || requestedMode === 'go-cutover' || packagedPreviewRequested", 'kernel cutover modes')
  assertIncludes(kernelSource, 'if (cutoverRequested) return fallback(compactInput)', 'kernel fingerprint TS fallback')
  assertIncludes(kernelSource, 'defaultAgentTeamKernelEmbeddedHelperRoot()', 'kernel embedded helper root')
  assertIncludes(kernelSource, 'defaultAgentTeamKernelEmbeddedHelperManifestPath()', 'kernel embedded helper manifest')
  assert.equal(/package\.json|node_modules|__dirname|process\.cwd\(\)/i.test(kernelSource), false, 'kernel must not discover unapproved installed package layout by default')
  assert.equal(/download-artifact|hosted-observation|workflow-run|github\.run_id|github\.run_attempt|github\.sha|workflow_dispatch|actions\/download-artifact/i.test(runtimeSources), false, 'runtime/resolver must not consume hosted workflow/artifact metadata')
  assert.equal(/npm\s+(?:publish|version|pack)|gh\s+release|cosign|slsa|postinstall|preinstall|install-time build|curl\b|wget\b|node-gyp|prebuild/i.test(runtimeSources), false, 'runtime/resolver must not contain release/npm/download/install behavior')

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
    const previewSnapshot = preview.parseTmuxPaneSnapshot('raw tmux should not parse as success', 111, () => {
      throw new Error('explicit packaged preview must not call TS parser fallback')
    })
    assert.equal(preview.metadata().kernel.cutoverFailureKind, 'missing-helper')
    assert.equal(previewSnapshot.ok, false)
    assert.equal(previewSnapshot.resultMarker, 'stale')
    assert.equal(previewSnapshot.module, MODULE)
    assert.deepEqual(previewSnapshot.panes, [])

    const cutover = kernel.createAgentTeamKernelAdapter({ mode: 'go-cutover', env: {} })
    const cutoverSnapshot = cutover.parseTmuxPaneSnapshot('%1 x y z', 222, () => {
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
        fingerprint: 'checkpoint-ts-fallback',
        inputKind: 'compact-panel-data',
        readOnly: true,
        fullTextIncluded: false,
        stateFilesRead: false,
        stateFilesWritten: false,
      }
    })
    assert.equal(fingerprintFallbackCalls, 1, 'packaged preview fingerprint must stay TS fallback')
    assert.equal(fingerprint.fingerprint, 'checkpoint-ts-fallback')
  } finally {
    loaded.cleanup()
  }
}

function assertWorkflowInvariants(root) {
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
  assert.equal(/go-packaged-preview|package-manager|native availability|release|signing|cosign|SLSA|install source/i.test(readiness.replace('not normal-user native availability proof', '')), false, 'readiness must not expand into package/native availability UI')
  assertIncludes(teamCommand, "const options = ['config init', 'config show', 'config validate', 'config migrate --dry-run', 'readiness']", 'team command completions')
  assert.equal(/native availability|go-packaged-preview|release|publish|signing|cosign|SLSA/i.test(teamCommand), false, '/team command must not expose native availability/release controls')

  const toolSources = walkFiles(path.join(root, 'tools'))
    .filter(file => file.endsWith('.ts'))
    .map(file => read(root, toRel(root, file)))
    .join('\n')
  for (const name of EXPECTED_TOOLS) assertIncludes(toolSources, `name: '${name}'`, 'tool registrations')
  assert.equal(/\bgo-packaged-preview\b|native availability|release asset|npm publish|package artifact|\bsigning\b|\bcosign\b|\bSLSA\b|artifact download|install source/i.test(toolSources), false, 'tools must not add native/release/signing/package control plane')

  if (env.pi?.__tools) assert.deepEqual([...env.pi.__tools.keys()].sort(), EXPECTED_TOOLS.slice().sort(), 'registered tool surface must not expand')
  if (env.pi?.__commands) assert.deepEqual([...env.pi.__commands.keys()].sort(), ['team'], 'registered command surface must not expand')

  const goBoundarySources = ['core/kernel.ts', 'core/kernelPackagedResolver.ts', 'kernel/go/agentteam-kernel/main.go']
    .filter(rel => exists(root, rel))
    .map(rel => read(root, rel))
    .join('\n')
  assert.equal(/capturePane|capture-pane|tmux\s+capture|send-keys|new-window|split-window|kill-pane|agentteam_task|agentteam_receive|report_done|report_blocked|mailbox|full-text reader|full text reader|stateFilesWritten:\s*true|fullTextIncluded:\s*true|taskReportPlanRunConnected:\s*true|panelConnected:\s*true|tmuxConnected:\s*true|repository write|npm publish|package release|renderPanel|openTeamPanel/i.test(goBoundarySources), false, 'Go/kernel boundary must not expand to tmux/control-plane/UI/full-text/package authority')
}

function assertRoadmapStillFutureGated(root) {
  const roadmap = read(root, ROADMAP_DOC)
  assertIncludes(roadmap, '`package.json` 当前声明版本为 `0.6.8`', ROADMAP_DOC)
  assertIncludes(roadmap, 'Go kernel 一旦通过某个模块的 cutover gate', ROADMAP_DOC)
  assertIncludes(roadmap, 'release rollback 通过 GitHub tag/npm version，而不是 runtime 中长期偷偷走旧 TS path。', ROADMAP_DOC)
  assertIncludes(roadmap, 'fallback deletion remains blocked until runtime prerequisite signoff', ROADMAP_DOC)
  assertIncludes(roadmap, 'STOP gates：no TS fallback deletion until normal-user availability signoff', ROADMAP_DOC)
}

module.exports = {
  name: 'Go kernel v0.6.33 clean-install checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    assertCheckpointDoc(root)
    assertMainDocAndGitignore(root)
    assertPackageRepoInvariants(root)
    assertNoCheckedInArtifacts(root)
    assertRuntimeKernelInvariants(root, env)
    assertWorkflowInvariants(root)
    assertReadinessToolControlPlaneInvariants(root, env)
    assertRoadmapStillFutureGated(root)
  },
}
