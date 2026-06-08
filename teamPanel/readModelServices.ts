import type { TeamState } from '../internalTypes.js'
import { recordPanelProfileEvent } from '../runtime/profiling.js'
import { compactPlanRunPanelProjection, type CompactPlanRunPanelProjection } from '../state/runVisibilityReadModel.js'
import {
  taskHistoryDisplaySummary,
  type TaskHistoryDisplaySummary,
} from '../state/taskHistoryReadModel.js'
import { buildReportWatchdogSummary, type ReportWatchdogTaskSummary } from '../state/taskReportWatchdogReadModel.js'

export type { CompactPlanRunPanelProjection } from '../state/runVisibilityReadModel.js'
export type { TaskHistoryDisplaySummary } from '../state/taskHistoryReadModel.js'
export type { ReportWatchdogTaskSummary } from '../state/taskReportWatchdogReadModel.js'

export type PanelReadModelMode = 'attached' | 'global'

export type PanelReadModelBuildProfileEvent = {
  mode: PanelReadModelMode
  durationMs: number
  teamCount?: number
  taskCount?: number
  memberCount?: number
}

export type PanelReadModelServices = {
  taskHistorySummary(team: TeamState, taskId: string): TaskHistoryDisplaySummary
  taskWatchdogSummary(team: TeamState, taskId: string): ReportWatchdogTaskSummary | undefined
  planRunProjection(team: TeamState): CompactPlanRunPanelProjection[]
  recordReadModelBuild(event: PanelReadModelBuildProfileEvent): void
}

export function createPanelReadModelServices(): PanelReadModelServices {
  return {
    taskHistorySummary: taskHistoryDisplaySummary,
    taskWatchdogSummary(team, taskId) {
      return buildReportWatchdogSummary(team).tasks.find(task => task.taskId === taskId)
    },
    planRunProjection: compactPlanRunPanelProjection,
    recordReadModelBuild(event) {
      recordPanelProfileEvent({
        kind: 'readModelBuild',
        ...event,
      })
    },
  }
}

export const defaultPanelReadModelServices: PanelReadModelServices = createPanelReadModelServices()
