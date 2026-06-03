function createStateBundle(requireDist) {
  return {
    ...requireDist('state/fsStore.js'),
    ...requireDist('state/paths.js'),
    ...requireDist('state/sessionBinding.js'),
    ...requireDist('state/merge.js'),
    ...requireDist('state/taskStore.js'),
    ...requireDist('state/taskHistoryReadModel.js'),
    ...requireDist('state/taskHistory.js'),
    ...requireDist('state/taskHistoryMigration.js'),
    ...requireDist('state/mailboxStore.js'),
    ...requireDist('state/runtimeStore.js'),
    ...requireDist('state/bridgeStore.js'),
    ...requireDist('state/deliveryStore.js'),
    ...requireDist('state/leaderProjectionStore.js'),
    ...requireDist('state/leaderAttentionStore.js'),
    ...requireDist('state/outboxStore.js'),
    ...requireDist('state/outboxDiagnosticsStore.js'),
    ...requireDist('state/validation.js'),
    ...requireDist('state/teamStore.js'),
  }
}

module.exports = { createStateBundle }
