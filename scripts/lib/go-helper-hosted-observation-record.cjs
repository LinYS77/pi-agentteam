const fs = require('node:fs')
const path = require('node:path')

const MODULE = 'hostedObservationRecord'
const WORKFLOW_PATH = '.github/workflows/go-helper-review-artifact.yml'
const WORKFLOW_NAME = 'Go Helper Review Artifact'
const TARGET = 'linux-x64-glibc'
const RETENTION_DAYS = 7
const MAX_RECORD_BYTES = 64 * 1024

const FAILURE_KINDS = new Set([
  'record-read-failed',
  'record-size-invalid',
  'record-json-invalid',
  'record-schema-invalid',
  'record-observation-invalid',
  'record-forbidden-content',
  'record-availability-overclaim',
])

const TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'workflowPath',
  'workflowName',
  'commitSha',
  'observed',
  'runId',
  'runAttempt',
  'status',
  'conclusion',
  'jobs',
  'target',
  'retentionDays',
  'reviewOnly',
  'releaseAsset',
  'installSource',
  'packageArtifact',
  'normalUserAvailability',
])

const JOB_KEYS = new Set(['name', 'status', 'conclusion', 'target'])
const REQUIRED_JOB_NAMES = ['build-review-artifact', 'verify-review-artifact']
const FLAG_EXPECTATIONS = Object.freeze({
  reviewOnly: true,
  releaseAsset: false,
  installSource: false,
  packageArtifact: false,
  normalUserAvailability: false,
})

const FORBIDDEN_KEY_TOKENS = new Set([
  'apiurl',
  'archiveurl',
  'artifactindex',
  'artifactindexjson',
  'artifactpath',
  'artifacturl',
  'attestation',
  'attestationintoto',
  'body',
  'bundlepath',
  'checksum',
  'checksums',
  'downloadpath',
  'downloadurl',
  'headers',
  'htmlurl',
  'href',
  'localpath',
  'log',
  'logs',
  'mailboxtext',
  'manifest',
  'manifestjson',
  'payload',
  'provenance',
  'provenancejson',
  'raw',
  'rawpayload',
  'releaseurl',
  'reporttext',
  'response',
  'sha256sums',
  'stack',
  'stderr',
  'stdout',
  'stepsummary',
  'summary',
  'trace',
  'uri',
  'url',
  'verifierjson',
  'verifieroutput',
  'webhookpayload',
  'workflowsummary',
])

class HostedObservationRecordError extends Error {
  constructor(failureKind, remediation, hint) {
    super(failureKind)
    this.name = 'HostedObservationRecordError'
    this.failureKind = failureKind
    this.remediation = remediation
    this.hint = hint
  }

  toDiagnostic() {
    return compactFailure(this.failureKind, this.remediation, this.hint)
  }
}

function compactFailure(failureKind, remediation, hint) {
  if (!FAILURE_KINDS.has(failureKind)) throw new Error(`unexpected failureKind ${failureKind}`)
  return {
    ok: false,
    status: 'unavailable',
    module: MODULE,
    capability: MODULE,
    resultMarker: 'fail-closed',
    failureKind,
    remediation,
    hint,
  }
}

function fail(failureKind, remediation, hint) {
  throw new HostedObservationRecordError(failureKind, remediation, hint)
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeKey(key) {
  return String(key).replace(/[-_.\s]/g, '').toLowerCase()
}

function assertAllowedKeys(record, allowed, hint) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) fail('record-schema-invalid', 'keep hosted observation records to the minimal allowlisted facts', hint)
  }
}

