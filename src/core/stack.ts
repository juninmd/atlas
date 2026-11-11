import { posix } from './path.ts'
import { redact } from './redact.ts'
import type { Dep, DepKind, Ecosystem, Stack, WorkflowRef } from './types.ts'

interface Out { deps: Dep[]; runtimes: Record<string, string | string[]>; docker: Set<string>; errors: string[] }
type Handler = (text: string, dir: string, out: Out) => void
// Declared values only. Bounded before redact (its regexes go quadratic on hostile input); URL userinfo,
// token-shaped values and control characters (terminal escapes, forged rows) never reach the index.
const clean = (value: unknown, max = 120): string => redact(String(value).slice(0, 2000).replace(/\/\/[^\s/]*@/g, '//'))
  .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').slice(0, max)
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const lines = (text: string): string[] => text.split(/\r?\n/)
const dep = (ecosystem: Ecosystem, name: string, range: string | undefined, kind: DepKind, path: string): Dep => ({ ecosystem, name: clean(name, 214), range: clean(range || '*'), kind, path })
const requirement = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*((?:[<>=!~@].*)?)$/
function pip(line: string, dir: string, out: Out): void {
  const match = line.split('#')[0].split(';')[0].trim().match(requirement)
  if (match) out.deps.push(dep('pypi', match[1], match[2].replace(/\s--\S.*$/, '').replace(/\\$/, '').replace(/\s+/g, ''), 'prod', dir))
}
// Linear scan of `key = [ "a", 'b' ]`: quotes and comments are honoured, so `]` inside a string never ends the list.
function tomlList(text: string, key: string): string[] {
  const start = text.match(new RegExp(`^${key}[ \\t]*=[ \\t]*\\[`, 'm'))
  const items: string[] = []
  for (let i = start ? (start.index ?? 0) + start[0].length : text.length; i < text.length;) {
    const c = text[i]!
    if (c === ']') break
    if (c === '#') { while (i < text.length && text[i] !== '\n') i++ } else if (c === '"' || c === "'") {
      const end = text.indexOf(c, i + 1)
      if (end < 0) break
      items.push(text.slice(i + 1, end)); i = end + 1
    } else i++
  }
  return items
}
const cargoKinds: Record<string, DepKind> = { dependencies: 'prod', 'dev-dependencies': 'dev', 'build-dependencies': 'build', 'workspace.dependencies': 'prod' }
const cargoRange = (table: string): string => table.match(/\bversion\s*=\s*"([^"]+)"/)?.[1] ?? (/\bworkspace\s*=\s*true/.test(table) ? 'workspace' : '(sem versão)')
const handlers: Record<string, Handler> = {
  'package.json'(text, dir, out) {
    let pkg: unknown
    try { pkg = JSON.parse(text) } catch { /* reported below */ }
    if (!isObject(pkg)) return out.errors.push(posix.join(dir, 'package.json'))
    const groups: [string, DepKind][] = [['dependencies', 'prod'], ['devDependencies', 'dev'], ['peerDependencies', 'peer']]
    for (const [group, kind] of groups)
      if (isObject(pkg[group])) for (const [name, range] of Object.entries(pkg[group] as Record<string, unknown>)) out.deps.push(dep('npm', name, typeof range === 'string' ? range : '', kind, dir))
    const engines = pkg.engines
    if (isObject(engines) && typeof engines.node === 'string') out.runtimes.node ??= clean(engines.node)
    if (typeof pkg.packageManager === 'string') out.runtimes.packageManager ??= clean(pkg.packageManager)
  },
  'requirements.txt'(text, dir, out) { for (const line of lines(text)) pip(line, dir, out) },
  'pyproject.toml'(text, dir, out) {
    // Only [project]: other tables (tool.*, optional-dependencies) reuse the same key names.
    const header = text.match(/^\[project\][ \t]*(?:#.*)?$/m)
    if (!header) return
    const body = text.slice((header.index ?? 0) + header[0].length)
    const next = body.search(/^\[/m)
    const project = next < 0 ? body : body.slice(0, next)
    const python = project.match(/^requires-python\s*=\s*["']([^"']+)["']/m)
    if (python) out.runtimes.python ??= clean(python[1])
    for (const item of tomlList(project, 'dependencies')) pip(item, dir, out)
  },
  'Cargo.toml'(text, dir, out) {
    let section = ''
    for (const raw of lines(text)) {
      const line = raw.split('#')[0].trim()
      const header = line.match(/^\[+([^\]]+)\]+$/)
      if (header) { section = header[1].replace(/^target\..+\.(?=(?:dev-|build-)?dependencies$)/, ''); continue }
      const version = section === 'package' && line.match(/^rust-version\s*=\s*"([^"]+)"/)
      if (version) out.runtimes.rust ??= clean(version[1])
      const kind = cargoKinds[section]
      if (!kind) continue
      const shared = line.match(/^([A-Za-z0-9_-]+)\.workspace\s*=\s*true/)
      if (shared) { out.deps.push(dep('cargo', shared[1], 'workspace', kind, dir)); continue }
      const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]+)"|\{(.*)\})/)
      if (match) out.deps.push(dep('cargo', match[3]?.match(/\bpackage\s*=\s*"([^"]+)"/)?.[1] ?? match[1], match[2] ?? cargoRange(match[3]), kind, dir))
    }
  },
  'go.mod'(text, dir, out) {
    let block = false
    for (const raw of lines(text)) {
      const line = raw.trim()
      if (line.startsWith('//')) continue
      const version = line.match(/^go\s+(\S+)/)
      if (version) out.runtimes.go ??= clean(version[1])
      if (/^require\s*\($/.test(line)) { block = true; continue }
      if (block && line === ')') { block = false; continue }
      const match = (block ? line : line.match(/^require\s+(.*)$/)?.[1] ?? '').match(/^(\S+)\s+(v\S+)(.*)$/)
      if (match) out.deps.push(dep('go', match[1], match[2], /\/\/\s*indirect/.test(match[3]) ? 'indirect' : 'prod', dir))
    }
  },
  Dockerfile(text, dir, out) {
    const stages = new Set()
    for (const match of text.matchAll(/^FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/gim)) {
      if (match[1].toLowerCase() !== 'scratch' && !stages.has(match[1].toLowerCase())) out.docker.add(clean(match[1]))
      if (match[2]) stages.add(match[2].toLowerCase())
    }
  },
}
const reusable = /uses:\s*['"]?([\w.-]+\/[\w.-]+)\/\.github\/workflows\/([\w.-]+\.ya?ml)@([^\s'"#]+)/g
const depth = (path: string): number => path.split('/').length
export function extractStack({ files = {}, lockfiles = [], workflows = {} }: { files?: Record<string, string>; lockfiles?: string[]; workflows?: Record<string, string> } = {}): Stack {
  const out: Out = { deps: [], runtimes: {}, docker: new Set(), errors: [] }
  // Shallowest manifest first so root runtime declarations win over nested packages.
  for (const path of Object.keys(files).sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))) {
    const base = posix.basename(path), dir = clean(posix.dirname(path) === '.' ? '' : posix.dirname(path), 200)
    if (base === '.node-version' || base === '.nvmrc') {
      const first = lines(files[path]!.trim())[0] ?? ''
      if (/^v?[\w.*/-]{1,20}$/.test(first)) out.runtimes.nodeFile ??= clean(first)
    } else if (Object.hasOwn(handlers, base)) handlers[base]!(files[path]!, dir, out)
  }
  const refs = new Map<string, WorkflowRef>()
  for (const text of Object.values(workflows)) for (const m of text.replace(/^[ \t]*#.*$/gm, '').matchAll(reusable)) {
    const ref = { repo: clean(m[1]), file: clean(m[2]), ref: clean(m[3]) }
    refs.set(`${ref.repo}/${ref.file}@${ref.ref}`, ref)
  }
  return { deps: out.deps, runtimes: { ...out.runtimes, ...(out.docker.size && { docker: [...out.docker] }) },
    lockfiles: [...new Set(lockfiles)].sort(), ci: { workflows: Object.keys(workflows).length, reusable: [...refs.values()] }, parseErrors: out.errors }
}
