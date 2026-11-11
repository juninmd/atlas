import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { enrich } from '../src/core/catalog.js'
import { analyze } from '../src/core/analyze.js'

const dir = await mkdtemp(join(tmpdir(), 'mcp-'))
process.env.STACK_FILE = join(dir, 'stack.json')
const mk = (name, description, language, extra = {}) => { const r = { name, owner: 'o', description, url: 'u', private: false, fork: false, archived: false, language, stars: 0, topics: [], pushed_at: new Date().toISOString(), license: null, open_issues: 0, ...extra }; return { ...enrich(r), scan: analyze(r, null) } }
const { handle, setLoader } = await import('./mcp.mjs')
setLoader(async () => [mk('alpha', 'Bot de automação', 'Python'), mk('beta', 'Site', 'JavaScript', { license: 'MIT', topics: ['web'] })])
const call = async (name, args) => JSON.parse((await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).result.content[0].text)

test('lista ferramentas', async () => {
  const r = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  assert.deepEqual(r.result.tools.map(t => t.name).sort(), ['get_repo', 'list_categories', 'list_repos', 'list_risks', 'search_repos', 'who_uses'])
})
test('busca, filtros e riscos', async () => {
  assert.deepEqual((await call('search_repos', { query: 'automação' })).map(r => r.name), ['alpha'])
  assert.deepEqual((await call('list_repos', { language: 'javascript' })).map(r => r.name), ['beta'])
  assert.equal((await call('get_repo', { name: 'ALPHA' })).scan.status !== undefined, true)
  const risks = await call('list_risks', { limit: 1 })
  assert.equal(risks[0].name, 'alpha')
  assert.ok(risks[0].risks.length >= 1)
})
test('erro para repo inexistente e índice ausente', async () => {
  const r = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_repo', arguments: { name: 'nope' } } })
  assert.equal(r.result.isError, true)
  const w = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'who_uses', arguments: { dep: 'vue' } } })
  assert.equal(w.result.isError, true)
})
test('who_uses lê o índice local', async () => {
  await writeFile(process.env.STACK_FILE, JSON.stringify({ schema: 2, repos: [{ name: 'beta', private: false, status: 'ok', stack: { deps: [{ ecosystem: 'npm', name: 'vue', range: '^3', kind: 'prod', path: '' }], runtimes: {}, lockfiles: [], ci: { workflows: 0, reusable: [] }, parseErrors: [] } }] }))
  const rows = await call('who_uses', { dep: 'vue' })
  assert.equal(rows[0].repo, 'beta')
})
