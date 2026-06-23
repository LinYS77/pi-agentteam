const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  DEFAULT_PREFIX,
  FULL_TEXT_SENTINEL,
  isSafeTempHome,
  runHarness,
} = require('../../scripts/lib/v0638-temp-home-rc-harness.cjs')

const DOC = 'docs/perf/v0.6.38-temp-home-bound-rc-harness.md'
const SCRIPT = 'scripts/verify-v0638-temp-home-rc-harness.cjs'
const LIB = 'scripts/lib/v0638-temp-home-rc-harness.cjs'
const SUITE = 'tests/suites/go-kernel-v0638-temp-home-rc-harness.cjs'
const PACKAGE_VERSION = '0.6.8'
const REQUIRED_DOC = [
  '# v0.6.38 Temp-Home-Bound RC Harness',
  'v0.6.38 provides a temp-home-bound RC harness and operator procedure for the next manual RC slice.',
  'The harness is GO for non-interactive verification of registered `/team config` command handling and representative `agentteam_*` tool flows in an isolated temp home.',
  'The harness is STOP for release/tag/npm/native/default-Go/package/signing/second-platform/fallback-deletion work, production runtime semantics changes, broad Go authority, raw full-text evidence check-in, and claiming real TUI/model/manual RC pass.',
  'No production TypeScript or Go runtime semantics are changed by this enablement.',
  'T112 could not safely execute the Slice 5 manual RC checklist because the worker\'s live `agentteam_*` tools were bound to the active agentteam, not a clean temp `PI_AGENTTEAM_HOME`.',
  '`pi --help` does not expose a direct non-interactive `/team` CLI.',
  '## Automated Harness',
  'node scripts/verify-v0638-temp-home-rc-harness.cjs --out /tmp/pi-agentteam-v0638-temp-home-rc-harness-summary.json',
  'Sets `PI_AGENTTEAM_HOME` before loading/transpiling extension modules, so `state/paths.ts` binds file-backed state to the isolated home.',
  'Registers the real extension through `index.ts` and real `api/commands.ts` / `api/tools.ts` seams.',
  'Runs `/team config show`, `/team config init`, `/team config validate`, and `/team config migrate --dry-run` through the registered command handler.',
  'Runs representative `agentteam_create`, `agentteam_spawn`, `agentteam_task`, `agentteam_send`, `agentteam_receive`, `report_done`, `report_blocked`, leader review/close/block/unblock, compact panel model read, legacy `teams/-` absence, and release-governance absence checks.',
  'Emits sanitized JSON only; the sentinel `V0638_RC_FULL_TEXT_SENTINEL_DO_NOT_LEAK` must never appear in output.',
  '## Isolation Contract',
  'The original live `PI_AGENTTEAM_HOME` is restored after the run.',
  '## Procedure For Next Manual RC',
  'export PI_AGENTTEAM_HOME=$(mktemp -d /tmp/pi-agentteam-v0638-rc-smoke.XXXXXX)',
  'pi --no-extensions --extension ./index.ts --session-dir "$PI_AGENTTEAM_HOME/pi-sessions"',
  'Use `/team config ...` and `agentteam_*` tools only in that session, not from the live team harness.',
  '## Coverage And Limits',
  'Real interactive `/team` TUI rendering, flicker, key handling, attached/global panel operator observation, and real terminal paint behavior.',
  'Real LLM/model/provider worker execution; spawn uses fake tmux panes and simulated worker session binding.',
  '## STOP Gates',
  'The harness would use the live/default `PI_AGENTTEAM_HOME` or a path outside `/tmp/pi-agentteam-v0638-rc-harness.*`.',
  'Script output contains `V0638_RC_FULL_TEXT_SENTINEL_DO_NOT_LEAK`.',
  '## Validation',
  '`node --check scripts/lib/v0638-temp-home-rc-harness.cjs`.',
  '`node --check scripts/verify-v0638-temp-home-rc-harness.cjs`.',
  '`node --check tests/suites/go-kernel-v0638-temp-home-rc-harness.cjs`.',
  'Direct invocation of `tests/suites/go-kernel-v0638-temp-home-rc-harness.cjs` with `helpers.extRoot=process.cwd()`.',
  '`git diff --check`.',
]
const FORBIDDEN_DOC_OVERCLAIMS = [
  'release can ship',
  'ready for release',
  'manual RC passed',
  'real TUI passed',
  'real model worker passed',
  'p95 gates passed',
  'npm test is green',
  'tag was created',
  'tag was pushed',
  'npm version completed',
  'npm publish completed',
  'default Go is enabled',
  'default Go is approved',
  'native helper delivery is complete',
  'package release is approved',
  'signing is approved',
  'second-platform support is approved',
  'fallback deletion is approved',
]
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]
const FORBIDDEN_ARTIFACT = /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig)$/i
const FORBIDDEN_GENERATED_RECORD = /(?:^|\/)(?:artifact-index|generated-manifest|checksum|checksums|sha256sums|provenance|attestation|hosted-observation|raw-record|raw-hosted|release-bundle|release-asset|signature-material)(?:[-_.\/]|$)/i
const ALLOWED_REVIEW_RECORDS = new Set([
  '.github/workflows/go-helper-review-artifact.yml',
  'scripts/build-go-helper-artifact.cjs',
  'scripts/lib/go-helper-artifact-builder.cjs',
  'scripts/lib/go-helper-artifact-verifier.cjs',
  'scripts/lib/go-helper-clean-install-proof.cjs',
  'scripts/lib/go-helper-hosted-observation-record.cjs',
  'scripts/lib/pi-extension-install-load-proof.cjs',
  'scripts/verify-go-helper-artifact.cjs',
  'scripts/verify-go-helper-clean-install-proof.cjs',
  'scripts/verify-go-helper-hosted-observation-record.cjs',
  'scripts/verify-pi-extension-install-load.cjs',
  SCRIPT,
  LIB,
])

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

