const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const READINESS = 'docs/perf/v0.4.19-tmux-snapshot-fail-closed-readiness.md'
const PREREQ = 'docs/perf/v0.4.19-go-runtime-prerequisites.md'
const TMUX_CUTOVER = 'docs/perf/v0.4.18-tmux-snapshot-parse-cutover.md'
const DIAGNOSTICS = 'docs/perf/v0.4.18-go-cutover-fail-closed-diagnostics.md'
const PLAN = 'docs/agentteam方案书.md'
const PARITY_FIXTURES = 'tests/fixtures/kernel/tmux/snapshotCases.cjs'
const PARITY_SUITE = 'tests/suites/go-kernel-tmux-snapshot-parser.cjs'

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
  name: 'Go kernel v0.4.19 tmux fail-closed readiness docs',
  async run(env) {
    const root = env.helpers.extRoot

    for (const rel of [READINESS, PREREQ, TMUX_CUTOVER, DIAGNOSTICS, PLAN, PARITY_FIXTURES, PARITY_SUITE]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const readiness = read(root, READINESS)
    const prereq = read(root, PREREQ)
    const tmuxCutover = read(root, TMUX_CUTOVER)
    const diagnostics = read(root, DIAGNOSTICS)
    const plan = read(root, PLAN)
    const packageJson = JSON.parse(read(root, 'package.json'))
    const combined = [readiness, prereq, tmuxCutover, diagnostics, plan].join('\n\n')

    for (const [rel, source] of [[PREREQ, prereq], [TMUX_CUTOVER, tmuxCutover], [PLAN, plan]]) {
      assertIncludes(source, READINESS, `${rel} should link tmux fail-closed readiness`)
    }

    for (const expected of [
      'tmuxSnapshotParse',
      'Migration parser mode',
      'Current pre-cutover mode',
      'fail-open to TypeScript is allowed',
      'Cutover-owned parser mode',
      'fail-closed with compact diagnostics',
      'No silent TypeScript parser fallback',
      'no false successful empty snapshot',
      'fallback deletion is blocked',
      PREREQ,
      TMUX_CUTOVER,
      DIAGNOSTICS,
      PARITY_FIXTURES,
      PARITY_SUITE,
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
      '`cutoverFailureKind`',
      '`reason`',
      '`status`',
      '`resultMarker`',
      'helper stdout/stderr bodies',
      'full helper paths',
      'repository paths',
      'mailbox/report text',
      'sidecar/cache/index/raw state contents',
      'hidden runtime state',
      'Parser failure is not pane loss',
      'current migration fail-open fallback',
      'They do not approve fallback deletion',
    ]) {
      assertIncludes(readiness, expected, 'tmux readiness doc')
    }

    for (const [label, pattern] of [
      ['operation classes', /Migration parser mode[\s\S]*Current pre-cutover mode[\s\S]*fail-open to TypeScript is allowed[\s\S]*Cutover-owned parser mode[\s\S]*fail-closed with compact diagnostics/i],
      ['future cutover waits for signoff', /runtime prerequisite signoff[\s\S]{0,220}fallback deletion is blocked|fallback deletion is blocked[\s\S]{0,220}runtime prerequisite signoff/i],
      ['missing through capability failures', /`missing-helper`[\s\S]*`disabled-helper`[\s\S]*`helper-unsupported-protocol`[\s\S]*`helper-unsupported-version`[\s\S]*`helper-unsupported-capability`/i],
      ['timeout through nonzero failures', /`helper-timeout`[\s\S]*`helper-spawn-error`[\s\S]*`helper-crash`[\s\S]*`helper-nonzero-exit`/i],
      ['empty malformed jsonrpc failures', /`helper-empty-response`[\s\S]*`helper-malformed-json`[\s\S]*`helper-jsonrpc-error`/i],
      ['incompatible unsafe previous failures', /`helper-incompatible-response`[\s\S]*`helper-unsafe-response-shape`[\s\S]*`previous-helper-failure`/i],
      ['result shape', /"ok": false[\s\S]*"status": "unknown"[\s\S]*"resultMarker": "stale"[\s\S]*"cutoverFailureKind": "missing-helper"/i],
      ['sanitized reason', /reason[\s\S]{0,160}short[\s\S]{0,80}sanitized/i],
      ['no false empty snapshot', /must not emit `ok:true` with `panes: \[\]` and `byPaneId: \{\}`[\s\S]{0,160}Go parser failed/i],
      ['leak prohibitions', /helper stdout\/stderr bodies[\s\S]*full helper paths[\s\S]*repository paths[\s\S]*mailbox\/report text[\s\S]*sidecar\/cache\/index\/raw state contents[\s\S]*hidden runtime state/i],
      ['parity remains covered', /Parser parity remains covered[\s\S]*tests\/fixtures\/kernel\/tmux\/snapshotCases\.cjs[\s\S]*tests\/suites\/go-kernel-tmux-snapshot-parser\.cjs/i],
      ['no runtime behavior changes', /no runtime behavior changes are made|does not change runtime behavior/i],
    ]) {
      assertMatches(readiness, pattern, `tmux readiness doc: ${label}`)
    }

    for (const [label, pattern] of [
      ['prereq links readiness', /tmux parser[\s\S]{0,180}fail-closed readiness[\s\S]{0,180}docs\/perf\/v0\.4\.19-tmux-snapshot-fail-closed-readiness\.md/i],
      ['cutover links readiness', /fail-closed readiness doc[\s\S]{0,180}docs\/perf\/v0\.4\.19-tmux-snapshot-fail-closed-readiness\.md/i],
      ['plan tracks slice 2', /v0\.4\.19 — tmuxSnapshotParse Fail-Closed Readiness[\s\S]*docs\/perf\/v0\.4\.19-tmux-snapshot-fail-closed-readiness\.md/i],
      ['existing diagnostics baseline still linked', /docs\/perf\/v0\.4\.18-go-cutover-fail-closed-diagnostics\.md[\s\S]*helper-malformed-json|helper-malformed-json[\s\S]*docs\/perf\/v0\.4\.18-go-cutover-fail-closed-diagnostics\.md/i],
    ]) {
      assertMatches(combined, pattern, `linked docs: ${label}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'default Go runtime approved',
      'native packaging is approved',
      'delete TypeScript parser fallback now',
      'fallback deletion is approved without runtime prerequisite signoff',
      'fail-open remains production architecture after cutover',
      'false successful empty snapshot is allowed',
      'helper stdout body may be included',
      'helper stderr body may be included',
      'full helper paths may be included',
      'repository paths may be included',
      'mailbox/report text may be included',
      'sidecar/cache/index/raw state contents may be included',
      'hidden runtime state may be included',
      'Go owns state writes',
      'Go owns repository writes',
      'Go owns sidecar/outbox writes',
      'Go owns task/report governance',
      'Go reads mailbox full text',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'run `npm version` to release',
      'run `npm publish` to release',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.19 tmux readiness docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assert.equal(packageJson.version, '0.6.8', 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist for docs-only tmux readiness planning`)
    }
  },
}
