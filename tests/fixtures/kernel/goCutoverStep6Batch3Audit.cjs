const STEP6_BATCH3_GUARD_SUITE = 'tests/suites/go-kernel-tmux-cutover-batch3-guard.cjs'
const STEP6_BATCH3_GUARD_HELPER = 'tests/helpers/goTmuxCutoverBatch3Guards.cjs'

const STEP6_BATCH3_ACTIONS = Object.freeze([
  'keep-unique',
  'split-later',
  'delete-replaced',
])

const STEP6_BATCH3_CLUSTERS = Object.freeze({
  workerLifecycle: Object.freeze({
    id: 'worker-lifecycle-runtime',
    label: 'v0653-v0654 worker lifecycle runtime operations',
    versions: Object.freeze(['v0.6.53', 'v0.6.54']),
    expectedSuiteCount: 2,
    recommendedAction: 'keep-unique',
    rationale: 'These suites own the first runtime Go workerLifecycle operation shapes and helper result contracts; only shared package/no-release/source-boundary assertions are duplicated.',
  }),
  readOnlyFacade: Object.freeze({
    id: 'read-only-facade-cutovers',
    label: 'v0655-v0670 read-only pane/window/session facade cutovers',
    versions: Object.freeze(Array.from({ length: 16 }, (_, index) => `v0.6.${55 + index}`)),
    expectedSuiteCount: 16,
    recommendedAction: 'split-later',
    rationale: 'Step 6 batches 1 and 2 delete replaced sync pane facade wrappers plus read-only window/session/discovery orchestration after current guard migration; v0660-v0661 remain out of scope and preserved.',
  }),
  windowLabelMutation: Object.freeze({
    id: 'window-label-mutation-gates-cutovers',
    label: 'v0671-v0678 window marking and label gate/cutover sequence',
    versions: Object.freeze(Array.from({ length: 8 }, (_, index) => `v0.6.${71 + index}`)),
    expectedSuiteCount: 8,
    recommendedAction: 'keep-unique',
    rationale: 'Gate and cutover pairs document the exact staged mutation authority for window marks, border labels, pane labels, and pane title clearing; they remain behavior-unique.',
  }),
  teammatePaneLifecycleMutation: Object.freeze({
    id: 'teammate-pane-lifecycle-mutation-gates-cutovers',
    label: 'v0679-v0686 teammate pane/session/window creation and kill-pane gates/cutovers',
    versions: Object.freeze(Array.from({ length: 8 }, (_, index) => `v0.6.${79 + index}`)),
    expectedSuiteCount: 8,
    recommendedAction: 'keep-unique',
    rationale: 'These suites own high-risk creation and destructive kill-pane contracts, including compact throwing/no-throw facade boundaries and exact tmux argv constraints.',
  }),
  clearPaneLabelSync: Object.freeze({
    id: 'clear-pane-label-sync-gate-cutover',
    label: 'v0687-v0688 clearPaneLabelSync gate and cutover',
    versions: Object.freeze(['v0.6.87', 'v0.6.88']),
    expectedSuiteCount: 2,
    recommendedAction: 'keep-unique',
    rationale: 'The sync clear-label pair is intentionally narrow and reuses clearPaneLabel without a new Go operation; keep until a dedicated sync facade owner replaces it.',
  }),
})

const COMMON_DUPLICATE_ASSERTIONS = Object.freeze([
  'package.json version 0.6.8 and no release/npm/tag/GitHub mechanics',
  'historical doc/roadmap/gitignore presence and release-overclaim guardrails',
  'fixture schema/package/helper/protocol shape and native helper path preservation',
  'compact diagnostics/no raw stdout/stderr/cwd/stack/mailbox/report leakage',
  'TypeScript/pi facade remains the authority boundary; Go is called only through explicit adapter seams',
])

const READ_ONLY_DUPLICATE_ASSERTIONS = Object.freeze([
  ...COMMON_DUPLICATE_ASSERTIONS,
  'read-only workerLifecycle/tmuxAvailability results stay readOnly:true with no state file writes and tmuxMutation:false',
  'direct TypeScript tmux fallback is removed only for the specific cutover facade and no hidden fallback is added after Go cutover',
  'mutating lifecycle, labels, pane creation, kill, wake/send-keys, state/task/UI, and release/package ownership remain out of scope',
])