function isAbsoluteOrLocalPath(value) {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return true
  if (/^~[\\/]/.test(value)) return true
  return /(?:^|[\s'"`])(?:\.{1,2}[\\/]|\/(?:home|tmp|var|Users|private|mnt|workspace)[\\/]|[A-Za-z]:[\\/])/.test(value)
}

function assertSafeString(value, key) {
  if (value.length > 512) fail('record-forbidden-content', 'record only minimal hosted observation facts, not raw payloads', 'string-size')
  if (/https?:\/\/|www\.|api\.github\.com|github\.com\//i.test(value)) {
    fail('record-forbidden-content', 'omit hosted artifact, API, download, and release URLs from the record', 'url')
  }
  if (key !== 'workflowPath' && isAbsoluteOrLocalPath(value)) {
    fail('record-forbidden-content', 'omit local and absolute paths from the record', 'path')
  }
  if (/stdout|stderr|stack trace|AssertionError|Error:\s|\bat\s+\S+\s+\(/i.test(value)) {
    fail('record-forbidden-content', 'omit process transcripts and report bodies from the record', 'process-output')
  }
  if (/artifact-index\.json|manifest\.json|provenance\.json|SHA256SUMS|attestation\.intoto|workflow summary|verifier JSON|downloaded bundle|raw API payload/i.test(value)) {
    fail('record-forbidden-content', 'omit artifact metadata bodies and hosted workflow payloads from the record', 'artifact-body')
  }
  if (/normal[- ]user native availability|normal user availability|native availability proof|default Go is enabled|default resolver is enabled|release asset is approved|package artifact is approved|install source is approved|package-manager clean-install proof is complete/i.test(value)) {
    fail('record-availability-overclaim', 'record hosted observation as review-only non-availability evidence', 'availability-claim')
  }
}

function assertNoForbiddenContent(value, key = '', depth = 0) {
  if (depth > 8) fail('record-schema-invalid', 'keep hosted observation records shallow and minimal', 'depth')
  if (typeof value === 'string') {
    assertSafeString(value, key)
    return
  }
  if (Array.isArray(value)) {
    if (value.length > 8) fail('record-schema-invalid', 'keep hosted observation arrays bounded', 'array-size')
    for (const item of value) assertNoForbiddenContent(item, '', depth + 1)
    return
  }
  if (!isRecord(value)) return
  for (const [childKey, childValue] of Object.entries(value)) {
    const normalized = normalizeKey(childKey)
    if (childKey !== 'workflowPath' && childKey !== 'normalUserAvailability' && childKey !== 'packageArtifact' && childKey !== 'releaseAsset') {
      if (FORBIDDEN_KEY_TOKENS.has(normalized) || /(?:url|uri|href)$/.test(normalized)) {
        fail('record-forbidden-content', 'omit hosted artifacts, raw payloads, summaries, URLs, logs, and metadata bodies from the record', 'forbidden-key')
      }
    }
    assertNoForbiddenContent(childValue, childKey, depth + 1)
  }
}

function assertLiteral(value, expected, hint) {
  if (value !== expected) fail('record-schema-invalid', 'provide the exact hosted observation record contract values', hint)
}

function assertCommitSha(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/i.test(value)) {
    fail('record-schema-invalid', 'record a 40-hex commit SHA only', 'commitSha')
  }
}

function normalizePositiveInteger(value, hint) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    fail('record-schema-invalid', 'record GitHub run identifiers as positive integer strings', hint)
  }
  const text = String(value)
  if (!/^[1-9][0-9]*$/.test(text)) {
    fail('record-schema-invalid', 'record GitHub run identifiers as positive integer strings', hint)
  }
  return text
}

function assertFlags(record) {
  for (const [key, expected] of Object.entries(FLAG_EXPECTATIONS)) {
    if (record[key] !== expected) {
      fail('record-availability-overclaim', 'keep hosted observation flags review-only and non-availability', key)
    }
  }
}

function validateJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length !== REQUIRED_JOB_NAMES.length) {
    fail('record-observation-invalid', 'observed hosted records require build and verify job success facts only', 'jobs')
  }
  const byName = new Map()
  for (const job of jobs) {
    if (!isRecord(job)) fail('record-observation-invalid', 'observed job facts must be minimal records', 'job')
    assertAllowedKeys(job, JOB_KEYS, 'job-key')
    if (typeof job.name !== 'string' || !REQUIRED_JOB_NAMES.includes(job.name) || byName.has(job.name)) {
      fail('record-observation-invalid', 'observed job facts must include build and verify once', 'job-name')
    }
    if (job.status !== 'completed' || job.conclusion !== 'success') {
      fail('record-observation-invalid', 'observed hosted records require green build and verify jobs', 'job-result')
    }
    if (job.target !== TARGET) fail('record-observation-invalid', 'observed job facts must match the approved review target', 'job-target')
    byName.set(job.name, job)
  }
  for (const name of REQUIRED_JOB_NAMES) {
    if (!byName.has(name)) fail('record-observation-invalid', 'observed job facts must include build and verify once', 'job-missing')
  }
}

