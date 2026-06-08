import type { PlanRunAction } from '../core/planRunActions.js'
import type { PlanRunPauseReason, TeamState } from '../internalTypes.js'

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
