const PROTOCOL_VERSION = 1
const HELPER_VERSION = '0.3.0-read-model-shadow'
const CAPABILITIES = ['health', 'profile', 'tmuxSnapshotParse', 'tmuxSnapshotCapture', 'compactReadModelFingerprint', 'workerLifecycle', 'tmuxAvailability']

const tmuxStdout = [
  '%pane-a\tsession:@1\tagentteam leader\tpi',
  '%pane-b\tsession:@2\tworker label\tbash',
  '%pane-a\tsession:@3\tagentteam duplicate\tzsh',
  'malformed-row',
  '\tsession:@4\tmissing pane\tpython',
  '%pane-extra\tsession:@5\textra label\tnode\textra-field-ignored',
].join('\n')

function compactReadModelInput() {
  return {
    mode: 'attached',
    team: {
      name: 'jsonrpc-team',
      leaderCwd: '/tmp/jsonrpc-team',
      identity: {
        teamId: 'team-jsonrpc',
        projectKey: 'project-jsonrpc',
        displayName: 'JSON-RPC Team',
        slug: 'jsonrpc-team',
      },
      revision: 7,
      tasks: {
        T001: { history: { reports: 1, events: 2, messageRefs: 3 } },
      },
    },
    members: [
      {
        name: 'worker-a',
        role: 'implementer',
        status: 'idle',
        paneId: '%pane-a',
        windowTarget: 'jsonrpc:@1',
        bridgeAvailable: true,
        bridgeVersion: 'test',
        bridgeLastSeenAt: 1700000000000,
        bridgeWorkRequestCount: 1,
      },
    ],
    tasks: [
      {
        id: 'T001',
        title: 'Protocol task',
        status: 'open',
        owner: 'worker-a',
        updatedAt: 1700000001000,
        blockedBy: [],
      },
    ],
    mailbox: [
      {
        id: 'M001',
        type: 'inform',
        from: 'worker-a',
        summary: 'Compact summary only',
        priority: 'normal',
        taskId: 'T001',
        readAt: undefined,
        deliveredAt: 1700000002000,
      },
    ],
    outboxDiagnostics: { pending: 0, failed: 0, latest: [] },
    extraIgnoredByProjection: 'fixture-extra',
  }
}

function request(method, params = undefined, id = `fixture-${method}`) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    ...(params === undefined ? {} : { params }),
  }
}

function validMethodCases() {
  return [
    {
      name: 'health',
      request: request('health', undefined, 'health-string-id'),
    },
    {
      name: 'profile with params',
      request: request('profile', { fixture: 'jsonrpc', nested: { ok: true }, extra: 'ignored by adapter validation' }, 42),
    },
    {
      name: 'tmux snapshot parse',
      request: request('tmuxSnapshotParse', { stdout: tmuxStdout, capturedAt: 1700000003000, extra: 'ignored' }, 'tmux-string-id'),
    },
    {
      name: 'tmux snapshot capture',
      request: request('tmuxSnapshotCapture', { capturedAt: 1700000003500 }, 'tmux-capture-string-id'),
    },
    {
      name: 'compact read-model fingerprint',
      request: request('compactReadModelFingerprint', { input: compactReadModelInput(), extra: 'ignored' }, 'read-model-string-id'),
    },
    {
      name: 'worker lifecycle inspectPane missing pane',
      request: request('workerLifecycle', { operation: 'inspectPane', paneId: '%missing-fixture-pane' }, 'worker-lifecycle-string-id'),
    },
    {
      name: 'worker lifecycle listAgentTeamPanes',
      request: request('workerLifecycle', { operation: 'listAgentTeamPanes' }, 'worker-lifecycle-list-string-id'),
    },
    {
      name: 'worker lifecycle captureCurrentPaneBinding',
      request: request('workerLifecycle', { operation: 'captureCurrentPaneBinding' }, 'worker-lifecycle-current-binding-string-id'),
    },
    {
      name: 'worker lifecycle findAgentTeamWindowTarget',
      request: request('workerLifecycle', { operation: 'findAgentTeamWindowTarget', sessionName: 'missing-fixture-session' }, 'worker-lifecycle-window-target-string-id'),
    },
    {
      name: 'worker lifecycle sessionExists',
      request: request('workerLifecycle', { operation: 'sessionExists', sessionName: 'missing-fixture-session' }, 'worker-lifecycle-session-exists-string-id'),
    },
    {
      name: 'tmux availability',
      request: request('tmuxAvailability', undefined, 'tmux-availability-string-id'),
    },
  ]
}

