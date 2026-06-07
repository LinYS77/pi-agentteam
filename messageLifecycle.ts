import type { MailboxMessage } from './internalTypes.js'

export function isMailboxMessageRead(message: Pick<MailboxMessage, 'readAt'>): boolean {
  return Boolean(message.readAt)
}

export function isMailboxMessageDelivered(message: Pick<MailboxMessage, 'deliveredAt'>): boolean {
  return Boolean(message.deliveredAt)
}

export function isMailboxMessageUnread(message: Pick<MailboxMessage, 'readAt'>): boolean {
  return !isMailboxMessageRead(message)
}

export function isMailboxMessageUndelivered(message: Pick<MailboxMessage, 'deliveredAt'>): boolean {
  return !isMailboxMessageDelivered(message)
}

export function unreadMailboxMessages(messages: MailboxMessage[]): MailboxMessage[] {
  return messages.filter(isMailboxMessageUnread)
}

export function undeliveredMailboxMessages(messages: MailboxMessage[]): MailboxMessage[] {
  return messages.filter(isMailboxMessageUndelivered)
}
