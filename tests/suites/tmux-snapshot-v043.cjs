const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

async function withTempHome(modules, name, fn) {
  const previousHome = process.env.PI_AGENTTEAM_HOME
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `agentteam-tmux-snapshot-${name}-`))
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

async function withCoreTmuxAdapter(modules, coreTmux, fn) {
  const originalResolvePaneBinding = modules.tmux.resolvePaneBinding
  const originalListAgentTeamPanes = modules.tmux.listAgentTeamPanes
  modules.tmux.resolvePaneBinding = coreTmux.resolvePaneBinding
  modules.tmux.listAgentTeamPanes = coreTmux.listAgentTeamPanes
  try {
    return await fn()
  } finally {
    modules.tmux.resolvePaneBinding = originalResolvePaneBinding
    modules.tmux.listAgentTeamPanes = originalListAgentTeamPanes
  }
}

function makeSnapshotTeam(modules, name, workerCount, leaderCwd, rawName = name) {
  modules.state.deleteTeamState(name)
  const team = modules.state.createInitialTeamState({
    teamName: rawName,
    storageName: name,
    leaderSessionFile: `/tmp/${name}-leader.jsonl`,
    leaderCwd,
    description: 'v0.4.3 tmux snapshot characterization fixture',
  })
  const paneIds = []
  for (let index = 0; index < workerCount; index += 1) {
    const paneId = `%${name}-${index + 1}`
    paneIds.push(paneId)
    modules.state.upsertMember(team, {
      name: `worker-${index + 1}`,
      role: 'implementer',
      cwd: leaderCwd,
      sessionFile: `/tmp/${name}-worker-${index + 1}.jsonl`,
      paneId,
      windowTarget: 'snapshot:@1',
      status: 'idle',
    })
  }
  modules.state.writeTeamState(team)
  modules.runtimePanes.invalidatePaneReconcileCache(name)
  return { team, paneIds }
}

function createCountingTmuxClient(livePaneIds, orphanPaneIds = []) {
  const calls = []
  function record(args) {
    calls.push([...args])
  }
  function respondDisplayMessage(args) {
    const targetIndex = args.indexOf('-t')
    const paneId = targetIndex >= 0 ? args[targetIndex + 1] : '%current'
    if (!livePaneIds.has(paneId)) return { ok: false, stdout: '', stderr: `missing ${paneId}` }
    const format = args[args.length - 1] || ''
    if (format.includes('#{session_name}:#{window_id}')) return { ok: true, stdout: 'snapshot:@1' }
    if (format.includes('#{pane_id}')) return { ok: true, stdout: paneId }
    return { ok: true, stdout: paneId }
  }
  function respondListPanes() {
    const rows = [
      ...Array.from(livePaneIds).map(paneId => `${paneId}\tsnapshot:@1\tagentteam ${paneId}\tpi`),
      ...orphanPaneIds.map(paneId => `${paneId}\tsnapshot:@9\tagentteam orphan ${paneId}\tpi`),
    ]
    return { ok: true, stdout: rows.join('\n') }
  }
  return {
    calls,
    exec(args) {
      record(args)
      if (args[0] === 'display-message') return respondDisplayMessage(args).stdout
      if (args[0] === 'list-panes') return respondListPanes().stdout
      return ''
    },
    execNoThrow(args) {
      record(args)
      if (args[0] === 'display-message') return respondDisplayMessage(args)
      if (args[0] === 'list-panes') return respondListPanes()
      return { ok: true, stdout: '' }
    },
    async execAsync(args) {
      record(args)
      if (args[0] === 'display-message') return respondDisplayMessage(args).stdout
      if (args[0] === 'list-panes') return respondListPanes().stdout
      return ''
    },
    async execNoThrowAsync(args) {
      record(args)
      if (args[0] === 'display-message') return respondDisplayMessage(args)
      if (args[0] === 'list-panes') return respondListPanes()
      return { ok: true, stdout: '' }
    },
  }
}

function countCommand(calls, command) {
  return calls.filter(args => args[0] === command).length
}

function assertPanelLoadDoesNotMutateMailbox(modules, teamName, messageId) {
  const stored = modules.state.readMailbox(teamName, 'team-lead').find(item => item.id === messageId)
  assert.ok(stored, 'mailbox fixture should remain present after panel data load')
  assert.equal(stored.readAt, undefined, 'panel load should not mark mailbox items read')
  assert.equal(stored.deliveredAt, undefined, 'panel load should not mark mailbox items delivered')
  assert.equal(String(stored.text || '').includes('full report body sentinel'), true, 'fixture should retain full body in mailbox store')
}

