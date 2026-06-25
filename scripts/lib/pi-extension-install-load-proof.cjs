const cp = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const PACKAGE_NAME = 'pi-agentteam'
const PACKAGE_VERSION = '0.6.8'
const RESULT_MARKER = 'pi-extension-install-load-smoke'
const APPROVED_EMBEDDED_NATIVE_PREFIX = 'native/tmuxSnapshotParse/0.3.0-read-model-shadow/linux-x64-glibc/'
const EXPECTED_COMMANDS = ['team']
const EXPECTED_TOOLS = [
  'agentteam_create',
  'agentteam_spawn',
  'agentteam_send',
  'agentteam_receive',
  'agentteam_task',
  'agentteam_planrun',
]
const EXPECTED_RENDERERS = ['agentteam-leader-attention', 'agentteam-mailbox']
const EXPECTED_HOOK_EVENTS = [
  'agent_end',
  'agent_start',
  'before_agent_start',
  'context',
  'input',
  'message_end',
  'session_shutdown',
  'session_start',
  'tool_call',
  'tool_result',
]
const REQUIRED_INSTALLED_FILES = [
  'package.json',
  'index.ts',
  'types.ts',
  'api/tools.ts',
  'api/commands.ts',
  'commands/team.ts',
  'tools/team.ts',
  'tools/message.ts',
  'tools/task.ts',
  'tools/planRun.ts',
  'hooks/session.ts',
  'hooks/context.ts',
  'hooks/agent.ts',
  'hooks/toolGuard.ts',
  'renderers.ts',
  'policy.ts',
  'config.example.json',
  'README.md',
  'LICENSE',
]
const EXPECTED_PEERS = {
  '@earendil-works/pi-ai': '*',
  '@earendil-works/pi-coding-agent': '*',
  '@earendil-works/pi-tui': '*',
  typebox: '*',
}
const FORBIDDEN_PACKAGE_KEYS = [
  'optionalDependencies',
  'bundledDependencies',
  'bundleDependencies',
  'agentteamGoHelper',
  'binary',
  'os',
  'cpu',
  'native',
  'nativeHelper',
]
const LIFECYCLE_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepublish',
  'prepublishOnly',
  'publish',
  'postpublish',
]
const ROOT_FORBIDDEN_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.mod',
  'go.sum',
  'kernel/go/agentteam-kernel/go.mod',
  'kernel/go/agentteam-kernel/go.sum',
]
const FAILURE_KINDS = new Set([
  'repo-package-invalid',
  'npm-unavailable',
  'npm-pack-failed',
  'npm-pack-invalid',
  'npm-install-failed',
  'installed-package-missing',
  'installed-package-invalid',
  'installed-surface-invalid',
  'installed-code-load-failed',
  'extension-factory-invalid',
  'extension-registration-invalid',
  'cleanup-failed',
])

class PiExtensionInstallLoadProofError extends Error {
  constructor(failureKind, remediation, hint, details = {}) {
    super(failureKind)
    this.name = 'PiExtensionInstallLoadProofError'
    this.failureKind = failureKind
    this.remediation = remediation
    this.hint = hint
    this.details = details
  }

  toDiagnostic() {
    return compactFailure(this.failureKind, this.remediation, this.hint, this.details)
  }
}

function compactFailure(failureKind, remediation, hint, details = {}) {
  if (!FAILURE_KINDS.has(failureKind)) throw new Error(`unexpected failureKind ${failureKind}`)
  return {
    ok: false,
    status: 'unavailable',
    resultMarker: 'fail-closed',
    failureKind,
    remediation,
    hint,
    reviewOnly: true,
    prototype: true,
    piExtensionFacadeLoad: false,
    nativePackageDelivery: false,
    normalUserNativeAvailability: false,
    defaultGo: false,
    fallbackDeletion: false,
    pathsRedacted: true,
    rawNpmOutputIncluded: false,
    stackIncluded: false,
    ...(Number.isFinite(details.exitCode) ? { exitCode: details.exitCode } : {}),
  }
}

function fail(failureKind, remediation, hint, details) {
  throw new PiExtensionInstallLoadProofError(failureKind, remediation, hint, details)
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
}

function readJson(filePath, failureKind, hint) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!isRecord(parsed)) fail(failureKind, 'inspect package metadata and rerun pi extension load proof', hint)
    return parsed
  } catch (error) {
    if (error instanceof PiExtensionInstallLoadProofError) throw error
    fail(failureKind, 'inspect package metadata and rerun pi extension load proof', hint)
  }
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')))
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function spawnNpm(args, cwd) {
  return cp.spawnSync('npm', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
    },
  })
}