function verifyHostedObservationRecord(record) {
  if (!isRecord(record)) fail('record-schema-invalid', 'provide a JSON object hosted observation record', 'record')
  assertNoForbiddenContent(record)
  assertAllowedKeys(record, TOP_LEVEL_KEYS, 'top-level-key')

  assertLiteral(record.schemaVersion, 1, 'schemaVersion')
  assertLiteral(record.workflowPath, WORKFLOW_PATH, 'workflowPath')
  assertLiteral(record.workflowName, WORKFLOW_NAME, 'workflowName')
  assertCommitSha(record.commitSha)
  assertLiteral(record.target, TARGET, 'target')
  assertLiteral(record.retentionDays, RETENTION_DAYS, 'retentionDays')
  assertFlags(record)

  if (typeof record.observed !== 'boolean') {
    fail('record-schema-invalid', 'record observed as an explicit boolean', 'observed')
  }

  const summary = {
    ok: true,
    resultMarker: 'hosted-observation-record-verified',
    module: MODULE,
    workflowPath: WORKFLOW_PATH,
    workflowName: WORKFLOW_NAME,
    commitSha: record.commitSha.toLowerCase(),
    observed: record.observed,
    status: record.status,
    target: TARGET,
    retentionDays: RETENTION_DAYS,
    reviewOnly: true,
    releaseAsset: false,
    installSource: false,
    packageArtifact: false,
    normalUserAvailability: false,
  }

  if (record.observed) {
    if (record.status !== 'completed' || record.conclusion !== 'success') {
      fail('record-observation-invalid', 'observed hosted records require completed success status', 'run-result')
    }
    const runId = normalizePositiveInteger(record.runId, 'runId')
    const runAttempt = Object.prototype.hasOwnProperty.call(record, 'runAttempt')
      ? normalizePositiveInteger(record.runAttempt, 'runAttempt')
      : undefined
    validateJobs(record.jobs)
    summary.observation = 'hosted workflow observed'
    summary.conclusion = 'success'
    summary.runId = runId
    if (runAttempt) summary.runAttempt = runAttempt
    summary.jobs = {
      'build-review-artifact': 'success',
      'verify-review-artifact': 'success',
    }
    summary.evidenceKind = 'review-only hosted observation facts'
    return { summary, record }
  }

  if (record.status !== 'not_observed_locally') {
    fail('record-observation-invalid', 'unobserved records must be explicitly not observed locally', 'not-observed-status')
  }
  for (const key of ['runId', 'runAttempt', 'conclusion', 'jobs']) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      fail('record-observation-invalid', 'not observed locally records must not include hosted run evidence', `not-observed:${key}`)
    }
  }
  summary.observation = 'not observed locally'
  summary.evidenceKind = 'review-only non-availability evidence'
  return { summary, record }
}

function parseRecordJson(source) {
  try {
    return JSON.parse(source)
  } catch (_) {
    fail('record-json-invalid', 'provide a valid JSON hosted observation record', 'json')
  }
}

function verifyHostedObservationRecordFile(options = {}) {
  const recordPath = options.recordPath
  if (typeof recordPath !== 'string' || recordPath.length === 0) {
    fail('record-read-failed', 'provide --record pointing to a local JSON record', 'record-path')
  }
  let stat
  try {
    stat = fs.lstatSync(recordPath)
  } catch (_) {
    fail('record-read-failed', 'provide a readable local JSON record', 'read')
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail('record-read-failed', 'provide a regular local JSON record file', 'file-type')
  }
  if (stat.size > MAX_RECORD_BYTES) {
    fail('record-size-invalid', 'record only minimal hosted observation facts, not raw payloads', 'record-bytes')
  }
  let source
  try {
    source = fs.readFileSync(recordPath, 'utf8')
  } catch (_) {
    fail('record-read-failed', 'provide a readable local JSON record', 'read')
  }
  return verifyHostedObservationRecord(parseRecordJson(source))
}

module.exports = {
  FAILURE_KINDS,
  FLAG_EXPECTATIONS,
  HostedObservationRecordError,
  MAX_RECORD_BYTES,
  MODULE,
  REQUIRED_JOB_NAMES,
  RETENTION_DAYS,
  TARGET,
  WORKFLOW_NAME,
  WORKFLOW_PATH,
  compactFailure,
  verifyHostedObservationRecord,
  verifyHostedObservationRecordFile,
}
