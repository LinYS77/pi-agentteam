const TEAM_TASK_ACTIONS = Object.freeze(['create', 'assign', 'block', 'unblock', 'close', 'progress', 'report_done', 'report_blocked', 'list', 'show', 'history', 'reports', 'report'] as const)
export type TeamTaskAction = typeof TEAM_TASK_ACTIONS[number]

export { TEAM_TASK_ACTIONS }
