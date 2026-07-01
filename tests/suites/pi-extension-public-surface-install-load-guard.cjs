const assert = require('node:assert/strict')
const { assertPackageVersion } = require('../helpers/packageGuards.cjs')
const {
  assertPiExtensionPublicSurfaceGuard,
} = require('../helpers/piExtensionPublicSurfaceGuards.cjs')

module.exports = {
  name: 'Pi extension public surface and install-load guard',
  async run(env) {
    const root = env.helpers.extRoot
    const packageJson = assertPackageVersion(root)
    assert.equal(packageJson.version, '0.6.8', 'pi extension public surface guard must keep package version unchanged')
    const result = assertPiExtensionPublicSurfaceGuard(root, env)
    assert.equal(result.checkedCategories.length, 12, 'pi extension public surface guard should cover every category')
  },
}
