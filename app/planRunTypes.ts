import type { PlanRunAction } from '../core/planRunActions.js'
import type { PlanRunLimitState, PlanRunPauseReason, TeamState } from '../internalTypes.js'

export type PlanRunFailureKind = Extract<PlanRunPauseReason, 'validation_failed' | 'test_failed'>

export type PlanRunLimitsInput = {
  maxSteps?: number
  maxConsecutiveSteps?: number
  deadlineAt?: number
  maxDurationMs?: number
}

export type PlanRunLimitsPreview = {
  limits?: PlanRunLimitsInput
  limitState?: PlanRunLimitState
}

export type PlanRunStepInput = {
  title?: string
  description?: string
  owner?: string
}

export type PlanRunInput = {
  action: PlanRunAction
  sourceReportId?: string
  planRunId?: string
  confirmApproved?: boolean
  pauseReason?: PlanRunPauseReason | string
  failureKind?: PlanRunFailureKind | string
  taskId?: string
  source?: string
  summary?: string
  externalRef?: string
  limits?: PlanRunLimitsInput
  dryRun?: boolean
  steps?: PlanRunStepInput[]
}

export type PlanRunApplicationContext = {
  team: TeamState
  teamName: string
  actor: string
}

export type PlanRunApplicationInput = {
  params: PlanRunInput
  context: PlanRunApplicationContext
}

export type PlanRunApplicationResult = {
  text: string
  details: Record<string, unknown>
  statusInvalidationRequested?: boolean
}
