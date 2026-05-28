const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

module.exports = {
  name: 'config diagnostics',
  async run(env) {
    const configModule = env.helpers.requireDist('config.js')
    const agentsModule = env.helpers.requireDist('agents.js')
    const stateModule = env.modules.state
    const tool = name => env.pi.__tools.get(name)
    const originalHome = process.env.PI_AGENTTEAM_HOME

    function withHome(name, fn) {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-${name}-`))
      const previousHome = process.env.PI_AGENTTEAM_HOME
      let result
      try {
        process.env.PI_AGENTTEAM_HOME = home
        result = fn(home)
        return result
      } finally {
        const cleanup = () => {
          process.env.PI_AGENTTEAM_HOME = previousHome
          fs.rmSync(home, { recursive: true, force: true })
        }
        if (result && typeof result.then === 'function') {
          return result.finally(cleanup)
        }
        cleanup()
      }
    }

    function readTeamStateFromHome(home, teamName) {
      const statePath = path.join(home, 'teams', teamName, 'team.json')
      return fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null
    }

    function writeTeamStateToHome(home, team) {
      const statePath = path.join(home, 'teams', team.name, 'team.json')
      fs.mkdirSync(path.dirname(statePath), { recursive: true })
      fs.writeFileSync(statePath, `${JSON.stringify(team, null, 2)}\n`, 'utf8')
    }

    function writeSessionContextToHome(_home, sessionFile, context) {
      const sessionPath = stateModule.getSessionContextPath(sessionFile)
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true })
      fs.writeFileSync(sessionPath, `${JSON.stringify(context, null, 2)}\n`, 'utf8')
    }

    function writeConfig(home, content) {
      fs.mkdirSync(home, { recursive: true })
      fs.writeFileSync(path.join(home, 'config.json'), content, 'utf8')
    }

    withHome('missing-config', home => {
      const loaded = configModule.loadAgentConfig({ knownRoles: ['planner', 'researcher', 'implementer'] })
      assert.equal(loaded.path, path.join(home, 'config.json'))
      assert.equal(stateModule.getConfigPath(), path.join(home, 'config.json'))
      assert.equal(loaded.exists, false)
      assert.deepEqual(loaded.config, {})
      assert.equal(loaded.diagnostics.length, 1)
      assert.equal(loaded.diagnostics[0].level, 'info')
      assert.equal(loaded.diagnostics[0].code, 'config_missing')
      assert.ok(loaded.diagnostics[0].message.includes(path.join(home, 'config.json')))
    })

    withHome('invalid-json-config', home => {
      writeConfig(home, '{ invalid json')
      const loaded = configModule.loadAgentConfig({ knownRoles: ['planner'] })
      assert.equal(loaded.exists, true)
      assert.deepEqual(loaded.config, {})
      assert.ok(loaded.diagnostics.some(item => item.level === 'error' && item.code === 'config_invalid_json'))
      const discovered = agentsModule.discoverAgentsWithDiagnostics()
      assert.ok(discovered.diagnostics.some(item => item.level === 'error' && item.code === 'config_invalid_json'))
    })

    withHome('shape-config', home => {
      writeConfig(home, JSON.stringify({
        agentModels: {
          planner: '  glm-5.1  ',
          researcher: '',
          implementer: null,
          ghost: 'ghost-model',
          bad: 123,
          unknownBad: 123,
        },
      }))
      const loaded = configModule.loadAgentConfig({ knownRoles: ['planner', 'researcher', 'implementer'] })
      assert.equal(loaded.exists, true)
      assert.equal(loaded.config.agentModels.planner, 'glm-5.1')
      assert.equal(loaded.config.agentModels.researcher, null)
      assert.equal(loaded.config.agentModels.implementer, null)
      assert.equal(Object.hasOwn(loaded.config.agentModels, 'ghost'), false)
      assert.equal(Object.hasOwn(loaded.config.agentModels, 'bad'), false)
      assert.ok(loaded.diagnostics.some(item => item.level === 'warning' && item.code === 'agentModels_unknown_role' && item.jsonPath === 'agentModels.ghost'))
      assert.ok(loaded.diagnostics.some(item => item.level === 'warning' && item.code === 'agentModels_invalid_value' && item.jsonPath === 'agentModels.bad'))
      assert.ok(loaded.diagnostics.some(item => item.level === 'warning' && item.code === 'agentModels_unknown_role' && item.jsonPath === 'agentModels.unknownBad'))
      assert.ok(loaded.diagnostics.some(item => item.level === 'warning' && item.code === 'agentModels_invalid_value' && item.jsonPath === 'agentModels.unknownBad'))
    })

    withHome('valid-discovery-config', home => {
      writeConfig(home, JSON.stringify({
        agentModels: {
          planner: 'planner-model',
          researcher: '',
          implementer: null,
        },
      }))
      const result = agentsModule.discoverAgentsWithDiagnostics()
      assert.equal(result.configPath, path.join(home, 'config.json'))
      assert.equal(result.configExists, true)
      assert.equal(result.config.agentModels.planner, 'planner-model')
      assert.equal(result.diagnostics.length, 0)
      const planner = result.agents.find(agent => agent.name === 'planner')
      const researcher = result.agents.find(agent => agent.name === 'researcher')
      const implementer = result.agents.find(agent => agent.name === 'implementer')
      assert.equal(planner.model, 'planner-model')
      assert.equal(researcher.model, undefined, 'empty string config should mean default/no override')
      assert.equal(implementer.model, undefined, 'null config should mean default/no override')
    })

    await withHome('spawn-invalid-config-diagnostics', async home => {
      writeConfig(home, JSON.stringify({ agentModels: { ghost: 'x', researcher: 123 } }))
      const ctx = env.helpers.createCtx('/tmp/config-spawn-project', '/tmp/config-spawn-leader.jsonl', env.notifications)
      let res = await tool('agentteam_create').execute('config-spawn-create', {
        team_name: 'config-spawn-suite',
        description: 'config spawn diagnostics',
      }, null, () => {}, ctx)
      assert.ok(res.content[0].text.includes('Created team config-spawn-suite'), `create failed: ${JSON.stringify(res)}`)
      const createdTeam = readTeamStateFromHome(home, 'config-spawn-suite')
      assert.ok(createdTeam, `created team should exist; create result=${JSON.stringify(res)}`)
      createdTeam.leaderSessionFile = '/tmp/config-spawn-leader.jsonl'
      createdTeam.members['team-lead'].sessionFile = '/tmp/config-spawn-leader.jsonl'
      writeTeamStateToHome(home, createdTeam)
      writeSessionContextToHome(home, '/tmp/config-spawn-leader.jsonl', { teamName: 'config-spawn-suite', memberName: 'team-lead' })
      res = await tool('agentteam_spawn').execute('config-spawn-worker', {
        name: 'Config Researcher',
        role: 'researcher',
      }, null, () => {}, ctx)
      assert.equal(res.details.denied, undefined, `spawn should not be denied on config diagnostics: ${res.content[0].text}`)
      assert.ok(res.details.memberName, `spawn should return memberName; result=${JSON.stringify(res)}`)
      assert.equal(res.details.memberName, 'config-researcher', 'spawn should still create the requested worker')
      assert.ok(res.content[0].text.includes('[model: default]'), 'invalid role model should fall back to default')
      assert.ok(res.content[0].text.includes('Config diagnostics:'), 'spawn text should surface config diagnostics')
      assert.ok(res.content[0].text.includes('agentModels_unknown_role'), 'spawn text should include unknown role diagnostic')
      assert.ok(res.content[0].text.includes('agentModels_invalid_value'), 'spawn text should include invalid value diagnostic')
      assert.equal(res.details.modelLabel, 'default')
      assert.equal(res.details.modelSource, 'default')
      assert.ok(res.details.configDiagnostics.some(item => item.code === 'agentModels_unknown_role'))
      assert.ok(res.details.configDiagnostics.some(item => item.code === 'agentModels_invalid_value'))
      const team = readTeamStateFromHome(home, 'config-spawn-suite')
      assert.equal(team.members['config-researcher'].model, undefined, 'invalid value should not set member model')
      env.patches.livePanes.delete(res.details.paneId)
    })

    await withHome('spawn-default-config-model', async home => {
      writeConfig(home, JSON.stringify({ agentModels: { researcher: null } }))
      const ctx = env.helpers.createCtx('/tmp/default-model-project', '/tmp/default-model-leader.jsonl', env.notifications)
      let res = await tool('agentteam_create').execute('default-model-create', {
        team_name: 'default-model-suite',
        description: 'default model spawn',
      }, null, () => {}, ctx)
      assert.ok(res.content[0].text.includes('Created team default-model-suite'))
      const createdTeam = readTeamStateFromHome(home, 'default-model-suite')
      createdTeam.leaderSessionFile = '/tmp/default-model-leader.jsonl'
      createdTeam.members['team-lead'].sessionFile = '/tmp/default-model-leader.jsonl'
      writeTeamStateToHome(home, createdTeam)
      writeSessionContextToHome(home, '/tmp/default-model-leader.jsonl', { teamName: 'default-model-suite', memberName: 'team-lead' })
      const spawnRes = await tool('agentteam_spawn').execute('default-model-spawn', {
        name: 'Default Researcher',
        role: 'researcher',
      }, null, () => {}, ctx)
      assert.ok(spawnRes.content[0].text.includes('[model: default]'), 'default model spawn should show default')
      assert.equal(spawnRes.details.model, undefined)
      assert.equal(spawnRes.details.modelLabel, 'default')
      assert.equal(spawnRes.details.modelSource, 'default')
      env.patches.livePanes.delete(spawnRes.details.paneId)
    })

    withHome('root-shape-config', home => {
      writeConfig(home, '[]')
      const loaded = configModule.loadAgentConfig({ knownRoles: ['planner'] })
      assert.deepEqual(loaded.config, {})
      assert.ok(loaded.diagnostics.some(item => item.level === 'error' && item.code === 'config_invalid_root'))
    })

    withHome('agentmodels-shape-config', home => {
      writeConfig(home, JSON.stringify({ agentModels: [] }))
      const loaded = configModule.loadAgentConfig({ knownRoles: ['planner'] })
      assert.deepEqual(loaded.config, {})
      assert.ok(loaded.diagnostics.some(item => item.level === 'warning' && item.code === 'agentModels_invalid_shape'))
    })

    withHome('delivery-mode-config', home => {
      writeConfig(home, JSON.stringify({ deliveryMode: 'bridge-only' }))
      const loaded = configModule.loadAgentConfig({ knownRoles: ['planner'] })
      assert.deepEqual(loaded.config, {})
      const bridgeOnlyDiagnostic = loaded.diagnostics.find(item => item.level === 'error' && item.code === 'deliveryMode_unsupported')
      assert.ok(bridgeOnlyDiagnostic)
      assert.ok(bridgeOnlyDiagnostic.message.includes('not a vNext config key'))
      assert.ok(bridgeOnlyDiagnostic.message.includes('remove deliveryMode'))

      writeConfig(home, JSON.stringify({ deliveryMode: 'legacy' }))
      const legacy = configModule.loadAgentConfig({ knownRoles: ['planner'] })
      assert.deepEqual(legacy.config, {})
      const legacyDiagnostic = legacy.diagnostics.find(item => item.level === 'error' && item.code === 'deliveryMode_unsupported')
      assert.ok(legacyDiagnostic)
      assert.ok(legacyDiagnostic.message.includes('not a vNext config key'))
      assert.ok(legacyDiagnostic.message.includes('pi-agentteam@0.5.0'))

      writeConfig(home, JSON.stringify({ deliveryMode: 'surprise' }))
      const unknown = configModule.loadAgentConfig({ knownRoles: ['planner'] })
      assert.deepEqual(unknown.config, {})
      const unknownDiagnostic = unknown.diagnostics.find(item => item.level === 'error' && item.code === 'deliveryMode_unsupported')
      assert.ok(unknownDiagnostic)
      assert.ok(unknownDiagnostic.message.includes('not a vNext config key'))
      assert.ok(unknownDiagnostic.message.includes('bridge-only'))
    })
  },
}