function paramsCases() {
  return [
    {
      name: 'profile missing params defaults to empty params',
      request: request('profile', undefined, 'profile-missing-params'),
    },
    {
      name: 'profile empty params echoes empty params',
      request: request('profile', {}, 'profile-empty-params'),
    },
    {
      name: 'tmux missing params defaults to empty snapshot',
      request: request('tmuxSnapshotParse', undefined, 'tmux-missing-params'),
    },
    {
      name: 'tmux extra params ignored',
      request: request('tmuxSnapshotParse', { stdout: '%x\ts:@1\tlabel\tcmd\n', capturedAt: 7, unused: 'ignored' }, 'tmux-extra-params'),
    },
    {
      name: 'tmux capture missing params uses helper timestamp',
      request: request('tmuxSnapshotCapture', undefined, 'tmux-capture-missing-params'),
    },
    {
      name: 'compact read-model missing params returns null projection',
      request: request('compactReadModelFingerprint', undefined, 'read-model-missing-params'),
    },
    {
      name: 'compact read-model valid compact payload',
      request: request('compactReadModelFingerprint', { input: compactReadModelInput() }, 'read-model-valid-payload'),
    },
    {
      name: 'worker lifecycle unsupported operation fails closed',
      request: request('workerLifecycle', { operation: 'killPane', paneId: '%unsupported-fixture-pane' }, 'worker-lifecycle-unsupported'),
    },
  ]
}

function idCases() {
  return [
    {
      name: 'string id echoes string id',
      request: request('health', undefined, 'id-string'),
      expectedOwnId: true,
      expectedId: 'id-string',
    },
    {
      name: 'numeric id echoes numeric id',
      request: request('health', undefined, 123),
      expectedOwnId: true,
      expectedId: 123,
    },
    {
      name: 'null id is omitted by current helper response',
      request: request('health', undefined, null),
      expectedOwnId: false,
    },
    {
      name: 'missing id is omitted by current helper response',
      request: { jsonrpc: '2.0', method: 'health' },
      expectedOwnId: false,
    },
  ]
}

function errorCases() {
  return [
    {
      name: 'parse error',
      raw: '{not-json\n',
      expectedCode: -32700,
      expectedOwnId: false,
    },
    {
      name: 'invalid jsonrpc version',
      request: { jsonrpc: '1.0', id: 'bad-version', method: 'health' },
      expectedCode: -32600,
      expectedMessageIncludes: 'invalid JSON-RPC version',
      expectedOwnId: true,
      expectedId: 'bad-version',
    },
    {
      name: 'unknown method',
      request: { jsonrpc: '2.0', id: 'unknown-method', method: 'unknownMethod' },
      expectedCode: -32601,
      expectedMessageIncludes: 'method not found',
      expectedOwnId: true,
      expectedId: 'unknown-method',
    },
  ]
}

function multipleRequestBatch() {
  return [
    request('health', undefined, 'batch-health'),
    request('profile', { batch: true }, 204),
    request('tmuxSnapshotParse', { stdout: '%batch\ts:@1\tbatch label\tpi\n', capturedAt: 99 }, 'batch-tmux'),
    request('tmuxSnapshotCapture', { capturedAt: 100 }, 'batch-tmux-capture'),
    request('compactReadModelFingerprint', { input: compactReadModelInput() }, 'batch-read-model'),
    request('workerLifecycle', { operation: 'inspectPane', paneId: '%batch-missing-pane' }, 'batch-worker-lifecycle'),
    request('workerLifecycle', { operation: 'listAgentTeamPanes' }, 'batch-worker-lifecycle-list'),
    request('workerLifecycle', { operation: 'captureCurrentPaneBinding' }, 'batch-worker-lifecycle-current-binding'),
    request('workerLifecycle', { operation: 'findAgentTeamWindowTarget', sessionName: 'missing-batch-session' }, 'batch-worker-lifecycle-window-target'),
    request('workerLifecycle', { operation: 'sessionExists', sessionName: 'missing-batch-session' }, 'batch-worker-lifecycle-session-exists'),
    request('tmuxAvailability', undefined, 'batch-tmux-availability'),
    { jsonrpc: '2.0', id: 'batch-unknown', method: 'unknownMethod' },
  ]
}

function largePayloadRequest(byteCount = 1024 * 1024) {
  const chunk = 'x'.repeat(Math.max(1, byteCount))
  return request('tmuxSnapshotParse', {
    stdout: `%large\tsession:@1\t${chunk}\tpi\n`,
    capturedAt: 1700000004000,
  }, 'large-within-scanner-bound')
}

module.exports = {
  PROTOCOL_VERSION,
  HELPER_VERSION,
  CAPABILITIES,
  tmuxStdout,
  compactReadModelInput,
  request,
  validMethodCases,
  paramsCases,
  idCases,
  errorCases,
  multipleRequestBatch,
  largePayloadRequest,
}
