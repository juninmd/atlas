import { posix } from './path.js'
import { api, fromBase64 } from './github.js'
import { extractStack } from './stack.js'
export const SCHEMA = 2
const MANIFEST = /(?:^|\/)(?:package\.json|requirements\.txt|pyproject\.toml|Cargo\.toml|go\.mod|Dockerfile)$/
const IGNORED = /(?:^|\/)(?:node_modules|vendor|target|dist|build|\.venv|venv|testdata)\//
const ROOT_RUNTIME = new Set(['.node-version', '.nvmrc'])
const LOCKFILES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb', 'Cargo.lock', 'go.sum', 'uv.lock', 'poetry.lock'])
const WORKFLOW = /^\.github\/workflows\/[\w.-]+\.ya?ml$/
const MAX_MANIFESTS = 15, MAX_WORKFLOWS = 30
const depth = path => path.split('/').length
const encode = path => path.split('/').map(encodeURIComponent).join('/')
const decode = data => data?.encoding === 'base64' && typeof data.content === 'string' ? fromBase64(data.content) : null
export function select(paths) {
  const kept = paths.filter(p => !IGNORED.test(p) && !p.split('/').some(s => s === '.' || s === '..'))
  return {
    manifests: kept.filter(p => MANIFEST.test(p) || ROOT_RUNTIME.has(p)).sort((a, b) => depth(a) - depth(b) || a.localeCompare(b)).slice(0, MAX_MANIFESTS),
    workflows: kept.filter(p => WORKFLOW.test(p)).slice(0, MAX_WORKFLOWS),
    lockfiles: kept.map(p => posix.basename(p)).filter(name => LOCKFILES.has(name)),
  }
}
export async function collectRepo(repo, get = api) {
  const base = `repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`
  const empty = { status: 'empty', stack: extractStack() }
  if (!repo.branch) return empty
  let tree
  try { tree = await get(`${base}/git/trees/${encodeURIComponent(repo.branch)}?recursive=1`) } catch (e) { if (e.status === 409) return empty; throw e }
  const picked = select((tree.tree || []).filter(t => t.type === 'blob').map(t => t.path))
  const unread = []
  const read = async paths => {
    const result = {}
    for (const path of paths) {
      const text = decode(await get(`${base}/contents/${encode(path)}`))
      if (text === null) unread.push(path); else result[path] = text
    }
    return result
  }
  const stack = extractStack({ files: await read(picked.manifests), workflows: await read(picked.workflows), lockfiles: picked.lockfiles })
  return { status: 'ok', ...(tree.truncated && { truncated: true }), ...(unread.length && { unread }), stack }
}
export async function collectStack(repos, previous = {}, { get = api, concurrency = 4, onProgress, shouldStop } = {}) {
  const cached = new Map((previous?.schema === SCHEMA ? previous.repos : []).map(e => [`${e.owner}/${e.name}`, e]))
  const entries = new Array(repos.length)
  let next = 0, fetched = 0, failed = 0, halted = null, done = 0
  // Keep the previous snapshot (labelled stale, old pushed_at) so a rerun retries only what changed.
  const unavailable = (old, meta, error) => old?.stack && old.status !== 'error'
    ? { ...old, ...meta, pushed_at: old.pushed_at, status: 'stale', error } : { ...meta, status: 'error', error, stack: extractStack() }
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < repos.length) {
      const index = next++, repo = repos[index], old = cached.get(`${repo.owner}/${repo.name}`)
      if (!halted) halted = shouldStop?.() || null
      const meta = { name: repo.name, owner: repo.owner, private: repo.private, archived: repo.archived, fork: repo.fork, branch: repo.branch, pushed_at: repo.pushed_at }
      if (['ok', 'empty'].includes(old?.status) && old.pushed_at === repo.pushed_at && old.branch === repo.branch) { entries[index] = { ...old, ...meta }; onProgress?.(++done, repos.length); continue }
      if (halted) { failed++; entries[index] = unavailable(old, meta, halted); onProgress?.(++done, repos.length); continue }
      try { entries[index] = { ...meta, ...await collectRepo(repo, get) }; fetched++ } catch (e) {
        failed++
        if (e.rateLimited) halted = `limite de requisições do GitHub esgotado${e.resetAt ? `; tente de novo após ${e.resetAt}` : ''}`
        entries[index] = unavailable(old, meta, halted ?? e.message)
      }
      onProgress?.(++done, repos.length)
    }
  }))
  return { index: { schema: SCHEMA, generated_at: new Date().toISOString(), repos: entries }, fetched, failed, halted }
}
