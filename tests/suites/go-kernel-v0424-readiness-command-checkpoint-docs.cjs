const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const CHECKPOINT = 'docs/perf/v0.4.24-explicit-readiness-command-integration-checkpoint.md'
const PRIOR_CHECKPOINT = 'docs/perf/v0.4.23-compact-native-failure-diagnostics-checkpoint.md'
const DOC = 'docs/perf/v0.4.24-explicit-readiness-command-integration.md'
const PLAN = 'docs/agentteam方案书.md'
const ARTIFACTS = [
  'docs/perf/v0.4.24-explicit-readiness-command-integration.md',
  'commands/readiness.ts',
  'commands/team.ts',
  'tests/suites/go-kernel-v0424-readiness-command-contract-docs.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-seam-docs.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-integration.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-sunset-docs.cjs',
]
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

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, EXPECTED_VERSION, 'package version must remain unchanged')
  assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'package.json#files must exclude kernel/')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package.json#files must exclude native/helper/generated artifacts')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    assert.equal(/npm\s+(?:version|publish)\b/.test(command), false, `${name} must not run npm version/publish`)
    assert.equal(/go\s+(?:build|install)\b/.test(command), false, `${name} must not build/install helper`)
    assert.equal(/curl\b|wget\b|node-gyp\b|prebuild/i.test(command), false, `${name} must not download/build native helper`)
    assert.equal(/kernel\//i.test(command) && /pack|publish|files|npm/i.test(command), false, `${name} must not package kernel/native helper`)
  }
  for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist`)
  }
  const nativeArtifacts = walkFiles(root)
    .filter(file => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}.git${path.sep}`))
    .filter(file => /\.(?:exe|dll|so|dylib|tgz)$/i.test(file))
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
  assert.deepEqual(nativeArtifacts, [], 'native/package artifacts must not be checked in')
}

