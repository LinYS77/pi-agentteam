import { configureSessionBindingStore } from './sessionBinding.js'
import { listTeams, readTeamState } from './teamStore.js'

let initialized = false

export function initializeStateStores(): void {
  if (initialized) return
  configureSessionBindingStore({
    readTeamState,
    listTeams,
  })
  initialized = true
}
