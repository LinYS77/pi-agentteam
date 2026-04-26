import type { MailboxMessage } from './types.js'

export function isMailboxMessageRead(message: MailboxMessage): boolean {
  return Boolean(message.readAt)
}

export function isMailboxMessageDelivered(message: MailboxMessage): boolean {
  return Boolean(message.deliveredAt)
}

export function isMailboxMessageUnread(message: MailboxMessage): boolean {
  return !isMailboxMessageRead(message)
}

export function isMailboxMessageUndelivered(message: MailboxMessage): boolean {
  return !isMailboxMessageDelivered(message)
}

export function unreadMailboxMessages(messages: MailboxMessage[]): MailboxMessage[] {
  return messages.filter(isMailboxMessageUnread)
}

export function undeliveredMailboxMessages(messages: MailboxMessage[]): MailboxMessage[] {
  return messages.filter(isMailboxMessageUndelivered)
}
