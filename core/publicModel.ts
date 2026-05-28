const TASK_STATUSES = Object.freeze(['open', 'blocked', 'done'] as const)
export type TaskStatus = typeof TASK_STATUSES[number]

const WORKER_HEALTHS = Object.freeze(['offline', 'idle', 'busy', 'error'] as const)
export type WorkerHealth = typeof WORKER_HEALTHS[number]

const MESSAGE_TYPES = Object.freeze(['assignment', 'question', 'inform'] as const)
export type MessageType = typeof MESSAGE_TYPES[number]

const TASK_REPORT_TYPES = Object.freeze(['report_done', 'report_blocked'] as const)
export type TaskReportType = typeof TASK_REPORT_TYPES[number]

const MESSAGE_READ_STATES = Object.freeze(['unread', 'read'] as const)
export type MessageReadState = typeof MESSAGE_READ_STATES[number]

function isExactString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOneOf<const Values extends readonly string[]>(values: Values, value: unknown): value is Values[number] {
  return isExactString(value) && (values as readonly string[]).includes(value)
}

function normalizeOneOf<const Values extends readonly string[]>(values: Values, value: unknown): Values[number] | undefined {
  return isOneOf(values, value) ? value : undefined
}

export { TASK_STATUSES, WORKER_HEALTHS, MESSAGE_TYPES, TASK_REPORT_TYPES, MESSAGE_READ_STATES }

export function isTaskStatus(value: unknown): value is TaskStatus {
  return isOneOf(TASK_STATUSES, value)
}

export function normalizeTaskStatus(value: unknown): TaskStatus | undefined {
  return normalizeOneOf(TASK_STATUSES, value)
}

export function isWorkerHealth(value: unknown): value is WorkerHealth {
  return isOneOf(WORKER_HEALTHS, value)
}

export function normalizeWorkerHealth(value: unknown): WorkerHealth | undefined {
  return normalizeOneOf(WORKER_HEALTHS, value)
}

export function isMessageType(value: unknown): value is MessageType {
  return isOneOf(MESSAGE_TYPES, value)
}

export function normalizeMessageType(value: unknown): MessageType | undefined {
  return normalizeOneOf(MESSAGE_TYPES, value)
}

export function isTaskReportType(value: unknown): value is TaskReportType {
  return isOneOf(TASK_REPORT_TYPES, value)
}

export function normalizeTaskReportType(value: unknown): TaskReportType | undefined {
  return normalizeOneOf(TASK_REPORT_TYPES, value)
}

export function isMessageReadState(value: unknown): value is MessageReadState {
  return isOneOf(MESSAGE_READ_STATES, value)
}

export function normalizeMessageReadState(value: unknown): MessageReadState | undefined {
  return normalizeOneOf(MESSAGE_READ_STATES, value)
}
