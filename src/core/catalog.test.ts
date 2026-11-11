import test from 'node:test'
import assert from 'node:assert/strict'
import { redact } from './redact.ts'
import { enrich, readmeSummary } from './catalog.ts'
import { repo as meta } from './stack-fixtures.ts'
test('secrets and private keys are redacted from documentation', () => {
  const secret = 'ghp_' + 'a'.repeat(36)
  assert.equal(redact(secret).includes(secret), false)
  assert.equal(redact('token=supersecretvalue').includes('supersecretvalue'), false)
  assert.equal(redact('-----BEGIN RSA PRIVATE KEY-----\nprivate\n-----END RSA PRIVATE KEY-----').includes('private'), false)
})
test('purpose distinguishes evidence from missing documentation', () => {
  const repo = meta('example')
  assert.equal(enrich(repo).purposeSource, 'Pendente')
  assert.equal(enrich(repo, { status: 'ok', text: 'This application helps organize all the recipes in a personal cooking library.' }).purposeSource, 'Trecho do README')
  assert.equal(enrich({ ...repo, description: 'Known purpose' }).purposeSource, 'Descrição do GitHub')
})
test('language suggestions and existing categories are available without replacing topics', () => {
  const repo = meta('widget', { description: 'A Tauri desktop app', topics: ['desktop-application', 'my-existing-tag'], language: 'C#' })
  const result = enrich(repo)
  assert.ok(result.suggestedTopics.includes('csharp'))
  assert.ok(result.categories.includes('Desktop'))
  assert.deepEqual(result.topics, repo.topics)
})
test('README purpose comes from descriptive prose rather than install commands', () => {
  assert.equal(readmeSummary('git clone https://github.com/example/very-long-repository-name\n\n' + 'npm install ' + 'dependency '.repeat(10)), '')
  assert.equal(readmeSummary('## Summary\n\n* Api Responsável por cuidar da centralização de APIs do APP Wheelie.'), 'Api Responsável por cuidar da centralização de APIs do APP Wheelie.')
  assert.equal(readmeSummary('```markdown\n# Project\n\nThis tool organizes personal applications into searchable collections.\n```'), 'This tool organizes personal applications into searchable collections.')
})