async function withTmuxClient(tmuxClientModule, fakeClient, fn) {
  assert.equal(typeof tmuxClientModule.withTmuxClientForTests, 'function', 'tmux/client.js should expose withTmuxClientForTests for fake tmux tests')
  return await tmuxClientModule.withTmuxClientForTests(fakeClient, fn)
}

function exerciseParserContract(snapshotModule) {
  assert.equal(typeof snapshotModule.parseTmuxPaneSnapshot, 'function', 'tmux/snapshot.js should export parseTmuxPaneSnapshot(stdout, capturedAt)')
  assert.equal(typeof snapshotModule.captureTmuxSnapshot, 'function', 'tmux/snapshot.js should export captureTmuxSnapshot(capturedAt)')
  assert.equal(typeof snapshotModule.TMUX_PANE_SNAPSHOT_FORMAT, 'string', 'tmux/snapshot.js should export snapshot list-panes format')

  const snapshot = snapshotModule.parseTmuxPaneSnapshot([
    '%pane-a\tsession:@1\tagentteam leader\tpi',
    '%pane-empty-label\tsession:@1\t\tbash',
    '%pane-empty-command\tsession:@1\tagentteam worker\t',
    'malformed-line-without-tabs',
    '\tsession:@1\tagentteam missing pane\tpi',
    '%pane-a\tsession:@2\tagentteam duplicate last wins\tzsh',
    '',
  ].join('\n'), 12345)

  assert.equal(snapshot.capturedAt, 12345, 'parser should preserve explicit capturedAt')
  assert.equal(snapshot.ok, true, 'parser snapshots should be marked ok')
  assert.deepEqual(snapshot.panes.map(item => item.paneId), ['%pane-a', '%pane-empty-label', '%pane-empty-command'], 'parser should skip malformed/empty pane id lines and keep first-seen order')
  assert.equal(snapshot.panes.length, 3, 'parser should keep only well-formed rows with pane id')
  assert.equal(snapshot.byPaneId['%pane-empty-label'].label, '', 'parser should allow empty labels')
  assert.equal(snapshot.byPaneId['%pane-empty-command'].currentCommand, '', 'parser should allow empty currentCommand')
  assert.equal(snapshot.byPaneId['%pane-a'].target, 'session:@2', 'duplicate pane ids should use last row values')
  assert.equal(snapshot.byPaneId['%pane-a'].label, 'agentteam duplicate last wins', 'duplicate pane ids should be last-wins in byPaneId')
  assert.equal(snapshot.byPaneId['%pane-a'].currentCommand, 'zsh', 'duplicate pane ids should update currentCommand')
  assert.equal(snapshot.panes[0], snapshot.byPaneId['%pane-a'], 'panes should reference the last-wins item while retaining first-seen order')
}

async function exerciseCaptureContract(snapshotModule, tmuxClientModule) {
  const fakeClient = createCountingTmuxClient(new Set(['%capture-a', '%capture-b']))
  await withTmuxClient(tmuxClientModule, fakeClient, async () => {
    const snapshot = snapshotModule.captureTmuxSnapshot(67890)
    assert.equal(snapshot.capturedAt, 67890, 'captureTmuxSnapshot should preserve explicit capturedAt')
    assert.equal(snapshot.ok, true, 'successful capture snapshots should be marked ok')
    assert.equal(snapshot.panes.length, 2, 'captureTmuxSnapshot should parse fake list-panes rows')
    assert.equal(snapshot.byPaneId['%capture-a'].target, 'snapshot:@1')
    assert.equal(snapshot.byPaneId['%capture-b'].currentCommand, 'pi')
  })
  assert.equal(countCommand(fakeClient.calls, 'list-panes'), 1, 'captureTmuxSnapshot should call list-panes once')
  assert.equal(countCommand(fakeClient.calls, 'display-message'), 0, 'captureTmuxSnapshot should not call display-message')
  assert.deepEqual(fakeClient.calls[0], ['list-panes', '-a', '-F', snapshotModule.TMUX_PANE_SNAPSHOT_FORMAT], 'captureTmuxSnapshot should use the exported snapshot format')
}

