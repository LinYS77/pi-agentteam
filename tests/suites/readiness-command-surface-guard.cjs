const { assertReadinessCommandSurface } = require('../helpers/readinessCommandSurfaceGuards.cjs')
const { assertPackageVersion } = require('../helpers/packageGuards.cjs')

module.exports = {
  name: 'readiness command surface guard',
  async run(env) {
    const root = env.helpers.extRoot
    assertPackageVersion(root)
    await assertReadinessCommandSurface(root, env)
  },
}
