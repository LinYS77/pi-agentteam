import type { TaskStatus } from '../core/publicModel.js'
import type { TeamTaskAction } from '../core/taskActions.js'

export type { TeamTaskAction } from '../core/taskActions.js'

export type TeamTaskInput = {
  action: TeamTaskAction
  taskId?: string
  reportId?: string
  title?: string
  description?: string
  owner?: string
  note?: string
  blockedBy?: string[]
  limit?: number
  all?: boolean
  includeMessages?: boolean
  status?: TaskStatus
}
