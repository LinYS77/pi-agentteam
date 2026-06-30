const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_WALK_SKIP_DIRS = ['.git', 'node_modules', 'data', 'dist']

function relPath(root, rel) {
  const value = String(rel || '')
  return path.isAbsolute(value) ? value : path.join(root, ...value.split('/'))
}

function readRel(root, rel, encoding = 'utf8') {
  return fs.readFileSync(relPath(root, rel), encoding)
}

function readJsonRel(root, rel) {
  return JSON.parse(readRel(root, rel))
}

function existsRel(root, rel) {
  return fs.existsSync(relPath(root, rel))
}

function sha256Rel(root, rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(relPath(root, rel))).digest('hex')
}

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/')
}

function walkFiles(root, options = {}) {
  const skipDirs = new Set(options.skipDirs || DEFAULT_WALK_SKIP_DIRS)
  const include = typeof options.include === 'function' ? options.include : () => true
  const out = options.out || []
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      walkFiles(full, { ...options, out, skipDirs: [...skipDirs] })
      continue
    }
    if (entry.isFile() && include(full, entry)) out.push(full)
  }
  return out
}

function assertIncludes(source, expected, label) {
  assert.ok(String(source).includes(expected), `${label} should include ${expected}`)
}

function assertNotIncludes(source, forbidden, label) {
  assert.equal(String(source).includes(forbidden), false, `${label} must not include ${forbidden}`)
}

function assertNoOverclaims(source, forbiddenList, label) {
  for (const forbidden of forbiddenList) {
    if (forbidden instanceof RegExp) {
      assert.equal(forbidden.test(source), false, `${label} must not overclaim: ${forbidden}`)
      continue
    }
    assert.equal(String(source).includes(forbidden), false, `${label} must not overclaim: ${forbidden}`)
  }
}

module.exports = {
  DEFAULT_WALK_SKIP_DIRS,
  relPath,
  readRel,
  readJsonRel,
  existsRel,
  sha256Rel,
  toRel,
  walkFiles,
  assertIncludes,
  assertNotIncludes,
  assertNoOverclaims,
}
