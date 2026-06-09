const FULL_TEXT_LOOKING_SENTINEL = 'MAILBOX_TEXT_SHOULD_NOT_LEAK_BUT_THIS_IS_A_COMPACT_TMUX_LABEL'
const LONG_LABEL = `agentteam long label ${'λ'.repeat(2048)}`
const LONG_COMMAND = `python -c "print('${'x'.repeat(4096)}')"`

function pane(paneId, target, label, currentCommand) {
  return { paneId, target, label, currentCommand }
}

function snapshot(capturedAt, panes) {
  return {
    capturedAt,
    panes,
    byPaneId: Object.fromEntries(panes.map(item => [item.paneId, item])),
    ok: true,
  }
}

function cases() {
  return [
    {
      name: 'empty stdout',
      capturedAt: 1700001000000,
      stdout: '',
      expectedPanes: [],
    },
    {
      name: 'single row with trailing newline',
      capturedAt: 1700001000001,
      stdout: '%trail\tsession:@1\tagentteam trailing\tpi\n',
      expectedPanes: [pane('%trail', 'session:@1', 'agentteam trailing', 'pi')],
    },
    {
      name: 'CRLF rows normalize carriage returns',
      capturedAt: 1700001000002,
      stdout: '%crlf-a\tsession:@1\tagentteam crlf\tpi\r\n%crlf-b\tsession:@2\tworker crlf\tbash\r\n',
      expectedPanes: [
        pane('%crlf-a', 'session:@1', 'agentteam crlf', 'pi'),
        pane('%crlf-b', 'session:@2', 'worker crlf', 'bash'),
      ],
    },
    {
      name: 'malformed and too few fields skipped',
      capturedAt: 1700001000003,
      stdout: 'malformed\n%too-few\tsession:@1\tlabel\n%valid\tsession:@2\tvalid label\tzsh',
      expectedPanes: [pane('%valid', 'session:@2', 'valid label', 'zsh')],
    },
    {
      name: 'empty pane id skipped',
      capturedAt: 1700001000004,
      stdout: '\tsession:@1\tmissing pane\tpi\n%present\tsession:@2\tpresent\tbash',
      expectedPanes: [pane('%present', 'session:@2', 'present', 'bash')],
    },
    {
      name: 'empty label retained',
      capturedAt: 1700001000005,
      stdout: '%empty-label\tsession:@1\t\tpi',
      expectedPanes: [pane('%empty-label', 'session:@1', '', 'pi')],
    },
    {
      name: 'empty current command retained',
      capturedAt: 1700001000006,
      stdout: '%empty-command\tsession:@1\tagentteam worker\t',
      expectedPanes: [pane('%empty-command', 'session:@1', 'agentteam worker', '')],
    },
    {
      name: 'duplicate pane ids keep first order and last values',
      capturedAt: 1700001000007,
      stdout: '%dup\tsession:@1\tfirst label\tpi\n%other\tsession:@2\tother label\tbash\n%dup\tsession:@3\tlast label\tzsh',
      expectedPanes: [
        pane('%dup', 'session:@3', 'last label', 'zsh'),
        pane('%other', 'session:@2', 'other label', 'bash'),
      ],
    },
    {
      name: 'extra tab fields ignored after currentCommand',
      capturedAt: 1700001000008,
      stdout: '%extra\tsession:@1\textra label\tpython\textra-field\tanother-field',
      expectedPanes: [pane('%extra', 'session:@1', 'extra label', 'python')],
    },
    {
      name: 'unicode labels and commands retained',
      capturedAt: 1700001000009,
      stdout: '%unicode\t会话:@1\t研究员 🚀 标签\t命令-π',
      expectedPanes: [pane('%unicode', '会话:@1', '研究员 🚀 标签', '命令-π')],
    },
    {
      name: 'long label and command retained efficiently',
      capturedAt: 1700001000010,
      stdout: `%long\tsession:@1\t${LONG_LABEL}\t${LONG_COMMAND}`,
      expectedPanes: [pane('%long', 'session:@1', LONG_LABEL, LONG_COMMAND)],
    },
    {
      name: 'sentinel-like label remains compact tmux label',
      capturedAt: 1700001000011,
      stdout: `%sentinel\tsession:@1\t${FULL_TEXT_LOOKING_SENTINEL}\tpi`,
      expectedPanes: [pane('%sentinel', 'session:@1', FULL_TEXT_LOOKING_SENTINEL, 'pi')],
    },
    {
      name: 'mixed corpus canonical snapshot',
      capturedAt: 1700001000012,
      stdout: [
        '',
        'bad-row',
        '%mix-a\tsession:@1\talpha\tpi',
        '%mix-empty-label\tsession:@1\t\tbash',
        '%mix-empty-command\tsession:@1\tworker\t',
        '\tsession:@1\tmissing pane\tpi',
        '%mix-extra\tsession:@2\textra\tnode\tignored',
        '%mix-a\tsession:@3\talpha last\tzsh',
        `%mix-sentinel\tsession:@4\t${FULL_TEXT_LOOKING_SENTINEL}\tpython`,
      ].join('\n'),
      expectedPanes: [
        pane('%mix-a', 'session:@3', 'alpha last', 'zsh'),
        pane('%mix-empty-label', 'session:@1', '', 'bash'),
        pane('%mix-empty-command', 'session:@1', 'worker', ''),
        pane('%mix-extra', 'session:@2', 'extra', 'node'),
        pane('%mix-sentinel', 'session:@4', FULL_TEXT_LOOKING_SENTINEL, 'python'),
      ],
    },
  ].map(testCase => ({
    ...testCase,
    expected: snapshot(testCase.capturedAt, testCase.expectedPanes),
  }))
}

module.exports = {
  FULL_TEXT_LOOKING_SENTINEL,
  LONG_LABEL,
  LONG_COMMAND,
  cases,
  snapshot,
}
