const assert = require('node:assert/strict')
const {
  PACKAGE_RELEASE_SECURITY_ROLLBACK_CATEGORIES,
  assertPackageReleaseSecurityRollbackGuard,
} = require('../helpers/packageReleaseSecurityRollbackGuards.cjs')

module.exports = {
  name: 'Go kernel package/release/security/rollback guard',
  async run(env) {
    const result = assertPackageReleaseSecurityRollbackGuard(env.helpers.extRoot, env)
    assert.deepEqual(result.checkedCategories, [...PACKAGE_RELEASE_SECURITY_ROLLBACK_CATEGORIES].sort(), 'guard should cover every package/release/security/rollback category')
  },
}
