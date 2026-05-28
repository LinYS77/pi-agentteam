import type { TaskStatus } from '../core/publicModel.js'

export type TeamTaskAction = 'create' | 'assign' | 'block' | 'unblock' | 'close' | 'note' | 'report_done' | 'report_blocked' | 'list'

export type TeamTaskInput = {
  action: TeamTaskAction
  taskId?: string
  title?: string
  description?: string
  owner?: string
  note?: string
  blockedBy?: string[]
  limit?: number
  all?: boolean
  status?: TaskStatus
}
