import test from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, toCsv, toJson, toMarkdown, topicsPlan } from './export.ts'
import { enrich } from '../core/catalog.ts'
import { analyze } from '../core/analyze.ts'
import { repo as meta } from '../core/stack-fixtures.ts'
import type { Repo, RepoMeta } from '../core/types.ts'

const NOW = Date.now()
const mk = (name: string, over: Partial<RepoMeta> = {}): Repo => { const r = meta(name, { description: `Projeto ${name}`, pushed_at: new Date(NOW - 86400000).toISOString(), ...over }); return { ...enrich(r), _i: 0, scan: analyze(r, null) } }

test('csvCell escapa aspas, vírgulas e neutraliza fórmulas', () => {
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('diz "oi"'), '"diz ""oi"""')
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"')
  assert.equal(csvCell('+1'), "'+1")
  assert.equal(csvCell(null), '')
  assert.equal(csvCell(5), '5')
})
test('toCsv tem cabeçalho, uma linha por repositório e quebra de linha final', () => {
  const csv = toCsv([mk('alpha', { license: 'MIT' }), mk('beta', { private: true })])
  const lines = csv.trimEnd().split('\n')
  assert.equal(lines.length, 3)
  assert.match(lines[0]!, /^nome,visibilidade,/)
  assert.match(lines[1]!, /^alpha,publico,/)
  assert.match(lines[2]!, /^beta,privado,/)
  assert.ok(csv.endsWith('\n'))
})
test('toJson é JSON válido com status, saúde e riscos', () => {
  const data = JSON.parse(toJson([mk('alpha')])) as { name: string; status: string; health: number; risks: unknown[] }[]
  assert.equal(data[0]!.name, 'alpha')
  assert.ok(['ativo', 'manutencao', 'experimento', 'abandonado'].includes(data[0]!.status))
  assert.ok(Array.isArray(data[0]!.risks))
})
test('toMarkdown resume por status, ordena por riscos e escapa barras', () => {
  const md = toMarkdown([mk('ok', { license: 'MIT', topics: ['a'] }), mk('pipe|name', { license: null, topics: [] })], { user: 'octo', date: '2026-01-01' })
  assert.match(md, /^# Atlas · Raio-X de octo/)
  assert.match(md, /2 repositórios/)
  assert.ok(md.indexOf('pipe\\|name') < md.indexOf('[ok]'), 'mais riscos primeiro')
  assert.match(md, /## Riscos e como corrigir/)
})
test('topicsPlan segue a regra da CLI: preserva topics e marca needs-classification', () => {
  const plan = topicsPlan([mk('bot-de-automacao', { description: 'Um bot de automação', language: 'Python' }), mk('sem-nada', { description: '', language: null }), mk('tem', { topics: ['x'] })])
  assert.ok(plan[0]!.add.includes('automation'))
  assert.deepEqual(plan[1]!.add, ['needs-classification'])
  assert.deepEqual(plan[2]!.before, ['x'])
  assert.ok(!plan[2]!.add.includes('x'))
})
