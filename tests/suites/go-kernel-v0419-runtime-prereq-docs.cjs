const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const PREREQ = 'docs/perf/v0.4.19-go-runtime-prerequisites.md'
const LINKING_DOCS = [
  'docs/decisions/0002-module-owned-go-kernel-cutover.md',
  'docs/perf/v0.4.18-go-module-cutover-checklist.md',
  'docs/perf/v0.4.18-tmux-snapshot-parse-cutover.md',
  'docs/perf/v0.4.18-go-cutover-fail-closed-diagnostics.md',
  'docs/agentteam方案书.md',
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

module.exports = {
  name: 'Go kernel v0.4.19 runtime prerequisite docs',
  async run(env) {
    const root = env.helpers.extRoot

    assert.equal(fs.existsSync(path.join(root, PREREQ)), true, `${PREREQ} should exist`)

    const prereq = read(root, PREREQ)
    const linkedDocs = LINKING_DOCS.map(rel => [rel, read(root, rel)])
    const packageJson = JSON.parse(read(root, 'package.json'))

    for (const [rel, source] of linkedDocs) {
      assertIncludes(source, PREREQ, `${rel} should link v0.4.19 runtime prerequisites`)
    }

    for (const expected of [
      'Model A',
      'source-only/manual helper path',
      'pre-cutover only',
      'GitHub-only readiness',
      'Model B',
      'explicit user-provided helper path',
      'experimental/local cutover smoke only',
      'not a packaged/default release path',
      'Model C',
      'native packaging matrix',
      'out of v0.4.19 scope',
      'v0.4.19 endorses Model A',
      'may document Model B as local smoke only',
      'Model C is deferred',
      'no default Go runtime',
      'no shipped Go-owned runtime until runtime availability is solved',
      'fallback deletion is blocked until runtime prerequisite signoff',
      'no package version change',
      '`npm version`',
      '`npm publish`',
      'lifecycle hooks',
      'package lock files',
      '`go.mod`',
      '`go.sum`',
      'checked-in native binaries',
      '`kernel/` package inclusion',
      'TypeScript/pi remains the control plane',
    ]) {
      assertIncludes(prereq, expected, 'runtime prerequisite doc')
    }

    for (const [label, pattern] of [
      ['source-only is pre-cutover', /source-only\/manual helper path[\s\S]{0,240}Pre-cutover only|source-only\/manual helper path[\s\S]{0,240}pre-cutover migration scaffolding/i],
      ['manual helper path stays non-default', /manual helper path[\s\S]{0,240}no default Go runtime|manual helper path[\s\S]{0,240}not a shipped\/default Go runtime/i],
      ['user helper is local only', /explicit user-provided helper path[\s\S]{0,240}experimental\/local cutover smoke only/i],
      ['native packaging deferred', /native packaging matrix[\s\S]{0,240}(?:deferred|out of v0\.4\.19 scope)/i],
      ['fallback deletion blocked', /no TypeScript runtime fallback deletion[\s\S]{0,240}runtime prerequisite signoff|fallback deletion is blocked until runtime prerequisite signoff/i],
      ['no npm release mechanics', /no package version change[\s\S]{0,240}`npm version`[\s\S]{0,240}`npm publish`/i],
      ['no native metadata', /lifecycle hooks[\s\S]{0,240}package lock files[\s\S]{0,240}`go\.mod`[\s\S]{0,240}`go\.sum`[\s\S]{0,240}checked-in native binaries/i],
      ['no kernel package inclusion', /include `kernel\/` in the npm package|`kernel\/` package inclusion/i],
      ['no state/repository writes', /state writes[\s\S]{0,120}repository writes[\s\S]{0,120}sidecar\/outbox writes/i],
      ['no governance full-text movement', /task\/report governance[\s\S]{0,180}full-text boundaries|governance[\s\S]{0,180}full-text/i],
      ['no tmux worker lifecycle movement', /tmux lifecycle[\s\S]{0,180}worker lifecycle|tmux execution[\s\S]{0,180}worker lifecycle/i],
    ]) {
      assertMatches(prereq, pattern, `runtime prerequisite doc: ${label}`)
    }

    const combined = [prereq, ...linkedDocs.map(([, source]) => source)].join('\n\n')
    for (const [label, pattern] of [
      ['linked stop/go gate', /runtime prerequisite signoff[\s\S]{0,220}fallback deletion|fallback deletion[\s\S]{0,220}runtime prerequisite signoff/i],
      ['linked source-only model', /source-only\/manual helper[\s\S]{0,220}pre-cutover|pre-cutover[\s\S]{0,220}source-only\/manual helper/i],
      ['linked local helper model', /explicit user-provided helper path[\s\S]{0,220}local smoke/i],
      ['linked native deferred model', /native packaging[\s\S]{0,220}deferred/i],
    ]) {
      assertMatches(combined, pattern, `linked docs: ${label}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'default Go runtime approved',
      'default Go control plane is approved',
      'native packaging is approved',
      'run `npm version` to release',
      'run `npm publish` to release',
      'delete TypeScript runtime fallback now',
      'fallback deletion is approved without runtime prerequisite signoff',
      'source-only helper is shipped runtime availability',
      'explicit helper path is a packaged/default release path',
      'Go owns state writes',
      'Go owns repository writes',
      'Go owns sidecar/outbox writes',
      'Go owns task/report governance',
      'Go reads mailbox full text',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.19 docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assert.equal(packageJson.version, '0.6.8', 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist for docs-only runtime prerequisite planning`)
    }
  },
}
