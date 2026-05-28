const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

module.exports = {
  name: 'session binding path hardening',
  async run(env) {
    const { modules } = env
    const originalHome = process.env.PI_AGENTTEAM_HOME

    function withHome(name, fn) {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-${name}-`))
      const previousHome = process.env.PI_AGENTTEAM_HOME
      try {
        process.env.PI_AGENTTEAM_HOME = home
        modules.state.invalidateSessionContextCache()
        return fn(home)
      } finally {
        modules.state.invalidateSessionContextCache()
        process.env.PI_AGENTTEAM_HOME = previousHome
        fs.rmSync(home, { recursive: true, force: true })
      }
    }

    withHome('long-session-binding', home => {
      const longSessionFile = `/tmp/${'very-long-session-component-'.repeat(80)}/leader-session.jsonl`
      const hashedPath = modules.state.getSessionContextPath(longSessionFile)
      const hashedBase = path.basename(hashedPath)

      assert.match(hashedBase, /^session-[0-9a-f]{64}\.json$/)
      assert.ok(hashedBase.length < 90, 'hashed binding basename should be bounded')
      assert.equal(path.dirname(hashedPath), path.join(home, 'sessions'), 'vNext session bindings should use sessions/ root')
      assert.equal(modules.state.getLegacySessionContextPath, undefined, 'legacy base64 session path helper should be removed')
      assert.equal(modules.state.sanitizeSessionFile, undefined, 'legacy base64 session sanitizer should be removed')

      modules.state.writeSessionContext(longSessionFile, { teamName: 'long-team', memberName: 'team-lead' })
      assert.equal(fs.existsSync(hashedPath), true, 'new writes should use hash path')
      assert.deepEqual(modules.state.readSessionContext(longSessionFile), { teamName: 'long-team', memberName: 'team-lead' })

      modules.state.clearSessionContext(longSessionFile)
      assert.equal(fs.existsSync(hashedPath), false, 'clear should remove hashed binding')
      assert.deepEqual(modules.state.readSessionContext(longSessionFile), { teamName: null, memberName: null })
    })

    withHome('new-short-session-binding', home => {
      const sessionFile = '/tmp/new-short-session.jsonl'
      const hashedPath = modules.state.getSessionContextPath(sessionFile)
      const legacyBase64Path = path.join(home, 'sessions', `${Buffer.from(sessionFile).toString('base64url')}.json`)

      modules.state.writeSessionContext(sessionFile, { teamName: 'new-team', memberName: 'new-worker' })
      assert.equal(fs.existsSync(hashedPath), true, 'new writes should create hash binding')
      assert.equal(fs.existsSync(legacyBase64Path), false, 'new writes should not create legacy base64 binding')
    })

    withHome('legacy-base64-session-binding-not-readable', home => {
      const sessionFile = '/tmp/short-legacy-session.jsonl'
      const hashedPath = modules.state.getSessionContextPath(sessionFile)
      const legacyBase64Path = path.join(home, 'sessions', `${Buffer.from(sessionFile).toString('base64url')}.json`)
      fs.mkdirSync(path.dirname(legacyBase64Path), { recursive: true })
      fs.writeFileSync(legacyBase64Path, `${JSON.stringify({ teamName: 'legacy-team', memberName: 'legacy-worker' }, null, 2)}\n`, 'utf8')

      assert.equal(fs.existsSync(hashedPath), false)
      assert.deepEqual(modules.state.readSessionContext(sessionFile), { teamName: null, memberName: null }, 'legacy base64 binding should not be read or repaired')
      assert.equal(fs.existsSync(hashedPath), false, 'legacy read should not migrate to hash path')
      assert.equal(fs.existsSync(legacyBase64Path), true, 'legacy read should not mutate or remove ignored base64 binding')

      modules.state.clearSessionContext(sessionFile)
      assert.equal(fs.existsSync(hashedPath), false, 'clear should remove hash binding')
      assert.equal(fs.existsSync(legacyBase64Path), true, 'clear should not mutate ignored legacy base64 binding')
    })

    withHome('ensure-derived-session-binding', () => {
      const sessionFile = `/tmp/${'derive-session-'.repeat(20)}leader.jsonl`
      const team = modules.state.createInitialTeamState({
        teamName: 'derive-team',
        description: 'derive suite',
        leaderSessionFile: sessionFile,
        leaderCwd: '/tmp/project',
      })
      modules.state.writeTeamState(team)
      const hashedPath = modules.state.getSessionContextPath(sessionFile)

      const initModule = env.helpers.requireDist('state/init.js')
      initModule.initializeStateStores()
      initModule.initializeStateStores()
      const result = modules.state.ensureAttachedSessionContext(sessionFile)
      assert.deepEqual(result.context, { teamName: 'derive-team', memberName: 'team-lead' })
      assert.equal(result.source, 'derived')
      assert.equal(fs.existsSync(hashedPath), true, 'ensure-derived binding should be written to hash path')
      assert.deepEqual(JSON.parse(fs.readFileSync(hashedPath, 'utf8')), { teamName: 'derive-team', memberName: 'team-lead' })
    })
  },
}
