const assert = require('node:assert/strict')
const { assertPackageVersion } = require('../helpers/packageGuards.cjs')
const {
  assertDefaultGoReadinessFixtureGuard,
} = require('../helpers/defaultGoReadinessFixtureGuards.cjs')

module.exports = {
  name: 'Go kernel default-Go readiness fixture guard',
  async run(env) {
    const root = env.helpers.extRoot
    const packageJson = assertPackageVersion(root)
    assert.equal(packageJson.version, '0.6.8', 'default-Go readiness fixture guard must keep package version unchanged')
    const result = assertDefaultGoReadinessFixtureGuard(root)
    assert.equal(result.checkedCategories.length, 12, 'default-Go readiness fixture guard should cover every category')
  },
}
