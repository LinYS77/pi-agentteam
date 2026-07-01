const assert = require('node:assert/strict')
const { assertPackageVersion } = require('../helpers/packageGuards.cjs')
const {
  assertInstallLayoutPathSafetyGuard,
} = require('../helpers/installLayoutPathSafetyGuards.cjs')

module.exports = {
  name: 'Go kernel install-layout platform path-safety guard',
  async run(env) {
    const root = env.helpers.extRoot
    const packageJson = assertPackageVersion(root)
    assert.equal(packageJson.version, '0.6.8', 'install-layout path-safety guard must keep package version unchanged')
    await assertInstallLayoutPathSafetyGuard(root, env)
  },
}
