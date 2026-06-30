const assert = require('node:assert/strict')
const { readJsonRel, sha256Rel, toRel, walkFiles } = require('./fsAssertions.cjs')

const APPROVED_NATIVE_ROOT = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc'
const FORBIDDEN_RAW_ARTIFACT_FILE_RE = /(?:^|\/)(?:.*raw.*(?:benchmark|p95|manual|rc|smoke|terminal|mailbox|report|transcript|state|hosted|validation|release).*|.*(?:benchmark|p95|manual|rc|smoke|terminal|mailbox|report|transcript|state|hosted|validation|release).*raw.*)\.(?:json|jsonl|log|txt|ndjson|tgz|tar|tar\.gz|zip|png|jpg|jpeg|gif|webp)$/i
const FORBIDDEN_RELEASE_ARTIFACT_RE = /\.(?:tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig|asc|spdx|sbom)$/i

function assertNativeArtifactSnapshot(root, options) {
  const nativeRoot = options.nativeRoot || APPROVED_NATIVE_ROOT
  const label = options.label || nativeRoot
  const snapshot = options.snapshot
  assert.ok(snapshot, `${label} snapshot metadata is required`)

  const manifest = readJsonRel(root, `${nativeRoot}/manifest.json`)
  const provenance = readJsonRel(root, `${nativeRoot}/provenance.json`)
  if (options.packageVersion !== undefined) assert.equal(manifest.packageVersion, options.packageVersion, `${label} manifest packageVersion should remain unchanged`)
  if (options.helperVersion !== undefined) assert.equal(manifest.helperVersion, options.helperVersion, `${label} manifest helperVersion should remain unchanged`)
  if (options.protocolVersion !== undefined) assert.equal(manifest.protocolVersion, options.protocolVersion, `${label} manifest protocolVersion should remain unchanged`)
  if (options.capabilities !== undefined) assert.deepEqual(manifest.capabilities, [...options.capabilities], `${label} manifest capabilities should remain unchanged`)
  assert.equal(manifest.artifact.path, `${nativeRoot}/agentteam-tmuxSnapshotParse`, `${label} artifact path should remain unchanged`)
  assert.equal(manifest.artifact.filename, 'agentteam-tmuxSnapshotParse', `${label} artifact filename should remain unchanged`)
  assert.equal(manifest.artifact.size, snapshot.helperSize, `${label} helper size should remain unchanged`)
  assert.equal(manifest.artifact.sha256, snapshot.helperSha256, `${label} helper sha256 should remain unchanged`)
  assert.equal(manifest.source.revision, snapshot.sourceRevision, `${label} manifest source revision should remain unchanged`)
  assert.equal(provenance.source.revision, snapshot.sourceRevision, `${label} provenance source revision should remain unchanged`)
  assert.ok(manifest.smoke && typeof manifest.smoke === 'object', `${label} manifest smoke object should remain present`)
  assert.ok(provenance.smoke && typeof provenance.smoke === 'object', `${label} provenance smoke object should remain present`)
  for (const key of snapshot.forbiddenSmokeKeys || []) {
    assert.equal(Object.prototype.hasOwnProperty.call(manifest.smoke, key), false, `${label} native manifest must not add ${key}`)
    assert.equal(Object.prototype.hasOwnProperty.call(provenance.smoke, key), false, `${label} native provenance must not add ${key}`)
  }
  assert.equal(sha256Rel(root, snapshot.helperPath), snapshot.helperSha256, `${label} helper sha256 should match snapshot`)
  assert.equal(sha256Rel(root, `${nativeRoot}/manifest.json`), snapshot.manifestSha256, `${label} manifest sha256 should match snapshot`)
  assert.equal(sha256Rel(root, `${nativeRoot}/provenance.json`), snapshot.provenanceSha256, `${label} provenance sha256 should match snapshot`)
  assert.equal(sha256Rel(root, `${nativeRoot}/attestation.intoto.jsonl`), snapshot.attestationSha256, `${label} attestation sha256 should match snapshot`)
  assert.equal(sha256Rel(root, `${nativeRoot}/SHA256SUMS`), snapshot.checksumsSha256, `${label} SHA256SUMS sha256 should match snapshot`)
  return { manifest, provenance }
}

function assertNoRawOrReleaseArtifacts(root, options = {}) {
  const approvedPrefixes = new Set(options.approvedPrefixes || [`${APPROVED_NATIVE_ROOT}/`])
  const rawPattern = options.rawPattern || FORBIDDEN_RAW_ARTIFACT_FILE_RE
  const artifactPattern = options.artifactPattern || FORBIDDEN_RELEASE_ARTIFACT_RE
  const forbiddenRaw = []
  const forbiddenArtifacts = []
  for (const file of walkFiles(root)) {
    const rel = toRel(root, file)
    if ([...approvedPrefixes].some(prefix => rel.startsWith(prefix))) continue
    if (rawPattern.test(rel)) forbiddenRaw.push(rel)
    if (artifactPattern.test(rel)) forbiddenArtifacts.push(rel)
  }
  assert.deepEqual(forbiddenRaw.sort(), [], options.rawMessage || 'repo must not contain raw evidence files')
  assert.deepEqual(forbiddenArtifacts.sort(), [], options.artifactMessage || 'repo must not contain unapproved release/archive/signing artifacts')
}

module.exports = {
  APPROVED_NATIVE_ROOT,
  FORBIDDEN_RAW_ARTIFACT_FILE_RE,
  FORBIDDEN_RELEASE_ARTIFACT_RE,
  assertNativeArtifactSnapshot,
  assertNoRawOrReleaseArtifacts,
}
