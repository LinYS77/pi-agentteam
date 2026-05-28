import type { MessageType } from '../core/publicModel.js'

export type TeamSendInput = {
  to?: string
  message: string
  summary?: string
  type?: MessageType
  taskId?: string
  priority?: 'low' | 'normal' | 'high'
  metadata?: Record<string, unknown>
}

export type TeamReceiveInput = {
  markRead?: boolean
  limit?: number
}
