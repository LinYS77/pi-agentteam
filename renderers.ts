import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Box, Text } from '@earendil-works/pi-tui'
import type { TeamMessagePriority, TeamMessageType } from './internalTypes.js'

export function registerAgentTeamRenderers(pi: ExtensionAPI): void {
  pi.registerMessageRenderer('agentteam-leader-attention', (message, _options, theme) => {
    const details = (message.details ?? {}) as {
      from?: string
      summary?: string
      createdAt?: number
      type?: TeamMessageType
      taskId?: string
      threadId?: string
    }
    const box = new Box(1, 1, text => theme.bg('customMessageBg', text))
    const type = details.type ?? 'question'
    const header = `${theme.fg('accent', '[agentteam attention]')} ${theme.fg('toolTitle', details.from ?? 'teammate')} ${theme.fg('dim', `(${type})`)}`
    const summary = details.summary ? `\n${theme.fg('dim', details.summary)}` : ''
    const routing = details.taskId || details.threadId
      ? `\n${theme.fg('dim', `task=${details.taskId ?? '-'} thread=${details.threadId ?? '-'}`)}`
      : ''
    box.addChild(new Text(`${header}${summary}${routing}\n${String(message.content)}`, 0, 0))
    return box
  })

  pi.registerMessageRenderer('agentteam-mailbox', (message, _options, theme) => {
    const details = (message.details ?? {}) as {
      from?: string
      summary?: string
      createdAt?: number
      type?: TeamMessageType
      taskId?: string
      threadId?: string
      priority?: TeamMessagePriority
    }
    const box = new Box(1, 1, text => theme.bg('customMessageBg', text))
    const type = details.type ?? 'inform'
    const header = `${theme.fg('accent', '[agentteam]')} ${theme.fg('toolTitle', details.from ?? 'teammate')} ${theme.fg('dim', `(${type})`)}`
    const summary = details.summary ? `\n${theme.fg('dim', details.summary)}` : ''
    const routing = details.taskId || details.threadId
      ? `\n${theme.fg('dim', `task=${details.taskId ?? '-'} thread=${details.threadId ?? '-'}`)}`
      : ''
    const priority = details.priority ? `\n${theme.fg('dim', `priority=${details.priority}`)}` : ''
    const timestamp = details.createdAt ? `\n${theme.fg('dim', new Date(details.createdAt).toLocaleTimeString())}` : ''
    box.addChild(new Text(`${header}${summary}${routing}${priority}\n${String(message.content)}${timestamp}`, 0, 0))
    return box
  })
}
