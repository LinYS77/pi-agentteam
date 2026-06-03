import { isLeader } from '../utils.js'

type TaskPermissionTeam = {
  members: Record<string, { role: string }>
}

const NON_LEADER_ALLOWED_TASK_ACTIONS = new Set([
  'list',
  'show',
  'history',
  'reports',
  'report',
  'progress',
  'report_done',
  'report_blocked',
])

export function actorRole(team: TaskPermissionTeam, actor: string): string {
  if (isLeader(actor)) return 'leader'
  return (team.members[actor]?.role ?? '').trim().toLowerCase()
}

export function ensureTaskPrivilege(
  team: TaskPermissionTeam,
  actor: string,
  action: string,
): string | null {
  if (isLeader(actor)) return null

  const role = actorRole(team, actor)

  // Non-leaders can inspect, record compact progress, and send report-only task reports.
  if (NON_LEADER_ALLOWED_TASK_ACTIONS.has(action)) return null

  return `Task action '${action}' is leader-only for ${actor} (${role || 'worker'}). Allowed for non-leaders: list/show/history/reports/report/progress/report_done/report_blocked`
}
