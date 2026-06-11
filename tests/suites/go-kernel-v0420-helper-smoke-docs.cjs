const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const SMOKE = 'docs/perf/v0.4.20-go-cutover-helper-smoke.md'
const V0419_SMOKE = 'docs/perf/v0.4.19-go-helper-smoke-readiness.md'
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

module.exports = {
  name: 'Go kernel v0.4.20 go-cutover helper smoke docs',
  async run(env) {
    const root = env.helpers.extRoot
    assert.equal(fs.existsSync(path.join(root, SMOKE)), true, `${SMOKE} should exist`)
    assert.equal(fs.existsSync(path.join(root, V0419_SMOKE)), true, `${V0419_SMOKE} should exist`)
    const smoke = read(root, SMOKE)
    const packageJson = JSON.parse(read(root, 'package.json'))

    for (const expected of [
      'source-only',
      'PI_AGENTTEAM_KERNEL=go-cutover',
      'PI_AGENTTEAM_KERNEL_HELPER="$helper"',
      'mktemp /tmp/agentteam-v0420-kernel.XXXXXX',
      'helper="$(mktemp /tmp/agentteam-v0420-kernel.XXXXXX)"',
      'trap \'rm -f "$helper"\' EXIT',
      '(cd kernel/go/agentteam-kernel && GO111MODULE=off go build -o "$helper" .)',
      'printf',
      '"method":"tmuxSnapshotParse"',
      '"capturedAt":1700000000000',
      'node tests/run.cjs',
      'npm run --silent bench:team-panel-tmux',
      'rm -f "$helper"',
      'trap - EXIT',
      'GO111MODULE=off',
      'ok:true',
      'fallbackKind`/`fallbackReason`',
      'compactReadModelFingerprint` remains TypeScript fallback / non-cutover',
      'ok:false',
      'status:"unknown"',
      'resultMarker:"stale"',
      'module:"tmuxSnapshotParse"',
      'capability:"tmuxSnapshotParse"',
      'cutoverFailureKind',
      'TypeScript parser fallback',
      'package/native config sanity passed',
      'package.json` version remains `0.6.8`',
      'package.json#files` excludes `kernel/`',
      'no helper build/download/package script',
      'no `package-lock.json`',
      '`npm-shrinkwrap.json`',
      '`go.mod`',
      '`go.sum`',
      'checked-in `.exe`, `.dll`, `.so`, `.dylib`',
      'Temp helper path: /tmp/agentteam-v0420-kernel.<suffix>; removed after run',
    ]) {
      assertIncludes(smoke, expected, 'v0.4.20 helper smoke doc')
    }

    for (const [label, pattern] of [
      ['tmp build command', /helper="\$\(mktemp \/tmp\/agentteam-v0420-kernel\.XXXXXX\)"[\s\S]*GO111MODULE=off go build -o "\$helper" \./i],
      ['direct helper smoke', /printf '%s\\n'[\s\S]*"method":"tmuxSnapshotParse"[\s\S]*"capturedAt":1700000000000[\s\S]*\| "\$helper"/i],
      ['explicit go-cutover tests', /PI_AGENTTEAM_KERNEL=go-cutover PI_AGENTTEAM_KERNEL_HELPER="\$helper" node tests\/run\.cjs/i],
      ['explicit go-cutover bench', /PI_AGENTTEAM_KERNEL=go-cutover PI_AGENTTEAM_KERNEL_HELPER="\$helper" npm run --silent bench:team-panel-tmux/i],
      ['cleanup', /rm -f "\$helper"[\s\S]*trap - EXIT/i],
      ['success and fail closed', /helper-backed `tmuxSnapshotParse` success[\s\S]*no migration `fallbackKind`[\s\S]*Missing-helper[\s\S]*`ok:false`[\s\S]*`status:"unknown"`[\s\S]*`resultMarker:"stale"/i],
      ['package sanity snippet', /pkg\.version !== '0\.6\.8'[\s\S]*package files include kernel[\s\S]*lifecycle scripts present[\s\S]*package-lock\.json[\s\S]*npm-shrinkwrap\.json[\s\S]*go\.mod[\s\S]*go\.sum/i],
      ['native scan', /find \. -type f[\s\S]*'\*\.exe'[\s\S]*'\*\.dll'[\s\S]*'\*\.so'[\s\S]*'\*\.dylib'/i],
      ['review template', /v0\.4\.20 go-cutover helper smoke validation[\s\S]*Cleanup: rm -f "\$helper" completed; helper path no longer exists/i],
      ['non goals', /does not approve or implement package scripts[\s\S]*native packaging[\s\S]*default Go runtime[\s\S]*TypeScript fallback deletion/i],
    ]) {
      assertMatches(smoke, pattern, `v0.4.20 helper smoke doc: ${label}`)
    }

    for (const forbidden of [
      'Go is default',
      'Go remains default',
      'Go runtime is required',
      'add package.json script',
      'postinstall download is allowed',
      'native packaging is approved',
      'checked-in binary is allowed',
      'run `npm version` to release',
      'run `npm publish` to release',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go owns state writes',
      'Go owns task/report governance',
      'Go reads mailbox full text',
    ]) {
      assert.equal(smoke.includes(forbidden), false, `v0.4.20 helper smoke doc must not imply forbidden policy: ${forbidden}`)
    }

    assert.equal(packageJson.version, EXPECTED_VERSION, 'package version must remain unchanged')
    assert.equal((packageJson.files || []).some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'kernel source must not be packaged')
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'postpublish']) {
      assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `package must not define ${lifecycle}`)
    }
    for (const rel of ['package-lock.json', 'npm-shrinkwrap.json', 'go.mod', 'go.sum', 'kernel/go/agentteam-kernel/go.mod', 'kernel/go/agentteam-kernel/go.sum']) {
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must not exist for v0.4.20 helper smoke docs`)
    }
  },
}
