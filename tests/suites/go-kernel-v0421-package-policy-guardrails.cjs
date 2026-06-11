const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DOC = 'docs/perf/v0.4.21-go-package-policy-guardrails.md'
const AVAILABILITY = 'docs/perf/v0.4.21-go-runtime-availability.md'
const ARTIFACT = 'docs/perf/v0.4.21-go-native-artifact-contract.md'
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
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson, 'optionalDependencies'), false, 'package must not define optional native companion dependencies yet')
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
    .filter(file => /\.(?:exe|dll|so|dylib)$/i.test(file))
    .map(file => path.relative(root, file).replace(/\\/g, '/'))
  assert.deepEqual(nativeArtifacts, [], 'native artifacts must not be checked in')
}

module.exports = {
  name: 'Go kernel v0.4.21 package policy guardrails',
  async run(env) {
    const root = env.helpers.extRoot
    for (const rel of [DOC, AVAILABILITY, ARTIFACT, PLAN]) {
      assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} should exist`)
    }

    const doc = read(root, DOC)
    const plan = read(root, PLAN)
    const combined = [doc, plan].join('\n\n')

    assertIncludes(doc, AVAILABILITY, 'package policy should link Slice 1 availability doc')
    assertIncludes(doc, ARTIFACT, 'package policy should link Slice 2 native artifact doc')
    assertIncludes(plan, DOC, 'plan should reference package policy doc')

    for (const expected of [
      'v0.4.21 Go Package Policy Guardrails',
      'Slice 3 docs/tests policy only',
      'does not change `package.json`',
      'add package metadata',
      'add package scripts',
      'add native artifacts',
      'include `kernel/` in the package',
      'implement a resolver',
      'run `npm version`',
      'run `npm publish`',
      'approve native packaging',
      'make Go default',
      'delete the TypeScript parser fallback',
      'docs/perf/v0.4.21-go-runtime-availability.md',
      'docs/perf/v0.4.21-go-native-artifact-contract.md',
      'Package behavior remains unchanged until a future Model C package implementation slice',
      'package.json` version remains `0.6.8`',
      'package.json#files` excludes `kernel/`',
      'no lifecycle hooks',
      'preinstall',
      'install',
      'postinstall',
      'prepare',
      'prepublish',
      'prepublishOnly',
      'publish',
      'postpublish',
      'no helper build/install/download/package/version/publish scripts',
      'no `package-lock.json`',
      'no `npm-shrinkwrap.json`',
      'no root `go.mod`',
      'no root `go.sum`',
      'no helper `kernel/go/agentteam-kernel/go.mod`',
      'no helper `kernel/go/agentteam-kernel/go.sum`',
      'no checked-in `.exe`, `.dll`, `.so`, `.dylib`, or helper artifact',
      'no `optionalDependencies` for native companion packages yet',
      'no native companion package metadata yet',
      'no package resolver path for generated native artifacts yet',
      'no package inclusion for generated helper artifacts yet',
      'Future Package Slice Change-Control',
      'optionalDependencies` or equivalent metadata',
      'package.json#files` entries for generated release artifacts',
      'resolver path rules for installed/generated helpers',
      'checksum manifests',
      'CI artifact production',
      'npm pack --dry-run --ignore-scripts',
      'clean install smokes from package artifacts',
      'explicit owner slice and leader approval',
      'docs guard',
      'package/native sanity update',
      'rollback story',
      'no hidden lifecycle/download/build behavior',
      'Prohibited-by-Default Patterns',
      'postinstall/preinstall/prepare downloads',
      'install-time `go build`',
      'checked-in generated binaries in the source repo',
      'implicit network fetch',
      'default Go enablement',
      'TypeScript parser fallback deletion',
      'broadening Go authority',
      'Package Sanity Checklist',
      'scripts scan for `npm version` or `npm publish`',
      'scripts scan for `go build` or `go install`',
      'scripts scan for `curl`, `wget`, `node-gyp`, or `prebuild`',
      'scripts scan for `kernel/` package/publish/file operations',
      'package files check excludes `kernel/`',
      'native artifact scan excludes `node_modules` and `.git`',
      'lock/go module existence check',
      'Relationship to Slices 1 and 2',
      'No future Model C package implementation may proceed',
      'STOP v0.4.21 package/native work',
      'optionalDependencies` or native companion package metadata is added',
      'lifecycle hook is added',
      'helper build/install/download/package/version/publish script is added',
      'postinstall/preinstall/prepare download appears',
      'install-time `go build` appears',
      'default Go enablement appears',
      'TypeScript parser fallback deletion appears',
      'Go authority broadens beyond parser-only stdin/stdout `tmuxSnapshotParse`',
    ]) {
      assertIncludes(doc, expected, 'package policy doc')
    }

    for (const [label, pattern] of [
      ['scope', /Slice 3 docs\/tests policy only[\s\S]*does not change `package\.json`[\s\S]*add package scripts[\s\S]*add native artifacts[\s\S]*include `kernel\/` in the package[\s\S]*implement a resolver[\s\S]*run `npm version`[\s\S]*run `npm publish`/i],
      ['frozen policy', /package\.json` version remains `0\.6\.8`[\s\S]*package\.json#files` excludes `kernel\/`[\s\S]*no lifecycle hooks[\s\S]*preinstall[\s\S]*postinstall[\s\S]*prepare[\s\S]*prepublishOnly[\s\S]*postpublish[\s\S]*no helper build\/install\/download\/package\/version\/publish scripts[\s\S]*no `package-lock\.json`[\s\S]*no `npm-shrinkwrap\.json`[\s\S]*no root `go\.mod`[\s\S]*no helper `kernel\/go\/agentteam-kernel\/go\.sum`[\s\S]*no checked-in `\.exe`, `\.dll`, `\.so`, `\.dylib`[\s\S]*no `optionalDependencies`/i],
      ['future change control', /Future Package Slice Change-Control[\s\S]*optionalDependencies` or equivalent metadata[\s\S]*package\.json#files` entries[\s\S]*resolver path rules[\s\S]*checksum manifests[\s\S]*CI artifact production[\s\S]*npm pack --dry-run --ignore-scripts[\s\S]*clean install smokes[\s\S]*explicit owner slice and leader approval[\s\S]*docs guard[\s\S]*package\/native sanity update[\s\S]*rollback story/i],
      ['prohibited patterns', /Prohibited-by-Default Patterns[\s\S]*postinstall\/preinstall\/prepare downloads[\s\S]*install-time `go build`[\s\S]*checked-in generated binaries[\s\S]*implicit network fetch[\s\S]*default Go enablement[\s\S]*TypeScript parser fallback deletion[\s\S]*broadening Go authority/i],
      ['sanity script', /npm\\s\+\(\?:version\|publish\)[\s\S]*go\\s\+\(\?:build\|install\)[\s\S]*curl\\b\|wget\\b\|node-gyp\\b\|prebuild[\s\S]*kernel\\\/.*pack\|publish\|files\|npm[\s\S]*package-lock\.json[\s\S]*npm-shrinkwrap\.json[\s\S]*go\.mod[\s\S]*go\.sum[\s\S]*find \. -type f/i],
      ['relationship', /Slice 1 availability decision[\s\S]*Slice 2 native artifact contract[\s\S]*Slice 3 freezes current package behavior[\s\S]*No future Model C package implementation may proceed/i],
      ['stop conditions', /STOP v0\.4\.21 package\/native work[\s\S]*package\.json` version changes from `0\.6\.8`[\s\S]*package\.json#files` includes `kernel\/`[\s\S]*optionalDependencies[\s\S]*lifecycle hook is added[\s\S]*helper build\/install\/download\/package\/version\/publish script[\s\S]*package-lock\.json[\s\S]*go\.mod[\s\S]*checked-in `\.exe`[\s\S]*postinstall\/preinstall\/prepare download[\s\S]*install-time `go build`[\s\S]*default Go enablement[\s\S]*TypeScript parser fallback deletion/i],
    ]) {
      assertMatches(doc, pattern, `package policy doc: ${label}`)
    }

    for (const forbiddenPhrase of [
      'Go is default',
      'Go remains default',
      'Go runtime is required',
      'native packaging is approved',
      'native implementation is approved',
      'checked-in binary is allowed',
      'postinstall download is allowed',
      'preinstall download is allowed',
      'prepare download is allowed',
      'install-time Go build is allowed',
      'run `npm version` to release',
      'run `npm publish` to release',
      'fallback deletion is approved',
      'delete the TypeScript fallback now',
      'commit/tag/push as part of this checkpoint',
      'compactReadModelFingerprint becomes cutover-owned',
      'Go owns tmux lifecycle',
      'Go owns worker lifecycle',
      'Go owns state writes',
      'Go owns task/report governance',
      'Go reads mailbox full text',
    ]) {
      assert.equal(combined.includes(forbiddenPhrase), false, `v0.4.21 package policy docs must not imply forbidden policy: ${forbiddenPhrase}`)
    }

    assertPackageNativeSanity(root)
  },
}
