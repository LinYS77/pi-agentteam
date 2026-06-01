import type { MailboxRepositoryPort } from '../../app/ports.js'
import {
  markMailboxMessagesDelivered,
  markMailboxMessagesRead,
  readMailbox,
} from '../../state/mailboxStore.js'

export const fileBackedMailboxRepositoryPort: MailboxRepositoryPort = {
  readMailbox,
  markDelivered: markMailboxMessagesDelivered,
  markRead: markMailboxMessagesRead,
}
