import test from 'node:test'
import assert from 'node:assert/strict'
import { collectStack } from './stack-collect.js'
import { formatReport, parseWhoArgs, report, who } from './stack-query.js'
import { fakeGithub, repo } from './stack-fixtures.js'

async function sample() {
  const manifests = {
    node20: { 'package.json': '{"dependencies":{"hono":"^4.1.0","lodash.merge":"4"},"engines":{"node":">=20"},"packageManager":"pnpm@10"}', 'pnpm-lock.yaml': 'x', '.github/workflows/v.yml': 'uses: acme/base-actions/.github/workflows/reusable-validate.yml@main' },
    node18: { 'package.json': '{"dependencies":{"hono":"^3.0.0"},"engines":{"node":">=18"}}', '.github/workflows/v.yml': 'uses: acme/base-actions/.github/workflows/reusable-validate.yml@v1' },
    node20b: { 'package.json': '{"dependencies":{"hono":"^4.2.0"},"engines":{"node":">=20"}}', 'package-lock.json': 'x', '.github/workflows/v.yml': 'uses: acme/base-actions/.github/workflows/reusable-validate.yml@main' },
    py: { 'requirements.txt': 'Flask_Login==0.6\n' },
    old: { 'package.json': '{"dependencies":{"hono":"^1"}}' },
    forked: { 'package.json': '{"dependencies":{"hono":"^1"}}' },
  }
  const get = path => {
    const name = path.split('/')[2]
    return fakeGithub(manifests[name] ?? {})(path)
  }
  const repos = [repo('node20'), repo('node18'), repo('node20b'), repo('py', { private: true }), repo('old', { archived: true }), repo('forked', { fork: true })]
  return (await collectStack(repos, {}, { get })).index
}

test('who matches by name, filters by range and normalizes only python names', async () => {
  const index = await sample()
  assert.deepEqual(who(index, 'hono').map(r => [r.repo, r.range]), [['forked', '^1'], ['node18', '^3.0.0'], ['node20', '^4.1.0'], ['node20b', '^4.2.0'], ['old', '^1']])
  assert.deepEqual(who(index, 'HONO', '^4').map(r => r.repo), ['node20', 'node20b'])
  assert.deepEqual(who(index, 'flask-login').map(r => r.repo), ['py'])
  assert.deepEqual(who(index, 'lodash-merge'), [])
  assert.deepEqual(who(index, 'lodash.merge').map(r => r.repo), ['node20'])
})

test('report finds drift and gaps among active repos only', async () => {
  const result = report(await sample())
  assert.deepEqual(result.noCi, ['py'])
  assert.deepEqual(result.noLockfile, ['node18'])
  const validate = result.reusable.get('acme/base-actions/reusable-validate.yml')
  assert.deepEqual([...validate], [['main', ['node20', 'node20b']], ['v1', ['node18']]])
  assert.deepEqual(result.node.get('>=20'), ['node20', 'node20b'])
  const text = formatReport(result)
  assert.match(text, /Sem CI \(1\): py/)
  assert.match(text, /v1: 1 → node18/)
  assert.doesNotMatch(text, /main: 2 →/)
})

test('who arguments: name may come before or after --range; incomplete flags are invalid', () => {
  assert.deepEqual(parseWhoArgs(['hono']), { name: 'hono', range: undefined, json: false })
  assert.deepEqual(parseWhoArgs(['hono', '--range', '^4', '--json']), { name: 'hono', range: '^4', json: true })
  assert.deepEqual(parseWhoArgs(['--range', '^4', 'hono']), { name: 'hono', range: '^4', json: false })
  assert.equal(parseWhoArgs(['hono', '--range']), null)
  assert.equal(parseWhoArgs([]), null)
  assert.equal(parseWhoArgs(['--json']), null)
})

test('package manager hashes do not split otherwise identical versions', async () => {
  const get = fakeGithub({ 'package.json': '{"packageManager":"pnpm@10.1.0+sha512.abc"}' })
  const a = (await collectStack([repo('a')], {}, { get })).index
  const b = (await collectStack([repo('b')], {}, { get: fakeGithub({ 'package.json': '{"packageManager":"pnpm@10.1.0"}' }) })).index
  assert.deepEqual([...report({ ...a, repos: [...a.repos, ...b.repos] }).packageManager.keys()], ['pnpm@10.1.0'])
})

test('who arguments: --range=value form works; a flag cannot be swallowed as the range', () => {
  assert.deepEqual(parseWhoArgs(['hono', '--range=^4']), { name: 'hono', range: '^4', json: false })
  assert.equal(parseWhoArgs(['--range', '--json', 'hono']), null)
})

test('report: unparsable manifests surface and a lockfile only counts for its own ecosystem', async () => {
  const get = path => fakeGithub(path.includes('/rust/') ? { 'Cargo.toml': '[dependencies]\nserde = "1"', 'Cargo.lock': 'x', 'package.json': '{"dependencies":{"a":"1"}}' }
    : { 'package.json': '{broken,' })(path)
  const { index } = await collectStack([repo('rust'), repo('bad')], {}, { get })
  const result = report(index)
  assert.deepEqual(result.noLockfile, ['rust'])
  assert.deepEqual(result.parseErrors, ['bad'])
  assert.match(formatReport(result), /Manifest ilegível \(1\): bad/)
})
