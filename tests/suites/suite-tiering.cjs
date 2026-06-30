const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  classifySuite,
  discoverSuiteFiles,
  isCurrentGoKernelSuite,
  isHistoricalGoKernelSuite,
  selectSuiteFiles,
} = require('../suiteManifest.cjs')

module.exports = {
  name: 'suite tiering manifest',
  async run(env) {
    const root = env.helpers.extRoot
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

    assert.equal(packageJson.version, '0.6.8', 'suite tiering must not change the approved package version')
    assert.equal(packageJson.scripts?.test, 'node tests/run.cjs --tier default')
    assert.equal(packageJson.scripts?.['test:regression'], 'node tests/run.cjs --tier regression')
    assert.equal(packageJson.scripts?.['test:audit'], 'node tests/run.cjs --tier audit')
    assert.equal(packageJson.scripts?.['test:go-current'], 'node tests/run.cjs --tier go-current')
    assert.equal(packageJson.scripts?.['test:list'], 'node tests/run.cjs --list')
    assert.ok(packageJson.scripts?.check?.includes('npm run test:regression'), 'check must keep the full regression suite wired in')
    assert.equal(packageJson.scripts?.check?.includes('npm test'), false, 'check must not use the reduced default developer suite')
    assert.equal(packageJson.scripts?.['release:check']?.includes('npm publish'), false, 'release check must not publish')
    assert.equal(packageJson.scripts?.['release:check']?.includes('npm version'), false, 'release check must not bump versions')

    const allSuites = discoverSuiteFiles()
    const defaultSuites = selectSuiteFiles({ tiers: ['default'] })
    const regressionSuites = selectSuiteFiles({ tiers: ['regression'] })
    const auditSuites = selectSuiteFiles({ tiers: ['audit'] })
    const benchmarkSuites = selectSuiteFiles({ tiers: ['benchmark'] })
    const goCurrentSuites = selectSuiteFiles({ tiers: ['go-current'] })
    const smokeSuites = selectSuiteFiles({ tiers: ['smoke'] })

    assert.ok(allSuites.length > 200, 'manifest should cover the existing large flat suite set')
    assert.deepEqual(regressionSuites, allSuites, 'regression tier should preserve every suite')
    assert.ok(defaultSuites.length < regressionSuites.length, 'default tier should be reduced from full regression')
    assert.ok(auditSuites.length > 100, 'audit tier should preserve historical Go/kernel coverage explicitly')
    assert.ok(benchmarkSuites.includes('zzzzzzzzzzzzz-read-model-bench-v0414.cjs'), 'benchmark tier should preserve opt-in bench suites')
    assert.equal(defaultSuites.includes('zzzzzzzzzzzzz-read-model-bench-v0414.cjs'), false, 'default tier should exclude benchmark suites')

    assert.ok(defaultSuites.includes('service-units.cjs'), 'default tier should keep non-Go core integration coverage')
    assert.ok(defaultSuites.includes('package-install-smoke.cjs'), 'default tier should keep package/no-release smoke coverage')
    assert.ok(smokeSuites.includes('package-install-smoke.cjs'), 'smoke tier should include package smoke coverage')
    assert.ok(goCurrentSuites.includes('go-kernel-v0696-v07-release-decision-package.cjs'), 'go-current tier should keep latest release/no-action guard')
    assert.ok(defaultSuites.includes('go-kernel-v0696-v07-release-decision-package.cjs'), 'default tier should keep current Go release guard')
    assert.ok(auditSuites.includes('go-kernel-v0688-go-clear-pane-label-sync-cutover.cjs'), 'audit tier should retain historical cutover coverage')
    assert.equal(defaultSuites.includes('go-kernel-v0688-go-clear-pane-label-sync-cutover.cjs'), false, 'default tier should remove historical audit coverage')
    assert.ok(auditSuites.includes('go-kernel-release-checklist-docs.cjs'), 'audit tier should retain older release checklist docs')
    assert.equal(defaultSuites.includes('go-kernel-release-checklist-docs.cjs'), false, 'default tier should remove older release checklist docs')

    for (const file of auditSuites) {
      assert.equal(defaultSuites.includes(file), false, `${file} should not be both audit and default`)
      assert.ok(classifySuite(file).tiers.includes('regression'), `${file} must remain in full regression`)
    }
    for (const file of goCurrentSuites) {
      assert.equal(isCurrentGoKernelSuite(file), true, `${file} should be classified as current Go/kernel coverage`)
    }
    assert.equal(isHistoricalGoKernelSuite('go-kernel-v0688-go-clear-pane-label-sync-cutover.cjs'), true)
    assert.equal(isHistoricalGoKernelSuite('go-kernel-v0689-go-worker-delivery-boundary-gate.cjs'), false)

    assert.deepEqual(selectSuiteFiles({ filters: ['service-units'] }), ['service-units.cjs'], 'legacy substring suite filters should still work without tiers')
    assert.deepEqual(selectSuiteFiles({ tiers: ['audit'], filters: ['go-kernel-v0688'] }), ['go-kernel-v0688-go-clear-pane-label-sync-cutover.cjs'], 'suite filters should intersect with tier selectors')
  },
}
