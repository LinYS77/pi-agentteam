// Public/stable vocabulary surface.
//
// Runtime, persisted store, delivery, projection, and Outbox shapes live in
// internalTypes.ts or focused app/runtime/state modules. Packed runtime files are
// not all stable public API; public consumers should depend on the small vNext
// vocabulary exported here and from core/publicModel.

import { TEAM_LEAD as CORE_TEAM_LEAD } from './core/teamIdentity.js'

export {
  MESSAGE_READ_STATES,
  MESSAGE_TYPES,
  TASK_REPORT_TYPES,
  TASK_STATUSES,
  WORKER_HEALTHS,
  isMessageReadState,
  isMessageType,
  isTaskReportType,
  isTaskStatus,
  isWorkerHealth,
  normalizeMessageReadState,
  normalizeMessageType,
  normalizeTaskReportType,
  normalizeTaskStatus,
  normalizeWorkerHealth,
  type MessageReadState,
  type MessageType,
  type TaskReportType,
  type TaskStatus,
  type WorkerHealth,
} from './core/publicModel.js'

export const TEAM_LEAD = CORE_TEAM_LEAD

export type PublicTaskStatus = import('./core/publicModel.js').TaskStatus
export type PublicWorkerHealth = import('./core/publicModel.js').WorkerHealth
export type PublicMessageType = import('./core/publicModel.js').MessageType
export type PublicTaskReportType = import('./core/publicModel.js').TaskReportType
export type PublicMessageReadState = import('./core/publicModel.js').MessageReadState

export type PublicTask = {
  id: string
  title: string
  description: string
  status: PublicTaskStatus
  owner?: string
  blockedBy: string[]
  createdAt: number
  updatedAt: number
}

export type PublicWorker = {
  name: string
  role: string
  health: PublicWorkerHealth
  model?: string
}

export type PublicMessage = {
  id: string
  from: string
  to: string
  text: string
  summary?: string
  type?: PublicMessageType | PublicTaskReportType
  taskId?: string
  threadId?: string
  priority?: 'low' | 'normal' | 'high'
  readState: PublicMessageReadState
  createdAt: number
}

export type PublicTaskReport = {
  type: PublicTaskReportType
  taskId: string
  text: string
  from: string
}
