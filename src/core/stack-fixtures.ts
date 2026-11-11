import type { Dep, RepoMeta, Stack } from './types.ts'

export const b64 = (text: string) => ({ encoding: 'base64', content: Buffer.from(text).toString('base64') })
export const dep = (stack: Stack, name: string): Dep => {
  const found = stack.deps.find(d => d.name === name)
  if (!found) throw new Error(`dependência não encontrada: ${name}`)
  return found
}
export const repo = (name: string, extra: Partial<RepoMeta> = {}): RepoMeta => ({ name, owner: 'me', description: '', url: `https://github.com/me/${name}`, private: false, archived: false, fork: false, language: null, stars: 0, topics: [], updated_at: null, created_at: null, license: null, open_issues: 0, size: 0, branch: 'main', pushed_at: '2026-01-01', ...extra })
/** Getter falso: responde arvore e conteudo a partir de um mapa caminho -> texto. */
export function fakeGithub(files: Record<string, string>, calls: string[] = []) {
  return async <T = unknown>(path: string): Promise<T> => {
    calls.push(path)
    if (path.includes('/git/trees/')) return { truncated: false, tree: Object.entries(files).map(([p, c]) => ({ path: p, type: 'blob', size: c.length })) } as T
    const file = decodeURIComponent(path.split('/contents/')[1]!)
    if (!(file in files)) throw Object.assign(new Error('x'), { status: 404 })
    return b64(files[file]!) as T
  }
}
