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

    function assertDefaultV1Config(config, label) {
      assert.equal(config.version, 1, `${label} should declare version: 1`)
      assert.ok(config.agents && typeof config.agents === 'object' && !Array.isArray(config.agents), `${label} should contain agents object`)
      for (const role of ['planner', 'researcher', 'implementer']) {
        assert.deepEqual(config.agents[role], { model: null }, `${label} should default ${role} model through agents.<role>.model`)
      }
      assert.deepEqual(config.automation, {
        mode: 'manual',
        approvedPlan: { enabled: true, maxConsecutiveSteps: 5 },
      }, `${label} should include manual approved-plan automation defaults`)
      assert.deepEqual(config.ui, {
        teamPanel: { refreshMode: 'debounced', minRefreshMs: 250 },
      }, `${label} should include debounced team panel UI defaults`)
      assert.equal(Object.hasOwn(config, 'agentModels'), false, `${label} should not write legacy-only agentModels`)
    }

    function assertLegacyMigrationDiagnostic(diagnostics, label) {
      const diagnosticText = diagnostics.map(item => `${item.code}: ${item.message}`).join('\n')
      assert.match(diagnosticText, /legacy|migrat/i, `${label} should include legacy/migration guidance; diagnostics=${diagnosticText}`)
    }

    const commandConfigModule = env.helpers.requireDist('commands/config.js')

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
      assertLegacyMigrationDiagnostic(result.diagnostics, 'legacy agentModels discovery')
      const planner = result.agents.find(agent => agent.name === 'planner')
      const researcher = result.agents.find(agent => agent.name === 'researcher')
      const implementer = result.agents.find(agent => agent.name === 'implementer')
      assert.equal(planner.model, 'planner-model')
      assert.equal(researcher.model, undefined, 'empty string config should mean default/no override')
      assert.equal(implementer.model, undefined, 'null config should mean default/no override')
    })

    withHome('v1-config-schema-preferred-over-legacy', home => {
      writeConfig(home, JSON.stringify({
        version: 1,
        agents: {
          researcher: { model: 'v1-researcher-model' },
          planner: { model: null },
          implementer: { model: 'v1-implementer-model' },
        },
        agentModels: {
          researcher: 'legacy-researcher-model',
          planner: 'legacy-planner-model',
          implementer: 'legacy-implementer-model',
        },
      }))

      const loaded = configModule.loadAgentConfig({ knownRoles: ['planner', 'researcher', 'implementer'] })
      assert.equal(loaded.exists, true)
      assert.equal(loaded.config.version, 1, 'loaded config should retain v1 marker')
      assert.equal(loaded.config.agents.researcher.model, 'v1-researcher-model')
      assert.equal(loaded.config.agents.planner.model, null)
      assert.equal(loaded.config.agents.implementer.model, 'v1-implementer-model')
      assert.equal(loaded.config.agentModels.researcher, 'v1-researcher-model', 'effective legacy compatibility map should be derived from v1 agents and beat legacy agentModels')
      assert.equal(loaded.config.agentModels.planner, null, 'v1 null model should beat legacy agentModels')
      assert.equal(loaded.config.agentModels.implementer, 'v1-implementer-model')

      const discovered = agentsModule.discoverAgentsWithDiagnostics()
      assert.equal(discovered.config.version, 1)
      assert.equal(discovered.config.agents.researcher.model, 'v1-researcher-model')
      assert.equal(discovered.config.agentModels.researcher, 'v1-researcher-model')
      assert.equal(discovered.agents.find(agent => agent.name === 'researcher').model, 'v1-researcher-model')
      assert.equal(discovered.agents.find(agent => agent.name === 'planner').model, undefined, 'v1 null model should keep planner on default despite legacy fallback value')
      assert.equal(discovered.agents.find(agent => agent.name === 'implementer').model, 'v1-implementer-model')
    })

    withHome('legacy-config-show-validate-migration-warning', home => {
      writeConfig(home, JSON.stringify({ agentModels: { planner: 'legacy-planner-model', researcher: null, implementer: null } }))
      const loaded = configModule.loadAgentConfig({ knownRoles: ['planner', 'researcher', 'implementer'] })
      assert.equal(loaded.config.agentModels.planner, 'legacy-planner-model')
      assertLegacyMigrationDiagnostic(loaded.diagnostics, 'legacy loadAgentConfig')

      const show = commandConfigModule.buildConfigShowText()
      assert.ok(show.text.includes('- planner: legacy-planner-model'))
      assert.match(show.text, /legacy|migrat/i, 'config show should include legacy/migration warning for legacy agentModels')

      const validate = commandConfigModule.buildConfigValidateText()
      assert.match(validate.text, /legacy|migrat/i, 'config validate should include legacy/migration warning for legacy agentModels')
    })

    withHome('config-init-default-v1-non-overwrite-and-missing-guidance', home => {
      const bundledExample = configModule.readBundledConfigExample()
      assertDefaultV1Config(bundledExample, 'bundled config.example.json')

      const missingShow = commandConfigModule.buildConfigShowText()
      assert.ok(missingShow.text.includes('Exists: no'), 'missing config show should say config does not exist')
      assert.match(missingShow.text, /config init|bootstrap|create config/i, 'missing config show should guide bootstrap/init')
      assert.match(missingShow.text, /version|agents\./i, 'missing config show should mention v1/agents schema so fresh users are not left with legacy-only guidance')

      const init = commandConfigModule.initConfigText()
      assert.equal(init.level, 'info')
      const configPath = path.join(home, 'config.json')
      assert.equal(fs.existsSync(configPath), true, 'config init should create missing runtime config')
      const initialized = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      assertDefaultV1Config(initialized, '/team config init output')

      const customExisting = {
        version: 1,
        agents: {
          planner: { model: 'custom-existing-planner' },
          researcher: { model: null },
          implementer: { model: null },
        },
      }
      fs.writeFileSync(configPath, `${JSON.stringify(customExisting, null, 2)}\n`, 'utf8')
      const before = fs.readFileSync(configPath, 'utf8')
      const secondInit = commandConfigModule.initConfigText()
      assert.equal(secondInit.level, 'warning')
      assert.match(secondInit.text, /Refusing to overwrite|already exists/i)
      assert.equal(fs.readFileSync(configPath, 'utf8'), before, 'config init must never overwrite an existing config')
    })

    withHome('config-migrate-dry-run-preview-no-write', home => {
      const configPath = path.join(home, 'config.json')
      writeConfig(home, `${JSON.stringify({
        version: 1,
        agents: {
          researcher: { model: 'v1-researcher-model' },
          planner: { model: null },
        },
        agentModels: {
          researcher: 'legacy-researcher-ignored',
          planner: 'legacy-planner-ignored',
          implementer: 'legacy-implementer-model',
        },
        automation: {
          mode: 'manual',
          approvedPlan: { enabled: false, maxConsecutiveSteps: 7 },
        },
        ui: {
          teamPanel: { refreshMode: 'debounced', minRefreshMs: 500 },
        },
      }, null, 2)}\n`)
      const beforeBytes = fs.readFileSync(configPath, 'utf8')
      const beforeMtimeMs = fs.statSync(configPath).mtimeMs
      const preview = configModule.buildProposedV1AgentConfig({ knownRoles: ['planner', 'researcher', 'implementer'] })
      assert.equal(preview.proposed.version, 1)
      assert.deepEqual(preview.proposed.agents.researcher, { model: 'v1-researcher-model' }, 'v1 model should beat legacy during dry-run preview')
      assert.deepEqual(preview.proposed.agents.planner, { model: null }, 'v1 null should beat legacy during dry-run preview')
      assert.deepEqual(preview.proposed.agents.implementer, { model: 'legacy-implementer-model' }, 'non-empty legacy model should migrate into missing v1 role')
      assert.deepEqual(preview.proposed.automation, { mode: 'manual', approvedPlan: { enabled: false, maxConsecutiveSteps: 7 } })
      assert.deepEqual(preview.proposed.ui, { teamPanel: { refreshMode: 'debounced', minRefreshMs: 500 } })
      assert.equal(Object.hasOwn(preview.proposed, 'agentModels'), false, 'dry-run proposed v1 config should not include legacy agentModels')
      assert.equal(fs.readFileSync(configPath, 'utf8'), beforeBytes, 'dry-run preview helper must not write config bytes')
      assert.equal(fs.statSync(configPath).mtimeMs, beforeMtimeMs, 'dry-run preview helper must not change mtime')

      const text = commandConfigModule.buildConfigMigrateDryRunText().text
      assert.match(text, /migrate/i)
      assert.match(text, /dry-run|dry run/i)
      assert.match(text, /Proposed v1 config|would be written|version/i)
      assert.match(text, /agents/i)
      assert.match(text, /automation/i)
      assert.match(text, /teamPanel/i)
      assert.equal(fs.readFileSync(configPath, 'utf8'), beforeBytes, 'dry-run command text must not write config bytes')
      assert.equal(fs.statSync(configPath).mtimeMs, beforeMtimeMs, 'dry-run command text must not change mtime')
    })

    withHome('config-migrate-dry-run-invalid-json-actionable', home => {
      const configPath = path.join(home, 'config.json')
      writeConfig(home, '{ invalid json')
      const beforeBytes = fs.readFileSync(configPath, 'utf8')
      const beforeMtimeMs = fs.statSync(configPath).mtimeMs
      const preview = commandConfigModule.buildConfigMigrateDryRunText()
      assert.equal(preview.level, 'error')
      assert.match(preview.text, /config_invalid_json|Failed to parse/i)
      assert.match(preview.text, /dry-run|no file was written|Fix the JSON/i)
      assert.match(preview.text, /version/i)
      assert.equal(fs.readFileSync(configPath, 'utf8'), beforeBytes, 'invalid dry-run must not write config bytes')
      assert.equal(fs.statSync(configPath).mtimeMs, beforeMtimeMs, 'invalid dry-run must not change mtime')
    })

    withHome('config-migrate-dry-run-missing-actionable', home => {
      const configPath = path.join(home, 'config.json')
      const preview = commandConfigModule.buildConfigMigrateDryRunText()
      assert.equal(preview.level, 'info')
      assert.match(preview.text, /Exists: no/i)
      assert.match(preview.text, /default v1 config|config init|proposed/i)
      assert.match(preview.text, /automation/i)
      assert.match(preview.text, /teamPanel/i)
      assert.equal(fs.existsSync(configPath), false, 'missing dry-run must not create config.json')
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
      assert.equal(spawnRes.details.modelSource, 'null')
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
