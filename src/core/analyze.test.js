import test from 'node:test'
import assert from 'node:assert/strict'
import { analyze, statusOf } from './analyze.js'

const NOW = Date.parse('2026-11-11T00:00:00Z')
const days = n => new Date(NOW - n * 86400000).toISOString()
const base = { name: 'x', description: 'd', topics: ['a'], license: 'MIT', fork: false, archived: false, open_issues: 0, pushed_at: days(5) }
const entry = (over = {}) => ({ status: 'ok', stack: { deps: [{ ecosystem: 'npm', name: 'vue', range: '^3', kind: 'prod', path: '' }], runtimes: {}, lockfiles: ['pnpm-lock.yaml'], ci: { workflows: 1, reusable: [] }, parseErrors: [], ...over } })

test('status segue arquivado, idade e estrutura', () => {
  assert.equal(statusOf({ ...base, archived: true }, null, NOW), 'abandonado')
  assert.equal(statusOf({ ...base, pushed_at: days(400) }, null, NOW), 'abandonado')
  assert.equal(statusOf({ ...base, pushed_at: days(200) }, null, NOW), 'manutencao')
  assert.equal(statusOf(base, null, NOW), 'ativo')
  assert.equal(statusOf({ ...base, description: '', topics: [], license: null }, null, NOW), 'experimento')
})
test('riscos leves usam só metadados da lista', () => {
  const s = analyze({ ...base, description: '', topics: [], license: null, open_issues: 30 }, null, NOW)
  assert.deepEqual(s.risks.map(r => r.id).sort(), ['many-issues', 'no-description', 'no-license', 'no-topics'])
  assert.equal(s.deep, false)
  assert.ok(s.risks.every(r => r.fix))
})
test('análise profunda detecta CI, lockfile e imagem sem versão', () => {
  const s = analyze(base, entry({ ci: { workflows: 0, reusable: [] }, lockfiles: [], runtimes: { docker: ['node:latest'] } }), NOW)
  assert.deepEqual(s.risks.map(r => r.id).sort(), ['docker-latest', 'no-ci', 'no-lockfile'])
  assert.equal(s.deep, true)
  assert.deepEqual(s.techs.map(t => t.name), ['vue'])
})
test('forks e arquivados não recebem riscos de CI', () => {
  const bare = entry({ ci: { workflows: 0, reusable: [] }, lockfiles: [] })
  assert.ok(!analyze({ ...base, fork: true }, bare, NOW).risks.some(r => r.id === 'no-ci'))
  assert.ok(!analyze({ ...base, archived: true }, bare, NOW).risks.some(r => r.id === 'no-ci'))
})
test('saúde fica entre 4 e 99 e cai com riscos', () => {
  const ok = analyze(base, entry(), NOW), bad = analyze({ ...base, description: '', topics: [], license: null, open_issues: 50, pushed_at: days(500) }, null, NOW)
  assert.ok(ok.health > bad.health)
  assert.ok(ok.health <= 99 && bad.health >= 4)
})
test('entrada com erro ou vazia não conta como análise profunda', () => {
  assert.equal(analyze(base, { status: 'error', stack: { deps: [] } }, NOW).deep, false)
})
