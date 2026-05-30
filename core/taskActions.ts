const TEAM_TASK_ACTIONS = Object.freeze(['create', 'assign', 'block', 'unblock', 'close', 'note', 'report_done', 'report_blocked', 'list'] as const)
export type TeamTaskAction = typeof TEAM_TASK_ACTIONS[number]

export { TEAM_TASK_ACTIONS }