function assertNpmAvailable(repoRoot) {
  const result = spawnNpm(['--version'], repoRoot)
  if (result.error || result.status !== 0) {
    fail('npm-unavailable', 'install npm and rerun temp pi extension install/load proof', 'npm')
  }
  return String(result.stdout || '').trim().split('\n')[0].trim()
}

function assertPackageMetadata(packageJson, scope) {
  if (packageJson.name !== PACKAGE_NAME) fail('repo-package-invalid', 'run proof from the pi-agentteam repository root', `${scope}:package-name`)
  if (packageJson.version !== PACKAGE_VERSION) fail('repo-package-invalid', 'preserve package.json version 0.6.8 for v0.6.35 pi extension proof', `${scope}:package-version`)
  if (packageJson.type !== 'module') fail('repo-package-invalid', 'preserve package type module for pi TypeScript extension', `${scope}:type`)
  if (Object.prototype.hasOwnProperty.call(packageJson, 'main') || Object.prototype.hasOwnProperty.call(packageJson, 'exports') || Object.prototype.hasOwnProperty.call(packageJson, 'types')) {
    fail('repo-package-invalid', 'keep current no-main/no-exports/no-types package surface unless future-approved', `${scope}:entry-fields`)
  }
  if (JSON.stringify(packageJson.pi?.extensions) !== JSON.stringify(['./index.ts'])) {
    fail('repo-package-invalid', 'keep package.json#pi.extensions exactly ["./index.ts"]', `${scope}:pi.extensions`)
  }
  for (const [name, range] of Object.entries(EXPECTED_PEERS)) {
    if (packageJson.peerDependencies?.[name] !== range) {
      fail('repo-package-invalid', 'keep pi core packages and typebox as peer dependencies with * range', `${scope}:peer:${name}`)
    }
  }
  if (packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0) {
    fail('repo-package-invalid', 'do not add runtime dependencies in v0.6.35 Slice 2 proof', `${scope}:dependencies`)
  }
  for (const key of FORBIDDEN_PACKAGE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(packageJson, key)) {
      fail('repo-package-invalid', 'remove native package metadata before pi extension load proof', `${scope}:${key}`)
    }
  }
  for (const lifecycle of LIFECYCLE_SCRIPTS) {
    if (Object.prototype.hasOwnProperty.call(packageJson.scripts || {}, lifecycle)) {
      fail('repo-package-invalid', 'remove lifecycle hooks before pi extension load proof', `${scope}:${lifecycle}`)
    }
  }
  for (const [name, command] of Object.entries(packageJson.scripts || {})) {
    const packAllowed = name === 'release:check' && /npm\s+pack\s+--dry-run\s+--ignore-scripts\b/.test(command)
    if (/npm\s+(?:publish|version)\b/.test(command)) fail('repo-package-invalid', 'remove publish/version script behavior', `${scope}:${name}`)
    if (/npm\s+pack\b/.test(command) && !packAllowed) fail('repo-package-invalid', 'remove package-producing script behavior', `${scope}:${name}`)
    if (/go\s+(?:build|install|mod)\b|curl\b|wget\b|node-gyp\b|prebuild|postinstall|preinstall|install-time build/i.test(command)) {
      fail('repo-package-invalid', 'remove native helper build/download/install behavior from scripts', `${scope}:${name}`)
    }
  }
  if ((packageJson.files || []).some(item => /(?:github|workflow|helper|native|manifest|artifact|bundle|generated|checksum|provenance|attestation|hosted-observation|record|\.exe|\.dll|\.so|\.dylib|\.tgz)/i.test(item) && !item.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX))) {
    fail('repo-package-invalid', 'keep unapproved native/generated/helper artifacts out of package files metadata', `${scope}:files`)
  }
}

function assertRepoPackage(repoRoot) {
  const packageJson = readJson(path.join(repoRoot, 'package.json'), 'repo-package-invalid', 'repo-package-json')
  assertPackageMetadata(packageJson, 'repo')
  for (const rel of ROOT_FORBIDDEN_FILES) {
    if (exists(repoRoot, rel)) fail('repo-package-invalid', 'remove lockfiles or Go module files before pi extension load proof', rel)
  }
  return packageJson
}

