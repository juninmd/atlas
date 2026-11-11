const pypi = name => name.toLowerCase().replace(/[-_.]+/g, '-')
// PyPI names are case/separator-insensitive; npm, cargo and go names are not.
const same = (d, name) => d.ecosystem === 'pypi' ? pypi(d.name) === pypi(name) : d.name.toLowerCase() === name.toLowerCase()
// A lockfile only counts for its own ecosystem; pip has no lockfile convention here, so it is never flagged.
const LOCKFILES = { npm: ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb'], cargo: ['Cargo.lock'], go: ['go.sum'] }
const active = e => !e.archived && !e.fork && ['ok', 'stale'].includes(e.status)
export function parseWhoArgs(args) {
  const at = args.findIndex(a => a === '--range' || a.startsWith('--range='))
  let range, skip = -1
  if (at >= 0) {
    range = args[at].startsWith('--range=') ? args[at].slice(8) : args[at + 1]
    if (!range || range.startsWith('--')) return null
    if (args[at] === '--range') skip = at + 1
  }
  const name = args.find((a, i) => !a.startsWith('--') && i !== skip)
  return name ? { name, range, json: args.includes('--json') } : null
}
export function who(index, name, range) {
  const rows = new Map()
  for (const e of index.repos) for (const d of e.stack.deps) {
    if (!same(d, name) || (range && !d.range.includes(range))) continue
    const id = `${e.name}|${d.ecosystem}|${d.range}|${d.kind}`
    const row = rows.get(id) ?? { repo: e.name, private: e.private, archived: e.archived, fork: e.fork, stale: e.status === 'stale', ecosystem: d.ecosystem, name: d.name, range: d.range, kind: d.kind, paths: [] }
    if (!row.paths.includes(d.path)) row.paths.push(d.path)
    rows.set(id, row)
  }
  return [...rows.values()].sort((a, b) => a.repo.localeCompare(b.repo) || a.range.localeCompare(b.range))
}
function group(entries, keys) {
  const map = new Map()
  for (const e of entries) for (const key of new Set(keys(e).filter(Boolean))) map.set(key, [...(map.get(key) ?? []), e.name])
  return new Map([...map].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])))
}
export function report(index) {
  const all = index.repos, live = all.filter(active)
  const missingLock = e => Object.entries(LOCKFILES).some(([eco, names]) => e.stack.deps.some(d => d.ecosystem === eco) && !names.some(n => e.stack.lockfiles.includes(n)))
  return {
    total: all.length, active: live.length, skipped: all.filter(e => e.archived || e.fork).length,
    empty: all.filter(e => e.status === 'empty').map(e => e.name), failed: all.filter(e => ['error', 'stale'].includes(e.status)).map(e => e.name),
    truncated: all.filter(e => e.truncated).map(e => e.name), parseErrors: live.filter(e => e.stack.parseErrors.length).map(e => e.name),
    unread: all.filter(e => e.unread).map(e => e.name), generated_at: index.generated_at,
    noCi: live.filter(e => !e.stack.ci.workflows).map(e => e.name),
    noLockfile: live.filter(missingLock).map(e => e.name),
    reusable: new Map([...new Set(live.flatMap(e => e.stack.ci.reusable.map(r => `${r.repo}/${r.file}`)))].sort()
      .map(file => [file, group(live, e => e.stack.ci.reusable.filter(r => `${r.repo}/${r.file}` === file).map(r => r.ref))])),
    node: group(live, e => [e.stack.runtimes.node ?? e.stack.runtimes.nodeFile]),
    packageManager: group(live, e => [e.stack.runtimes.packageManager?.split('+')[0]]),
    docker: group(live, e => e.stack.runtimes.docker ?? []),
  }
}
// Every group but the largest lists its repos: that is where the drift lives.
function section(title, groups) {
  if (!groups.size) return []
  return [`${title}:`, ...[...groups].map(([key, names], i) => `  ${key}: ${names.length}${i ? ` → ${names.join(', ')}` : ''}`)]
}
const list = (title, names) => names.length ? [`${title} (${names.length}): ${names.join(', ')}`] : []
export function formatReport(r) {
  return [`Índice de ${r.generated_at}: ${r.total} repositórios (${r.active} ativos, ${r.skipped} arquivados/forks)`,
    ...list('Vazios', r.empty), ...list('Coleta incompleta (rode stack:collect de novo)', r.failed), ...list('Árvore truncada (índice parcial)', r.truncated), ...list('Arquivo grande demais (não lido)', r.unread), ...list('Manifest ilegível', r.parseErrors),
    ...list('Sem CI', r.noCi), ...list('Sem lockfile', r.noLockfile),
    ...[...r.reusable].flatMap(([file, refs]) => section(file, refs)), ...section('Node (engines / .nvmrc)', r.node),
    ...section('Gerenciador de pacotes', r.packageManager), ...section('Imagens base Docker', r.docker)].join('\n')
}
export function formatWho(rows) {
  if (!rows.length) return 'Nenhum repositório declara essa dependência.'
  return rows.map(r => [r.repo + (r.private ? ' (privado)' : '') + (r.archived ? ' (arquivado)' : '') + (r.stale ? ' (desatualizado)' : ''),
    r.ecosystem, `${r.name}@${r.range}`, r.kind, r.paths.filter(Boolean).join(',')].join('\t')).join('\n')
}
