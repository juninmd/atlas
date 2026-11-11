import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { enrich } from '../src/core/catalog.ts'
import { analyze } from '../src/core/analyze.ts'
import { repo } from '../src/core/stack-fixtures.ts'
import type { RepoMeta } from '../src/core/types.ts'

const dir = await mkdtemp(join(tmpdir(), 'mcp-'))
const STACK = join(dir, 'stack.json')
process.env.STACK_FILE = STACK
const mk = (name: string, description: string, language: string, extra: Partial<RepoMeta> = {}) => { const r = repo(name, { description, language, pushed_at: new Date().toISOString(), ...extra }); return { ...enrich(r), scan: analyze(r, null) } }
const { handle, setLoader } = await import('./mcp.ts')
setLoader(async () => [mk('alpha', 'Bot de automação', 'Python'), mk('beta', 'Site', 'JavaScript', { license: 'MIT', topics: ['web'] })])
const rpc = async (name: string, args: Record<string, unknown>) => (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })) as { result: { isError?: boolean; content: { text: string }[] } }
const call = async (name: string, args: Record<string, unknown>) => JSON.parse((await rpc(name, args)).result.content[0]!.text)

test('lista ferramentas', async () => {
  const r = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })) as unknown as { result: { tools: { name: string }[] } }
  assert.deepEqual(r.result.tools.map(t => t.name).sort(), ['get_repo', 'list_categories', 'list_repos', 'list_risks', 'search_repos', 'who_uses'])
})
test('busca, filtros e riscos', async () => {
  assert.deepEqual((await call('search_repos', { query: 'automação' })).map((r: { name: string }) => r.name), ['alpha'])
  assert.deepEqual((await call('list_repos', { language: 'javascript' })).map((r: { name: string }) => r.name), ['beta'])
  assert.equal((await call('get_repo', { name: 'ALPHA' })).scan.status !== undefined, true)
  const risks = await call('list_risks', { limit: 1 })
  assert.equal(risks[0].name, 'alpha')
  assert.ok(risks[0].risks.length >= 1)
})
test('erro para repo inexistente e índice ausente', async () => {
  const r = await rpc('get_repo', { name: 'nope' })
  assert.equal(r.result.isError, true)
  const w = await rpc('who_uses', { dep: 'vue' })
  assert.equal(w.result.isError, true)
})
test('who_uses lê o índice local', async () => {
  await writeFile(STACK, JSON.stringify({ schema: 2, repos: [{ name: 'beta', private: false, status: 'ok', stack: { deps: [{ ecosystem: 'npm', name: 'vue', range: '^3', kind: 'prod', path: '' }], runtimes: {}, lockfiles: [], ci: { workflows: 0, reusable: [] }, parseErrors: [] } }] }))
  const rows = await call('who_uses', { dep: 'vue' })
  assert.equal(rows[0].repo, 'beta')
})
