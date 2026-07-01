const assert = require('node:assert/strict')
const { assertPackageVersion } = require('../helpers/packageGuards.cjs')
const {
  assertArtifactCiProvenanceGuard,
} = require('../helpers/artifactCiProvenanceGuards.cjs')

module.exports = {
  name: 'Go kernel artifact CI provenance guard',
  async run(env) {
    const root = env.helpers.extRoot
    const packageJson = assertPackageVersion(root)
    assert.equal(packageJson.version, '0.6.8', 'artifact CI provenance guard must keep package version unchanged')
    await assertArtifactCiProvenanceGuard(root)
  },
}