function assertNoOverclaims(source, label) {
  for (const forbidden of FORBIDDEN_DOC_OVERCLAIMS) assert.equal(source.includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  assertNoOverclaims(doc, DOC)
  assert.match(doc, /not a release-readiness approval/i)
  assert.match(doc, /not covered by the automated harness/i)
  assert.match(doc, /no production TypeScript or Go runtime semantics are changed/i)
}

function assertScriptStatic(root) {
  for (const rel of [SCRIPT, LIB, SUITE]) assert.equal(exists(root, rel), true, `${rel} should exist`)
  const script = read(root, SCRIPT)
  const lib = read(root, LIB)
  assertIncludes(script, "require('./lib/v0638-temp-home-rc-harness.cjs')", SCRIPT)
  assertIncludes(script, '--keep-home', SCRIPT)
  assertIncludes(script, '--out', SCRIPT)
  assertIncludes(lib, "const DEFAULT_PREFIX = '/tmp/pi-agentteam-v0638-rc-harness.'", LIB)
  assertIncludes(lib, "process.env.PI_AGENTTEAM_HOME = resolvedHome", LIB)
  assertIncludes(lib, "const originalAutoBridge = process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE", LIB)
  assertIncludes(lib, "process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE = '0'", LIB)
  assertIncludes(lib, "summary.isolation.autoBridgeEnvRestored", LIB)
  assertIncludes(lib, "summary.unsupported.push({ id: 'real-pi-tui-team-panel'", LIB)
  assertIncludes(lib, "summary.unsupported.push({ id: 'real-llm-provider-worker-execution'", LIB)
  assertIncludes(lib, 'assertNoSentinelInSummary(summary)', LIB)
  assert.equal(/npm\s+version\b|npm\s+publish\b|git\s+tag\b|git\s+push\b|go\s+(?:build|install|mod)\b/.test(script + lib), false, 'harness must not contain release/native commands')
}

function assertPackageRuntimeInvariants(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.name, 'pi-agentteam')
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.equal(packageJson.type, 'module')
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
  for (const field of ['main', 'exports', 'types']) assert.equal(Object.prototype.hasOwnProperty.call(packageJson, field), false, `package.json must not add ${field}`)
  assert.deepEqual(Object.keys(packageJson.dependencies || {}).sort(), [], 'dependencies must remain empty or absent')
  for (const key of ['optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'agentteamGoHelper', 'binary', 'os', 'cpu', 'native', 'nativeHelper']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package must not define native metadata ${key}`)
  }
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish', 'prepack', 'postpack']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define lifecycle script ${lifecycle}`)
  }
}