function assertCommandMinimal(root) {
  const teamCommand = read(root, 'commands/team.ts')
  assert.equal((teamCommand.match(/'readiness'/g) || []).length, 1, 'team command should expose exactly one readiness completion')
  assertMatches(teamCommand, /handleTeamReadinessCommand\(args, ctx\)[\s\S]*if \(readinessResult\.handled\) return[\s\S]*openTeamPanel/, 'readiness command should remain explicit and before panel opening')
  const readinessSource = read(root, 'commands/readiness.ts')
  assertMatches(readinessSource, /args\.trim\(\)\.toLowerCase\(\) === 'readiness'/, 'readiness parser should accept only one subcommand literal')
  assert.equal((readinessSource.match(/=== 'readiness'/g) || []).length, 1, 'readiness command should have exactly one accepted parser literal')
  assert.equal(/args\.includes|args\.split|startsWith\('readiness|--[a-z]/.test(readinessSource), false, 'readiness command should not parse nested subcommands or options')
  for (const forbiddenPattern of [/registerTool/, /registerCommand/, /openTeamPanel/, /node:fs/, /node:child_process/, /\.\.\/tmux\//, /listAgentTeamPanes|captureTmuxSnapshot|runTmux|execFile|readMailbox|readReport|taskMutations|writeTeamState|deleteTeamState|reconcile|killPane/]) {
    assert.equal(forbiddenPattern.test(readinessSource), false, `readiness command must remain contained and not match ${forbiddenPattern}`)
  }
  const apiTools = read(root, 'api/tools.ts')
  assert.equal(/readiness/i.test(apiTools), false, 'readiness must not be registered as a model-callable tool')
  for (const rel of ['teamPanel/dataSource.ts', 'teamPanel/viewModel.ts', 'teamPanel/readModel.ts', 'teamPanel.ts', 'renderers.ts']) {
    const source = read(root, rel)
    assert.equal(/readiness|releaseDecision|platformHint|freshnessHint|remediation/.test(source), false, `${rel} must not render readiness diagnostics in /team`)
  }
}

module.exports = {
  name: 'Go kernel v0.4.24 readiness command checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [CHECKPOINT, PRIOR_CHECKPOINT, DOC, PLAN, ...ARTIFACTS]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const checkpoint = read(root, CHECKPOINT)
    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const combined = [checkpoint, doc, plan].join('\n\n')

    assertIncludes(checkpoint, PRIOR_CHECKPOINT, 'checkpoint should link prior v0.4.23 checkpoint')
    assertIncludes(doc, CHECKPOINT, 'v0.4.24 main doc should link final checkpoint')
    assertIncludes(plan, CHECKPOINT, 'roadmap should reference final checkpoint')
    for (const rel of ARTIFACTS) {
      assertIncludes(checkpoint, rel, `checkpoint should link ${rel}`)
    }

    for (const expected of [
      'v0.4.24 Explicit Readiness Command Integration Checkpoint',
      'Slice 5 final GitHub-only explicit readiness command integration checkpoint review',
      'GO only for GitHub-only v0.4.24 explicit readiness command integration checkpoint after leader/user approval',
      'STOP for expanding `/team readiness` into a permanent user-facing feature',
      'STOP for additional readiness subcommands/options without explicit user approval',
      'STOP for ambient `/team` UI/panel diagnostics',
      'STOP for model-callable tools',
      'STOP for runtime control-plane behavior',
      'STOP for npm/default/native cutover',
      'STOP for real package inclusion or native artifact approval',
      'STOP for `package.json` metadata or version changes',
      'STOP for `optionalDependencies`, lifecycle hooks/downloads, package scripts, lockfiles, Go modules, native artifacts, tarballs, generated manifests, or generated artifacts',
      'STOP for treating diagnostics/readiness as normal-user native availability proof',
      'STOP for default Go enablement',
      'STOP for current `go-cutover` behavior changes',
      'STOP for `go-packaged-preview` availability semantics changes',
      'STOP for TypeScript fallback deletion',
      'STOP for broader Go authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
      'Slice 1 contract',
      'explicit opt-in reviewer readiness surface only',
      'Slice 2 seam selection',
      'smallest `/team readiness` seam before panel open',
      'Slice 3 implementation',
      'minimal read-only deterministic `/team readiness` command using v0.4.23 safe helpers',
      'Slice 4 containment',
      'transitional reviewer tooling, not a long-term product feature',
      'sunset/deletion/merge paths',
      'default/unset remains disabled/TypeScript',
      'current `go-cutover` remains unchanged',
      'go-packaged-preview` remains explicit-only, non-default, and not normal-user availability proof',
      'compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
      'runtime `/team` panel remains quiet',
      '`/team readiness` is a single explicit subcommand only',
      'no additional readiness subcommands/options are approved',
      'no model-callable readiness tool is registered',
      'no ambient `/team` panel diagnostics are rendered',
      'package.json` version remains `0.6.8`',
      'no `optionalDependencies`',
      'no lifecycle hooks',
      'no helper build/install/download/package/version/publish scripts',
      'no `package-lock.json` or `npm-shrinkwrap.json`',
      'no root or helper `go.mod`',
      'no root or helper `go.sum`',
      'no checked-in `.exe`, `.dll`, `.so`, `.dylib`',
      'Readiness Sunset and Go Mainline',
      '`/team readiness` remains transitional reviewer/readiness tooling only',
      'not a long-term product feature',
      'Go mainline remains core hot-path replacement',
      'replace proven deterministic hot-path modules with Go-owned implementations after cutover gates, not feature expansion',
      'Future work returns to Go core replacement, generated artifacts, clean install proof, module cutover gate, and separately approved fallback deletion/default cutover plan',
      'delete `/team readiness` after formal native diagnostics/default path matures',
      'merge `/team readiness` into a separately approved diagnostics UX',
      'developer/reviewer-only hidden/internal command if explicitly approved',
      'generated artifacts and clean-install proof exist',
      'unsupported-platform remediation and rollback are accepted',
      'normal-user diagnostics UX exists if needed',
      'TypeScript fallback deletion/default cutover decision is separately approved',
      'generated artifacts/checksums/provenance/license/executable validation',
      'clean install smokes across supported platforms',
      'unsupported-platform remediation',
      'rollback story',
      'user approval for default/native/fallback deletion',
      'node tests/run.cjs go-kernel-v0424-readiness-command-contract-docs',
      'node tests/run.cjs go-kernel-v0424-readiness-command-seam-docs',
      'node tests/run.cjs go-kernel-v0424-readiness-command-integration',
      'node tests/run.cjs go-kernel-v0424-readiness-command-sunset-docs',
      'node tests/run.cjs go-kernel-v0424-readiness-command-checkpoint-docs',
      'node --check tests/suites/go-kernel-v0424-readiness-command-checkpoint-docs.cjs',
      'node tests/run.cjs',
      'npm run typecheck',
      'npm run -s check:boundaries',
      'git diff --check',
      'npm run --silent bench:team-panel-tmux',
      'PI_AGENTTEAM_KERNEL=go-packaged-preview npm run --silent bench:team-panel-tmux',
      'package/native sanity scan',
      'Proceed only with a GitHub-only v0.4.24 explicit readiness command integration checkpoint after leader/user approval',
    ]) {
      assertIncludes(checkpoint, expected, 'v0.4.24 checkpoint doc')
    }

    for (const [label, pattern] of [
      ['decision split', /GO only for GitHub-only v0\.4\.24 explicit readiness command integration checkpoint after leader\/user approval[\s\S]*STOP for expanding `\/team readiness`[\s\S]*STOP for additional readiness subcommands\/options[\s\S]*STOP for ambient `\/team` UI\/panel diagnostics[\s\S]*STOP for model-callable tools[\s\S]*STOP for runtime control-plane behavior[\s\S]*STOP for npm\/default\/native cutover[\s\S]*STOP for real package inclusion[\s\S]*STOP for `package\.json` metadata or version changes[\s\S]*STOP for `optionalDependencies`[\s\S]*STOP for treating diagnostics\/readiness as normal-user native availability proof[\s\S]*STOP for default Go enablement[\s\S]*STOP for current `go-cutover` behavior changes[\s\S]*STOP for `go-packaged-preview` availability semantics changes[\s\S]*STOP for TypeScript fallback deletion[\s\S]*STOP for broader Go authority/i],
      ['artifacts', /docs\/perf\/v0\.4\.24-explicit-readiness-command-integration\.md[\s\S]*commands\/readiness\.ts[\s\S]*commands\/team\.ts[\s\S]*go-kernel-v0424-readiness-command-contract-docs\.cjs[\s\S]*go-kernel-v0424-readiness-command-seam-docs\.cjs[\s\S]*go-kernel-v0424-readiness-command-integration\.cjs[\s\S]*go-kernel-v0424-readiness-command-sunset-docs\.cjs/i],
      ['slice summary', /Slice 1 contract[\s\S]*explicit opt-in reviewer readiness surface only[\s\S]*Slice 2 seam selection[\s\S]*smallest `\/team readiness` seam before panel open[\s\S]*Slice 3 implementation[\s\S]*minimal read-only deterministic[\s\S]*Slice 4 containment[\s\S]*transitional reviewer tooling, not a long-term product feature/i],
      ['runtime and command state', /default\/unset remains disabled\/TypeScript[\s\S]*current `go-cutover` remains unchanged[\s\S]*`go-packaged-preview` remains explicit-only[\s\S]*`compactReadModelFingerprint` remains TypeScript fallback[\s\S]*runtime `\/team` panel remains quiet[\s\S]*`\/team readiness` is a single explicit subcommand only[\s\S]*no model-callable readiness tool is registered[\s\S]*no ambient `\/team` panel diagnostics are rendered/i],
      ['sunset and mainline', /`\/team readiness` remains transitional reviewer\/readiness tooling only[\s\S]*not a long-term product feature[\s\S]*Go mainline remains core hot-path replacement[\s\S]*replace proven deterministic hot-path modules with Go-owned implementations after cutover gates, not feature expansion[\s\S]*Future work returns to Go core replacement[\s\S]*delete `\/team readiness`[\s\S]*merge `\/team readiness`[\s\S]*developer\/reviewer-only hidden\/internal command/i],
      ['blockers', /Remaining Blockers Before Actual Default\/Native\/Fallback Deletion[\s\S]*generated artifacts\/checksums\/provenance\/license\/executable validation[\s\S]*clean install smokes across supported platforms[\s\S]*unsupported-platform remediation[\s\S]*rollback story[\s\S]*normal-user diagnostics UX if needed[\s\S]*user approval for default\/native\/fallback deletion/i],
      ['validation', /node tests\/run\.cjs go-kernel-v0424-readiness-command-contract-docs[\s\S]*node tests\/run\.cjs go-kernel-v0424-readiness-command-seam-docs[\s\S]*node tests\/run\.cjs go-kernel-v0424-readiness-command-integration[\s\S]*node tests\/run\.cjs go-kernel-v0424-readiness-command-sunset-docs[\s\S]*node tests\/run\.cjs go-kernel-v0424-readiness-command-checkpoint-docs[\s\S]*node tests\/run\.cjs[\s\S]*npm run typecheck[\s\S]*npm run -s check:boundaries[\s\S]*git diff --check[\s\S]*npm run --silent bench:team-panel-tmux[\s\S]*PI_AGENTTEAM_KERNEL=go-packaged-preview npm run --silent bench:team-panel-tmux[\s\S]*package\/native sanity scan/i],
    ]) {
      assertMatches(checkpoint, pattern, `v0.4.24 checkpoint doc: ${label}`)
    }

    for (const forbiddenPhrase of [
      'native/default cutover is approved',
      'native packaging is approved',
      'npm publish is approved',
      'npm version is approved',
      'fallback deletion is approved',
      'delete the TypeScript fallback now',
      'Go is default',
      'Go remains default',
      'readiness is a long-term product feature',
      'readiness command is permanent',
      'a readiness tool is registered',
      'ambient readiness panel is implemented',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go reads mailbox full text',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.24 checkpoint docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assertCommandMinimal(root)
    assertPackageNativeSanity(root)
  },
}
