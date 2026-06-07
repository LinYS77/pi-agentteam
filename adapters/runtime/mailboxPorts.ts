import type { MailboxRepositoryPort } from '../../app/ports.js'
import { fileBackedStateRepository, type StateRepository } from '../../state/repository.js'

const stateRepository: StateRepository = fileBackedStateRepository

export const fileBackedMailboxRepositoryPort: MailboxRepositoryPort = {
  readMailbox: stateRepository.readMailbox,
  markDelivered: stateRepository.markMailboxMessagesDelivered,
  markRead: stateRepository.markMailboxMessagesRead,
}
