const { assertGoTmuxCutoverBatch3Guard } = require('../helpers/goTmuxCutoverBatch3Guards.cjs')

module.exports = {
  name: 'Go kernel tmux cutover batch 3 guard',
  async run(env) {
    await assertGoTmuxCutoverBatch3Guard({
      repoRoot: env.helpers.extRoot,
      requireDist: env.helpers.requireDist,
      distRoot: env.helpers.distRoot,
    })
  },
}
