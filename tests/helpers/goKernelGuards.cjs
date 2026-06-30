const assert = require('node:assert/strict')

const BRIDGE_NO_TERMINAL_TOKENS = ['send-keys', 'paste-buffer', 'set-buffer', 'runtimeWake']

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sourceWithoutLineComments(source) {
  return String(source).replace(/^\s*\/\/.*$/gm, '')
}

function parseGoCapabilities(source) {
  const body = String(source).match(/var\s+capabilities\s*=\s*\[\]string\{([^}]+)\}/s)?.[1] || ''
  return [...body.matchAll(/"([^"]+)"/g)].map(match => match[1])
}

function parseGoWorkerLifecycleCases(source) {
  const body = String(source).match(/func\s+workerLifecycle\([^]*?switch\s+operation\s*\{([^]*?)\n\s*default:/)?.[1] || ''
  return [...body.matchAll(/case "([^"]+)"/g)].map(match => match[1])
}

function functionBody(source, name) {
  const text = String(source)
  const candidates = [
    `export async function ${name}(`,
    `export function ${name}(`,
    `async function ${name}(`,
    `function ${name}(`,
  ]
  let start = -1
  for (const candidate of candidates) {
    start = text.indexOf(candidate)
    if (start !== -1) break
  }
  assert.notEqual(start, -1, `${name} should exist`)
  const parameterEnd = text.indexOf(')', start)
  assert.notEqual(parameterEnd, -1, `${name} should have parameters`)
  const signatureEnd = text.indexOf('\n', parameterEnd)
  const brace = text.lastIndexOf('{', signatureEnd === -1 ? text.length : signatureEnd)
  assert.ok(brace > parameterEnd, `${name} should have a body`)
  let depth = 0
  for (let index = brace; index < text.length; index += 1) {
    const char = text[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1)
    }
  }
  throw new Error(`${name} body should close`)
}

function assertNoBridgeTerminalTransport(source, label, options = {}) {
  const tokens = options.tokens || BRIDGE_NO_TERMINAL_TOKENS
  const text = String(source)
  for (const token of tokens) assert.equal(text.includes(token), false, `${label} must not use terminal/tmux transport token ${token}`)
  assert.equal(/runTmux(?:NoThrow|Async|NoThrowAsync)?\s*\(/.test(text), false, `${label} must not call tmux client helpers for delivery`)
  assert.equal(/exec\.Command|spawnSync|spawn\(/.test(text), false, `${label} must not shell out for worker delivery`)
}

module.exports = {
  BRIDGE_NO_TERMINAL_TOKENS,
  escapeRegExp,
  sourceWithoutLineComments,
  parseGoCapabilities,
  parseGoWorkerLifecycleCases,
  functionBody,
  assertNoBridgeTerminalTransport,
}
