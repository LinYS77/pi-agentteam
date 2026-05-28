const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

module.exports = {
  name: 'real loader/package smoke',
  async run(env) {
    const root = path.resolve(__dirname, '..', '..')
    const sourceFiles = ['agents.ts', 'config.ts']
    for (const file of sourceFiles) {
      const text = fs.readFileSync(path.join(root, file), 'utf8')
      assert.ok(text.includes('import.meta.url'), `${file} should use import.meta.url for bundled resource lookup`)
      assert.ok(!text.includes('__filename'), `${file} should not depend on __filename in ESM`)
      assert.ok(!text.includes('__dirname'), `${file} should not depend on __dirname in ESM`)
    }

    assert.equal(fs.existsSync(path.join(root, 'commands.ts')), false, 'legacy top-level commands registration entrypoint should move under api/')
    assert.equal(fs.existsSync(path.join(root, 'tools.ts')), false, 'legacy top-level tools registration entrypoint should move under api/')
    assert.equal(fs.existsSync(path.join(root, 'state.ts')), false, 'legacy top-level state facade should be removed')
    for (const removedRootFacade of [
      'tmux.ts',
      'runtime.ts',
      'runtimeBridge.ts',
      'runtimeDelivery.ts',
      'runtimePanes.ts',
      'runtimeRules.ts',
      'runtimeService.ts',
      'runtimeStorage.ts',
    ]) {
      assert.equal(fs.existsSync(path.join(root, removedRootFacade)), false, `${removedRootFacade} root facade should be removed`)
    }

    const sourceScanRoots = [
      'agents.ts',
      'api',
      'adapters',
      'hooks',
      'runtime',
      'teamPanel.ts',
      'renderers.ts',
      'policy.ts',
      'teamPanel',
      'tools',
      'commands',
    ]
    const staleImports = []
    function scan(p) {
      const stat = fs.statSync(p)
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(p)) scan(path.join(p, entry))
        return
      }
      if (!p.endsWith('.ts')) return
      const text = fs.readFileSync(p, 'utf8')
      if (text.includes('@mariozechner/')) staleImports.push(path.relative(root, p))
    }
    for (const rel of sourceScanRoots) scan(path.join(root, rel))
    assert.deepEqual(staleImports, [], 'source should prefer @earendil-works package scope')

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-loader-smoke-'))
    try {
      const pkgDir = path.join(tmp, 'pkg')
      fs.cpSync(env.helpers.distRoot, pkgDir, { recursive: true })
      fs.writeFileSync(path.join(pkgDir, 'config.mjs'), `
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
const moduleDir = path.dirname(fileURLToPath(import.meta.url))
export function getBundledConfigExamplePath() { return path.join(moduleDir, 'config.example.json') }
export function readBundledConfigExample() { return JSON.parse(fs.readFileSync(getBundledConfigExamplePath(), 'utf8')) }
`, 'utf8')
      fs.writeFileSync(path.join(pkgDir, 'agents.mjs'), `
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '@earendil-works/pi-coding-agent'
const moduleDir = path.dirname(fileURLToPath(import.meta.url))
export function discoverAgents() {
  const dir = path.join(moduleDir, 'agents')
  return fs.readdirSync(dir).filter(name => name.endsWith('.md')).map(name => {
    const content = fs.readFileSync(path.join(dir, name), 'utf8')
    const { frontmatter, body } = parseFrontmatter(content)
    return { name: frontmatter.name, description: frontmatter.description, systemPrompt: body }
  })
}
`, 'utf8')
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8')
      const nm = path.join(pkgDir, 'node_modules')
      fs.mkdirSync(path.join(nm, '@earendil-works'), { recursive: true })
      fs.copyFileSync(path.join(env.helpers.stubRoot, 'pi-coding-agent.js'), path.join(nm, '@earendil-works', 'pi-coding-agent.js'))
      fs.copyFileSync(path.join(env.helpers.stubRoot, 'pi-ai.js'), path.join(nm, '@earendil-works', 'pi-ai.js'))
      fs.copyFileSync(path.join(env.helpers.stubRoot, 'pi-tui.js'), path.join(nm, '@earendil-works', 'pi-tui.js'))
      fs.copyFileSync(path.join(env.helpers.stubRoot, 'typebox.js'), path.join(nm, 'typebox.js'))
      fs.mkdirSync(path.join(nm, '@earendil-works', 'pi-coding-agent'), { recursive: true })
      fs.mkdirSync(path.join(nm, '@earendil-works', 'pi-ai'), { recursive: true })
      fs.mkdirSync(path.join(nm, '@earendil-works', 'pi-tui'), { recursive: true })
      fs.mkdirSync(path.join(nm, 'typebox'), { recursive: true })
      fs.writeFileSync(path.join(nm, '@earendil-works', 'pi-coding-agent', 'package.json'), JSON.stringify({ type: 'commonjs', main: '../pi-coding-agent.js' }), 'utf8')
      fs.writeFileSync(path.join(nm, '@earendil-works', 'pi-ai', 'package.json'), JSON.stringify({ type: 'commonjs', main: '../pi-ai.js' }), 'utf8')
      fs.writeFileSync(path.join(nm, '@earendil-works', 'pi-tui', 'package.json'), JSON.stringify({ type: 'commonjs', main: '../pi-tui.js' }), 'utf8')
      fs.writeFileSync(path.join(nm, 'typebox', 'index.js'), "module.exports = require('../typebox.js')\n", 'utf8')
      fs.writeFileSync(path.join(nm, 'typebox', 'package.json'), JSON.stringify({ type: 'commonjs', main: './index.js' }), 'utf8')

      const agents = await import(pathToFileURL(path.join(pkgDir, 'agents.mjs')).href)
      const config = await import(pathToFileURL(path.join(pkgDir, 'config.mjs')).href)
      const discovered = agents.discoverAgents()
      assert.ok(discovered.some(agent => agent.name === 'researcher'), 'real ESM import should load bundled agents via import.meta.url')
      assert.deepEqual(config.readBundledConfigExample(), { agentModels: { planner: null, researcher: null, implementer: null } }, 'real ESM import should load bundled config example via import.meta.url')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  },
}