const MUTATION_DUPLICATE_ASSERTIONS = Object.freeze([
  ...COMMON_DUPLICATE_ASSERTIONS,
  'mutating operations stay behind TypeScript facades with exact helper operations and compact fail-closed diagnostics',
  'no wakePane/send-keys/state/task/UI/release/package authority is granted to Go by these slices',
  'tmux mutation authority is exact-argv only and must not broaden beyond the specific staged operation',
])

function suitePath(version, slug) {
  return `tests/suites/go-kernel-v${version.replace('v0.6.', '06')}-${slug}.cjs`
}

function docPath(version, slug) {
  return `docs/perf/${version}-${slug}.md`
}

function entry({ version, slug, fixture, cluster, uniqueAssertions, duplicateAssertions, currentOwnerCategories, recommendedAction = 'keep-unique' }) {
  return Object.freeze({
    version,
    suite: suitePath(version, slug),
    doc: docPath(version, slug),
    fixture,
    cluster,
    duplicateAssertions: Object.freeze([...duplicateAssertions]),
    uniqueAssertions: Object.freeze([...uniqueAssertions]),
    replacementEvidence: Object.freeze([{ suite: STEP6_BATCH3_GUARD_SUITE, helper: STEP6_BATCH3_GUARD_HELPER, categories: Object.freeze([...currentOwnerCategories]) }]),
    recommendedAction,
    deletionReady: recommendedAction === 'delete-replaced',
  })
}

