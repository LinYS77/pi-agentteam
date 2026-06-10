const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ADR = 'docs/decisions/0002-module-owned-go-kernel-cutover.md'
const CHECKLIST = 'docs/perf/v0.4.18-go-module-cutover-checklist.md'
const TMUX_CUTOVER = 'docs/perf/v0.4.18-tmux-snapshot-parse-cutover.md'
const DIAGNOSTICS = 'docs/perf/v0.4.18-go-cutover-fail-closed-diagnostics.md'
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

function extractSection(source, startHeading, nextHeadingPattern) {
  const start = source.indexOf(startHeading)
  assert.notEqual(start, -1, `section should include heading ${startHeading}`)
  const rest = source.slice(start)
  const next = rest.slice(startHeading.length).search(nextHeadingPattern)
  if (next === -1) return rest
  return rest.slice(0, startHeading.length + next)
}

module.exports = {
  name: 'Go kernel v0.4.18 cutover docs',
  async run(env) {
    const root = env.helpers.extRoot

    for (const rel of [ADR, CHECKLIST, TMUX_CUTOVER, DIAGNOSTICS, PLAN]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const adr = read(root, ADR)
    const checklist = read(root, CHECKLIST)
    const tmuxCutover = read(root, TMUX_CUTOVER)
    const diagnostics = read(root, DIAGNOSTICS)
    const plan = read(root, PLAN)
    const packageJson = JSON.parse(read(root, 'package.json'))
    const v0418Plan = extractSection(plan, '### v0.4.18 — Go Kernel Cutover Strategy & Fallback Deletion Plan', /\n### /)
    const combined = [adr, checklist, tmuxCutover, diagnostics, v0418Plan].join('\n\n')

    assertIncludes(v0418Plan, ADR, 'v0.4.18 plan section')
    assertIncludes(v0418Plan, CHECKLIST, 'v0.4.18 plan section')
    assertIncludes(v0418Plan, TMUX_CUTOVER, 'v0.4.18 plan section')
    assertIncludes(v0418Plan, DIAGNOSTICS, 'v0.4.18 plan section')
    assertIncludes(adr, CHECKLIST, 'cutover ADR')
    assertIncludes(adr, DIAGNOSTICS, 'cutover ADR')
    assertIncludes(checklist, ADR, 'module cutover checklist')
    assertIncludes(checklist, TMUX_CUTOVER, 'module cutover checklist')
    assertIncludes(checklist, DIAGNOSTICS, 'module cutover checklist')
    assertIncludes(tmuxCutover, DIAGNOSTICS, 'tmuxSnapshotParse cutover plan')

    for (const [label, pattern] of [
      ['migration scaffolding', /migration scaffolding/i],
      ['pre-cutover fallback', /pre-cutover|cutover 前/i],
      ['module-owned Go', /module-owned Go|Go-owned/i],
      ['cutover gate', /cutover gate/i],
      ['TypeScript runtime fallback deletion', /TypeScript runtime fallback deletion|fallback deletion plan/i],
      ['fail-closed diagnostics', /fail(?:s)? closed[\s\S]{0,160}diagnostic|fail-closed diagnostic/i],
      ['release rollback by tag/version', /GitHub tag\/npm version|corrected npm version/i],
      ['no hidden runtime fallback', /hidden (?:TypeScript )?runtime fallback/i],
      ['no long-term dual runtime fallback', /long-term dual-runtime ambiguity|不长期保留 TS\/Go 双 runtime fallback/i],
    ]) {
      assertMatches(combined, pattern, label)
    }

    assertMatches(combined, /fallback (?:is|behavior remains) (?:transitional migration tooling|migration scaffolding|pre-cutover migration)/i, 'fallback posture')
    assertMatches(combined, /post-cutover[\s\S]{0,160}fail(?:s)? closed|After cutover[\s\S]{0,160}fail closed/i, 'post-cutover fail-closed posture')
    assertMatches(combined, /release rollback[\s\S]{0,160}GitHub tag\/npm version|GitHub tag\/npm version[\s\S]{0,160}rollback/i, 'release rollback posture')
    assertMatches(combined, /not (?:a )?(?:whole-product|whole Go|whole-product Go) rewrite|whole-product Go rewrite|whole Go rewrite/i, 'whole-product rewrite non-goal')
    assertMatches(combined, /not (?:through|by) (?:a )?hidden (?:TypeScript )?runtime fallback|no hidden runtime fallback/i, 'hidden fallback non-goal')

    for (const [label, pattern] of [
      ['TypeScript control plane', /TypeScript\/pi remains (?:the )?control plane|TypeScript remains responsible/i],
      ['pi extension loading', /pi extension loading/i],
      ['no whole-product rewrite', /whole-product Go rewrite|whole Go rewrite/i],
      ['no Go control plane', /Go control plane/i],
      ['no native packaging', /native (?:binary )?packaging|native artifacts/i],
      ['no package version or npm publish/version', /package\.json` version|`npm version`|`npm publish`/i],
      ['no go modules', /`go\.mod`[\s\S]{0,80}`go\.sum`|`go\.sum`/i],
      ['no state writes', /state writes/i],
      ['no repository writes', /repository writes/i],
      ['no sidecar/outbox writes', /sidecar\/outbox writes/i],
      ['no task/report governance movement', /task\/report governance/i],
      ['no PlanRun movement', /PlanRun/i],
      ['no full-text movement', /full-text boundaries/i],
      ['no tmux lifecycle ownership', /tmux lifecycle/i],
      ['no worker lifecycle ownership', /worker lifecycle/i],
      ['no package/release control', /package\/release control/i],
    ]) {
      assertMatches(combined, pattern, `v0.4.18 boundary docs: ${label}`)
    }

    for (const candidate of [
      '`tmuxSnapshotParse`',
      '`compactReadModelFingerprint`',
      'state/sidecar/outbox writes',
      'First recommended candidate',
      'Second candidate only',
      'Deferred',
    ]) {
      assertIncludes(checklist, candidate, 'module cutover checklist candidates')
    }

    for (const gate of [
      '**Parity:**',
      '**Failure coverage:**',
      '**Fail-closed behavior:**',
      '**Fallback deletion:**',
      '**Performance/smoke:**',
      '**Boundary scans:**',
      '**Rollback:**',
      '**Review signoff:**',
    ]) {
      assertIncludes(checklist, gate, 'module cutover checklist gate')
    }

    for (const phrase of [
      'first recommended Go-owned module candidate',
      'Parse TypeScript-captured tmux snapshot stdout',
      'Running and capturing tmux commands',
      'Pane creation, pane labels, pane/window lifecycle',
      '`/team` rendering',
      'Parity corpus',
      'Helper health/protocol',
      'Failure coverage',
      'Boundary scans',
      'Package/native sanity',
      'Rollback text',
      'Reviewer signoff',
      'Empty stdout',
      'Trailing newline and CRLF',
      'Malformed rows',
      'Empty pane id rows',
      'Empty label and empty current command',
      'Duplicate pane ids preserve first-seen `panes` order and last-seen field values',
      'Extra tab fields after `currentCommand` are ignored',
      'Unicode labels and commands',
      '`panes` order and `byPaneId` contents stay consistent',
      'unknown/stale snapshot condition',
      'not proof that panes disappeared',
      'must not destructively update worker or pane state',
      'must not mark workers error or force reconcile',
      '`tmux/snapshot.ts`',
      '`core/kernel.ts`',
      'Do not delete these paths in v0.4.18 Slice E',
      'node tests/run.cjs',
      'npm run --silent bench:team-panel-tmux',
      'GO111MODULE=off go run .',
      'GO111MODULE=off go test .',
    ]) {
      assertIncludes(tmuxCutover, phrase, 'tmuxSnapshotParse cutover plan')
    }

    for (const [label, pattern] of [
      ['no Go tmux execution', /Go must not execute tmux|Go tmux execution/i],
      ['no state writes', /Go state writes|state writes/i],
      ['no governance movement', /task\/report governance|governance\/full-text/i],
      ['no package control', /package\/release control|npm package metadata/i],
      ['no native packaging', /native packaging/i],
      ['do not delete fallback yet', /does not delete the TypeScript runtime fallback|Do not delete these paths/i],
    ]) {
      assertMatches(tmuxCutover, pattern, `tmuxSnapshotParse cutover boundary: ${label}`)
    }

    for (const phrase of [
      'pre-cutover',
      'fail-open to TypeScript is allowed',
      'Post-cutover',
      'fail-closed with compact diagnostics',
      'No silent TypeScript runtime fallback',
      '`module`',
      '`capability`',
      '`status`',
      '`cutoverFailureKind`',
      '`reason`',
      '`expectedProtocolVersion`',
      '`expectedHelperVersion`',
      '`rollbackPointer`',
      '`resultMarker`',
      '`missing-helper`',
      '`disabled-helper`',
      '`helper-unsupported-protocol`',
      '`helper-unsupported-version`',
      '`helper-unsupported-capability`',
      '`helper-timeout`',
      '`helper-spawn-error`',
      '`helper-crash`',
      '`helper-nonzero-exit`',
      '`helper-malformed-json`',
      '`helper-jsonrpc-error`',
      '`helper-incompatible-response`',
      '`helper-unsafe-response-shape`',
      '`previous-helper-failure`',
      'helper stdout/stderr bodies',
      'full helper paths',
      'repository paths',
      'mailbox/report full text',
      'sidecar/cache/index contents',
      'hidden runtime state',
      'raw state files',
      'Runtime `/team` must not become noisy',
      'Bench, docs, tests, and debug-only contexts',
      'safe unavailable/unknown result marker',
      'unknown/stale snapshot condition',
      'GitHub tag/npm version',
      'corrected npm version',
      'Hidden TypeScript production fallback after cutover is forbidden',
      'This contract does not approve or implement',
      '`npm version`',
      '`npm publish`',
      '`go.mod`',
      '`go.sum`',
    ]) {
      assertIncludes(diagnostics, phrase, 'fail-closed diagnostics contract')
    }

    for (const [label, pattern] of [
      ['operation classes', /Migration read-only\/parser helper[\s\S]*Pre-cutover[\s\S]*fail-open to TypeScript[\s\S]*Go-owned module runtime[\s\S]*Post-cutover[\s\S]*fail-closed/i],
      ['safe unavailable status', /status[\s\S]*`unavailable`[\s\S]*`unknown`/i],
      ['rollback pointer', /rollbackPointer[\s\S]*GitHub tag\/npm version[\s\S]*corrected npm version/i],
      ['tmux unknown stale', /tmuxSnapshotParse[\s\S]*unknown\/stale[\s\S]*not pane loss/i],
      ['no runtime implementation', /does not approve or implement[\s\S]*runtime diagnostic rendering/i],
      ['no native package changes', /package version changes[\s\S]*native packaging[\s\S]*`go\.mod`[\s\S]*`go\.sum`/i],
    ]) {
      assertMatches(diagnostics, pattern, `fail-closed diagnostics policy: ${label}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'default Go control plane is approved',
      'whole-product Go rewrite is approved',
      'keep long-term dual TS/Go runtime fallback',
      'hidden TypeScript production fallback after cutover is allowed',
      'run `npm version` to release',
      'run `npm publish` to release',
      'native packaging is approved',
      'Go owns state writes',
      'Go owns task/report governance',
      'Go reads mailbox full text',
      'Go owns tmux lifecycle',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.18 docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assert.equal(packageJson.version, '0.6.8', 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist for docs-only cutover planning`)
    }
  },
}
