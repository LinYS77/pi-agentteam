const assert = require('node:assert/strict')
const { assertPackageVersion } = require('../helpers/packageGuards.cjs')
const {
  assertKernelResolverSourceBoundaryGuard,
} = require('../helpers/kernelResolverSourceBoundaryGuards.cjs')

module.exports = {
  name: 'Go kernel resolver source-boundary guard',
  async run(env) {
    const root = env.helpers.extRoot
    const packageJson = assertPackageVersion(root)
    assert.equal(packageJson.version, '0.6.8', 'kernel resolver source-boundary guard must keep package version unchanged')
    await assertKernelResolverSourceBoundaryGuard(root, env)
  },
}
