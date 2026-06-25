const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.24-explicit-readiness-command-integration.md'
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

function assertPackageNativeSanity(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, EXPECTED_VERSION, 'package version must remain unchanged')
  assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'package.json#files must exclude kernel/')
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith('native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/')), false, 'package.json#files must exclude native/helper/generated artifacts')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
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
  assertMatches(readinessSource, /args\.trim\(\)\.toLowerCase\(\) === 'readiness'/, 'readiness parser should accept only the single readiness subcommand')
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
  name: 'Go kernel v0.4.24 readiness command sunset docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [DOC, PLAN, 'commands/readiness.ts', 'commands/team.ts', 'api/tools.ts']) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const combined = [doc, plan].join('\n\n')

    assertIncludes(doc, '## Slice 4 Readiness Command Sunset and Containment Plan', 'doc should include Slice 4 sunset section')
    assertIncludes(plan, 'tests/suites/go-kernel-v0424-readiness-command-sunset-docs.cjs', 'roadmap should reference Slice 4 guard')

    for (const expected of [
      '`/team readiness` is transitional reviewer/readiness tooling only',
      'not a long-term product feature',
      'not ambient `/team` UI',
      'not part of the long-term Go performance replacement goal',
      'Go mainline remains core replacement work',
      'replace proven deterministic hot-path modules with Go-owned implementations after cutover gates, not add product features',
      'Future slices should return to Go core replacement work: generated artifacts, clean install proof, module cutover gate, and TypeScript fallback deletion plan after separate approval',
      'Containment rules',
      'no additional subcommands under `readiness` without explicit user approval',
      'no ambient `/team` panel rendering',
      'no model-callable tool surface',
      'no package/native/default behavior',
      'no state writes',
      'no full-text reads',
      'no mailbox/report full-text reads',
      'no tmux execution',
      'no tmux capture',
      'no worker lifecycle mutation',
      'no task/report governance mutation',
      'no pane reconcile',
      'no kill panes',
      'no broad Go authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
      'Sunset paths',
      'delete `/team readiness` after formal native diagnostics/default path matures',
      'merge it into a separately approved diagnostics UX',
      'keep it only as a developer/reviewer-only hidden/internal command if explicitly approved',
      'Deletion criteria',
      'generated artifacts and clean-install proof exist',
      'unsupported-platform remediation and rollback are accepted',
      'normal-user diagnostics UX exists if needed',
      'TypeScript fallback deletion/default cutover decision is separately approved',
      'STOP for treating `/team readiness` as a permanent user-facing feature',
      'STOP for expanding `/team readiness` into additional subcommands/options without explicit user approval',
      'STOP for model-callable tools, ambient panel rendering, runtime control-plane behavior, package/native/default behavior, or broader Go authority',
      'STOP for npm/default/native approval, package metadata changes, fallback deletion approval, or npm publish/version behavior',
    ]) {
      assertIncludes(doc, expected, 'v0.4.24 sunset doc')
    }

    for (const [label, pattern] of [
      ['classification', /`\/team readiness` is transitional reviewer\/readiness tooling only[\s\S]*not a long-term product feature[\s\S]*not part of the long-term Go performance replacement goal/i],
      ['go mainline', /Go mainline remains core replacement work[\s\S]*replace proven deterministic hot-path modules with Go-owned implementations after cutover gates, not add product features[\s\S]*generated artifacts, clean install proof, module cutover gate, and TypeScript fallback deletion plan after separate approval/i],
      ['containment', /Containment rules:[\s\S]*no additional subcommands under `readiness`[\s\S]*no ambient `\/team` panel rendering[\s\S]*no model-callable tool surface[\s\S]*no package\/native\/default behavior[\s\S]*no state writes[\s\S]*no full-text reads[\s\S]*no tmux execution[\s\S]*no worker lifecycle mutation[\s\S]*no broad Go authority/i],
      ['sunset', /Sunset paths:[\s\S]*delete `\/team readiness` after formal native diagnostics\/default path matures[\s\S]*merge it into a separately approved diagnostics UX[\s\S]*developer\/reviewer-only hidden\/internal command if explicitly approved/i],
      ['deletion criteria', /Deletion criteria:[\s\S]*generated artifacts and clean-install proof exist[\s\S]*unsupported-platform remediation and rollback are accepted[\s\S]*normal-user diagnostics UX exists if needed[\s\S]*TypeScript fallback deletion\/default cutover decision is separately approved/i],
    ]) {
      assertMatches(doc, pattern, `v0.4.24 sunset doc: ${label}`)
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
      'readiness tool is registered',
      'ambient readiness panel is implemented',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go reads mailbox full text',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.24 sunset docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assertCommandMinimal(root)
    assertPackageNativeSanity(root)
  },
}
