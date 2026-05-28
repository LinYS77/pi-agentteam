import { isTaskStatus, type TaskReportType, type TaskStatus } from './publicModel.js'

export type TaskState = {
  id: string
  title: string
  description?: string
  owner?: string
  status: TaskStatus
  createdAt: number
  updatedAt: number
  closedAt?: number
}

export type TaskCreateInput = {
  id: string
  title: string
  description?: string
  owner?: string
  createdAt: number
}

export type TaskReportIntent = {
  taskId: string
  type: TaskReportType
  at: number
  actor?: string
  note?: string
  metadata?: Record<string, unknown>
}

export type TaskTransitionInput =
  | {
      type: 'assign'
      owner: string
      at: number
    }
  | {
      type: 'block'
      at: number
    }
  | {
      type: 'unblock'
      at: number
    }
  | {
      type: 'close'
      at: number
    }
  | {
      type: 'report_done'
      at: number
      actor?: string
      note?: string
      metadata?: Record<string, unknown>
    }
  | {
      type: 'report_blocked'
      at: number
      actor?: string
      note?: string
      metadata?: Record<string, unknown>
    }

export type TaskAction = TaskTransitionInput['type']

type TaskStatusValue = TaskStatus | string

export type TaskTransitionResult =
  | {
      ok: true
      action: TaskAction
      from: TaskStatusValue
      to: TaskStatus
      task: TaskState
      reportIntent?: TaskReportIntent
    }
  | {
      ok: false
      action: TaskAction
      from: TaskStatusValue
      to: TaskStatusValue
      task: TaskState
      reason: string
    }

export function createTask(input: TaskCreateInput): TaskState {
  return {
    id: input.id,
    title: input.title,
    description: input.description,
    owner: input.owner,
    status: 'open',
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  }
}

function cloneTask(task: TaskState, patch: Partial<TaskState>): TaskState {
  return { ...task, ...patch }
}

function unsupportedStatus(task: TaskState, action: TaskAction): TaskTransitionResult {
  const status = String(task.status)
  return {
    ok: false,
    action,
    from: status,
    to: status,
    task,
    reason: `unsupported task status ${status}`,
  }
}

function invalidTransition(task: TaskState, action: TaskAction, reason: string): TaskTransitionResult {
  return {
    ok: false,
    action,
    from: task.status,
    to: task.status,
    task,
    reason,
  }
}

function reportIntent(task: TaskState, input: Extract<TaskTransitionInput, { type: TaskReportType }>): TaskReportIntent {
  return {
    taskId: task.id,
    type: input.type,
    at: input.at,
    actor: input.actor,
    note: input.note,
    metadata: input.metadata,
  }
}

export function transitionTask(task: TaskState, input: TaskTransitionInput): TaskTransitionResult {
  if (!isTaskStatus(task.status)) return unsupportedStatus(task, input.type)

  switch (input.type) {
    case 'assign': {
      if (task.status !== 'open') {
        return invalidTransition(task, input.type, `assign requires open task, got ${task.status}`)
      }
      return {
        ok: true,
        action: input.type,
        from: task.status,
        to: 'open',
        task: cloneTask(task, { owner: input.owner, updatedAt: input.at }),
      }
    }
    case 'block': {
      if (task.status !== 'open') {
        return invalidTransition(task, input.type, `block requires open task, got ${task.status}`)
      }
      return {
        ok: true,
        action: input.type,
        from: task.status,
        to: 'blocked',
        task: cloneTask(task, { status: 'blocked', updatedAt: input.at }),
      }
    }
    case 'unblock': {
      if (task.status !== 'blocked') {
        return invalidTransition(task, input.type, `unblock requires blocked task, got ${task.status}`)
      }
      return {
        ok: true,
        action: input.type,
        from: task.status,
        to: 'open',
        task: cloneTask(task, { status: 'open', updatedAt: input.at }),
      }
    }
    case 'close': {
      if (task.status === 'done') {
        return invalidTransition(task, input.type, 'close requires open or blocked task, got done')
      }
      return {
        ok: true,
        action: input.type,
        from: task.status,
        to: 'done',
        task: cloneTask(task, { status: 'done', updatedAt: input.at, closedAt: input.at }),
      }
    }
    case 'report_done':
    case 'report_blocked': {
      if (task.status === 'done') {
        return invalidTransition(task, input.type, `report requires open or blocked task, got done`)
      }
      return {
        ok: true,
        action: input.type,
        from: task.status,
        to: task.status,
        task: cloneTask(task, { updatedAt: input.at }),
        reportIntent: reportIntent(task, input),
      }
    }
  }
}