function assertArtifactInvariants(root) {
  for (const rel of ROOT_FORBIDDEN_FILES) assert.equal(exists(root, rel), false, `${rel} must not exist`)
  assert.deepEqual(fs.readdirSync(root).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort(), [], 'repo root must not contain pi-agentteam temp tarballs')
  const forbiddenArtifacts = []
  const forbiddenRecords = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if (FORBIDDEN_ARTIFACT.test(rel)) forbiddenArtifacts.push(rel)
    if (!rel.startsWith('docs/') && !rel.startsWith('tests/') && !ALLOWED_REVIEW_RECORDS.has(rel) && FORBIDDEN_GENERATED_RECORD.test(rel)) forbiddenRecords.push(rel)
  }
  assert.deepEqual(forbiddenArtifacts.sort(), [], 'repo must not contain checked-in native/archive/signing/release artifacts')
  assert.deepEqual(forbiddenRecords.sort(), [], 'repo must not contain generated manifests/checksums/provenance/attestation/raw hosted/release records outside docs/tests/review helper areas')
}

async function runHarnessWithIsolatedHome(root) {
  const inheritedHome = process.env.PI_AGENTTEAM_HOME
  delete process.env.PI_AGENTTEAM_HOME
  try {
    return await runHarness({ extRoot: root })
  } finally {
    if (inheritedHome === undefined) delete process.env.PI_AGENTTEAM_HOME
    else process.env.PI_AGENTTEAM_HOME = inheritedHome
  }
}

async function assertHarnessRun(root) {
  const originalHome = process.env.PI_AGENTTEAM_HOME
  const originalAutoBridge = process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE
  const summary = await runHarnessWithIsolatedHome(root)
  assert.equal(summary.ok, true, `harness should pass: ${JSON.stringify(summary.errors)}`)
  assert.equal(summary.status, 'passed')
  assert.equal(summary.cleanupResult, 'removed')
  assert.equal(summary.isolation.safePrefix, true)
  assert.equal(summary.isolation.underRepo, false)
  assert.equal(summary.isolation.initialEntryCount, 0)
  assert.equal(summary.isolation.liveHomeEnvRestored, true)
  assert.equal(summary.isolation.autoBridgeEnvRestored, true)
  assert.equal(process.env.PI_AGENTTEAM_HOME, originalHome)
  assert.equal(process.env.PI_AGENTTEAM_TEST_AUTO_BRIDGE, originalAutoBridge)
  assert.equal(isSafeTempHome(summary.tempHome, DEFAULT_PREFIX), true)
  assert.equal(fs.existsSync(summary.tempHome), false, 'temp home should be removed')
  assert.deepEqual(summary.commands.map(command => command.args), ['config show', 'config init', 'config validate', 'config migrate --dry-run'])
  const toolNames = summary.tools.map(tool => tool.name)
  for (const name of ['agentteam_create', 'agentteam_spawn', 'agentteam_task', 'agentteam_send', 'agentteam_receive']) assert.equal(toolNames.includes(name), true, `harness should run ${name}`)
  const checks = new Map(summary.checks.map(check => [check.id, check]))
  for (const id of ['unsafe-name-rejection', 'worker-receive-boundary', 'report-done-report-only', 'leader-receive-report-attention', 'report-blocked-report-only', 'team-panel-compact-model', 'legacy-teams-dash-absent', 'release-governance-absence']) {
    assert.equal(checks.get(id)?.pass, true, `harness check should pass: ${id}`)
  }
  assert.equal(summary.unsupported.some(item => item.id === 'real-pi-tui-team-panel'), true)
  assert.equal(summary.unsupported.some(item => item.id === 'real-llm-provider-worker-execution'), true)
  assert.equal(JSON.stringify(summary).includes(FULL_TEXT_SENTINEL), false, 'summary must not leak full-text sentinel')
  assert.equal(summary.errors.length, 0)
}

module.exports = {
  name: 'Go kernel v0.6.38 temp-home-bound RC harness',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertScriptStatic(root)
    assertPackageRuntimeInvariants(root)
    assertArtifactInvariants(root)
    await assertHarnessRun(root)
  },
}
