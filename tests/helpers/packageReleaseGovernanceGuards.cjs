const assert = require('node:assert/strict')
const {
  assertIncludes,
  existsRel,
  readRel,
} = require('./fsAssertions.cjs')
const {
  APPROVED_NATIVE_ROOT,
  assertNoRawOrReleaseArtifacts,
} = require('./nativeGuards.cjs')
const {
  assertPackageNoReleaseGuards,
  PACKAGE_VERSION,
} = require('./packageGuards.cjs')
const {
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior,
  assertWorkflowContract,
  readWorkflow,
  workflowFiles,
} = require('./reviewArtifactWorkflowGuard.cjs')
const {
  assertNoBridgeTerminalTransport,
  parseGoCapabilities,
  sourceWithoutLineComments,
} = require('./goKernelGuards.cjs')
const {
  BLOCKED,
  DEFAULT_GO_BLOCKER_IDS,
  defaultGoReadinessLedger,
} = require('../fixtures/kernel/v0636/defaultGoReadinessLedger.cjs')

const CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_HELPER = 'tests/helpers/packageReleaseGovernanceGuards.cjs'
const CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_SUITE = 'tests/suites/go-kernel-v0643-package-release-governance-remap.cjs'

const CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORIES = Object.freeze([
  'package-version-frozen',
  'npm-release-mechanics-forbidden',
  'git-github-release-mechanics-forbidden',
  'signing-slsa-release-assets-forbidden',
  'lifecycle-download-install-build-forbidden',
  'optional-native-dependency-binary-metadata-forbidden',
  'package-files-kernel-native-generated-broadening-forbidden',
  'raw-release-hosted-artifacts-forbidden',
  'review-workflow-review-only-non-release',
  'package-release-default-native-fallback-gates-unapproved',
  'typescript-pi-facade-worker-delivery-read-boundary-preserved',
])

const CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORY_DESCRIPTIONS = Object.freeze({
  'package-version-frozen': 'package.json remains 0.6.8 and the pi extension package identity stays unchanged.',
  'npm-release-mechanics-forbidden': 'package scripts cannot run npm version/publish or non-dry-run package publishing mechanics.',
  'git-github-release-mechanics-forbidden': 'package scripts and review workflow cannot create tags, push release refs, or invoke GitHub release mechanics.',
  'signing-slsa-release-assets-forbidden': 'package scripts, workflows, package files, and repo artifacts cannot introduce signing, cosign, SLSA, release assets, or signing material.',
  'lifecycle-download-install-build-forbidden': 'package lifecycle hooks, postinstall/preinstall downloads, install-time Go build/install/mod, node-gyp, prebuild, curl, and wget flows stay absent.',
  'optional-native-dependency-binary-metadata-forbidden': 'optional/bundled native dependencies, binary entrypoints, native helper metadata, os/cpu native package metadata, and native provider metadata stay absent.',
  'package-files-kernel-native-generated-broadening-forbidden': 'package.json#files does not broaden to kernel, scripts, workflows, docs/tests, generated artifacts, or native paths outside the approved embedded helper files.',
  'raw-release-hosted-artifacts-forbidden': 'raw evidence, hosted/release records, archives, signatures, release bundles, and unapproved generated artifacts are not checked in.',
  'review-workflow-review-only-non-release': 'the only GitHub workflow remains the bounded review-artifact workflow; review artifact upload is not release upload, not hosted release evidence, and not package/default availability.',
  'package-release-default-native-fallback-gates-unapproved': 'default Go, default resolver, normal-user native availability, package release, signing, second-platform support, and TypeScript fallback deletion gates remain blocked and non-waivable by repo state alone.',
  'typescript-pi-facade-worker-delivery-read-boundary-preserved': 'the package remains a TypeScript pi extension facade; worker delivery remains bridge-only, and full text remains behind explicit receive/read-boundary APIs.',
})