async function exerciseLookupHelpersContract(snapshotModule, tmuxClientModule) {
  for (const name of ['findPaneInSnapshot', 'paneExistsInSnapshot', 'resolvePaneBindingFromSnapshot', 'listAgentTeamPanesFromSnapshot']) {
    assert.equal(typeof snapshotModule[name], 'function', `tmux/snapshot.js should export ${name}`)
  }

  const snapshot = snapshotModule.parseTmuxPaneSnapshot([
    '%agent-a\tsnapshot:@1\tagentteam worker a\tpi',
    '%plain-shell\tsnapshot:@1\t\tbash',
    '%agent-b\tsnapshot:@2\tagentteam orphan candidate\tzsh',
    '%agent-empty-command\tsnapshot:@3\tagentteam empty command\t',
  ].join('\n'), 24680)
  const fakeClient = createCountingTmuxClient(new Set(['%agent-a', '%agent-b', '%plain-shell']))

  await withTmuxClient(tmuxClientModule, fakeClient, async () => {
    assert.equal(snapshotModule.findPaneInSnapshot(snapshot, '%agent-a'), snapshot.byPaneId['%agent-a'], 'findPaneInSnapshot should return the snapshot item')
    assert.equal(snapshotModule.findPaneInSnapshot(snapshot, '%missing'), null, 'findPaneInSnapshot should return null for missing panes')
    assert.equal(snapshotModule.findPaneInSnapshot(snapshot, ''), null, 'findPaneInSnapshot should return null for empty pane id')
    assert.equal(snapshotModule.paneExistsInSnapshot(snapshot, '%agent-a'), true, 'paneExistsInSnapshot should return true for present panes')
    assert.equal(snapshotModule.paneExistsInSnapshot(snapshot, '%missing'), false, 'paneExistsInSnapshot should return false for missing panes')
    assert.deepEqual(snapshotModule.resolvePaneBindingFromSnapshot(snapshot, '%agent-a'), {
      paneId: '%agent-a',
      target: 'snapshot:@1',
      label: 'agentteam worker a',
    }, 'resolvePaneBindingFromSnapshot should expose paneId/target/label')
    assert.equal(snapshotModule.resolvePaneBindingFromSnapshot(snapshot, '%missing'), null, 'resolvePaneBindingFromSnapshot should return null for missing panes')
    assert.deepEqual(snapshotModule.listAgentTeamPanesFromSnapshot(snapshot), [
      {
        paneId: '%agent-a',
        target: 'snapshot:@1',
        label: 'agentteam worker a',
        currentCommand: 'pi',
      },
      {
        paneId: '%agent-b',
        target: 'snapshot:@2',
        label: 'agentteam orphan candidate',
        currentCommand: 'zsh',
      },
      {
        paneId: '%agent-empty-command',
        target: 'snapshot:@3',
        label: 'agentteam empty command',
        currentCommand: '',
      },
    ], 'listAgentTeamPanesFromSnapshot should return listAgentTeamPanes-compatible labeled pane items')
  })

  assert.equal(fakeClient.calls.length, 0, 'snapshot lookup helpers should not call tmux subprocesses')
}

