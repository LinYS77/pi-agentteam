import { TEAM_LEAD } from '../types.js'
import { isLeader } from '../utils.js'

export function actorRole(team: { members: Record<string, { role: string }> }, actor: string): string {
  if (isLeader(actor)) return 'leader'
  return (team.members[actor]?.role ?? '').trim().toLowerCase()
}

export function ensureTaskPrivilege(
  team: { members: Record<string, { role: string }> },
  actor: string,
  action: string,
): string | null {
  if (isLeader(actor)) return null

  const role = actorRole(team, actor)

  // everyone can inspect and annotate
  if (action === 'list' || action === 'note') return null

  if (role === 'planner') {
    // planner manages decomposition and can close planning milestones when done.
    if (action === 'create' || action === 'claim' || action === 'update' || action === 'complete') return null
  }

  // non-planner workers can report completion for owned tasks.
  if (action === 'complete') return null

  return `Task action '${action}' is not allowed for ${actor} (${role || 'worker'}). Allowed: list/note/complete${role === 'planner' ? '/create/claim/update' : ''}`
}

export function buildImplementationCompletionNote(note?: string): string {
  const trimmed = note?.trim() ?? ''
  const template = [
    'Change summary:',
    '- Files changed: <path[:lines], ...>',
    '- Line range / diff scope: <start-end or hunk summary>',
    '- Checks run: <command -> result>',
    '- Validation result: <pass/fail + evidence>',
  ].join('\n')

  if (!trimmed) return template
  if (/Files changed:|Line range \/ diff scope:|Checks run:|Validation result:/i.test(trimmed)) {
    return trimmed
  }
  return `${trimmed}\n\n${template}`
}

export function canCompleteTask(input: {
  actor: string
  owner?: string
}): boolean {
  return input.actor === input.owner || input.actor === TEAM_LEAD
}