const APPROVED_EMBEDDED_NATIVE_FILES = Object.freeze([
  `${APPROVED_NATIVE_ROOT}/agentteam-tmuxSnapshotParse`,
  `${APPROVED_NATIVE_ROOT}/manifest.json`,
  `${APPROVED_NATIVE_ROOT}/SHA256SUMS`,
  `${APPROVED_NATIVE_ROOT}/provenance.json`,
  `${APPROVED_NATIVE_ROOT}/LICENSE`,
  `${APPROVED_NATIVE_ROOT}/license.json`,
  `${APPROVED_NATIVE_ROOT}/attestation.intoto.jsonl`,
])

const FORBIDDEN_PACKAGE_METADATA_KEYS = Object.freeze([
  'agentteamGoHelper',
  'binary',
  'cpu',
  'native',
  'nativeHelper',
  'os',
])

const FORBIDDEN_SCRIPT_MECHANICS = Object.freeze([
  ['npm version', /\bnpm\s+version\b/i],
  ['npm publish', /\bnpm\s+publish\b/i],
  ['GitHub release', /\bgh\s+release\b/i],
  ['git tag', /\bgit\s+tag\b/i],
  ['git push', /\bgit\s+push\b/i],
  ['cosign', /\bcosign\b/i],
  ['SLSA', /\bslsa\b/i],
  ['release asset upload', /\brelease[- ]asset\b|upload-release-asset|action-gh-release/i],
  ['go build/install/mod', /\bgo\s+(?:build|install|mod)\b/i],
  ['download tools', /\bcurl\b|\bwget\b/i],
  ['native build tools', /\bnode-gyp\b|\bprebuild\b/i],
  ['install-time native flow', /postinstall|preinstall|install-time build|package-manager native/i],
])

const FORBIDDEN_PACKAGE_FILE_ENTRY = /(?:^|\/)(?:\.github|docs|tests|fixtures|scripts|kernel)(?:\/|$)|(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|go\.mod|go\.sum)$|(?:native-helper|go-helper|artifact|bundle|checksum|provenance|attestation|hosted-observation|raw-record|release-asset|release-bundle|signing|cosign|slsa|platform-matrix|downloaded|generated)|\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig|asc|spdx|sbom)$/i

const FORBIDDEN_WORKFLOW_RELEASE_MECHANICS = Object.freeze([
  ['GitHub release action', /softprops\/action-gh-release|ncipollo\/release-action|actions\/upload-release-asset/i],
  ['GitHub release CLI', /\bgh\s+release\b/i],
  ['git tag/push', /\bgit\s+(?:tag|push)\b/i],
  ['npm release', /\bnpm\s+(?:version|publish|pack)\b/i],
  ['signing/cosign/SLSA', /\bcosign\b|\bslsa\b|sigstore|signing material/i],
  ['release permissions', /(?:contents|packages|id-token|attestations):\s*write/i],
  ['hosted release claim', /hosted release|release asset|release upload|published package/i],
])

