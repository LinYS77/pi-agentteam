import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent'
import { getCurrentTeamName } from '../session.js'
import { openTeamPanel } from '../teamPanel.js'
import type { TeamPanelResult } from '../teamPanel.js'
import type { CommandHandlerDeps } from './shared.js'
import {
  cleanupAllAgentTeamData,
  deleteSelectedTeam,
  recoverTeamAsCurrentLeader,
  removeSelectedMember,
} from './teamActions.js'

async function confirmPanelAction(
  ctx: ExtensionContext,
  result: TeamPanelResult,
): Promise<boolean> {
  if (result.type === 'remove-member') {
    return ctx.ui.confirm(
      `Remove teammate ${result.memberName}?`,
      'This clears its session binding, mailbox, pane reference, and returns active tasks owned by it to pending.',
    )
  }
  if (result.type === 'delete-team') {
    return ctx.ui.confirm(
      `Delete team ${result.teamName}?`,
      'This removes its state, mailboxes, teammate panes, and bindings. Non-current leader panes may be killed; the current pane stays alive and its agentteam label is cleared.',
    )
  }
  if (result.type === 'cleanup-all') {
    return ctx.ui.confirm(
      'Cleanup all agentteam data?',
      'This deletes all agentteam teams, mailboxes, session bindings, and stale panes. Non-current leader panes may be killed; the current pane stays alive and its agentteam label is cleared.',
    )
  }
  if (result.type === 'recover-team') {
    return ctx.ui.confirm(
      `Recover team ${result.teamName} as current leader?`,
      'This attaches the current pi session and tmux pane as team-lead for the selected team.',
    )
  }
  return true
}

async function handlePanelResult(
  ctx: ExtensionContext,
  deps: CommandHandlerDeps,
  result: TeamPanelResult,
): Promise<{ continuePanel: boolean; teamName?: string | null }> {
  if (result.type === 'close') return { continuePanel: false }

  if (result.type === 'sync') {
    deps.resetMailboxSyncKey()
    deps.runMailboxSync(ctx)
    deps.invalidateStatus(ctx)
    ctx.ui.notify('Synced agentteam mailbox projection', 'info')
    return { continuePanel: true, teamName: getCurrentTeamName(ctx) }
  }

  const ok = await confirmPanelAction(ctx, result)
  if (!ok) return { continuePanel: true, teamName: getCurrentTeamName(ctx) }

  if (result.type === 'remove-member') {
    removeSelectedMember(ctx, deps, result.teamName, result.memberName)
    return { continuePanel: true, teamName: getCurrentTeamName(ctx) }
  }

  if (result.type === 'delete-team') {
    deleteSelectedTeam(ctx, deps, result.teamName)
    return { continuePanel: true, teamName: getCurrentTeamName(ctx) }
  }

  if (result.type === 'cleanup-all') {
    cleanupAllAgentTeamData(ctx, deps)
    return { continuePanel: true, teamName: getCurrentTeamName(ctx) }
  }

  if (result.type === 'recover-team') {
    const recovered = recoverTeamAsCurrentLeader(ctx, deps, result.teamName)
    return { continuePanel: true, teamName: recovered?.name ?? getCurrentTeamName(ctx) }
  }

  return { continuePanel: false }
}

export function registerTeamCommands(pi: ExtensionAPI, deps: CommandHandlerDeps): void {
  pi.registerCommand('team', {
    description: 'Open the agentteam console',
    handler: async (_args, ctx) => {
      let teamName: string | null | undefined = getCurrentTeamName(ctx)
      let shouldReopen = true
      while (shouldReopen) {
        shouldReopen = false
        const result = await openTeamPanel(ctx, teamName)
        if (!result) return
        const next = await handlePanelResult(ctx, deps, result)
        if (!next.continuePanel) return
        teamName = next.teamName
        shouldReopen = Boolean(ctx.hasUI)
      }
    },
  })
}
