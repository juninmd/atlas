// Cliente da API do GitHub que roda no navegador e no Node. O token nunca vai para URL, log ou mensagem de erro.
import { redact, registerSecret } from './redact.ts'
import type { ReadmeDoc, RepoMeta } from './types.ts'

export const API = 'https://api.github.com'
export function fromBase64(b64: string): string {
  const bin = atob(String(b64).replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}
/** Campos da resposta da API que o Atlas le. */
interface ApiRepo {
  name: string; owner: { login: string }; description: string | null; html_url: string; private: boolean; fork: boolean; archived: boolean
  language: string | null; stargazers_count: number; topics?: string[]; pushed_at: string | null; updated_at: string | null; created_at: string | null
  default_branch: string | null; license?: { spdx_id: string | null } | null; open_issues_count?: number; size?: number
}
export interface RateInfo { limit: number | null; remaining: number | null; reset: number | null; authenticated?: boolean }
export interface ApiOptions { token?: string | null; method?: string; body?: unknown; attempt?: number }
export interface ApiError extends Error { status?: number; rateLimited?: boolean; resetAt?: string; network?: boolean }
export interface ClientOptions { getToken?: () => string | null | undefined; onRate?: (rate: RateInfo) => void; base?: string }
const slim = (r: ApiRepo): RepoMeta => ({
  name: r.name, owner: r.owner.login, description: redact(r.description || ''), url: r.html_url,
  private: r.private, fork: r.fork, archived: r.archived, language: r.language, stars: r.stargazers_count,
  topics: r.topics || [], pushed_at: r.pushed_at, updated_at: r.updated_at, created_at: r.created_at, branch: r.default_branch,
  license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null, open_issues: r.open_issues_count || 0, size: r.size || 0,
})

export function createClient({ getToken = () => null, onRate, base = API }: ClientOptions = {}) {
  const rate: RateInfo = { limit: null, remaining: null, reset: null, authenticated: false }
  async function api<T = unknown>(path: string, { token = getToken(), method = 'GET', body, attempt = 0 }: ApiOptions = {}): Promise<T> {
    if (token) registerSecret(token)
    let response
    try {
      response = await globalThis.fetch(`${base}/${path}`, {
        method, signal: AbortSignal.timeout(30000), headers: {
          Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        }, ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch (e) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 1000 * 2 ** attempt)); return api(path, { token, method, body, attempt: attempt + 1 }) }
      const error: ApiError = new Error('Não foi possível falar com o GitHub. Verifique a conexão.'); error.network = true; throw error
    }
    const h = response.headers
    if (h.get('x-ratelimit-remaining') != null) {
      Object.assign(rate, { limit: Number(h.get('x-ratelimit-limit')), remaining: Number(h.get('x-ratelimit-remaining')), reset: Number(h.get('x-ratelimit-reset')) * 1000, authenticated: Boolean(token) })
      onRate?.({ ...rate })
    }
    if (!response.ok) {
      if (attempt < 4 && (response.status >= 500 || response.status === 429 || (response.status === 403 && h.has('retry-after')))) {
        const delay = Number(h.get('retry-after')) * 1000 || Math.min(30000, 2000 * 2 ** attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
        return api(path, { token, method, body, attempt: attempt + 1 })
      }
      const error: ApiError = new Error(`GitHub retornou HTTP ${response.status}`); error.status = response.status
      // Cota primaria esgotada: quem chama pode parar cedo e informar quando volta.
      if (response.status === 403 && h.get('x-ratelimit-remaining') === '0') {
        error.rateLimited = true
        const reset = Number(h.get('x-ratelimit-reset'))
        if (reset) error.resetAt = new Date(reset * 1000).toISOString()
      }
      throw error
    }
    return response.json() as Promise<T>
  }
  async function me() { return api<{ login: string }>('user') }
  async function inventory({ user, includePrivate = false }: { user?: string; includePrivate?: boolean } = {}): Promise<RepoMeta[]> {
    if (!user) throw new Error('Informe o usuário do GitHub.')
    const repos: RepoMeta[] = []
    for (let page = 1; ; page++) {
      const path = includePrivate ? `user/repos?affiliation=owner&sort=updated&per_page=100&page=${page}` : `users/${encodeURIComponent(user)}/repos?type=owner&sort=updated&per_page=100&page=${page}`
      const batch = await api<ApiRepo[]>(path)
      for (const r of batch) {
        if (r.owner.login.toLowerCase() !== user.toLowerCase() || (!includePrivate && r.private)) continue
        repos.push(slim(r))
      }
      if (batch.length < 100) break
    }
    return repos
  }
  async function readme(repo: Pick<RepoMeta, 'owner' | 'name'>): Promise<ReadmeDoc> {
    try {
      const data = await api<{ path: string; content: string }>(`repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/readme`)
      return { status: 'ok', path: data.path, text: redact(fromBase64(data.content)) }
    } catch (e) {
      const error = e as ApiError
      if (error.status === 404) return { status: 'missing', text: '' }
      return { status: 'error', text: '', message: error.message, rateLimited: error.rateLimited }
    }
  }
  return { api, me, inventory, readme, rate: () => ({ ...rate }) }
}
const fallback = createClient()
export const api = <T = unknown>(path: string, options?: ApiOptions): Promise<T> => fallback.api<T>(path, options)
export type GithubClient = ReturnType<typeof createClient>