function findPackedTarball(packRoot) {
  const tarballs = fs.readdirSync(packRoot).filter(name => /^pi-agentteam-.*\.tgz$/i.test(name)).sort()
  if (tarballs.length !== 1) fail('npm-pack-invalid', 'ensure npm pack emits exactly one local temp tarball', 'tarball-count')
  return path.join(packRoot, tarballs[0])
}

function parsePackJson(stdout) {
  try {
    const parsed = JSON.parse(stdout)
    if (!Array.isArray(parsed) || !isRecord(parsed[0])) return undefined
    return parsed[0]
  } catch (_) {
    return undefined
  }
}

function createInstallWorkspace(repoRoot, options = {}) {
  assertRepoPackage(repoRoot)

  const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0635-pack-'))
  const installProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0635-install-'))
  const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0635-installed-dist-'))
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentteam-v0635-state-'))
  const tempRoots = { packRoot, installProjectRoot, distRoot, stateRoot }
  if (typeof options.onTempRoots === 'function') options.onTempRoots({ ...tempRoots })

  const pack = spawnNpm(['pack', repoRoot, '--ignore-scripts', '--pack-destination', packRoot, '--json'], repoRoot)
  if (pack.error || pack.status !== 0) fail('npm-pack-failed', 'rerun npm pack pi extension proof locally with scripts ignored', 'npm-pack', { exitCode: pack.status })
  const packed = parsePackJson(pack.stdout)
  const tarballPath = findPackedTarball(packRoot)
  if (!fs.existsSync(tarballPath)) fail('npm-pack-invalid', 'ensure local temp npm tarball exists before install', 'tarball')

  fs.writeFileSync(path.join(installProjectRoot, 'package.json'), `${JSON.stringify({ private: true, name: 'agentteam-v0635-pi-extension-temp' }, null, 2)}\n`, 'utf8')
  const install = spawnNpm([
    'install',
    tarballPath,
    '--ignore-scripts',
    '--package-lock=false',
    '--legacy-peer-deps',
    '--no-audit',
    '--no-fund',
  ], installProjectRoot)
  if (install.error || install.status !== 0) fail('npm-install-failed', 'rerun npm install from local temp tarball with scripts ignored', 'npm-install', { exitCode: install.status })

  const installedRoot = path.join(installProjectRoot, 'node_modules', PACKAGE_NAME)
  if (!fs.existsSync(installedRoot) || !fs.statSync(installedRoot).isDirectory()) {
    fail('installed-package-missing', 'ensure npm installed the local temp tarball package under node_modules', 'installed-root')
  }
  if (fs.existsSync(path.join(installProjectRoot, 'package-lock.json')) || fs.existsSync(path.join(installProjectRoot, 'npm-shrinkwrap.json'))) {
    fail('installed-surface-invalid', 'keep temp install package-lock disabled', 'temp-lockfile')
  }

  const installedPackageJson = readJson(path.join(installedRoot, 'package.json'), 'installed-package-invalid', 'installed-package-json')
  assertPackageMetadata(installedPackageJson, 'installed')

  return {
    packRoot,
    installProjectRoot,
    distRoot,
    stateRoot,
    installedRoot,
    installedPackageJson,
    packed,
    packFileCount: Number.isFinite(packed?.files?.length) ? packed.files.length : undefined,
    packEntryCount: Number.isFinite(packed?.entryCount) ? packed.entryCount : undefined,
  }
}

function cleanupWorkspace(workspace) {
  try {
    fs.rmSync(workspace.packRoot, { recursive: true, force: true })
    fs.rmSync(workspace.installProjectRoot, { recursive: true, force: true })
    fs.rmSync(workspace.distRoot, { recursive: true, force: true })
    fs.rmSync(workspace.stateRoot, { recursive: true, force: true })
  } catch (_) {
    fail('cleanup-failed', 'remove temp npm pack/install/load roots manually and rerun', 'cleanup')
  }
}

