const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.24-explicit-readiness-command-integration.md'
const PLAN = 'docs/agentteam方案书.md'
const EXPECTED_VERSION = '0.6.8'
const FORBIDDEN_SENTINELS = [
  '/tmp/V0424_READINESS_HELPER_PATH_SHOULD_NOT_LEAK/agentteam-go-helper',
  'V0424_READINESS_STDOUT_SHOULD_NOT_LEAK',
  'V0424_READINESS_STDERR_SHOULD_NOT_LEAK',
  '/home/user/private/v0424-readiness-repo',
  process.cwd(),
  'V0424_READINESS_RAW_CUTOVER_REASON_SHOULD_NOT_LEAK',
  '{"team":{"raw":"V0424_READINESS_RAW_TEAM_JSON_SHOULD_NOT_LEAK"}}',
  'V0424_READINESS_SIDECAR_CACHE_INDEX_SHOULD_NOT_LEAK',
  'V0424_READINESS_RAW_MANIFEST_CHECKSUM_PROVENANCE_SHOULD_NOT_LEAK',
  'V0424_READINESS_WORKER_PROMPT_SHOULD_NOT_LEAK',
  'Error: V0424_READINESS_STACK_TRACE_SHOULD_NOT_LEAK\n    at secret (/repo/file.ts:1:1)',
  'V0424_READINESS_MAILBOX_REPORT_TEXT_SHOULD_NOT_LEAK',
  '@earendil-works/agentteam-native-readiness-internal',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
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

function assertNoForbiddenLeaks(text, label) {
  for (const sentinel of FORBIDDEN_SENTINELS) {
    assert.equal(String(text).includes(sentinel), false, `${label} must not leak ${sentinel}`)
  }
  for (const forbidden of ['helperPath=', 'stdout=', 'stderr=', 'cutoverReason=', 'rawTeamJson=', 'mailbox/report', 'packageInternal=', 'process.env']) {
    assert.equal(String(text).includes(forbidden), false, `${label} must not include forbidden token ${forbidden}`)
  }
}

module.exports = {
  name: 'Go kernel v0.4.24 readiness command integration',
  async run(env) {
    const root = env.helpers.extRoot
    const { pi, leaderCtx, modules } = env
    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    assert.ok(doc.includes('## Slice 3 Explicit Readiness Command Integration Evidence'), 'doc should include Slice 3 implementation evidence')
    assert.ok(plan.includes('tests/suites/go-kernel-v0424-readiness-command-integration.cjs'), 'roadmap should reference Slice 3 integration suite')

    const command = pi.__commands.get('team')
    assert.ok(command, 'team command should be registered')
    assert.deepEqual([...pi.__commands.keys()].filter(name => name.startsWith('team')), ['team'], 'readiness should remain a /team subcommand, not a new command')

    const originalCustom = leaderCtx.ui.custom
    let panelOpened = 0
    leaderCtx.ui.custom = async () => {
      panelOpened += 1
      return { type: 'close' }
    }
    const teamNamesBefore = modules.state.listTeams().map(team => team.name).sort()
    const outboxBefore = JSON.stringify(modules.state.readTeamState('full-suite-team')?.outbox ?? [])
    const notificationsBefore = env.notifications.length
    await command.handler('readiness', leaderCtx)
    leaderCtx.ui.custom = originalCustom

    assert.equal(panelOpened, 0, '/team readiness must not open the panel')
    assert.equal(env.notifications.length, notificationsBefore + 1, '/team readiness should emit one notification')
    const message = env.notifications.at(-1).message
    assert.ok(message.includes('[agentteam readiness] tmuxSnapshotParse compact diagnostics'), 'readiness output should include header')
    assert.ok(message.includes('not normal-user native availability proof'), 'readiness output should disclaim availability proof')
    for (const expected of ['module=tmuxSnapshotParse', 'capability=tmuxSnapshotParse', 'status=unknown', 'resultMarker=stale', 'failureKind=missing-helper', 'failureKind=helper-unsupported-version', 'remediation=', 'hint=', 'releaseDecision=docs/perf/v0.4.23-compact-native-failure-diagnostics.md']) {
      assert.ok(message.includes(expected), `readiness output should include ${expected}`)
    }
    assertNoForbiddenLeaks(message, 'readiness output')
    assert.deepEqual(modules.state.listTeams().map(team => team.name).sort(), teamNamesBefore, '/team readiness must not create/delete teams')
    assert.equal(JSON.stringify(modules.state.readTeamState('full-suite-team')?.outbox ?? []), outboxBefore, '/team readiness must not mutate outbox/task governance state')

    leaderCtx.ui.custom = async () => {
      panelOpened += 1
      return { type: 'close' }
    }
    await command.handler('', leaderCtx)
    leaderCtx.ui.custom = originalCustom
    assert.equal(panelOpened, 1, 'normal /team should still open the panel')

    const readinessSource = read(root, 'commands/readiness.ts')
    for (const forbiddenPattern of [/node:fs/, /node:child_process/, /\.\.\/tmux\//, /listAgentTeamPanes|captureTmuxSnapshot|runTmux|execFile|readMailbox|readReport|report_done|report_blocked|taskMutations|writeTeamState|deleteTeamState|reconcile|killPane|openTeamPanel/]) {
      assert.equal(forbiddenPattern.test(readinessSource), false, `readiness command must stay read-only and not match ${forbiddenPattern}`)
    }
    assert.ok(readinessSource.includes('listTmuxSnapshotParseFailureDiagnostics'), 'readiness command should use compact diagnostics list helper')
    assert.ok(readinessSource.includes('formatTmuxSnapshotParseFailureReadiness'), 'readiness command should use compact readiness formatter')

    assertPackageNativeSanity(root)
  },
}
