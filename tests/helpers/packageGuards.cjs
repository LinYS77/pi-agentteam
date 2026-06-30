const assert = require('node:assert/strict')
const { existsRel, readJsonRel } = require('./fsAssertions.cjs')

const PACKAGE_VERSION = '0.6.8'
const DEFAULT_PACKAGE_FILE = 'package.json'
const DEFAULT_PACKAGE_LIFECYCLE_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepublish',
  'prepublishOnly',
  'publish',
  'postpublish',
  'prepack',
  'postpack',
]
const DEFAULT_FORBIDDEN_ROOT_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
  '.agentteam-artifacts',
]
const RELEASE_MECHANICS_SCRIPT_RE = /\b(?:npm\s+(?:publish|version)|gh\s+release|git\s+(?:tag|push)|cosign\b|slsa\b)/i

function readPackageJson(root, packageRel = DEFAULT_PACKAGE_FILE) {
  return readJsonRel(root, packageRel)
}

function assertPackageVersion(root, expectedVersion = PACKAGE_VERSION, packageRel = DEFAULT_PACKAGE_FILE) {
  const packageJson = readPackageJson(root, packageRel)
  assert.equal(packageJson.version, expectedVersion, `${packageRel} version should remain ${expectedVersion}`)
  return packageJson
}

function assertNoPackageLifecycleScripts(packageJson, lifecycleScripts = DEFAULT_PACKAGE_LIFECYCLE_SCRIPTS, label = 'package') {
  for (const lifecycle of lifecycleScripts) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle), false, `${label} must not define ${lifecycle}`)
  }
}

function assertNoOptionalNativeDependencyFlow(packageJson, label = 'package') {
  assert.equal(packageJson.optionalDependencies, undefined, `${label} must not define optional native dependencies`)
  assert.equal(packageJson.bundleDependencies, undefined, `${label} must not bundle dependencies`)
  assert.equal(packageJson.bundledDependencies, undefined, `${label} must not bundle dependencies`)
  assert.equal(packageJson.bin, undefined, `${label} must not expose a binary entrypoint`)
}

function assertNoForbiddenRootFiles(root, forbiddenRootFiles = DEFAULT_FORBIDDEN_ROOT_FILES) {
  for (const rel of forbiddenRootFiles) assert.equal(existsRel(root, rel), false, `${rel} must not exist`)
}

function assertNoReleaseMechanicsScripts(packageJson, label = 'package') {
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const source = String(command || '')
    assert.equal(RELEASE_MECHANICS_SCRIPT_RE.test(source), false, `${label} script ${name} must not run release mechanics`)
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(source)
    assert.equal(/\bnpm\s+pack\b/.test(source) && !packAllowed, false, `${label} script ${name} must not pack except dry-run release check`)
  }
}

function assertPackageNoReleaseGuards(root, options = {}) {
  const packageRel = options.packageRel || DEFAULT_PACKAGE_FILE
  const expectedVersion = options.expectedVersion || PACKAGE_VERSION
  const label = options.label || packageRel
  const packageJson = assertPackageVersion(root, expectedVersion, packageRel)

  if (options.expectedPiExtensions) assert.deepEqual(packageJson.pi?.extensions, options.expectedPiExtensions, `${label} pi.extensions should remain unchanged`)
  assertNoOptionalNativeDependencyFlow(packageJson, label)
  assertNoPackageLifecycleScripts(packageJson, options.lifecycleScripts || DEFAULT_PACKAGE_LIFECYCLE_SCRIPTS, label)
  assertNoReleaseMechanicsScripts(packageJson, label)
  assertNoForbiddenRootFiles(root, options.forbiddenRootFiles || DEFAULT_FORBIDDEN_ROOT_FILES)
  return packageJson
}

module.exports = {
  PACKAGE_VERSION,
  DEFAULT_PACKAGE_FILE,
  DEFAULT_PACKAGE_LIFECYCLE_SCRIPTS,
  DEFAULT_FORBIDDEN_ROOT_FILES,
  RELEASE_MECHANICS_SCRIPT_RE,
  readPackageJson,
  assertPackageVersion,
  assertNoPackageLifecycleScripts,
  assertNoOptionalNativeDependencyFlow,
  assertNoForbiddenRootFiles,
  assertNoReleaseMechanicsScripts,
  assertPackageNoReleaseGuards,
}
