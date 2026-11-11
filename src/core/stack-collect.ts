import { posix } from './path.ts'
import { api, fromBase64 } from './github.ts'
import type { ApiError, ApiOptions } from './github.ts'
import { extractStack } from './stack.ts'
import type { RepoMeta, Stack, StackEntry, StackIndex } from './types.ts'

export const SCHEMA = 2
const MANIFEST = /(?:^|\/)(?:package\.json|requirements\.txt|pyproject\.toml|Cargo\.toml|go\.mod|Dockerfile)$/
const IGNORED = /(?:^|\/)(?:node_modules|vendor|target|dist|build|\.venv|venv|testdata)\//
const ROOT_RUNTIME = new Set(['.node-version', '.nvmrc'])
const LOCKFILES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb', 'Cargo.lock', 'go.sum', 'uv.lock', 'poetry.lock'])
const WORKFLOW = /^\.github\/workflows\/[\w.-]+\.ya?ml$/
const MAX_MANIFESTS = 15, MAX_WORKFLOWS = 30

export type Getter = <T = unknown>(path: string, options?: ApiOptions) => Promise<T>
type Target = Pick<RepoMeta, 'owner' | 'name' | 'branch'>
type Tracked = Pick<RepoMeta, 'owner' | 'name' | 'private' | 'archived' | 'fork' | 'branch' | 'pushed_at'>
interface Tree { truncated?: boolean; tree?: { type: string; path: string }[] }
interface CollectResult { status: 'ok' | 'empty'; stack: Stack; truncated?: boolean; unread?: string[] }

const depth = (path: string): number => path.split('/').length
const encode = (path: string): string => path.split('/').map(encodeURIComponent).join('/')
const decode = (data: { encoding?: string; content?: unknown } | null | undefined): string | null =>
  data?.encoding === 'base64' && typeof data.content === 'string' ? fromBase64(data.content) : null

export function select(paths: string[]) {
  const kept = paths.filter(p => !IGNORED.test(p) && !p.split('/').some(s => s === '.' || s === '..'))
  return {
    manifests: kept.filter(p => MANIFEST.test(p) || ROOT_RUNTIME.has(p)).sort((a, b) => depth(a) - depth(b) || a.localeCompare(b)).slice(0, MAX_MANIFESTS),
    workflows: kept.filter(p => WORKFLOW.test(p)).slice(0, MAX_WORKFLOWS),
    lockfiles: kept.map(p => posix.basename(p)).filter(name => LOCKFILES.has(name)),
  }
}

export async function collectRepo(repo: Target, get: Getter = api): Promise<CollectResult> {
  const base = `repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`
  const empty: CollectResult = { status: 'empty', stack: extractStack() }
  if (!repo.branch) return empty
  let tree: Tree
  try { tree = await get<Tree>(`${base}/git/trees/${encodeURIComponent(repo.branch)}?recursive=1`) } catch (e) { if ((e as ApiError).status === 409) return empty; throw e }
  const picked = select((tree.tree || []).filter(t => t.type === 'blob').map(t => t.path))
  const unread: string[] = []
  const read = async (paths: string[]): Promise<Record<string, string>> => {
    const result: Record<string, string> = {}
    for (const path of paths) {
      const text = decode(await get(`${base}/contents/${encode(path)}`))
      if (text === null) unread.push(path); else result[path] = text
    }
    return result
  }
  const stack = extractStack({ files: await read(picked.manifests), workflows: await read(picked.workflows), lockfiles: picked.lockfiles })
  return { status: 'ok', ...(tree.truncated && { truncated: true }), ...(unread.length && { unread }), stack }
}

export interface CollectOptions { get?: Getter; concurrency?: number; onProgress?: (done: number, total: number) => void; shouldStop?: () => string | null | undefined }

export async function collectStack(repos: Tracked[], previous?: Partial<StackIndex> | null, { get = api, concurrency = 4, onProgress, shouldStop }: CollectOptions = {}) {
  const cached = new Map((previous?.schema === SCHEMA ? previous.repos ?? [] : []).map(e => [`${e.owner}/${e.name}`, e]))
  const entries = new Array<StackEntry>(repos.length)
  let next = 0, fetched = 0, failed = 0, halted: string | null = null, done = 0
  // Keep the previous snapshot (labelled stale, old pushed_at) so a rerun retries only what changed.
  const unavailable = (old: StackEntry | undefined, meta: Omit<StackEntry, 'status' | 'stack'>, error: string): StackEntry => old?.stack && old.status !== 'error'
    ? { ...old, ...meta, pushed_at: old.pushed_at, status: 'stale', error } : { ...meta, status: 'error', error, stack: extractStack() }
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < repos.length) {
      const index = next++, repo = repos[index]!, old = cached.get(`${repo.owner}/${repo.name}`)
      if (!halted) halted = shouldStop?.() || null
      const meta = { name: repo.name, owner: repo.owner, private: repo.private, archived: repo.archived, fork: repo.fork, branch: repo.branch, pushed_at: repo.pushed_at }
      if (old && ['ok', 'empty'].includes(old.status) && old.pushed_at === repo.pushed_at && old.branch === repo.branch) { entries[index] = { ...old, ...meta }; onProgress?.(++done, repos.length); continue }
      if (halted) { failed++; entries[index] = unavailable(old, meta, halted); onProgress?.(++done, repos.length); continue }
      try { entries[index] = { ...meta, ...await collectRepo(repo, get) }; fetched++ } catch (err) {
        const e = err as ApiError
        failed++
        if (e.rateLimited) halted = `limite de requisições do GitHub esgotado${e.resetAt ? `; tente de novo após ${e.resetAt}` : ''}`
        entries[index] = unavailable(old, meta, halted ?? e.message)
      }
      onProgress?.(++done, repos.length)
    }
  }))
  return { index: { schema: SCHEMA, generated_at: new Date().toISOString(), repos: entries } satisfies StackIndex, fetched, failed, halted }
}
