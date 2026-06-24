const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.6.38-true-operator-manual-rc-pass-evidence.md'
const PACKAGE_VERSION = '0.6.8'

const REQUIRED_DOC = [
  '# v0.6.38 True Operator Manual RC Pass Evidence',
  'Result: **pass with one optional limitation**.',
  'true `pi` TUI/operator/model manual RC smoke',
  'clean temporary `PI_AGENTTEAM_HOME`',
  'pi --no-extensions --extension ./index.ts --session-dir "$PI_AGENTTEAM_HOME/pi-sessions"',
  'one tool at a time, terse natural-language `Parameters:` prompts',
  'No prompt used JSON-call wording',
  'Unsafe name rejection',
  'Spawn researcher',
  'Spawn planner',
  'Spawn implementer',
  'Worker receive full-text boundary',
  'Worker `report_done` report-only',
  'Worker `report_blocked` report-only',
  '`/team` TUI + direct `r` refresh',
  'PlanRun approve',
  'PlanRun advance',
  'PlanRun leader close/final advance',
  'PlanRun cancel',
  'optional not covered',
  'No raw logs, screenshots, state archives, worker transcripts, full mailbox bodies, full report bodies',
  'No raw logs, screenshots, state archives, worker transcripts, full mailbox bodies, full report bodies, provider response identifiers, raw tool-call identifiers, package artifacts, native artifacts, release assets, tags, pushes, `npm version`, `npm publish`, `package.json` edits, default-Go/native/fallback deletion work, or force-added ignored files were created.',
]

const FORBIDDEN_RAW_MARKERS = [
  'responseId',
  'call_',
  'MailboxMessage.text',
  'TaskReport.text',
  'FULL_BODY_SENTINEL',
  'PROFILE_FULL_BODY_SENTINEL',
  'V0638_RC_FULL_TEXT_SENTINEL_DO_NOT_LEAK',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
]

const FORBIDDEN_OVERCLAIMS = [
  'v0.7 release-ready approval is granted',
  'v0.7 is release-ready',
  'release can ship',
  'ready for release',
  'all p95 gates pass',
  'all p95 gates passed',
  'PlanRun cancel passed',
  'npm version completed',
  'npm publish completed',
  'tag was created',
  'tag was pushed',
  'default Go is enabled',
  'native helper delivery is complete',
  'fallback deletion is approved',
]

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
}

function assertIncludes(source, expected, label) {
  assert.ok(source.includes(expected), `${label} should include ${expected}`)
}

function assertDoc(root) {
  assert.equal(exists(root, DOC), true, `${DOC} should exist`)
  const doc = read(root, DOC)
  for (const expected of REQUIRED_DOC) assertIncludes(doc, expected, DOC)
  for (const forbidden of FORBIDDEN_RAW_MARKERS) assert.equal(doc.includes(forbidden), false, `${DOC} must not include raw marker: ${forbidden}`)
  for (const forbidden of FORBIDDEN_OVERCLAIMS) assert.equal(doc.includes(forbidden), false, `${DOC} must not overclaim: ${forbidden}`)
  assert.match(doc, /Result: \*\*pass with one optional limitation\*\*\./)
  assert.match(doc, /Optional PlanRun `cancel` did not execute after bounded retries/i)
  assert.match(doc, /not a blocker for the main RC pass/i)
  assert.match(doc, /exact local temp paths are also omitted/i)
  assert.equal(/\/tmp\/pi-agentteam-[^`\s]*\.[A-Za-z0-9]{8,}/.test(doc), false, `${DOC} must not include concrete temp dirs`)
  assert.equal(/ready:true|release-ready approval|manual RC evidence proves v0\.7 readiness/i.test(doc), false, `${DOC} must not claim release readiness`)
}

function assertGitignoreAllowsOnlyPassEvidence(root) {
  const gitignore = read(root, '.gitignore')
  assertIncludes(gitignore, `!${DOC}`, '.gitignore')
  assert.equal(gitignore.includes('!docs/perf/v0.6.38-true-operator-manual-rc-evidence.md'), false, 'blocked true-operator evidence should remain ignored by default')
}

function assertPackageInvariant(root) {
  const packageJson = JSON.parse(read(root, 'package.json'))
  assert.equal(packageJson.version, PACKAGE_VERSION)
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'])
}

module.exports = {
  name: 'Go kernel v0.6.38 true operator manual RC evidence',
  async run(env) {
    const root = env.helpers.extRoot
    assertDoc(root)
    assertGitignoreAllowsOnlyPassEvidence(root)
    assertPackageInvariant(root)
  },
}