const FORBIDDEN_GO_CAPABILITY_RE = /(?:package|release|publish|sign|slsa|mailbox|report|planrun|fulltext|defaultgo|fallback)/i
const FORBIDDEN_GO_RELEASE_CONTROL_RE = /npm\s+(?:publish|version|pack)|gh\s+release|git\s+(?:tag|push)|cosign|slsa|release asset|package-manager native delivery|normal-user native availability|fallback deletion|agentteam_receive|report_done|report_blocked|renderPanel/i

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function normalizePackageFileEntry(entry) {
  return String(entry || '').replace(/\\/g, '/').replace(/^\.\//, '')
}

function isNegatedPackageEntry(entry) {
  return normalizePackageFileEntry(entry).startsWith('!')
}

function unnegatedPackageEntry(entry) {
  const normalized = normalizePackageFileEntry(entry)
  return normalized.startsWith('!') ? normalized.slice(1).replace(/^\//, '') : normalized
}

function assertNoForbiddenScripts(packageJson) {
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const source = String(command || '')
    for (const [label, pattern] of FORBIDDEN_SCRIPT_MECHANICS) {
      assert.equal(pattern.test(source), false, `${name} must not run ${label}`)
    }
    if (/\bnpm\s+pack\b/i.test(source)) {
      assert.equal(name, 'release:check', `${name} must not run npm pack outside release:check`)
      assert.match(source, /\bnpm\s+pack\s+--dry-run\s+--ignore-scripts\b/, 'release:check may only pack with --dry-run --ignore-scripts')
    }
  }
}

function assertPackageManifestGovernance(root) {
  const packageJson = assertPackageNoReleaseGuards(root, {
    expectedVersion: PACKAGE_VERSION,
    expectedPiExtensions: ['./index.ts'],
  })
  assert.equal(packageJson.name, 'pi-agentteam', 'package name should remain pi-agentteam')
  assert.equal(packageJson.type, 'module', 'package type should remain module')
  assert.deepEqual(Object.keys(packageJson.dependencies || {}).sort(), [], 'runtime dependencies must remain absent; pi dependencies stay peer-only')
  for (const key of FORBIDDEN_PACKAGE_METADATA_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package.json must not define ${key}`)
  }
  for (const key of ['main', 'exports', 'types']) {
    assert.equal(Object.prototype.hasOwnProperty.call(packageJson, key), false, `package.json must not broaden pi facade through ${key}`)
  }
  assertNoForbiddenScripts(packageJson)
  return packageJson
}

function assertPackageFilesDoNotBroaden(packageJson) {
  assert.ok(Array.isArray(packageJson.files), 'package.json#files should remain an explicit allowlist')
  const files = packageJson.files.map(normalizePackageFileEntry)
  const fileSet = new Set(files)
  for (const rel of APPROVED_EMBEDDED_NATIVE_FILES) assert.ok(fileSet.has(rel), `approved embedded native file should remain packaged: ${rel}`)
  assert.equal(files.some(item => item === 'kernel' || item.startsWith('kernel/') || item.includes('/kernel/')), false, 'package files must not include kernel source')

  for (const entry of files) {
    const rel = unnegatedPackageEntry(entry)
    if (isNegatedPackageEntry(entry)) continue
    const approvedNative = APPROVED_EMBEDDED_NATIVE_FILES.includes(rel)
    assert.equal(rel.startsWith('native/') && !approvedNative, false, `package files must not include unapproved native path: ${rel}`)
    assert.equal(FORBIDDEN_PACKAGE_FILE_ENTRY.test(rel) && !approvedNative, false, `package files must not include unapproved generated/native/release entry: ${rel}`)
  }
}

function assertReviewWorkflowRemainsReviewOnly(root) {
  assert.deepEqual(workflowFiles(root), ['go-helper-review-artifact.yml'], 'only the review artifact workflow should exist')
  assertWorkflowContract(root)
  assertNoUnapprovedWorkflowReleaseOrPackageBehavior(root)
  const workflow = readWorkflow(root)
  assertIncludes(workflow, 'review-only artifact', 'review workflow')
  assertIncludes(workflow, 'actions/upload-artifact@v4', 'review workflow should keep bounded review artifact upload')
  assertIncludes(workflow, 'retention-days: 7', 'review workflow should keep short retention')
  for (const [label, pattern] of FORBIDDEN_WORKFLOW_RELEASE_MECHANICS) {
    assert.equal(pattern.test(workflow), false, `review workflow must not include ${label}`)
  }
}

function assertReadinessGatesRemainBlocked() {
  assert.equal(defaultGoReadinessLedger.ready, false, 'default-Go readiness must remain false')
  assert.equal(defaultGoReadinessLedger.defaultGo, false, 'default Go must remain unapproved')
  assert.equal(defaultGoReadinessLedger.defaultResolver, false, 'default resolver must remain unapproved')
  assert.equal(defaultGoReadinessLedger.normalUserNativeAvailability, false, 'normal-user native availability must remain unproven')
  assert.equal(defaultGoReadinessLedger.fallbackDeletion, false, 'TypeScript fallback deletion must remain unapproved')
  assert.equal(defaultGoReadinessLedger.packageReleaseApproved, false, 'package release must remain unapproved')
  assert.equal(defaultGoReadinessLedger.secondPlatformSupport, false, 'second-platform support must remain unapproved')
  assert.equal(defaultGoReadinessLedger.signingApproved, false, 'signing must remain unapproved')
  assert.equal(defaultGoReadinessLedger.noSilentWaiver, true, 'repo state alone must not waive readiness blockers')
  assert.deepEqual(defaultGoReadinessLedger.blockers.map(blocker => blocker.id), [...DEFAULT_GO_BLOCKER_IDS], 'readiness blocker IDs should remain complete')
  for (const blocker of defaultGoReadinessLedger.blockers) {
    assert.equal(blocker.status, BLOCKED, `${blocker.id} must remain blocked`)
    assert.equal(blocker.requiredBeforeDefaultGo, true, `${blocker.id} must remain required before default Go`)
    assert.equal(blocker.waivableByRepoStateAlone, false, `${blocker.id} must not be waivable by repo state alone`)
  }
}

function assertTypeScriptPiFacadeAndReadBoundaries(root) {
  const packageJson = JSON.parse(readRel(root, 'package.json'))
  assert.deepEqual(packageJson.pi?.extensions, ['./index.ts'], 'pi extension entry should remain the TypeScript facade')

  const deliveryPolicy = readRel(root, 'deliveryPolicy.ts')
  const deliveryPolicyCode = sourceWithoutLineComments(deliveryPolicy)
  assertIncludes(deliveryPolicy, "export type AgentTeamDeliveryPolicyName = 'bridge-only'", 'deliveryPolicy.ts')
  assertIncludes(deliveryPolicy, "export const BRIDGE_ONLY_DELIVERY_POLICY: AgentTeamDeliveryPolicyName = 'bridge-only'", 'deliveryPolicy.ts')
  assertIncludes(deliveryPolicy, 'export const DEFAULT_DELIVERY_POLICY: AgentTeamDeliveryPolicyName = BRIDGE_ONLY_DELIVERY_POLICY', 'deliveryPolicy.ts')
  for (const legacy of ['terminal', 'tmux', 'legacy-terminal', 'send-keys', 'paste-buffer', 'runtimeWake']) {
    const literal = new RegExp(`['"]${legacy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`)
    assert.equal(literal.test(deliveryPolicyCode), false, `deliveryPolicy.ts must not expose legacy delivery literal ${legacy}`)
  }

  assertNoBridgeTerminalTransport(readRel(root, 'adapters/bridge/delivery.ts'), 'adapters/bridge/delivery.ts')
  assertNoBridgeTerminalTransport(readRel(root, 'runtime/bridgeDeliveryPump.ts'), 'runtime/bridgeDeliveryPump.ts')

  assertIncludes(readRel(root, 'runtime/leaderAttention.ts'), 'agentteam_receive({ markRead: true })', 'runtime/leaderAttention.ts')
  assertIncludes(readRel(root, 'runtime/leaderMailboxSignalRuntime.ts'), 'agentteam_receive({ markRead: true })', 'runtime/leaderMailboxSignalRuntime.ts')
  const panelLayout = readRel(root, 'teamPanel/layout.ts')
  assertIncludes(panelLayout, "renderDetailField(theme, 'Full text', 'agentteam_receive({ markRead: true })'", 'teamPanel/layout.ts')
  assertIncludes(panelLayout, "renderDetailField(theme, 'Panel', 'compact only; does not mark delivered/read'", 'teamPanel/layout.ts')

  const goSource = readRel(root, 'kernel/go/agentteam-kernel/main.go')
  for (const capability of parseGoCapabilities(goSource)) {
    assert.equal(FORBIDDEN_GO_CAPABILITY_RE.test(capability), false, `Go capability must not broaden to package/release/default/read-boundary control: ${capability}`)
  }
  assert.equal(FORBIDDEN_GO_RELEASE_CONTROL_RE.test(goSource), false, 'Go kernel must not contain package/release/default/fallback/read-boundary control-plane mechanics')
}

function assertGovernanceEvidenceFilesExist(root) {
  for (const rel of [
    'package.json',
    'deliveryPolicy.ts',
    'index.ts',
    'runtime/leaderAttention.ts',
    'runtime/leaderMailboxSignalRuntime.ts',
    'teamPanel/layout.ts',
    'adapters/bridge/delivery.ts',
    'runtime/bridgeDeliveryPump.ts',
    'kernel/go/agentteam-kernel/main.go',
    '.github/workflows/go-helper-review-artifact.yml',
    'tests/fixtures/kernel/v0636/defaultGoReadinessLedger.cjs',
    ...APPROVED_EMBEDDED_NATIVE_FILES,
  ]) {
    assert.equal(existsRel(root, rel), true, `${rel} should exist for consolidated package/release governance evidence`)
  }
}

function assertConsolidatedPackageReleaseGovernance(root) {
  const checked = new Set()
  const mark = (category, assertion) => {
    assertion()
    checked.add(category)
  }

  let packageJson
  mark('package-version-frozen', () => {
    packageJson = assertPackageManifestGovernance(root)
  })
  mark('npm-release-mechanics-forbidden', () => assertNoForbiddenScripts(packageJson))
  mark('git-github-release-mechanics-forbidden', () => {
    assertNoForbiddenScripts(packageJson)
    assertReviewWorkflowRemainsReviewOnly(root)
  })
  mark('signing-slsa-release-assets-forbidden', () => {
    assertNoForbiddenScripts(packageJson)
    assertReviewWorkflowRemainsReviewOnly(root)
    assertPackageFilesDoNotBroaden(packageJson)
    assertNoRawOrReleaseArtifacts(root)
  })
  mark('lifecycle-download-install-build-forbidden', () => assertNoForbiddenScripts(packageJson))
  mark('optional-native-dependency-binary-metadata-forbidden', () => assertPackageManifestGovernance(root))
  mark('package-files-kernel-native-generated-broadening-forbidden', () => assertPackageFilesDoNotBroaden(packageJson))
  mark('raw-release-hosted-artifacts-forbidden', () => assertNoRawOrReleaseArtifacts(root))
  mark('review-workflow-review-only-non-release', () => assertReviewWorkflowRemainsReviewOnly(root))
  mark('package-release-default-native-fallback-gates-unapproved', () => assertReadinessGatesRemainBlocked())
  mark('typescript-pi-facade-worker-delivery-read-boundary-preserved', () => assertTypeScriptPiFacadeAndReadBoundaries(root))
  assertGovernanceEvidenceFilesExist(root)

  const checkedCategories = sorted(checked)
  assert.deepEqual(checkedCategories, sorted(CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORIES), 'consolidated package/release guard should execute every category')
  return { checkedCategories }
}

module.exports = {
  APPROVED_EMBEDDED_NATIVE_FILES,
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORIES,
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_CATEGORY_DESCRIPTIONS,
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_HELPER,
  CONSOLIDATED_PACKAGE_RELEASE_GOVERNANCE_GUARD_SUITE,
  FORBIDDEN_PACKAGE_METADATA_KEYS,
  assertConsolidatedPackageReleaseGovernance,
  assertPackageFilesDoNotBroaden,
  assertPackageManifestGovernance,
  assertReadinessGatesRemainBlocked,
  assertReviewWorkflowRemainsReviewOnly,
  assertTypeScriptPiFacadeAndReadBoundaries,
}
