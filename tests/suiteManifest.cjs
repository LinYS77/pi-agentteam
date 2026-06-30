const fs = require('node:fs')
const path = require('node:path')

const SUITES_DIR = path.join(__dirname, 'suites')

const PREFERRED_SUITE_ORDER = [
  'core-vocabulary.cjs',
  'core-task-reducer.cjs',
  'core-message-policy.cjs',
  'core-worker-health.cjs',
  'suite-tiering.cjs',
  'package-install-smoke.cjs',
  'tools-state.cjs',
  'commands.cjs',
  'protocol-decisions-orchestration.cjs',
  'panel-renderer.cjs',
  'public-output-leak-guards.cjs',
  'outbox-store-runner.cjs',
  'data-layout-vnext.cjs',
]

const SMOKE_SUITE_FILES = new Set([
  'core-vocabulary.cjs',
  'core-task-reducer.cjs',
  'core-message-policy.cjs',
  'core-worker-health.cjs',
  'suite-tiering.cjs',
  'phase0-characterization.cjs',
  'package-install-smoke.cjs',
  'loader-package-smoke.cjs',
  'public-output-leak-guards.cjs',
  'public-surface-facade.cjs',
])

const TIER_ALIASES = {
  all: 'regression',
  full: 'regression',
  current: 'default',
  dev: 'default',
}

const KNOWN_TIERS = [
  'default',
  'smoke',
  'core',
  'go-current',
  'audit',
  'benchmark',
  'regression',
]

const UNVERSIONED_GO_AUDIT_FILES = new Set([
  'go-kernel-checkpoint-docs.cjs',
  'go-kernel-release-checklist-docs.cjs',
])

function normalizeSuiteFile(file) {
  const base = path.basename(String(file || '').trim())
  if (!base) return ''
  return base.endsWith('.cjs') ? base : `${base}.cjs`
}

function suiteStem(file) {
  return normalizeSuiteFile(file).replace(/\.cjs$/, '')
}

function parseGoKernelVersion(file) {
  const match = normalizeSuiteFile(file).match(/^go-kernel-v(\d{4})/)
  return match ? Number(match[1]) : null
}

function isGoKernelSuite(file) {
  return normalizeSuiteFile(file).startsWith('go-kernel-')
}

function isBenchmarkSuite(file) {
  const stem = suiteStem(file)
  return /(?:^|-)bench(?:-|$)/.test(stem) || /(?:^|-)profiling(?:-|$)/.test(stem)
}

function isHistoricalGoKernelSuite(file) {
  if (!isGoKernelSuite(file)) return false
  const suiteFile = normalizeSuiteFile(file)
  if (UNVERSIONED_GO_AUDIT_FILES.has(suiteFile)) return true
  const version = parseGoKernelVersion(suiteFile)
  return version !== null && version < 689
}

function isCurrentGoKernelSuite(file) {
  return isGoKernelSuite(file) && !isHistoricalGoKernelSuite(file)
}