function assertInstalledSurface(installedRoot) {
  const allFiles = walkFiles(installedRoot).map(file => toPosix(path.relative(installedRoot, file))).sort()
  const requiredMissing = REQUIRED_INSTALLED_FILES.filter(rel => !allFiles.includes(rel))
  if (requiredMissing.length > 0) fail('installed-surface-invalid', 'ensure TS/pi facade files are included in package files allowlist', 'required-files')

  const forbiddenNames = /(?:^|\/)(?:artifact-index|review-artifact-index|artifact-verifier|SHA256SUMS|checksum|provenance|attestation\.intoto|package-artifact|native-manifest|agentteam-native-manifest|generated-manifest|artifact-manifest|workflow-summary|verifier-output|hosted-observation-record|workflow-run|raw-payload|api-payload|signature|signed|cosign|slsa|release-bundle|release-asset)\.(?:json|jsonc|yaml|yml|jsonl|txt|sha256|sig|sigstore|bundle|intoto|md)$/i
  const forbidden = allFiles.filter(rel => {
    if (rel === 'package.json' || rel === 'LICENSE' || rel === 'README.md') return false
    if (rel.startsWith(APPROVED_EMBEDDED_NATIVE_PREFIX)) return false
    return rel === '.agentteam-artifacts'
      || rel.startsWith('.agentteam-artifacts/')
      || rel === 'native'
      || rel.startsWith('native/')
      || /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|go\.mod|go\.sum)$/i.test(rel)
      || /\.(?:exe|dll|so|dylib|tgz|tar|tar\.gz|zip|sig|sigstore|pem|key|crt|cert|p7s|minisig)$/i.test(rel)
      || forbiddenNames.test(rel)
  })
  if (forbidden.length > 0) fail('installed-surface-invalid', 'remove native/generated/package/release/signing artifacts from installed package surface', 'forbidden-installed-files')

  return {
    fileCount: allFiles.length,
    requiredFiles: [...REQUIRED_INSTALLED_FILES],
    requiredFilesPresent: true,
    packageJsonPresent: allFiles.includes('package.json'),
    indexTsPresent: allFiles.includes('index.ts'),
    readmePresent: allFiles.includes('README.md'),
    licensePresent: allFiles.includes('LICENSE'),
    configExamplePresent: allFiles.includes('config.example.json'),
    nativeHelperLayoutPresent: allFiles.some(rel => rel === 'native' || rel.startsWith('native/')),
    generatedArtifactsPresent: false,
    lockfilesPresent: false,
    goModulesPresent: false,
    nativeArchivesOrBinariesPresent: false,
    releaseAssetsPresent: false,
    signaturesOrAttestationsPresent: false,
    rawHostedRecordsPresent: false,
  }
}

function requireTypeScript() {
  try {
    return require('typescript')
  } catch (_) {
    return require('/home/linyusheng/.nvm/versions/node/v24.9.0/lib/node_modules/typescript')
  }
}

function writeFileEnsured(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}

