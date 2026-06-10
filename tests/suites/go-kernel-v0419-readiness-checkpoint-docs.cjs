const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const CHECKPOINT = 'docs/perf/v0.4.19-go-kernel-readiness-checkpoint.md'
const PREREQ = 'docs/perf/v0.4.19-go-runtime-prerequisites.md'
const TMUX_READINESS = 'docs/perf/v0.4.19-tmux-snapshot-fail-closed-readiness.md'
const REFRESH_SAFETY = 'docs/perf/v0.4.19-team-refresh-parser-unavailable-safety.md'
const HELPER_SMOKE = 'docs/perf/v0.4.19-go-helper-smoke-readiness.md'
const PLAN = 'docs/agentteam方案书.md'

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} should match ${pattern}`)
}

module.exports = {
  name: 'Go kernel v0.4.19 readiness checkpoint docs',
  async run(env) {
    const root = env.helpers.extRoot

    for (const rel of [CHECKPOINT, PREREQ, TMUX_READINESS, REFRESH_SAFETY, HELPER_SMOKE, PLAN]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const checkpoint = read(root, CHECKPOINT)
    const prereq = read(root, PREREQ)
    const tmuxReadiness = read(root, TMUX_READINESS)
    const refreshSafety = read(root, REFRESH_SAFETY)
    const helperSmoke = read(root, HELPER_SMOKE)
    const plan = read(root, PLAN)
    const packageJson = JSON.parse(read(root, 'package.json'))
    const combined = [checkpoint, prereq, tmuxReadiness, refreshSafety, helperSmoke, plan].join('\n\n')

    for (const [rel, source] of [[PREREQ, prereq], [TMUX_READINESS, tmuxReadiness], [REFRESH_SAFETY, refreshSafety], [HELPER_SMOKE, helperSmoke], [PLAN, plan]]) {
      assertIncludes(source, CHECKPOINT, `${rel} should link v0.4.19 readiness checkpoint`)
    }

    for (const expected of [
      'v0.4.19 Go Kernel Readiness Checkpoint',
      'Slice 1 runtime prerequisites',
      'Model A is endorsed for GitHub-only readiness',
      'Model B is documented for explicit user-provided helper path local smoke only',
      'Model C native packaging matrix is deferred',
      'Fallback deletion is blocked until runtime prerequisite signoff is accepted',
      'No default Go runtime is approved by v0.4.19',
      'Slice 2 tmux Fail-Closed Readiness',
      '`missing-helper`',
      '`disabled-helper`',
      '`helper-unsupported-protocol`',
      '`helper-unsupported-version`',
      '`helper-unsupported-capability`',
      '`helper-timeout`',
      '`helper-spawn-error`',
      '`helper-crash`',
      '`helper-nonzero-exit`',
      '`helper-empty-response`',
      '`helper-malformed-json`',
      '`helper-jsonrpc-error`',
      '`helper-incompatible-response`',
      '`helper-unsafe-response-shape`',
      '`previous-helper-failure`',
      '`ok:false`',
      'compact `cutoverFailureKind`',
      'short sanitized `reason`',
      'no false successful empty snapshot',
      'no helper stdout/stderr bodies',
      'no full helper paths or repository paths',
      'no mailbox/report text or TaskReport body text',
      'no sidecar/cache/index/raw state contents',
      'no hidden runtime state',
      'tests/fixtures/kernel/tmux/snapshotCases.cjs',
      'tests/suites/go-kernel-tmux-snapshot-parser.cjs',
      'Slice 3 Refresh Safety',
      'Parser unavailable means unknown/stale, not pane disappearance',
      'Light attached `/team` refresh with `snapshot.ok === false` must not clear `paneId` or `windowTarget`',
      'Global `/team` refresh must not present parser failure as a false successful empty pane list',
      'explicit TypeScript/pi live tmux fallback/retry behavior',
      'Slice 4 Helper Smoke Command Normalization',
      'mktemp /tmp/agentteam-v0419-kernel.XXXXXX',
      'GO111MODULE=off go build -o "$helper" .',
      'PI_AGENTTEAM_KERNEL=go',
      'PI_AGENTTEAM_KERNEL_HELPER="$helper"',
      'rm -f "$helper"',
      '`protocolVersion` is `1`',
      '`helperVersion` is currently `0.3.0-read-model-shadow`',
      '`capabilities` include `health`, `profile`, `tmuxSnapshotParse`, and `compactReadModelFingerprint`',
      '`businessPathsConnected` is `false`',
      '`kernel.enabled` is `true`',
      '`kernel.fallbacks` is `0`',
      '`parityMatched:true`',
      '`readOnly:true`',
      '`fullTextIncluded:false`',
      '`stateFilesRead:false`',
      '`stateFilesWritten:false`',
      'no runtime `/team` diagnostics are added',
      'missing Go toolchain is optional-skip/manual-smoke unavailable',
      'Package/Native Sanity',
      '`package.json` version remains `0.6.8`',
      '`package.json#files` excludes `kernel/`',
      'no `package-lock.json`',
      'no `npm-shrinkwrap.json`',
      'no root or helper `go.mod`',
      'no root or helper `go.sum`',
      'no checked-in native artifacts',
      'Recommendation: STOP for actual `tmuxSnapshotParse` fallback deletion in v0.4.19',
      'Do NOT proceed to actual `tmuxSnapshotParse` TypeScript fallback deletion yet',
      'the user explicitly approves a v0.4.20 cutover attempt',
      'v0.4.19 is readiness-only',
      'v0.4.20 actual `tmuxSnapshotParse` cutover only if gates are accepted',
      'return to the broader v0.5 core refactor path',
      'node tests/run.cjs',
      'npm run typecheck',
      'npm run -s check:boundaries',
      'git diff --check',
      'npm run --silent bench:team-panel-tmux',
      'package/native config sanity passed',
    ]) {
      assertIncludes(checkpoint, expected, 'readiness checkpoint doc')
    }

    for (const [label, pattern] of [
      ['slice 1 summary', /Model A is endorsed for GitHub-only readiness[\s\S]*Model B[\s\S]*local smoke only[\s\S]*Model C[\s\S]*deferred[\s\S]*Fallback deletion is blocked/i],
      ['slice 2 failure classes', /`missing-helper`[\s\S]*`disabled-helper`[\s\S]*`helper-unsupported-protocol`[\s\S]*`helper-empty-response`[\s\S]*`previous-helper-failure`/i],
      ['safe unavailable shape', /`ok:false`[\s\S]*compact `cutoverFailureKind`[\s\S]*short sanitized `reason`[\s\S]*unavailable[\s\S]*unknown[\s\S]*stale/i],
      ['no leak policy', /no helper stdout\/stderr bodies[\s\S]*no full helper paths or repository paths[\s\S]*no mailbox\/report text[\s\S]*no sidecar\/cache\/index\/raw state contents[\s\S]*no hidden runtime state/i],
      ['slice 3 refresh safety', /Parser unavailable means unknown\/stale, not pane disappearance[\s\S]*Light attached[\s\S]*snapshot\.ok === false[\s\S]*must not clear[\s\S]*Global[\s\S]*false successful empty pane list[\s\S]*explicit TypeScript\/pi live tmux fallback\/retry/i],
      ['slice 4 helper commands', /helper="\$\(mktemp \/tmp\/agentteam-v0419-kernel\.XXXXXX\)"[\s\S]*GO111MODULE=off go build -o "\$helper" \.[\s\S]*PI_AGENTTEAM_KERNEL=go[\s\S]*PI_AGENTTEAM_KERNEL_HELPER="\$helper"[\s\S]*rm -f "\$helper"/i],
      ['package native sanity', /package\.json` version remains `0\.6\.8`[\s\S]*package\.json#files` excludes `kernel\/`[\s\S]*no `package-lock\.json`[\s\S]*no `npm-shrinkwrap\.json`[\s\S]*no root or helper `go\.mod`[\s\S]*no root or helper `go\.sum`[\s\S]*no checked-in native artifacts/i],
      ['stop go recommendation', /Recommendation: STOP[\s\S]*Do NOT proceed[\s\S]*v0\.4\.20 cutover[\s\S]*runtime prerequisite signoff[\s\S]*v0\.4\.19 is readiness-only/i],
      ['next milestone', /v0\.4\.20 actual `tmuxSnapshotParse` cutover only if gates are accepted[\s\S]*return to the broader v0\.5 core refactor/i],
      ['final validation commands', /node tests\/run\.cjs[\s\S]*npm run typecheck[\s\S]*npm run -s check:boundaries[\s\S]*git diff --check[\s\S]*npm run --silent bench:team-panel-tmux/i],
    ]) {
      assertMatches(checkpoint, pattern, `readiness checkpoint doc: ${label}`)
    }

    for (const [label, pattern] of [
      ['plan slice 5', /v0\.4\.19 — Go Kernel Readiness Checkpoint[\s\S]*docs\/perf\/v0\.4\.19-go-kernel-readiness-checkpoint\.md/i],
      ['prereq link', /final readiness checkpoint[\s\S]{0,180}docs\/perf\/v0\.4\.19-go-kernel-readiness-checkpoint\.md/i],
      ['tmux link', /readiness checkpoint[\s\S]{0,180}docs\/perf\/v0\.4\.19-go-kernel-readiness-checkpoint\.md/i],
      ['refresh link', /readiness checkpoint[\s\S]{0,180}docs\/perf\/v0\.4\.19-go-kernel-readiness-checkpoint\.md/i],
      ['helper link', /final readiness checkpoint[\s\S]{0,180}docs\/perf\/v0\.4\.19-go-kernel-readiness-checkpoint\.md/i],
    ]) {
      assertMatches(combined, pattern, `linked docs: ${label}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'default Go runtime approved',
      'Go runtime is required',
      'fallback deletion is approved without runtime prerequisite signoff',
      'proceed to actual tmuxSnapshotParse fallback deletion now',
      'v0.4.19 approves fallback deletion',
      'native packaging is approved',
      'checked-in binary is allowed',
      'postinstall download is allowed',
      'run `npm version` to release',
      'run `npm publish` to release',
      'commit/tag/push as part of this checkpoint',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go owns state writes',
      'Go owns task/report governance',
      'Go reads mailbox full text',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.19 checkpoint docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assert.equal(packageJson.version, '0.6.8', 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist for v0.4.19 readiness checkpoint`)
    }
  },
}
