import test from 'node:test'
import assert from 'node:assert/strict'
import { api } from './github.js'
import { collectRepo, collectStack, select, SCHEMA } from './stack-collect.js'
import { report } from './stack-query.js'
import { b64, dep, fakeGithub, repo } from './stack-fixtures.js'

test('select keeps only known manifests, skips vendored dirs, caps fan-out', () => {
  const noise = Array.from({ length: 40 }, (_, i) => `pkg${i}/package.json`)
  const picked = select(['README.md', 'package.json', 'node_modules/x/package.json', 'target/debug/Cargo.toml', '.github/workflows/ci.yml',
    '.github/workflows/nested/ci.yml', '.nvmrc', 'pnpm-lock.yaml', 'a/b/go.sum', 'src/secrets.env', ...noise])
  assert.equal(picked.manifests[0], '.nvmrc')
  assert.ok(picked.manifests.includes('package.json'))
  assert.equal(picked.manifests.length, 15)
  assert.equal(picked.manifests.some(p => /node_modules|target|README|secrets/.test(p)), false)
  assert.deepEqual(picked.workflows, ['.github/workflows/ci.yml'])
  assert.deepEqual(picked.lockfiles.sort(), ['go.sum', 'pnpm-lock.yaml'])
})

test('collectRepo fetches only selected files from the repo tree', async () => {
  const calls = []
  const result = await collectRepo(repo('app'), fakeGithub({ 'package.json': '{"dependencies":{"hono":"^4"}}', 'README.md': 'hi', '.env': 'SECRET=1', 'pnpm-lock.yaml': 'lock' }, calls))
  assert.equal(result.status, 'ok')
  assert.equal(dep(result.stack, 'hono').range, '^4')
  assert.deepEqual(result.stack.lockfiles, ['pnpm-lock.yaml'])
  assert.deepEqual(calls.filter(c => c.includes('/contents/')), ['repos/me/app/contents/package.json'])
})

test('empty repository (409) is empty; other failures surface', async () => {
  const fail = status => async () => { throw Object.assign(new Error('boom'), { status }) }
  assert.equal((await collectRepo(repo('e'), fail(409))).status, 'empty')
  assert.equal((await collectRepo(repo('e', { branch: null }), fail(500))).status, 'empty')
  await assert.rejects(collectRepo(repo('x'), fail(404)))
  await assert.rejects(collectRepo(repo('x'), fail(500)))
})

test('truncated trees are flagged instead of silently incomplete', async () => {
  const get = async () => ({ truncated: true, tree: [] })
  assert.equal((await collectRepo(repo('big'), get)).truncated, true)
})

test('collectStack reuses unchanged repos, refetches pushed ones, keeps stale data on failure', async () => {
  const calls = []
  const get = fakeGithub({ 'package.json': '{"dependencies":{"a":"1"}}' }, calls)
  const first = await collectStack([repo('one'), repo('two')], {}, { get })
  assert.equal(first.fetched, 2)
  calls.length = 0
  const second = await collectStack([repo('one'), repo('two')], first.index, { get })
  assert.deepEqual([second.fetched, calls.length], [0, 0])
  const broken = async () => { throw Object.assign(new Error('GitHub retornou HTTP 500'), { status: 500 }) }
  const third = await collectStack([repo('one', { pushed_at: '2026-02-01' }), repo('three')], second.index, { get: broken })
  assert.equal(third.failed, 2)
  const [one, three] = third.index.repos
  assert.equal(one.status, 'stale')
  assert.equal(dep(one.stack, 'a').range, '1')
  assert.equal(one.pushed_at, '2026-01-01')
  assert.equal(three.status, 'error')
  const retried = await collectStack([repo('one', { pushed_at: '2026-02-01' })], third.index, { get })
  assert.equal(retried.fetched, 1)
  assert.equal(retried.index.repos[0].status, 'ok')
  assert.equal(retried.index.schema, SCHEMA)
})

test('schema change invalidates the cache', async () => {
  const calls = []
  const get = fakeGithub({ 'package.json': '{}' }, calls)
  const { index } = await collectStack([repo('one')], {}, { get })
  calls.length = 0
  await collectStack([repo('one')], { ...index, schema: SCHEMA - 1 }, { get })
  assert.ok(calls.length > 0)
})

test('select refuses dot segments in tree paths', () => {
  assert.deepEqual(select(['a/../../../user/emails/package.json', './package.json', 'ok/package.json']).manifests, ['ok/package.json'])
})

test('a repeated failure never turns an error into a stale snapshot with no data', async () => {
  const broken = async () => { throw Object.assign(new Error('GitHub retornou HTTP 500'), { status: 500 }) }
  const first = await collectStack([repo('x')], {}, { get: broken })
  const second = await collectStack([repo('x')], first.index, { get: broken })
  assert.equal(second.index.repos[0].status, 'error')
  assert.equal((await collectStack([repo('x')], null, { get: broken })).failed, 1)
})

test('a changed default branch invalidates the cache even when pushed_at is equal', async () => {
  const calls = []
  const get = fakeGithub({ 'package.json': '{}' }, calls)
  const { index } = await collectStack([repo('x')], {}, { get })
  calls.length = 0
  await collectStack([repo('x', { branch: 'trunk' })], index, { get })
  assert.ok(calls.length > 0)
})

test('files too large to read are reported instead of silently indexed as empty', async () => {
  const get = async path => path.includes('/git/trees/') ? { tree: [{ path: 'package.json', type: 'blob' }] } : { encoding: 'none', content: '' }
  const result = await collectRepo(repo('big'), get)
  assert.deepEqual(result.unread, ['package.json'])
  assert.deepEqual(report({ repos: [{ ...repo('big'), ...result }] }).unread, ['big'])
})

test('api flags a primary rate limit (403 with no quota left) but not other 403s', async () => {
  const original = globalThis.fetch
  const respond = headers => { globalThis.fetch = async () => new Response('{}', { status: 403, headers }) }
  try {
    respond({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1790000000' })
    await assert.rejects(api('x', { token: 't' }), e => e.rateLimited === true && e.resetAt === new Date(1790000000000).toISOString())
    respond({ 'x-ratelimit-remaining': '0' })
    await assert.rejects(api('x', { token: 't' }), e => e.rateLimited === true && e.resetAt === undefined)
    respond({ 'x-ratelimit-remaining': '4000' })
    await assert.rejects(api('x', { token: 't' }), e => e.rateLimited !== true)
  } finally { globalThis.fetch = original }
})

test('a GitHub rate limit stops further requests, keeps cached repos and says when to retry', async () => {
  let calls = 0
  const limited = async () => { calls++; throw Object.assign(new Error('GitHub retornou HTTP 403'), { status: 403, rateLimited: true, resetAt: '2026-01-01T00:00:00.000Z' }) }
  const { index } = await collectStack([repo('cached')], {}, { get: fakeGithub({ 'package.json': '{}' }) })
  calls = 0
  const result = await collectStack([repo('cached'), repo('a', { pushed_at: 'x' }), repo('b'), repo('c')], index, { get: limited, concurrency: 1 })
  assert.equal(calls, 1)
  assert.equal(result.failed, 3)
  assert.match(result.halted, /limite de requisições.*2026-01-01T00:00:00\.000Z/)
  assert.equal(result.index.repos[0].status, 'ok')
  assert.ok(result.index.repos.slice(1).every(e => e.status === 'error' && e.error === result.halted))
})
