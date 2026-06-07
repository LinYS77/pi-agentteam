const PLAN_RUN_ACTIONS = Object.freeze(['approve', 'show', 'list', 'advance', 'pause', 'resume', 'cancel'] as const)
export type PlanRunAction = typeof PLAN_RUN_ACTIONS[number]

export { PLAN_RUN_ACTIONS }
