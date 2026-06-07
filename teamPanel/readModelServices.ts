import type { TeamState } from '../internalTypes.js'
import { recordPanelProfileEvent } from '../runtime/profiling.js'
import {
  taskHistoryDisplaySummary,
  type TaskHistoryDisplaySummary,
} from '../state/taskHistoryReadModel.js'

export type { TaskHistoryDisplaySummary } from '../state/taskHistoryReadModel.js'

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
  recordReadModelBuild(event: PanelReadModelBuildProfileEvent): void
}

export function createPanelReadModelServices(): PanelReadModelServices {
  return {
    taskHistorySummary: taskHistoryDisplaySummary,
    recordReadModelBuild(event) {
      recordPanelProfileEvent({
        kind: 'readModelBuild',
        ...event,
      })
    },
  }
}

export const defaultPanelReadModelServices: PanelReadModelServices = createPanelReadModelServices()