module.exports = {
  name: 'TmuxSnapshot v0.4.3 characterization',
  async run(env) {
    const { modules, helpers } = env
    const tmuxClient = helpers.requireDist('tmux/client.js')
    const coreTmux = helpers.requireDist('tmux/core.js')
    const snapshotModule = helpers.requireDist('tmux/snapshot.js')
    const adapterTmux = helpers.requireDist('adapters/tmux/index.js')
    const failures = []

    exerciseParserContract(snapshotModule)
    await exerciseCaptureContract(snapshotModule, tmuxClient)
    await exerciseLookupHelpersContract(snapshotModule, tmuxClient)
    assert.equal(adapterTmux.parseTmuxPaneSnapshot, coreTmux.parseTmuxPaneSnapshot, 'adapter tmux facade should expose parseTmuxPaneSnapshot')
    assert.equal(adapterTmux.captureTmuxSnapshot, coreTmux.captureTmuxSnapshot, 'adapter tmux facade should expose captureTmuxSnapshot')
    assert.equal(adapterTmux.findPaneInSnapshot, coreTmux.findPaneInSnapshot, 'adapter tmux facade should expose findPaneInSnapshot')
    assert.equal(adapterTmux.paneExistsInSnapshot, coreTmux.paneExistsInSnapshot, 'adapter tmux facade should expose paneExistsInSnapshot')
    assert.equal(adapterTmux.resolvePaneBindingFromSnapshot, coreTmux.resolvePaneBindingFromSnapshot, 'adapter tmux facade should expose resolvePaneBindingFromSnapshot')
    assert.equal(adapterTmux.listAgentTeamPanesFromSnapshot, coreTmux.listAgentTeamPanesFromSnapshot, 'adapter tmux facade should expose listAgentTeamPanesFromSnapshot')

    await withTempHome(modules, 'v043', async () => {
      const attached = makeSnapshotTeam(modules, 'snapshot-attached-suite', 5, '/tmp/tmux-snapshot-v043/attached')
      const globalA = makeSnapshotTeam(modules, 'snapshot-global-a-suite', 3, '/tmp/tmux-snapshot-v043/project-a', 'Shared Snapshot')
      const globalB = makeSnapshotTeam(modules, 'snapshot-global-b-suite', 3, '/tmp/tmux-snapshot-v043/project-b', 'Shared Snapshot')
      const livePaneIds = new Set([...attached.paneIds, ...globalA.paneIds, ...globalB.paneIds])
      const orphanPaneIds = ['%snapshot-orphan-a', '%snapshot-orphan-b']

      const message = modules.state.pushMailboxMessage(attached.team.name, 'team-lead', {
        from: 'worker-1',
        to: 'team-lead',
        type: 'report_done',
        summary: 'TmuxSnapshot read-boundary fixture',
        text: 'full report body sentinel: panel snapshot characterization must not hydrate through receive/read semantics',
      })

      await withCoreTmuxAdapter(modules, coreTmux, async () => {
        const attachedFakeClient = createCountingTmuxClient(livePaneIds, orphanPaneIds)
        modules.runtimePanes.invalidatePaneReconcileCache(attached.team.name)
        await withTmuxClient(tmuxClient, attachedFakeClient, async () => {
          const attachedData = modules.panelDataSource.loadPanelData(attached.team.name)
          assert.equal(attachedData.mode, 'attached', 'attached fixture should load attached panel data')
        })
        assertPanelLoadDoesNotMutateMailbox(modules, attached.team.name, message.id)
        const attachedDisplayMessages = countCommand(attachedFakeClient.calls, 'display-message')
        const attachedListPanes = countCommand(attachedFakeClient.calls, 'list-panes')
        if (attachedListPanes > 1 || attachedDisplayMessages !== 0) {
          failures.push([
            'attached light reconcile /team load should use a bounded tmux snapshot instead of per-member display-message',
            `expected <=1 list-panes and 0 display-message; got list-panes=${attachedListPanes}, display-message=${attachedDisplayMessages}`,
            `commands=${JSON.stringify(attachedFakeClient.calls)}`,
          ].join('\n'))
        }

        const globalFakeClient = createCountingTmuxClient(livePaneIds, orphanPaneIds)
        modules.runtimePanes.invalidatePaneReconcileCache()
        await withTmuxClient(tmuxClient, globalFakeClient, async () => {
          const globalData = modules.panelDataSource.loadPanelData(null)
          assert.equal(globalData.mode, 'global', 'global fixture should load global panel data')
          assert.equal(globalData.teams.filter(team => team.identity?.displayName === 'Shared Snapshot').length, 2, 'TeamIdentity same-display teams should remain distinct in global data')
          assert.ok(globalData.orphanPanes.some(pane => pane.paneId === '%snapshot-orphan-a'), 'global panel should still expose orphan pane snapshot rows')
        })
        const globalDisplayMessages = countCommand(globalFakeClient.calls, 'display-message')
        const globalListPanes = countCommand(globalFakeClient.calls, 'list-panes')
        if (globalListPanes > 1 || globalDisplayMessages !== 0) {
          failures.push([
            'global /team load should reuse one tmux snapshot for team pane health and orphan pane discovery',
            `expected <=1 list-panes and 0 display-message; got list-panes=${globalListPanes}, display-message=${globalDisplayMessages}`,
            `commands=${JSON.stringify(globalFakeClient.calls)}`,
          ].join('\n'))
        }
      })
    })

    assert.equal(failures.length, 0, failures.join('\n\n'))
  },
}
