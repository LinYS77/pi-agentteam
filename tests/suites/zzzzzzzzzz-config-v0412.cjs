const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const EXPECTED_VERSION = '0.6.8'
const CONFIG_PANEL_SENTINEL = 'V0412_CONFIG_PANEL_FULL_DUMP_SHOULD_NOT_LEAK'
const DEFAULT_ROLES = ['researcher', 'planner', 'implementer']

function pushIfMissing(failures, condition, message) {
  if (!condition) failures.push(message)
}

function json(value) {
  return JSON.stringify(value)
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-config-v0412-${name}-`))
  try {
    process.env.PI_AGENTTEAM_HOME = home
    modules.state.invalidateSessionContextCache()
    modules.runtimePanes.invalidatePaneReconcileCache()
    return await fn(home)
  } finally {
    modules.runtimePanes.invalidatePaneReconcileCache()
    modules.state.invalidateSessionContextCache()
    process.env.PI_AGENTTEAM_HOME = previousHome
    fs.rmSync(home, { recursive: true, force: true })
  }
}

function writeConfig(home, config) {
  fs.mkdirSync(home, { recursive: true })
  fs.writeFileSync(path.join(home, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

function writeSessionContext(modules, sessionFile, context) {
  modules.state.writeSessionContext(sessionFile, context)
}

function readTeamFromHome(home, teamName) {
  const teamPath = path.join(home, 'teams', teamName, 'team.json')
  return fs.existsSync(teamPath) ? readJson(teamPath) : null
}

function writeTeamToHome(home, team) {
  const teamPath = path.join(home, 'teams', team.name, 'team.json')
  fs.mkdirSync(path.dirname(teamPath), { recursive: true })
  fs.writeFileSync(teamPath, `${JSON.stringify(team, null, 2)}\n`, 'utf8')
}

function fullV1SchemaExpectations(config, label, failures) {
  pushIfMissing(failures, config?.version === 1, `${label} should include version:1`)
  for (const role of DEFAULT_ROLES) {
    pushIfMissing(failures, typeof config?.agents?.[role] === 'object' && !Array.isArray(config.agents[role]), `${label} should include agents.${role}`)
    pushIfMissing(failures, Object.prototype.hasOwnProperty.call(config?.agents?.[role] ?? {}, 'model'), `${label} should include agents.${role}.model`)
  }
  pushIfMissing(failures, config?.automation?.mode === 'manual', `${label} should include automation.mode='manual'`)
  pushIfMissing(failures, config?.automation?.approvedPlan?.enabled === true, `${label} should include automation.approvedPlan.enabled=true`)
  pushIfMissing(failures, config?.automation?.approvedPlan?.maxConsecutiveSteps === 5, `${label} should include automation.approvedPlan.maxConsecutiveSteps=5`)
  pushIfMissing(failures, config?.ui?.teamPanel?.refreshMode === 'debounced', `${label} should include ui.teamPanel.refreshMode='debounced'`)
  pushIfMissing(failures, config?.ui?.teamPanel?.minRefreshMs === 250, `${label} should include ui.teamPanel.minRefreshMs=250`)
}

function diagnosticText(diagnostics) {
  return diagnostics.map(item => `${item.level}:${item.code}:${item.jsonPath ?? ''}:${item.message}`).join('\n')
}

function assertNoConfigSentinel(label, value, failures) {
  pushIfMissing(failures, !json(value).includes(CONFIG_PANEL_SENTINEL), `${label} should not expose arbitrary full config sentinel`)
}

async function createAttachedTeam(input) {
  const { env, home, teamName, sessionFile, ctx } = input
  const createTool = env.pi.__tools.get('agentteam_create')
  const result = await createTool.execute(`config-v0412-create-${teamName}`, {
    team_name: teamName,
    description: `config v0.4.12 ${teamName}`,
  }, null, () => {}, ctx)
  assert.equal(result.details?.denied, undefined, `create should not be denied: ${json(result)}`)
  const team = readTeamFromHome(home, teamName)
  assert.ok(team, `created team ${teamName} should exist`)
  team.leaderSessionFile = sessionFile
  team.members['team-lead'].sessionFile = sessionFile
  writeTeamToHome(home, team)
  writeSessionContext(env.modules, sessionFile, { teamName, memberName: 'team-lead' })
  return team
}

async function spawnWorker(input) {
  const { env, ctx, name, role } = input
  const spawnTool = env.pi.__tools.get('agentteam_spawn')
  const result = await spawnTool.execute(`config-v0412-spawn-${name}`, { name, role }, null, () => {}, ctx)
  if (result.details?.paneId) env.patches.livePanes.delete(result.details.paneId)
  return result
}

async function exerciseFullV1Schema(input) {
  const { failures, env } = input
  const configModule = env.helpers.requireDist('config.js')
  const bundled = configModule.readBundledConfigExample()
  fullV1SchemaExpectations(bundled, 'config.example.json', failures)
  const defaults = configModule.createDefaultAgentConfig()
  fullV1SchemaExpectations(defaults, 'createDefaultAgentConfig()', failures)
}

async function exerciseMissingConfigAndInit(input) {
  const { failures, env } = input
  const commandConfig = env.helpers.requireDist('commands/config.js')
  const packageJson = readJson(path.join(env.helpers.extRoot, 'package.json'))

  await withTempHome(env.modules, 'missing-init', async home => {
    const configPath = path.join(home, 'config.json')
    const missingShow = commandConfig.buildConfigShowText()
    pushIfMissing(failures, missingShow.text.includes(configPath), 'config show should include missing config path')
    pushIfMissing(failures, /Exists:\s*no/i.test(missingShow.text), 'missing config show should say exists=no')
    pushIfMissing(failures, /config init/i.test(missingShow.text), 'missing config show should guide /team config init')
    pushIfMissing(failures, fs.existsSync(configPath) === false, 'missing config show must not create config.json implicitly')

    const init = commandConfig.initConfigText()
    pushIfMissing(failures, init.level === 'info', 'config init should return info on first creation')
    pushIfMissing(failures, fs.existsSync(configPath), 'config init should create config.json')
    if (fs.existsSync(configPath)) fullV1SchemaExpectations(readJson(configPath), 'config init created config.json', failures)

    const customBytes = `${JSON.stringify({ version: 1, custom: 'preserve-byte-for-byte' }, null, 2)}\n`
    fs.writeFileSync(configPath, customBytes, 'utf8')
    const secondInit = commandConfig.initConfigText()
    pushIfMissing(failures, secondInit.level === 'warning', 'second config init should warn/refuse overwrite')
    pushIfMissing(failures, /refus|overwrite|already exists/i.test(secondInit.text), 'second config init should explain overwrite refusal')
    pushIfMissing(failures, fs.readFileSync(configPath, 'utf8') === customBytes, 'config init should preserve existing file byte-for-byte')
  })

  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
    pushIfMissing(failures, !packageJson.scripts?.[lifecycle], `package.json must not define ${lifecycle} lifecycle config writer`)
  }
  pushIfMissing(failures, packageJson.version === EXPECTED_VERSION, `package version should remain ${EXPECTED_VERSION}`)
}

async function exerciseLegacyCompatibility(input) {
  const { failures, env } = input
  const configModule = env.helpers.requireDist('config.js')
  const agentsModule = env.helpers.requireDist('agents.js')

  await withTempHome(env.modules, 'legacy-compat', async home => {
    writeConfig(home, {
      agentModels: {
        planner: 'legacy-planner-model',
        researcher: null,
        implementer: '',
        ghost: 'ghost-model',
      },
      unknownTopLevel: CONFIG_PANEL_SENTINEL,
    })
    const loaded = configModule.loadAgentConfig({ knownRoles: DEFAULT_ROLES })
    pushIfMissing(failures, loaded.config.agentModels?.planner === 'legacy-planner-model', 'legacy agentModels should remain readable')
    pushIfMissing(failures, /legacy|migrat/i.test(diagnosticText(loaded.diagnostics)), 'legacy agentModels should emit migration warning')
    pushIfMissing(failures, loaded.diagnostics.some(item => /unknown_role/.test(item.code) && item.jsonPath === 'agentModels.ghost'), 'legacy unknown role should warn compactly')
    pushIfMissing(failures, loaded.diagnostics.some(item => /unknown|unsupported/i.test(item.code) && item.jsonPath === 'unknownTopLevel'), 'unknown top-level config fields should warn compactly')

    const discovery = agentsModule.discoverAgentsWithDiagnostics()
    pushIfMissing(failures, discovery.agents.some(agent => agent.name === 'planner' && agent.model === 'legacy-planner-model'), 'legacy model should resolve during agent discovery')
    pushIfMissing(failures, discovery.agents.some(agent => agent.name === 'researcher'), 'unknown roles/fields should not break agent discovery')
  })
}

async function exerciseEffectiveModelSourceMetadata(input) {
  const { failures, env } = input
  await withTempHome(env.modules, 'model-source', async home => {
    const ctx = env.helpers.createCtx('/tmp/config-v0412-model-source', '/tmp/config-v0412-model-source-leader.jsonl', env.notifications)

    writeConfig(home, {
      version: 1,
      agents: {
        researcher: { model: 'v1-researcher-model' },
        planner: { model: null },
        implementer: { model: null },
      },
    })
    await createAttachedTeam({ env, home, teamName: 'config-v0412-v1-source', sessionFile: '/tmp/config-v0412-model-source-leader.jsonl', ctx })
    const v1Spawn = await spawnWorker({ env, ctx, name: 'V1 Researcher', role: 'researcher' })
    pushIfMissing(failures, v1Spawn.details?.modelLabel === 'v1-researcher-model', 'v1 spawn should include configured model label')
    pushIfMissing(failures, v1Spawn.details?.modelSource === 'v1', `v1 spawn modelSource should be v1, got ${v1Spawn.details?.modelSource}`)
    pushIfMissing(failures, /v1-researcher-model/.test(json(v1Spawn)), 'v1 spawn output/details should include model label')
    pushIfMissing(failures, /modelSource|source.*v1|v1/.test(v1Spawn.content?.[0]?.text ?? ''), 'v1 spawn text should include model source metadata')
  })

  await withTempHome(env.modules, 'legacy-source', async home => {
    const ctx = env.helpers.createCtx('/tmp/config-v0412-legacy-source', '/tmp/config-v0412-legacy-source-leader.jsonl', env.notifications)
    writeConfig(home, { agentModels: { planner: 'legacy-planner-model', researcher: null, implementer: null } })
    await createAttachedTeam({ env, home, teamName: 'config-v0412-legacy-source', sessionFile: '/tmp/config-v0412-legacy-source-leader.jsonl', ctx })
    const legacySpawn = await spawnWorker({ env, ctx, name: 'Legacy Planner', role: 'planner' })
    pushIfMissing(failures, legacySpawn.details?.modelLabel === 'legacy-planner-model', 'legacy spawn should include configured model label')
    pushIfMissing(failures, legacySpawn.details?.modelSource === 'legacy', `legacy spawn modelSource should be legacy, got ${legacySpawn.details?.modelSource}`)
  })

  await withTempHome(env.modules, 'null-default-source', async home => {
    const ctx = env.helpers.createCtx('/tmp/config-v0412-null-source', '/tmp/config-v0412-null-source-leader.jsonl', env.notifications)
    writeConfig(home, { version: 1, agents: { researcher: { model: null } } })
    await createAttachedTeam({ env, home, teamName: 'config-v0412-null-source', sessionFile: '/tmp/config-v0412-null-source-leader.jsonl', ctx })
    const nullSpawn = await spawnWorker({ env, ctx, name: 'Null Researcher', role: 'researcher' })
    pushIfMissing(failures, nullSpawn.details?.modelLabel === 'default', 'explicit null model should use default model label')
    pushIfMissing(failures, ['null', 'explicit-null', 'explicit_default', 'explicit-default'].includes(nullSpawn.details?.modelSource), `explicit null modelSource should be null/explicit-default, got ${nullSpawn.details?.modelSource}`)

    const missingSpawn = await spawnWorker({ env, ctx, name: 'Missing Implementer', role: 'implementer' })
    pushIfMissing(failures, missingSpawn.details?.modelSource === 'default', `missing role modelSource should be default, got ${missingSpawn.details?.modelSource}`)
  })
}

async function exerciseConfigCommandUx(input) {
  const { failures, env } = input
  const commandConfig = env.helpers.requireDist('commands/config.js')
  const command = env.pi.__commands.get('team')

  await withTempHome(env.modules, 'command-ux', async home => {
    const configPath = path.join(home, 'config.json')
    writeConfig(home, {
      version: 1,
      agents: {
        researcher: { model: 'ux-researcher-model' },
        planner: { model: null },
        implementer: { model: null },
      },
      agentModels: { planner: 'legacy-planner-ignored' },
      unknownTopLevel: CONFIG_PANEL_SENTINEL,
    })

    const show = commandConfig.buildConfigShowText()
    pushIfMissing(failures, show.text.includes(`Path: ${configPath}`), 'config show should include config path')
    pushIfMissing(failures, /Exists:\s*yes/i.test(show.text), 'config show should include exists=yes')
    pushIfMissing(failures, /Schema version:\s*1|version:\s*1/i.test(show.text), 'config show should include schema version')
    pushIfMissing(failures, /researcher.*ux-researcher-model.*v1|researcher.*source.*v1/i.test(show.text), 'config show should include effective per-role model source=v1')
    pushIfMissing(failures, /future-spawn-only|future spawn only|future spawns\/respawns/i.test(show.text), 'config show should include future-spawn-only note')

    const validate = commandConfig.buildConfigValidateText()
    pushIfMissing(failures, /Diagnostics:/i.test(validate.text), 'config validate should group diagnostics')
    pushIfMissing(failures, /warning|error/i.test(validate.text), 'config validate should include actionable warning/error groups')
    pushIfMissing(failures, /unknownTopLevel|unknown|unsupported/i.test(validate.text), 'config validate should report unknown fields actionably')

    const beforeBytes = fs.readFileSync(configPath, 'utf8')
    const ctx = env.helpers.createCtx('/tmp/config-v0412-command-ux', '/tmp/config-v0412-command-ux-leader.jsonl', env.notifications)
    env.notifications.length = 0
    await command.handler('config migrate --dry-run', ctx)
    const notification = env.notifications.at(-1)?.message ?? ''
    pushIfMissing(failures, /migrate/i.test(notification) && /dry-run|dry run/i.test(notification), '/team config migrate --dry-run should be recognized')
    pushIfMissing(failures, /proposed|would write|version/i.test(notification), 'config migrate --dry-run should show proposed v1 config')
    pushIfMissing(failures, /automation|teamPanel|agents/i.test(notification), 'config migrate --dry-run proposed config should include full v1 schema')
    pushIfMissing(failures, fs.readFileSync(configPath, 'utf8') === beforeBytes, 'config migrate --dry-run must not write/mutate config file')
  })
}

async function exerciseFutureSpawnOnly(input) {
  const { failures, env } = input
  await withTempHome(env.modules, 'future-spawn-only', async home => {
    const sessionFile = '/tmp/config-v0412-future-spawn-leader.jsonl'
    const ctx = env.helpers.createCtx('/tmp/config-v0412-future-spawn', sessionFile, env.notifications)
    writeConfig(home, { version: 1, agents: { researcher: { model: 'first-researcher-model' } } })
    await createAttachedTeam({ env, home, teamName: 'config-v0412-future-spawn', sessionFile, ctx })
    const first = await spawnWorker({ env, ctx, name: 'Future First', role: 'researcher' })
    pushIfMissing(failures, first.details?.modelLabel === 'first-researcher-model', 'first spawn should use initial config model')

    writeConfig(home, { version: 1, agents: { researcher: { model: 'second-researcher-model' } } })
    const afterConfigChange = readTeamFromHome(home, 'config-v0412-future-spawn')
    pushIfMissing(failures, afterConfigChange?.members?.['future-first']?.model === 'first-researcher-model', 'config change must not mutate existing member launched model')

    const second = await spawnWorker({ env, ctx, name: 'Future Second', role: 'researcher' })
    pushIfMissing(failures, second.details?.modelLabel === 'second-researcher-model', 'config changes should apply to future spawns')
    pushIfMissing(failures, readTeamFromHome(home, 'config-v0412-future-spawn')?.members?.['future-first']?.model === 'first-researcher-model', 'future spawn must not restart/mutate existing member model')
  })
}

async function exercisePanelCompactVisibility(input) {
  const { failures, env } = input
  await withTempHome(env.modules, 'panel-config', async home => {
    const sessionFile = '/tmp/config-v0412-panel-leader.jsonl'
    const ctx = env.helpers.createCtx('/tmp/config-v0412-panel', sessionFile, env.notifications)
    writeConfig(home, {
      version: 1,
      agents: { researcher: { model: 'panel-researcher-model' } },
      unknownTopLevel: CONFIG_PANEL_SENTINEL,
    })
    await createAttachedTeam({ env, home, teamName: 'config-v0412-panel', sessionFile, ctx })
    const repository = env.helpers.requireDist('state/repository.js').createStateRepository()
    const panel = repository.readTeamPanelModel('config-v0412-panel')
    assertNoConfigSentinel('repository panel model', panel, failures)
    pushIfMissing(failures, Boolean(panel?.config), 'repository /team panel model should include compact config status projection')
    pushIfMissing(failures, typeof panel?.config?.diagnosticCount === 'number', 'compact config panel projection should include diagnosticCount')
    pushIfMissing(failures, panel?.config?.exists === true, 'compact config panel projection should include exists=true')
    pushIfMissing(failures, panel?.config?.schemaVersion === 1, 'compact config panel projection should include schemaVersion=1')
    pushIfMissing(failures, /panel-researcher-model/.test(json(panel?.config ?? {})) && /v1/.test(json(panel?.config ?? {})), 'compact config panel projection should include effective model/source')
  })
}

function exercisePackageGuardrails(input) {
  const { failures, env } = input
  const pkg = readJson(path.join(env.helpers.extRoot, 'package.json'))
  pushIfMissing(failures, pkg.version === EXPECTED_VERSION, `package version should remain ${EXPECTED_VERSION}`)
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
    pushIfMissing(failures, !pkg.scripts?.[lifecycle], `package must not define ${lifecycle} lifecycle hook`)
  }
  pushIfMissing(failures, !json(pkg.scripts ?? {}).includes('npm version'), 'package scripts must not run npm version')
  pushIfMissing(failures, !json(pkg.scripts ?? {}).includes('npm publish'), 'package scripts must not run npm publish')
}

module.exports = {
  name: 'config runtime contract v0.4.12 RED characterization',
  async run(env) {
    const failures = []
    await exerciseFullV1Schema({ failures, env })
    await exerciseMissingConfigAndInit({ failures, env })
    await exerciseLegacyCompatibility({ failures, env })
    await exerciseEffectiveModelSourceMetadata({ failures, env })
    await exerciseConfigCommandUx({ failures, env })
    await exerciseFutureSpawnOnly({ failures, env })
    await exercisePanelCompactVisibility({ failures, env })
    exercisePackageGuardrails({ failures, env })

    assert.equal(failures.length, 0, failures.join('\n'))
  },
}
