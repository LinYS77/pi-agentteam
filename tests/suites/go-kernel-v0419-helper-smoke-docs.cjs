const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const SMOKE = 'docs/perf/v0.4.19-go-helper-smoke-readiness.md'
const PREREQ = 'docs/perf/v0.4.19-go-runtime-prerequisites.md'
const TMUX_READINESS = 'docs/perf/v0.4.19-tmux-snapshot-fail-closed-readiness.md'
const REFRESH_SAFETY = 'docs/perf/v0.4.19-team-refresh-parser-unavailable-safety.md'
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
  name: 'Go kernel v0.4.19 helper smoke readiness docs',
  async run(env) {
    const root = env.helpers.extRoot

    for (const rel of [SMOKE, PREREQ, TMUX_READINESS, REFRESH_SAFETY, PLAN]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const smoke = read(root, SMOKE)
    const prereq = read(root, PREREQ)
    const tmuxReadiness = read(root, TMUX_READINESS)
    const refreshSafety = read(root, REFRESH_SAFETY)
    const plan = read(root, PLAN)
    const packageJson = JSON.parse(read(root, 'package.json'))
    const combined = [smoke, prereq, tmuxReadiness, refreshSafety, plan].join('\n\n')

    for (const [rel, source] of [[PREREQ, prereq], [TMUX_READINESS, tmuxReadiness], [REFRESH_SAFETY, refreshSafety], [PLAN, plan]]) {
      assertIncludes(source, SMOKE, `${rel} should link helper smoke readiness`)
    }

    for (const expected of [
      'source-only',
      'optional local source-only reviewer smokes',
      'Model A',
      'Model B',
      'Not Model C',
      'mktemp /tmp/agentteam-v0419-kernel.XXXXXX',
      'helper="$(mktemp /tmp/agentteam-v0419-kernel.XXXXXX)"',
      '(cd kernel/go/agentteam-kernel && GO111MODULE=off go build -o "$helper" .)',
      'PI_AGENTTEAM_KERNEL=go',
      'PI_AGENTTEAM_KERNEL_HELPER="$helper"',
      'rm -f "$helper"',
      'trap',
      'GO111MODULE=off go run .',
      'GO111MODULE=off go test .',
      'protocolVersion',
      '`1`',
      'helperVersion',
      '`0.3.0-read-model-shadow`',
      '`health`',
      '`profile`',
      '`tmuxSnapshotParse`',
      '`compactReadModelFingerprint`',
      '`businessPathsConnected` is `false`',
      '`kernel.enabled` is `true`',
      '`kernel.fallbacks` is `0`',
      '`parityMatched:true`',
      '`readOnly:true`',
      '`fullTextIncluded:false`',
      '`stateFilesRead:false`',
      '`stateFilesWritten:false`',
      'no runtime `/team` diagnostics',
      'optional-skip/manual-smoke unavailable',
      'not a failure of the default TypeScript runtime',
      'package/native config sanity passed',
      'package.json` version remains `0.6.8`',
      'package.json#files` excludes `kernel/`',
      'no package script',
      'no lifecycle hook',
      'no postinstall/download',
      'no `package-lock.json`',
      '`npm-shrinkwrap.json`',
      '`go.mod`',
      '`go.sum`',
      'checked-in `.exe`, `.dll`, `.so`, `.dylib`',
    ]) {
      assertIncludes(smoke, expected, 'helper smoke readiness doc')
    }

    for (const [label, pattern] of [
      ['temp build command', /helper="\$\(mktemp \/tmp\/agentteam-v0419-kernel\.XXXXXX\)"[\s\S]*GO111MODULE=off go build -o "\$helper" \./i],
      ['explicit helper env', /PI_AGENTTEAM_KERNEL=go[\s\S]{0,120}PI_AGENTTEAM_KERNEL_HELPER="\$helper"/i],
      ['cleanup command', /rm -f "\$helper"[\s\S]{0,120}trap - EXIT/i],
      ['no package/native creep', /Do not check in the binary[\s\S]*add a package script[\s\S]*npm lifecycle hook[\s\S]*postinstall\/download[\s\S]*native packaging/i],
      ['health signals', /protocolVersion[\s\S]{0,80}`1`[\s\S]*helperVersion[\s\S]{0,140}`0\.3\.0-read-model-shadow`[\s\S]*capabilities[\s\S]*`health`[\s\S]*`profile`[\s\S]*`tmuxSnapshotParse`[\s\S]*`compactReadModelFingerprint`[\s\S]*businessPathsConnected[\s\S]{0,80}`false`/i],
      ['bench signals', /kernel\.enabled` is `true`[\s\S]*kernel\.fallbacks` is `0`[\s\S]*parityMatched:true[\s\S]*readOnly:true[\s\S]*fullTextIncluded:false[\s\S]*stateFilesRead:false[\s\S]*stateFilesWritten:false/i],
      ['missing go skip', /go version[\s\S]*optional Go helper smoke skipped[\s\S]*local Go toolchain unavailable[\s\S]*default TypeScript runtime is still valid/i],
      ['package sanity', /pkg\.version !== '0\.6\.8'[\s\S]*package files include kernel[\s\S]*lifecycle scripts present[\s\S]*package-lock\.json[\s\S]*npm-shrinkwrap\.json[\s\S]*go\.mod[\s\S]*go\.sum/i],
      ['native artifact scan', /find \. -type f[\s\S]*'\*\.exe'[\s\S]*'\*\.dll'[\s\S]*'\*\.so'[\s\S]*'\*\.dylib'/i],
      ['review template', /v0\.4\.19 helper smoke readiness[\s\S]*Temp helper path: \/tmp\/agentteam-v0419-kernel\.<suffix>[\s\S]*Package\/native sanity:/i],
      ['non-goals no scripts', /package scripts for helper build[\s\S]*runtime behavior changes[\s\S]*native packaging[\s\S]*`kernel\/` package inclusion/i],
    ]) {
      assertMatches(smoke, pattern, `helper smoke readiness doc: ${label}`)
    }

    for (const [label, pattern] of [
      ['prereq link', /source-only helper smoke commands[\s\S]{0,180}docs\/perf\/v0\.4\.19-go-helper-smoke-readiness\.md/i],
      ['tmux readiness link', /source-only helper smoke readiness[\s\S]{0,180}docs\/perf\/v0\.4\.19-go-helper-smoke-readiness\.md/i],
      ['refresh safety link', /source-only helper smoke\/readiness commands[\s\S]{0,180}docs\/perf\/v0\.4\.19-go-helper-smoke-readiness\.md/i],
      ['plan slice 4', /v0\.4\.19 — Go Helper Smoke Command Normalization[\s\S]*docs\/perf\/v0\.4\.19-go-helper-smoke-readiness\.md/i],
    ]) {
      assertMatches(combined, pattern, `linked docs: ${label}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'default Go runtime approved',
      'Go runtime is required',
      'add package.json script',
      'package script is required',
      'postinstall download is allowed',
      'native packaging is approved',
      'checked-in binary is allowed',
      'run `npm version` to release',
      'run `npm publish` to release',
      'fallback deletion is approved without runtime prerequisite signoff',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go owns state writes',
      'Go owns task/report governance',
      'Go reads mailbox full text',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.19 helper smoke docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assert.equal(packageJson.version, '0.6.8', 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist for docs-only helper smoke planning`)
    }
  },
}
