import { TEAM_LEAD } from '../internalTypes.js'
import type { TeamState } from '../internalTypes.js'
import { updateTeamState } from '../state/teamStore.js'

export function updateBridgeMemberState(
  teamName: string,
  memberName: string,
  updater: (member: TeamState['members'][string], team: TeamState, now: number) => void | false,
  now = Date.now(),
): TeamState | null {
  return updateTeamState(teamName, team => {
    const member = team.members[memberName]
    if (!member || member.name === TEAM_LEAD) return
    const changed = updater(member, team, now)
    if (changed === false) return
    member.updatedAt = now
  })
}

export function clearBridgeRequestState(member: TeamState['members'][string]): void {
  member.bridgeWorkRequestedAt = undefined
  member.bridgeWorkRequestMessageIds = undefined
  member.bridgeWorkRequestBootPrompt = undefined
}
