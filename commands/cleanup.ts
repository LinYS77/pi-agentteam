import * as fs from 'node:fs'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import {
  clearSessionContext,
  getMailboxPath,
  listTeams,
  readTeamState,
  removeMember,
  writeTeamState,
} from '../state.js'
import { getCurrentTeamName, getSessionFile } from '../session.js'
import {
  killPane,
  listAgentTeamPanes,
  paneExists,
} from '../tmux.js'
import { TEAM_LEAD } from '../types.js'
import type { CommandHandlerDeps } from './shared.js'

export function registerCleanupCommands(pi: ExtensionAPI, deps: CommandHandlerDeps): void {
  pi.registerCommand('team-cleanup', {
    description: 'Delete all teams and clean orphan tmux panes',
    handler: async (_args, ctx) => {
      const currentTeamName = getCurrentTeamName(ctx)
      const teams = listTeams()
      const preview = teams
        .map(team => `- ${team.name}`)
        .join('\n')

      const currentAttachedTeam = currentTeamName ? readTeamState(currentTeamName) : null
      const livePaneIds = new Set<string>()
      if (currentAttachedTeam) {
        for (const member of Object.values(currentAttachedTeam.members)) {
          if (member.paneId) livePaneIds.add(member.paneId)
        }
      }
      const orphanPanes = listAgentTeamPanes().filter(pane => !livePaneIds.has(pane.paneId))
      const panePreview = orphanPanes
        .slice(0, 12)
        .map(pane => `- ${pane.paneId} ${pane.label}`)
        .join('\n')
      const paneMore = orphanPanes.length > 12 ? `\n- … ${orphanPanes.length - 12} more` : ''

      if (!preview && orphanPanes.length === 0) {
        ctx.ui.notify('No teams or orphan panes to clean up', 'info')
        return
      }

      const ok = await ctx.ui.confirm(
        'Cleanup all agentteam data?',
        [
          preview ? `Delete all teams:\n${preview}` : '',
          orphanPanes.length > 0 ? `Kill orphan panes:\n${panePreview}${paneMore}` : '',
        ].filter(Boolean).join('\n\n'),
      )
      if (!ok) return

      const deleted: string[] = []
      for (const team of teams) {
        deps.deleteTeamRuntime(team, { includeLeaderPane: team.name !== currentTeamName })
        deleted.push(team.name)
      }
      if (currentTeamName) {
        clearSessionContext(getSessionFile(ctx))
      }
      for (const pane of orphanPanes) {
        killPane(pane.paneId)
      }
      deps.invalidateStatus(ctx)
      const detachedNote = currentTeamName
        ? ` Current session detached from ${currentTeamName}.`
        : ''
      ctx.ui.notify(`Deleted ${deleted.length} team(s), killed ${orphanPanes.length} orphan pane(s).${detachedNote}`, 'info')
    },
  })

  pi.registerCommand('team-remove-member', {
    description: 'Remove a teammate from the current team',
    handler: async (args, ctx) => {
      const team = deps.ensureTeamForSession(ctx)
      if (!team) {
        ctx.ui.notify('No current team context', 'warning')
        return
      }
      const member = deps.sanitizeWorkerName(args ?? '')
      if (!member || member === TEAM_LEAD || !team.members[member]) {
        ctx.ui.notify('Unknown member', 'warning')
        return
      }
      const memberState = team.members[member]
      const paneId = memberState?.paneId
      const sessionFile = memberState?.sessionFile
      removeMember(team, member)
      writeTeamState(team)
      if (sessionFile) {
        clearSessionContext(sessionFile)
        try {
          fs.rmSync(sessionFile, { force: true })
        } catch {
          // ignore
        }
      }
      try {
        fs.rmSync(getMailboxPath(team.name, member), { force: true })
      } catch {
        // ignore
      }
      if (paneId && paneExists(paneId)) {
        killPane(paneId)
      }
      deps.invalidateStatus(ctx)
      ctx.ui.notify(`Removed ${member}`, 'info')
    },
  })
}
