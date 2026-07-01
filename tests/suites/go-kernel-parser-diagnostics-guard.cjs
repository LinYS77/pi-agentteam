const assert = require('node:assert/strict')
const { assertPackageVersion } = require('../helpers/packageGuards.cjs')
const {
  assertParserDiagnosticsGuard,
} = require('../helpers/parserDiagnosticsGuards.cjs')

module.exports = {
  name: 'Go kernel parser parity and compact diagnostics guard',
  async run(env) {
    const root = env.helpers.extRoot
    const packageJson = assertPackageVersion(root)
    assert.equal(packageJson.version, '0.6.8', 'parser diagnostics guard must keep package version unchanged')
    await assertParserDiagnosticsGuard(root, env)
  },
}