const STEP6_BATCH3_AUDIT_ENTRIES = Object.freeze([
  entry({
    version: 'v0.6.53',
    slug: 'go-inspect-pane-worker-lifecycle',
    fixture: 'tests/fixtures/kernel/v0653/goInspectPaneWorkerLifecycle.cjs',
    cluster: 'workerLifecycle',
    duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS,
    currentOwnerCategories: ['go-helper-operation-surface-exact', 'package-native-release-boundaries-preserved'],
    uniqueAssertions: [
      'first Go-owned workerLifecycle.inspectPane runtime slice and compact inspect result shape',
      'list-panes inspect format, pane target/current-command/mode/copy-mode mapping, and arbitrary pane-id support',
      'explicit proof that broad worker lifecycle ownership remains deferred after the first runtime operation',
    ],
  }),
  entry({
    version: 'v0.6.54',
    slug: 'go-list-agentteam-panes-worker-lifecycle',
    fixture: 'tests/fixtures/kernel/v0654/goListAgentTeamPanesWorkerLifecycle.cjs',
    cluster: 'workerLifecycle',
    duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS,
    currentOwnerCategories: ['go-helper-operation-surface-exact', 'package-native-release-boundaries-preserved'],
    uniqueAssertions: [
      'Go-owned workerLifecycle.listAgentTeamPanes result list and byPaneId contract',
      'agentteam label filtering over tmux snapshot rows while inspectPane stays arbitrary-pane capable',
      'two-operation read-only workerLifecycle capability progression from v0.6.53 to v0.6.54',
    ],
  }),
  entry({ version: 'v0.6.55', slug: 'go-list-agentteam-panes-facade-cutover', fixture: 'tests/fixtures/kernel/v0655/goListAgentTeamPanesFacadeCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades', 'go-helper-operation-surface-exact'], uniqueAssertions: ['listAgentTeamPanes public facade returns result panes or [] on helper failure', 'listAgentTeamPanesFromSnapshot remains snapshot-local and label-filtered', 'inspectPane and other facades remain out of the v0.6.55 slice'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.56', slug: 'go-inspect-pane-facade-cutover', fixture: 'tests/fixtures/kernel/v0656/goInspectPaneFacadeCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades', 'go-helper-operation-surface-exact'], uniqueAssertions: ['inspectPane public facade maps Go inspect result to PaneInspection', 'helper failure returns exists:false with compact error instead of throwing', 'targetForPaneId and binding facades remain separately staged'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.57', slug: 'go-pane-exists-facade-cutover', fixture: 'tests/fixtures/kernel/v0657/goPaneExistsFacadeCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades'], uniqueAssertions: ['paneExists becomes a Boolean wrapper over the Go-backed inspectPane facade', 'empty pane ids fail closed without direct tmux execution', 'paneExists retains no independent helper operation or mutation authority'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.58', slug: 'go-resolve-pane-binding-facade-cutover', fixture: 'tests/fixtures/kernel/v0658/goResolvePaneBindingFacadeCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades', 'go-helper-operation-surface-exact'], uniqueAssertions: ['resolvePaneBinding uses inspectPane target extension for arbitrary panes', 'listAgentTeamPanes remains label-filtered and is not reused for arbitrary pane binding', 'binding null/failure behavior remains compact and no-throw'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.59', slug: 'go-target-for-pane-facade-cutover', fixture: 'tests/fixtures/kernel/v0659/goTargetForPaneFacadeCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades'], uniqueAssertions: ['targetForPaneId is only a wrapper over resolvePaneBinding()?.target', 'display-message target lookup fallback is removed from this facade', 'empty/missing pane ids return null without throwing'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.60', slug: 'go-current-pane-binding-facade-cutover', fixture: 'tests/fixtures/kernel/v0660/goCurrentPaneBindingFacadeCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades', 'go-helper-operation-surface-exact'], uniqueAssertions: ['captureCurrentPaneBinding preserves the isInsideTmux gate', 'Go-backed current-pane binding returns null on unavailable/missing target', 'only the non-target display-message current binding path is authorized'] }),
  entry({ version: 'v0.6.61', slug: 'go-async-pane-binding-facade-cutover', fixture: 'tests/fixtures/kernel/v0661/goAsyncPaneBindingFacadeCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades'], uniqueAssertions: ['resolvePaneBindingAsync uses cancellable inspectWorkerPaneAsync', 'sync resolvePaneBinding is not wrapped or altered by the async cutover', 'abort/helper failure returns null and keeps compact diagnostics'] }),
  entry({ version: 'v0.6.62', slug: 'go-window-pane-lookup-facade-cutover', fixture: 'tests/fixtures/kernel/v0662/goWindowPaneLookupFacadeCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades', 'go-helper-operation-surface-exact'], uniqueAssertions: ['windowExists and firstPaneInWindow share listPanesInWindowAsync while preserving distinct return semantics', 'invalid targets fail closed without direct TypeScript list-panes fallback', 'window creation, labels, and mutating lifecycle remain outside the lookup slice'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.63', slug: 'go-tmux-availability-facade-cutover', fixture: 'tests/fixtures/kernel/v0663/goTmuxAvailabilityFacadeCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades', 'go-helper-operation-surface-exact'], uniqueAssertions: ['ensureTmuxAvailable uses tmuxAvailability and preserves throwing public contract', 'tmux -V execution is owned by the helper only', 'availability failure surfaces only compact failure kind in the thrown message'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.64', slug: 'go-pane-app-start-wait-cutover', fixture: 'tests/fixtures/kernel/v0664/goPaneAppStartWaitCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades'], uniqueAssertions: ['waitForPaneAppStart polls inspectWorkerPaneAsync instead of direct display-message', 'shell-command exclusion and deadline/abort behavior remain unchanged', 'worker spawn semantics are not broadened by the polling cutover'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.65', slug: 'go-agentteam-window-discovery-cutover', fixture: 'tests/fixtures/kernel/v0665/goAgentTeamWindowDiscoveryCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades', 'go-helper-operation-surface-exact'], uniqueAssertions: ['findAgentTeamWindowTarget discovers marked windows through Go list-windows parsing', 'session/window creation and labels remain out of scope', 'invalid session or aborted signal returns null'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.66', slug: 'go-session-existence-cutover', fixture: 'tests/fixtures/kernel/v0666/goSessionExistenceCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades', 'go-helper-operation-surface-exact'], uniqueAssertions: ['ensureSwarmWindow detached missing-session check uses sessionExistsAsync', 'session creation remains separately staged and only runs after a false/failed existence check', 'has-session probing is removed from TypeScript'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.67', slug: 'go-current-binding-window-fallback-cutover', fixture: 'tests/fixtures/kernel/v0667/goCurrentBindingWindowFallbackCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades'], uniqueAssertions: ['inside-tmux current target/current pane fallback uses cached captureCurrentPaneBinding()', 'preferred leader binding remains first authority before current binding fallback', 'detached setup and mutating lifecycle remain outside this fallback slice'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.68', slug: 'go-detached-leader-binding-cutover', fixture: 'tests/fixtures/kernel/v0668/goDetachedLeaderBindingCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades'], uniqueAssertions: ['detached leader target fallback uses resolvePaneBindingAsync after leader pane discovery', 'post-creation lookup and first-pane discovery remain separately staged', 'target resolution failure keeps the existing throwing ensureSwarmWindow contract'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.69', slug: 'go-detached-first-pane-cutover', fixture: 'tests/fixtures/kernel/v0669/goDetachedFirstPaneCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades'], uniqueAssertions: ['detached first-pane selection uses firstPaneInWindow(initialTarget, signal)', 'known initial target is required before pane selection', 'post-creation window lookup and creation remain separate contracts'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.70', slug: 'go-window-name-lookup-cutover', fixture: 'tests/fixtures/kernel/v0670/goWindowNameLookupCutover.cjs', cluster: 'readOnlyFacade', duplicateAssertions: READ_ONLY_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['read-only-worker-lifecycle-facades', 'go-helper-operation-surface-exact'], uniqueAssertions: ['post-creation findWindowTargetByName uses a dedicated Go workerLifecycle operation', 'new-window creation remains separately authorized and compact failure remains throwing in ensureSwarmWindow', 'only window name lookup is moved by this slice'], recommendedAction: 'delete-replaced' }),
  entry({ version: 'v0.6.71', slug: 'go-mutating-window-marking-gate', fixture: 'tests/fixtures/kernel/v0671/goMutatingWindowMarkingGate.cjs', cluster: 'windowLabelMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact', 'go-helper-operation-surface-exact'], uniqueAssertions: ['gate-only contract for future markWindowAsAgentTeam', 'authorized future window set-option argv list and forbidden pane label/border scope', 'no-runtime-migration fixture state remains historical evidence'] }),
  entry({ version: 'v0.6.72', slug: 'go-window-marking-cutover', fixture: 'tests/fixtures/kernel/v0672/goWindowMarkingCutover.cjs', cluster: 'windowLabelMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact', 'go-helper-operation-surface-exact'], uniqueAssertions: ['markWindowAsAgentTeam keeps windowExists guard and delegates to markWindowAsAgentTeamAsync', 'only three window set-option commands are authorized', 'public facade remains no-throw Promise<void>'] }),
  entry({ version: 'v0.6.73', slug: 'go-refresh-window-pane-labels-gate', fixture: 'tests/fixtures/kernel/v0673/goRefreshWindowPaneLabelsGate.cjs', cluster: 'windowLabelMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact'], uniqueAssertions: ['gate-only contract for future refreshWindowPaneLabels', 'authorized future pane-border-status and pane-border-format window options', 'pane label/title/new-session/new-window remain forbidden at this gate'] }),
  entry({ version: 'v0.6.74', slug: 'go-refresh-window-pane-labels-cutover', fixture: 'tests/fixtures/kernel/v0674/goRefreshWindowPaneLabelsCutover.cjs', cluster: 'windowLabelMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact', 'go-helper-operation-surface-exact'], uniqueAssertions: ['refreshWindowPaneLabels keeps windowExists guard and delegates to refreshWindowPaneLabelsAsync', 'only pane-border-status and pane-border-format set-option commands are authorized', 'public no-throw behavior and compact helper failure are preserved'] }),
  entry({ version: 'v0.6.75', slug: 'go-pane-label-setting-gate', fixture: 'tests/fixtures/kernel/v0675/goPaneLabelSettingGate.cjs', cluster: 'windowLabelMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact'], uniqueAssertions: ['gate-only contract for future setPaneLabel', 'authorized future set-option -p @agentteam-name and select-pane -T pair', 'clearing/create/kill/wake remain forbidden at this gate'] }),
  entry({ version: 'v0.6.76', slug: 'go-pane-label-setting-cutover', fixture: 'tests/fixtures/kernel/v0676/goPaneLabelSettingCutover.cjs', cluster: 'windowLabelMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact', 'go-helper-operation-surface-exact'], uniqueAssertions: ['setPaneLabel delegates to setPaneLabelAsync with exact pane label/title argv', 'label validation and compact helper failure remain private/no-throw', 'syncPaneLabelsForTeam keeps formatting and target refresh behavior'] }),
  entry({ version: 'v0.6.77', slug: 'go-pane-label-clearing-gate', fixture: 'tests/fixtures/kernel/v0677/goPaneLabelClearingGate.cjs', cluster: 'windowLabelMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact'], uniqueAssertions: ['gate-only contract for future clearPaneLabel', 'authorized future unset @agentteam-name and clear pane title argv', 'sync clearPaneLabelSync remains separate until v0.6.88'] }),
  entry({ version: 'v0.6.78', slug: 'go-pane-label-clearing-cutover', fixture: 'tests/fixtures/kernel/v0678/goPaneLabelClearingCutover.cjs', cluster: 'windowLabelMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact', 'go-helper-operation-surface-exact'], uniqueAssertions: ['private async clearPaneLabel delegates to clearPaneLabelAsync', 'clearPaneLabelsForTeam aggregates targets and refreshes labels after clearing', 'sync clearPaneLabelSync remains not migrated until v0.6.88'] }),
  entry({ version: 'v0.6.79', slug: 'go-create-teammate-pane-gate', fixture: 'tests/fixtures/kernel/v0679/goCreateTeammatePaneGate.cjs', cluster: 'teammatePaneLifecycleMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact'], uniqueAssertions: ['high-risk gate-only createTeammatePane contract before runtime migration', 'split-window/select-layout/resize-pane authorized future argv and cwd/start command bounds', 'pane creation remains throwing and does not grant wake/send-keys'] }),
  entry({ version: 'v0.6.80', slug: 'go-create-teammate-pane-cutover', fixture: 'tests/fixtures/kernel/v0680/goCreateTeammatePaneCutover.cjs', cluster: 'teammatePaneLifecycleMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact', 'go-helper-operation-surface-exact'], uniqueAssertions: ['createTeammatePane uses ensureSwarmWindow then createTeammatePaneAsync', 'hasLeaderLayout, cwd, startCommand, layout, and resize behavior are exact bounded inputs', 'successful creation still sets pane label and refreshes window labels'] }),
  entry({ version: 'v0.6.81', slug: 'go-detached-new-session-gate', fixture: 'tests/fixtures/kernel/v0681/goDetachedNewSessionGate.cjs', cluster: 'teammatePaneLifecycleMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact'], uniqueAssertions: ['gate-only contract for detached new-session in ensureSwarmWindow', 'missing-session branch is the only future authority', 'new-window/create pane/kill remain separate staged operations'] }),
  entry({ version: 'v0.6.82', slug: 'go-detached-new-session-cutover', fixture: 'tests/fixtures/kernel/v0682/goDetachedNewSessionCutover.cjs', cluster: 'teammatePaneLifecycleMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact', 'go-helper-operation-surface-exact'], uniqueAssertions: ['ensureSwarmWindow delegates missing-session creation to createDetachedSwarmSessionAsync', 'compact helper failure preserves throwing create failure behavior', 'post-session marking and lookup sequence remains TypeScript-governed'] }),
  entry({ version: 'v0.6.83', slug: 'go-detached-new-window-gate', fixture: 'tests/fixtures/kernel/v0683/goDetachedNewWindowGate.cjs', cluster: 'teammatePaneLifecycleMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact'], uniqueAssertions: ['gate-only contract for detached new-window in ensureSwarmWindow', 'missing marked-window branch is the only future authority', 'new-session/create pane/kill remain separate staged operations'] }),
  entry({ version: 'v0.6.84', slug: 'go-detached-new-window-cutover', fixture: 'tests/fixtures/kernel/v0684/goDetachedNewWindowCutover.cjs', cluster: 'teammatePaneLifecycleMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact', 'go-helper-operation-surface-exact'], uniqueAssertions: ['ensureSwarmWindow delegates missing-window creation to createDetachedSwarmWindowAsync', 'post-creation findWindowTargetByName must locate the new window before continuing', 'compact helper failure preserves throwing create failure behavior'] }),
  entry({ version: 'v0.6.85', slug: 'go-kill-pane-gate', fixture: 'tests/fixtures/kernel/v0685/goKillPaneGate.cjs', cluster: 'teammatePaneLifecycleMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact'], uniqueAssertions: ['destructive killPane gate-only contract before runtime migration', 'only exact kill-pane -t <paneId> is future-authorized', 'clear labels, create pane, wake/send-keys, state/task/UI remain out of scope'] }),
  entry({ version: 'v0.6.86', slug: 'go-kill-pane-cutover', fixture: 'tests/fixtures/kernel/v0686/goKillPaneCutover.cjs', cluster: 'teammatePaneLifecycleMutation', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact', 'go-helper-operation-surface-exact'], uniqueAssertions: ['killPane public facade is synchronous no-throw and delegates to Go killPane', 'Go contains exactly one authorized kill-pane -t paneID command', 'cleanup callers still decide when killPane is safe to invoke'] }),
  entry({ version: 'v0.6.87', slug: 'go-clear-pane-label-sync-gate', fixture: 'tests/fixtures/kernel/v0687/goClearPaneLabelSyncGate.cjs', cluster: 'clearPaneLabelSync', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact'], uniqueAssertions: ['gate-only contract for future clearPaneLabelSync reuse of clearPaneLabel', 'no new sync-specific Go operation or native smoke key is authorized', 'sync no-throw facade and orphan cleanup call sites remain explicit'] }),
  entry({ version: 'v0.6.88', slug: 'go-clear-pane-label-sync-cutover', fixture: 'tests/fixtures/kernel/v0688/goClearPaneLabelSyncCutover.cjs', cluster: 'clearPaneLabelSync', duplicateAssertions: MUTATION_DUPLICATE_ASSERTIONS, currentOwnerCategories: ['mutation-facade-authority-exact', 'go-helper-operation-surface-exact'], uniqueAssertions: ['clearPaneLabelSync delegates to existing synchronous clearPaneLabel adapter path', 'no new Go operation or helper rebuild is introduced', 'cleanup no-throw semantics and previous async clearPaneLabel ownership remain preserved'] }),
])

const STEP6_BATCH3_RETAINED_SUITES = Object.freeze(STEP6_BATCH3_AUDIT_ENTRIES.filter(entry => !entry.deletionReady).map(entry => entry.suite))
const STEP6_BATCH3_DELETION_CANDIDATE_SUITES = Object.freeze(STEP6_BATCH3_AUDIT_ENTRIES.filter(entry => entry.deletionReady).map(entry => entry.suite))
const STEP6_BATCH3_SCOPE_DOCS = Object.freeze(STEP6_BATCH3_AUDIT_ENTRIES.map(entry => entry.doc))
const STEP6_BATCH3_SCOPE_FIXTURES = Object.freeze(STEP6_BATCH3_AUDIT_ENTRIES.map(entry => entry.fixture))
const STEP6_BATCH3_CLUSTER_COUNTS = Object.freeze(STEP6_BATCH3_AUDIT_ENTRIES.reduce((counts, entry) => {
  counts[entry.cluster] = (counts[entry.cluster] || 0) + 1
  return counts
}, {}))

module.exports = {
  COMMON_DUPLICATE_ASSERTIONS,
  MUTATION_DUPLICATE_ASSERTIONS,
  READ_ONLY_DUPLICATE_ASSERTIONS,
  STEP6_BATCH3_ACTIONS,
  STEP6_BATCH3_AUDIT_ENTRIES,
  STEP6_BATCH3_CLUSTER_COUNTS,
  STEP6_BATCH3_CLUSTERS,
  STEP6_BATCH3_DELETION_CANDIDATE_SUITES,
  STEP6_BATCH3_GUARD_HELPER,
  STEP6_BATCH3_GUARD_SUITE,
  STEP6_BATCH3_RETAINED_SUITES,
  STEP6_BATCH3_SCOPE_DOCS,
  STEP6_BATCH3_SCOPE_FIXTURES,
}
