const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.24-explicit-readiness-command-integration.md'
const PLAN = 'docs/agentteam方案书.md'
const EXPECTED_VERSION = '0.6.8'
const AUDITED_SURFACES = [
  'api/commands.ts',
  'commands/team.ts',
  'commands/config.ts',
  'commands/shared.ts',
  'api/tools.ts',
  'tools/team.ts',
  'tools/message.ts',
  'tools/task.ts',
  'tools/planRun.ts',
  'tests/suites/commands.cjs',
  'tests/suites/public-output-leak-guards.cjs',
  'tests/suites/go-kernel-v0424-readiness-command-contract-docs.cjs',
]

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
  assert.equal((packageJson.files || []).some(item => /(?:helper|native|manifest|artifact|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item)), false, 'package.json#files must exclude native/helper/generated artifacts')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optionalDependencies')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'agentteamGoHelper'), false, 'package must not define native helper metadata')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'os'), false, 'main package must not define native os metadata')
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'cpu'), false, 'main package must not define native cpu metadata')
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

function assertPublicSurfacesUnchanged(root) {
  const apiCommands = read(root, 'api/commands.ts')
  assertMatches(apiCommands, /registerAgentTeamCommands\(pi[\s\S]*registerTeamCommands\(pi, deps\)/, 'api commands should still register only team commands')

  const teamCommand = read(root, 'commands/team.ts')
  assertMatches(teamCommand, /pi\.registerCommand\('team'/, 'team command should remain the public command seam')
  assertMatches(teamCommand, /handleTeamConfigCommand\(args, ctx\)/, 'team command should keep config subcommand routing')
  assertMatches(teamCommand, /handleTeamReadinessCommand\(args, ctx\)[\s\S]*if \(readinessResult\.handled\) return[\s\S]*openTeamPanel/, 'Slice 3 readiness routing should remain explicit and before panel opening')

  const commandsSuite = read(root, 'tests/suites/commands.cjs')
  assertIncludes(commandsSuite, "assert.deepEqual([...pi.__commands.keys()].filter(name => name.startsWith('team')), ['team'])", 'commands suite should still assert one team command')

  const apiTools = read(root, 'api/tools.ts')
  for (const expected of ['registerTeamTools', 'registerMessageTools', 'registerTaskTools', 'registerPlanRunTools']) {
    assertIncludes(apiTools, expected, `api tools should still register ${expected}`)
  }
  assert.equal(/readiness/i.test(apiTools), false, 'Slice 2 must not add readiness tool registration')
}

module.exports = {
  name: 'Go kernel v0.4.24 readiness command seam docs',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [DOC, PLAN, ...AUDITED_SURFACES]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const combined = [doc, plan].join('\n\n')

    assertIncludes(plan, 'tests/suites/go-kernel-v0424-readiness-command-seam-docs.cjs', 'roadmap should reference Slice 2 seam guard')
    assertIncludes(doc, '## Slice 2 Command Surface Discovery and Seam Selection', 'doc should include Slice 2 section')

    for (const expected of [
      'Slice 2 audits existing command/tool surfaces and selects the smallest future integration seam for Slice 3',
      'This slice is docs/tests only and no command is implemented in Slice 2',
      'Slice 3 implementation note: `/team readiness` is now the explicit command seam selected here',
      'api/commands.ts',
      'registerAgentTeamCommands()',
      'commands/team.ts',
      'single public `/team` command',
      'commands/config.ts',
      '/team config init|show|validate|migrate --dry-run',
      'commands/shared.ts',
      'api/tools.ts',
      'registerAgentTeamTools()',
      'tools/`',
      'tests/suites/commands.cjs',
      'tests/suites/public-output-leak-guards.cjs',
      'Recommended smallest Slice 3 seam',
      'add a new explicit `/team readiness` subcommand handled before `openTeamPanel()`',
      'same subcommand-dispatch style as `/team config`',
      'handleTeamReadinessCommand(args, ctx)',
      'core/kernelDiagnostics.ts',
      'emit compact reviewer-facing notification text through the command response path, not through `/team` panel rendering',
      'explicit opt-in, read-only, deterministic, and testable',
      'Do not add a new model-callable tool in Slice 3 unless separately approved',
      'Do not render readiness diagnostics in `/team`',
      'Do not add package/native resolver behavior',
      'no tmux capture, state writes, mailbox/report full-text reads, task/report mutation, worker lifecycle behavior, pane reconcile, or pane kill behavior',
      'Slice 3 may do only this, after separate approval',
      'implement an explicit `/team readiness` command or equivalent subcommand seam',
      'format compact readiness output using only allowed fields',
      'module, capability, status, resultMarker, failureKind, remediation, hint, releaseDecision',
      'must not implement `/team` ambient UI or runtime panel diagnostics rendering',
      'must not change runtime behavior, default Go, current `go-cutover`, or `go-packaged-preview` availability semantics',
      'must not delete the TypeScript parser fallback',
      'must not broaden Go authority beyond parser-only stdin/stdout `tmuxSnapshotParse`',
      'must not change package/native behavior',
      'The Slice 1 allowed output, forbidden leak, read-only behavior, runtime invariant, and package/native STOP gate sections remain authoritative',
    ]) {
      assertIncludes(doc, expected, 'v0.4.24 seam audit doc')
    }

    for (const [label, pattern] of [
      ['audited surfaces', /Audited surfaces:[\s\S]*`api\/commands\.ts`[\s\S]*`commands\/team\.ts`[\s\S]*`commands\/config\.ts`[\s\S]*`commands\/shared\.ts`[\s\S]*`api\/tools\.ts`[\s\S]*`tools\/`[\s\S]*`tests\/suites\/commands\.cjs`[\s\S]*`tests\/suites\/public-output-leak-guards\.cjs`/i],
      ['recommended seam', /Recommended smallest Slice 3 seam:[\s\S]*explicit `\/team readiness` subcommand[\s\S]*handled before `openTeamPanel\(\)`[\s\S]*same subcommand-dispatch style as `\/team config`[\s\S]*command response path, not through `\/team` panel rendering/i],
      ['why not other seams', /Why not other seams:[\s\S]*Do not add a new model-callable tool[\s\S]*Do not render readiness diagnostics in `\/team`[\s\S]*Do not add package\/native resolver behavior/i],
      ['slice3 may and must not', /Slice 3 may do only this[\s\S]*implement an explicit `\/team readiness` command[\s\S]*module, capability, status, resultMarker, failureKind, remediation, hint, releaseDecision[\s\S]*Slice 3 must not do this[\s\S]*must not implement `\/team` ambient UI[\s\S]*must not change runtime behavior[\s\S]*must not delete the TypeScript parser fallback/i],
      ['preserved constraints', /Allowed Command\/Readiness Output[\s\S]*Forbidden Fields and Leaks[\s\S]*Read-Only Behavior Contract[\s\S]*Runtime Invariants[\s\S]*Package and Native STOP Gates/i],
    ]) {
      assertMatches(doc, pattern, `v0.4.24 seam audit doc: ${label}`)
    }

    for (const forbiddenPhrase of [
      'command integration is implemented',
      'readiness command is implemented',
      '/team UI is implemented',
      '/team diagnostics are implemented',
      'runtime panel diagnostics are implemented',
      'Go is default',
      'Go remains default',
      'native/default cutover is approved',
      'native packaging is approved',
      'npm publish is approved',
      'npm version is approved',
      'fallback deletion is approved',
      'delete the TypeScript fallback now',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go owns state writes',
      'Go reads mailbox full text',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.24 seam docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assertPublicSurfacesUnchanged(root)
    assertPackageNativeSanity(root)
  },
}