function sortedValues(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function classifySuite(file) {
  const suiteFile = normalizeSuiteFile(file)
  const stem = suiteStem(suiteFile)
  const tiers = new Set(['regression'])
  const tags = new Set()

  if (SMOKE_SUITE_FILES.has(suiteFile)) {
    tiers.add('smoke')
    tags.add('smoke')
  }

  if (isBenchmarkSuite(suiteFile)) {
    tiers.add('benchmark')
    tags.add('benchmark')
    tags.add('perf')
  }

  if (isGoKernelSuite(suiteFile)) {
    tags.add('go')
    tags.add('go-kernel')
    if (isCurrentGoKernelSuite(suiteFile)) {
      tiers.add('go-current')
      tags.add('current')
    } else {
      tiers.add('audit')
      tags.add('audit')
      tags.add('historical')
    }
  } else if (!isBenchmarkSuite(suiteFile)) {
    tiers.add('core')
    tags.add('core')
  }

  if (/docs?|readiness|checkpoint|release|audit|governance|decision/.test(stem)) tags.add('docs')
  if (/package|loader|public-surface|public-output/.test(stem)) tags.add('package')
  if (/mailbox|message|outbox|delivery|wake/.test(stem)) tags.add('messaging')
  if (/task|report|history|planrun/.test(stem)) tags.add('tasks')
  if (/panel|read-model|renderer/.test(stem)) tags.add('ui')

  if (!tiers.has('audit') && !tiers.has('benchmark')) tiers.add('default')

  return {
    file: suiteFile,
    stem,
    tiers: sortedValues(tiers),
    tags: sortedValues(tags),
    goKernelVersion: parseGoKernelVersion(suiteFile),
  }
}

function orderSuiteFiles(files) {
  const normalized = [...new Set(files.map(normalizeSuiteFile).filter(Boolean))]
  const existing = new Set(normalized)
  const ordered = PREFERRED_SUITE_ORDER.filter(file => existing.has(file))
  for (const file of normalized.sort((a, b) => a.localeCompare(b))) {
    if (!ordered.includes(file)) ordered.push(file)
  }
  return ordered
}

function discoverSuiteFiles(suitesDir = SUITES_DIR) {
  const files = fs.readdirSync(suitesDir).filter(name => name.endsWith('.cjs'))
  return orderSuiteFiles(files)
}

function normalizeTier(tier) {
  const normalized = String(tier || '').trim().toLowerCase()
  return TIER_ALIASES[normalized] || normalized
}

function normalizeTag(tag) {
  return String(tag || '').trim().toLowerCase()
}

function suiteMatchesFilters(file, filters) {
  if (!filters.length) return true
  const suiteFile = normalizeSuiteFile(file)
  const stem = suiteStem(suiteFile)
  return filters.some(rawFilter => {
    const filter = String(rawFilter || '').trim()
    if (!filter) return false
    const normalizedFilter = filter.endsWith('.cjs') ? filter : `${filter}.cjs`
    return suiteFile === filter || suiteFile === normalizedFilter || stem === filter || stem.includes(filter)
  })
}

function selectSuiteFiles(options = {}) {
  const files = options.files ? orderSuiteFiles(options.files) : discoverSuiteFiles(options.suitesDir || SUITES_DIR)
  const tiers = (options.tiers || []).map(normalizeTier).filter(Boolean)
  const tags = (options.tags || []).map(normalizeTag).filter(Boolean)
  const filters = (options.filters || []).map(value => String(value || '').trim()).filter(Boolean)

  return files.filter(file => {
    const meta = classifySuite(file)
    const tierMatches = tiers.length === 0 || tiers.some(tier => meta.tiers.includes(tier))
    const tagMatches = tags.length === 0 || tags.some(tag => meta.tags.includes(tag))
    return tierMatches && tagMatches && suiteMatchesFilters(file, filters)
  })
}

function summarizeSelection(files) {
  const counts = new Map(KNOWN_TIERS.map(tier => [tier, 0]))
  for (const file of files) {
    for (const tier of classifySuite(file).tiers) counts.set(tier, (counts.get(tier) || 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].filter(([, count]) => count > 0))
}

module.exports = {
  SUITES_DIR,
  PREFERRED_SUITE_ORDER,
  SMOKE_SUITE_FILES,
  KNOWN_TIERS,
  UNVERSIONED_GO_AUDIT_FILES,
  normalizeSuiteFile,
  suiteStem,
  parseGoKernelVersion,
  isGoKernelSuite,
  isHistoricalGoKernelSuite,
  isCurrentGoKernelSuite,
  isBenchmarkSuite,
  classifySuite,
  orderSuiteFiles,
  discoverSuiteFiles,
  normalizeTier,
  normalizeTag,
  selectSuiteFiles,
  summarizeSelection,
}