function writeStubPackage(distRoot, packageName, source) {
  const packageDir = path.join(distRoot, 'node_modules', ...packageName.split('/'))
  fs.mkdirSync(packageDir, { recursive: true })
  fs.writeFileSync(path.join(packageDir, 'package.json'), `${JSON.stringify({ name: packageName, type: 'module', main: './index.js' }, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(packageDir, 'index.js'), source, 'utf8')
}

function writePeerDependencyStubs(distRoot) {
  writeStubPackage(distRoot, '@earendil-works/pi-coding-agent', `
export function parseFrontmatter(content) {
  const text = String(content ?? '')
  if (!text.startsWith('---\\n')) return { frontmatter: {}, body: text }
  const end = text.indexOf('\\n---', 4)
  if (end < 0) return { frontmatter: {}, body: text }
  const raw = text.slice(4, end).trim().split(/\\r?\\n/u)
  const frontmatter = {}
  for (const line of raw) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return { frontmatter, body: text.slice(end + 4).replace(/^\\r?\\n/u, '') }
}
`)

  writeStubPackage(distRoot, '@earendil-works/pi-ai', `
export function StringEnum(values, options = {}) {
  const enumValues = Array.from(values)
  return { kind: 'string-enum', type: 'string', enum: enumValues, v: { enum: enumValues }, options }
}
`)

  writeStubPackage(distRoot, 'typebox', `
function schema(kind, extra = {}) { return { kind, ...extra } }
export const Type = {
  String(options = {}) { return schema('string', { type: 'string', ...options }) },
  Number(options = {}) { return schema('number', { type: 'number', ...options }) },
  Boolean(options = {}) { return schema('boolean', { type: 'boolean', ...options }) },
  Unknown() { return schema('unknown') },
  Array(items, options = {}) { return schema('array', { type: 'array', items, ...options }) },
  Object(properties, options = {}) { return schema('object', { type: 'object', properties, o: properties, ...options }) },
  Optional(value) { return schema('optional', { optional: true, v: value, value }) },
  Record(key, value, options = {}) { return schema('record', { type: 'record', key, value, ...options }) },
}
`)

  writeStubPackage(distRoot, '@earendil-works/pi-tui', `
export class Text {
  constructor(text = '', x = 0, y = 0) { this.text = text; this.x = x; this.y = y }
  setText(text) { this.text = text }
}
export class Box {
  constructor(x = 0, y = 0, colorize = value => value) { this.x = x; this.y = y; this.colorize = colorize; this.children = [] }
  addChild(child) { this.children.push(child); return child }
}
export const Key = {
  escape: 'escape',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  enter: 'return',
  tab: 'tab',
  shift(value) { return 'shift+' + value },
}
export function matchesKey(input, key) { return String(input) === String(key) }
export function visibleWidth(value) { return String(value ?? '').replace(/\\u001b\\[[0-9;]*m/g, '').length }
export function truncateToWidth(value, width) {
  const text = String(value ?? '')
  const safe = Math.max(0, Number(width) || 0)
  return text.length <= safe ? text : text.slice(0, safe)
}
`)
}

function transpileInstalledPackage(installedRoot, distRoot) {
  const ts = requireTypeScript()
  fs.writeFileSync(path.join(distRoot, 'package.json'), `${JSON.stringify({ name: `${PACKAGE_NAME}-installed-load-proof`, private: true, type: 'module' }, null, 2)}\n`, 'utf8')
  writePeerDependencyStubs(distRoot)

  const files = walkFiles(installedRoot)
  let tsFileCount = 0
  let copiedResourceCount = 0
  for (const file of files) {
    const rel = toPosix(path.relative(installedRoot, file))
    if (rel === 'package.json') continue
    if (rel.startsWith('node_modules/')) continue
    if (rel.endsWith('.ts')) {
      const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.ES2022,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          sourceMap: false,
          inlineSourceMap: false,
          inlineSources: false,
        },
        fileName: file,
        reportDiagnostics: false,
      }).outputText
      writeFileEnsured(path.join(distRoot, rel.replace(/\.ts$/, '.js')), output)
      tsFileCount += 1
      continue
    }
    writeFileEnsured(path.join(distRoot, rel), fs.readFileSync(file))
    copiedResourceCount += 1
  }

  return {
    sourceKind: 'installed-package-root-transpiled',
    loadedFromInstalledPackageRoot: true,
    repoSourceLoaded: false,
    tsFileCount,
    copiedResourceCount,
    peerDependencyStubs: Object.keys(EXPECTED_PEERS).sort(),
  }
}

function createStubPi() {
  const hooks = []
  const tools = new Map()
  const commands = new Map()
  const renderers = new Map()
  const sentMessages = []
  const sentUserMessages = []
  const activeToolsChanges = []
  const providerRegistrations = []
  return {
    hooks,
    tools,
    commands,
    renderers,
    sentMessages,
    sentUserMessages,
    activeToolsChanges,
    providerRegistrations,
    api: {
      on(event, handler) {
        hooks.push({ event, handlerType: typeof handler })
      },
      registerTool(tool) {
        tools.set(tool?.name, tool)
      },
      registerCommand(name, options) {
        commands.set(name, options)
      },
      registerMessageRenderer(type, renderer) {
        renderers.set(type, renderer)
      },
      sendMessage(message, options) {
        sentMessages.push({ message, options })
      },
      sendUserMessage(content, options) {
        sentUserMessages.push({ content, options })
      },
      setActiveTools(names) {
        activeToolsChanges.push(Array.isArray(names) ? [...names] : names)
      },
      registerProvider(name, config) {
        providerRegistrations.push({ name, config })
      },
      events: {
        on() {},
        emit() {},
      },
    },
  }
}

function assertRegistrationSurface(stub) {
  const commandNames = [...stub.commands.keys()].sort()
  const toolNames = [...stub.tools.keys()].sort()
  const rendererNames = [...stub.renderers.keys()].sort()
  const hookEvents = [...new Set(stub.hooks.map(hook => hook.event))].sort()

  if (JSON.stringify(commandNames) !== JSON.stringify(EXPECTED_COMMANDS)) {
    fail('extension-registration-invalid', 'keep installed pi facade command registration surface stable for Slice 2 proof', 'commands')
  }
  if (JSON.stringify(toolNames) !== JSON.stringify(EXPECTED_TOOLS.slice().sort())) {
    fail('extension-registration-invalid', 'keep installed pi facade tool registration surface stable for Slice 2 proof', 'tools')
  }
  for (const renderer of EXPECTED_RENDERERS) {
    if (!stub.renderers.has(renderer)) fail('extension-registration-invalid', 'keep installed pi facade renderer registration surface stable for Slice 2 proof', `renderer:${renderer}`)
  }
  for (const event of EXPECTED_HOOK_EVENTS) {
    if (!hookEvents.includes(event)) fail('extension-registration-invalid', 'keep installed pi facade hook registration surface stable for Slice 2 proof', `hook:${event}`)
  }
  for (const name of EXPECTED_TOOLS) {
    const tool = stub.tools.get(name)
    if (!tool || typeof tool.description !== 'string' || typeof tool.promptSnippet !== 'string' || !Array.isArray(tool.promptGuidelines)) {
      fail('extension-registration-invalid', 'registered tools must include descriptions, prompt snippets, and guidelines', `tool-metadata:${name}`)
    }
  }
  const command = stub.commands.get('team')
  if (!command || typeof command.description !== 'string' || typeof command.handler !== 'function') {
    fail('extension-registration-invalid', 'registered /team command must include description and handler', 'team-command')
  }
  if (stub.sentMessages.length > 0 || stub.sentUserMessages.length > 0 || stub.activeToolsChanges.length > 0 || stub.providerRegistrations.length > 0) {
    fail('extension-registration-invalid', 'extension factory load must not send messages, change active tools, or register providers', 'factory-side-effects')
  }

  return {
    commands: commandNames,
    tools: toolNames,
    hookEvents,
    renderers: rendererNames,
    teamCommandRegistered: commandNames.includes('team'),
    expectedToolsRegistered: EXPECTED_TOOLS.every(name => toolNames.includes(name)),
    expectedHooksObserved: EXPECTED_HOOK_EVENTS.every(event => hookEvents.includes(event)),
    expectedRenderersObserved: EXPECTED_RENDERERS.every(name => rendererNames.includes(name)),
    messagesSentDuringLoad: stub.sentMessages.length,
    userMessagesSentDuringLoad: stub.sentUserMessages.length,
    activeToolChangesDuringLoad: stub.activeToolsChanges.length,
    providersRegisteredDuringLoad: stub.providerRegistrations.length,
  }
}

async function loadInstalledFacade(workspace, transpiled) {
  const stub = createStubPi()
  const previousHome = process.env.PI_AGENTTEAM_HOME
  process.env.PI_AGENTTEAM_HOME = workspace.stateRoot
  try {
    const moduleUrl = pathToFileURL(path.join(workspace.distRoot, 'index.js')).href
    const loaded = await import(`${moduleUrl}?proof=${Date.now()}-${Math.random().toString(16).slice(2)}`)
    if (typeof loaded.default !== 'function') {
      fail('extension-factory-invalid', 'installed index.ts default export must be callable extension factory', 'default-export')
    }
    loaded.default(stub.api)
    const stateFiles = walkFiles(workspace.stateRoot)
    const registration = assertRegistrationSurface(stub)
    return {
      ...transpiled,
      defaultExportCallable: true,
      invokedWithStubPiApi: true,
      stateRootControlled: true,
      stateFilesWrittenDuringLoad: stateFiles.length,
      stateWritesOutsideStub: false,
      registration,
    }
  } catch (error) {
    if (error instanceof PiExtensionInstallLoadProofError) throw error
    fail('installed-code-load-failed', 'load transpiled installed package index.ts with stubbed pi peer APIs', 'installed-index-load')
  } finally {
    if (previousHome === undefined) delete process.env.PI_AGENTTEAM_HOME
    else process.env.PI_AGENTTEAM_HOME = previousHome
  }
}

function buildSummary(input) {
  return {
    ok: true,
    status: 'verified',
    resultMarker: RESULT_MARKER,
    proofKind: 'temp-npm-install-load-ts-pi-facade',
    reviewOnly: true,
    prototype: true,
    piExtensionFacadeLoad: true,
    nativePackageDelivery: false,
    normalUserNativeAvailability: false,
    defaultGo: false,
    defaultResolver: false,
    fallbackDeletion: false,
    releaseAsset: false,
    installSource: false,
    packageArtifact: false,
    packageManagerNativeDelivery: false,
    package: {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      type: 'module',
      piExtensions: ['./index.ts'],
      tsPiFacade: true,
      nativeMetadata: false,
      lifecycleHooks: false,
      unsafeScripts: false,
      mainExportsTypesAdded: false,
    },
    npm: {
      available: true,
      versionObserved: 'observed-redacted',
      pack: {
        ran: true,
        command: 'npm pack <repo-root> --ignore-scripts --pack-destination <temp> --json',
        exitCode: 0,
        localTempTarball: true,
        scriptsIgnored: true,
        fileCount: input.workspace.packFileCount,
        entryCount: input.workspace.packEntryCount,
      },
      install: {
        ran: true,
        command: 'npm install <local-temp-tarball> --ignore-scripts --package-lock=false --legacy-peer-deps --no-audit --no-fund',
        exitCode: 0,
        localTempTarball: true,
        scriptsIgnored: true,
        packageLockDisabled: true,
        legacyPeerDeps: true,
        auditDisabled: true,
        fundDisabled: true,
        realPiInstall: false,
        networkRequired: false,
      },
    },
    installedPackage: {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      rootKind: 'os-temp-project-node_modules-package',
      loadedFromInstalledPackageRoot: true,
      repoSourceLoaded: false,
      piExtensions: ['./index.ts'],
      ...input.surface,
      packageJsonNativeMetadata: false,
      packageJsonLifecycleHooks: false,
      packageJsonUnsafeScripts: false,
    },
    load: {
      sourceKind: input.load.sourceKind,
      loadedFromInstalledPackageRoot: input.load.loadedFromInstalledPackageRoot,
      repoSourceLoaded: input.load.repoSourceLoaded,
      transpiledTsFiles: input.load.tsFileCount,
      copiedResourceFiles: input.load.copiedResourceCount,
      peerDependencyStubs: input.load.peerDependencyStubs,
      defaultExportCallable: input.load.defaultExportCallable,
      invokedWithStubPiApi: input.load.invokedWithStubPiApi,
      stateRootControlled: input.load.stateRootControlled,
      stateFilesWrittenDuringLoad: input.load.stateFilesWrittenDuringLoad,
      stateWritesOutsideStub: input.load.stateWritesOutsideStub,
    },
    registeredSurface: input.load.registration,
    noNativeDefaultReleaseControls: {
      nativeHelperRequired: false,
      goToolchainRequired: false,
      tmuxExecutionRequired: false,
      packageResolverRequired: false,
      hostedArtifactsRequired: false,
      lifecycleHooksRequired: false,
      networkRequired: false,
      defaultGoEnabled: false,
      defaultResolverEnabled: false,
      releaseControlsExposedByProof: false,
    },
    diagnostics: {
      pathsRedacted: true,
      tarballPathIncluded: false,
      repoCwdIncluded: false,
      rawNpmStdoutIncluded: false,
      rawNpmStderrIncluded: false,
      stackIncluded: false,
    },
    cleanup: {
      defaultCleanup: true,
      cleaned: input.cleaned,
      kept: input.kept,
      pathsRedacted: true,
    },
  }
}

async function runPiExtensionInstallLoadProof(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..', '..'))
  assertNpmAvailable(repoRoot)
  const keepTemp = Boolean(options.keepTemp)
  const workspace = createInstallWorkspace(repoRoot, options)
  let cleaned = false
  try {
    const surface = assertInstalledSurface(workspace.installedRoot)
    const transpiled = transpileInstalledPackage(workspace.installedRoot, workspace.distRoot)
    const load = await loadInstalledFacade(workspace, transpiled)
    if (!keepTemp) {
      cleanupWorkspace(workspace)
      cleaned = true
    }
    return buildSummary({ workspace, surface, load, cleaned, kept: keepTemp })
  } catch (error) {
    if (!keepTemp) cleanupWorkspace(workspace)
    if (error instanceof PiExtensionInstallLoadProofError) throw error
    fail('installed-code-load-failed', 'rerun pi extension facade load proof and inspect compact failure kind', 'unexpected')
  }
}

module.exports = {
  EXPECTED_COMMANDS,
  EXPECTED_HOOK_EVENTS,
  EXPECTED_RENDERERS,
  EXPECTED_TOOLS,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  PiExtensionInstallLoadProofError,
  compactFailure,
  runPiExtensionInstallLoadProof,
}
