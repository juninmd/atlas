import { test, expect } from '@playwright/test'
import { readFile, readdir } from 'node:fs/promises'

const TOKEN = 'github_pat_TESTTOKEN0123456789abcdefghijkl'
const iso = days => new Date(Date.now() - days * 86400000).toISOString()
const repo = (name, over = {}) => ({ name, owner: { login: 'octo' }, description: `Projeto ${name} para testes`, html_url: `https://github.com/octo/${name}`, private: false, fork: false, archived: false,
  language: 'JavaScript', stargazers_count: 3, topics: ['demo'], pushed_at: iso(5), updated_at: iso(5), created_at: iso(400), default_branch: 'main', license: { spdx_id: 'MIT' }, open_issues_count: 1, size: 10, ...over })
const PUBLIC = [repo('alpha'), repo('beta', { language: 'Python', license: null, description: '', topics: [], pushed_at: iso(500) }), repo('gamma', { language: 'Rust', archived: true })]
const PRIVATE = [...PUBLIC, repo('secreto', { private: true, language: 'Go' })]
const b64 = text => ({ encoding: 'base64', content: Buffer.from(text).toString('base64') })
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,accept,x-github-api-version,content-type', 'access-control-expose-headers': 'x-ratelimit-remaining,x-ratelimit-limit,x-ratelimit-reset' }

// Simula api.github.com e registra o que foi enviado.
async function mockGithub(page, { token = TOKEN, unauthorized = false } = {}) {
  const seen = []
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname + url.search
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    seen.push({ path, auth: req.headers().authorization || null })
    const json = (body, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', 'x-ratelimit-limit': req.headers().authorization ? '5000' : '60', 'x-ratelimit-remaining': '4990', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) }, body: JSON.stringify(body) })
    if (unauthorized) return json({ message: 'Bad credentials' }, 401)
    if (url.pathname === '/user') return json({ login: 'octo' })
    if (url.pathname === '/user/repos') return json(PRIVATE)
    if (url.pathname === '/users/octo/repos') return json(PUBLIC)
    if (url.pathname === '/users/ghost/repos') return json({ message: 'Not Found' }, 404)
    if (url.pathname.endsWith('/readme')) return json({ path: 'README.md', ...b64('# Olá\n\nTexto do README com [link](https://example.com) e <script>alert(1)</script>.') })
    if (url.pathname === '/repos/octo/alpha/git/trees/main') return json({ tree: [{ type: 'blob', path: 'package.json' }, { type: 'blob', path: 'pnpm-lock.yaml' }, { type: 'blob', path: '.github/workflows/ci.yml' }] })
    if (url.pathname === '/repos/octo/alpha/contents/package.json') return json(b64('{"dependencies":{"vue":"^3.5.0"},"devDependencies":{"vite":"^6.0.0"}}'))
    if (url.pathname === '/repos/octo/alpha/contents/.github/workflows/ci.yml') return json(b64('name: CI\non: push\n'))
    return json({ message: 'Not Found' }, 404)
  })
  return seen
}
const modal = page => page.locator('#connect')
async function connectPublic(page) {
  await page.fill('#cUser', 'octo')
  await page.getByRole('button', { name: 'Só públicos, sem token' }).click()
  await expect(page.locator('#count')).toContainText('de 3 repositórios')
}

test('primeira visita abre a conexão e não chama o GitHub antes de enviar', async ({ page }) => {
  const seen = await mockGithub(page)
  await page.goto('/')
  await expect(modal(page)).toBeVisible()
  await expect(page.locator('#cToken')).toHaveAttribute('type', 'password')
  expect(seen).toHaveLength(0)
})

test('sem token: só públicos, sem Authorization e nada guardado como credencial', async ({ page }) => {
  const seen = await mockGithub(page)
  await page.goto('/')
  await connectPublic(page)
  expect(seen.every(s => s.auth === null)).toBeTruthy()
  expect(seen.map(s => s.path).join()).not.toContain('user/repos')
  expect(await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)].join())).not.toMatch(/atlas-token/)
  await expect(page.locator('#netTxt')).toContainText('Só públicos')
})

test('com token: inclui privados, Authorization só para api.github.com, token só em sessionStorage', async ({ page }) => {
  const seen = await mockGithub(page)
  const outside = []
  page.on('request', r => { if (!r.url().startsWith('https://api.github.com') && !r.url().startsWith('http://127.0.0.1')) outside.push(r.url()) })
  await page.goto('/')
  await page.fill('#cUser', 'octo'); await page.fill('#cToken', TOKEN)
  await page.locator('#connect button[type=submit]').click()
  await expect(page.locator('#count')).toContainText('de 4 repositórios')
  expect(seen.some(s => s.auth === `Bearer ${TOKEN}`)).toBeTruthy()
  expect(seen.some(s => s.path.startsWith('/user/repos'))).toBeTruthy()
  expect(seen.every(s => !s.path.includes(TOKEN))).toBeTruthy()
  expect(outside).toEqual([])
  const st = await page.evaluate(() => ({ s: sessionStorage.getItem('atlas-token'), l: localStorage.getItem('atlas-token') }))
  expect(st).toEqual({ s: TOKEN, l: null })
  await expect(page.locator('#netTxt')).toContainText('Com privados')
  expect(await page.content()).not.toContain(TOKEN)
})

test('lembrar token persiste no reload e "Sair e apagar dados" limpa tudo', async ({ page }) => {
  await mockGithub(page)
  await page.goto('/')
  await page.fill('#cUser', 'octo'); await page.fill('#cToken', TOKEN); await page.check('#cRemember')
  await page.locator('#connect button[type=submit]').click()
  await expect(page.locator('#count')).toContainText('de 4')
  await page.reload()
  await expect(page.locator('#count')).toContainText('de 4')
  await page.click('#connBtn')
  await page.getByRole('button', { name: 'Sair e apagar dados' }).click()
  await expect(page.locator('#welcome')).toBeVisible()
  expect(await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)].join())).not.toMatch(/atlas-token|atlas-user/)
  await page.reload()
  await expect(modal(page)).toBeVisible()
})

test('erros do GitHub viram mensagens claras', async ({ page }) => {
  await mockGithub(page, { unauthorized: true })
  await page.goto('/')
  await page.fill('#cUser', 'octo'); await page.fill('#cToken', 'x'.repeat(20))
  await page.locator('#connect button[type=submit]').click()
  await expect(modal(page)).toContainText('Token inválido ou expirado')
  await page.unroute('https://api.github.com/**')
  await mockGithub(page)
  await page.fill('#cUser', 'ghost'); await page.fill('#cToken', '')
  await page.getByRole('button', { name: 'Só públicos, sem token' }).click()
  await expect(modal(page)).toContainText('Usuário não encontrado')
})

test('raio-X: riscos por metadados, README seguro e análise a fundo', async ({ page }) => {
  await mockGithub(page)
  await page.goto('/')
  await connectPublic(page)
  await page.click('[data-view=grid]')
  await page.fill('#q', 'beta')
  await page.locator('.repo-card').first().click()
  await page.getByRole('tab', { name: 'Riscos e melhorias' }).click()
  await expect(page.locator('#dbody')).toContainText('Sem licença declarada')
  await page.keyboard.press('Escape')
  await page.fill('#q', 'alpha')
  await page.locator('.repo-card').first().click()
  await page.getByRole('tab', { name: 'README' }).click()
  await expect(page.locator('.readme h1')).toHaveText('Olá')
  await expect(page.locator('.readme script')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Raio-X' }).click()
  await page.getByRole('button', { name: 'Analisar este repositório' }).click()
  await expect(page.locator('#dbody')).toContainText('workflow encontrado')
  await expect(page.locator('#dbody')).toContainText('vue')
  await page.keyboard.press('Escape')
  await page.click('[data-view=stack]')
  await page.fill('#who', 'vue')
  await expect(page.locator('#whoRes')).toContainText('alpha')
})

test('visões, paleta e remover com desfazer', async ({ page }) => {
  await mockGithub(page)
  await page.goto('/')
  await connectPublic(page)
  await expect(page.locator('#v-const canvas')).toBeVisible()
  await page.click('[data-view=deck]')
  await page.getByRole('button', { name: 'Remover', exact: true }).click()
  await expect(page.locator('#count')).toContainText('de 3 repositórios')
  await expect(page.locator('.toast')).toContainText('removido')
  await page.getByRole('button', { name: 'Desfazer' }).click()
  await page.keyboard.press('Control+k')
  await page.fill('#palq', 'saúde'); await page.keyboard.press('Enter')
  await expect(page.locator('#mosaic .cell').first()).toBeVisible()
})

test('mobile sem rolagem horizontal', async ({ page }) => {
  await mockGithub(page)
  await page.setViewportSize({ width: 400, height: 850 })
  await page.goto('/')
  await connectPublic(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400)
})

test('build sem nada hardcoded: CSP, sem usuário fixo e sem credencial', async () => {
  const html = await readFile('dist/index.html', 'utf8')
  expect(html).toContain("connect-src 'self' https://api.github.com")
  expect(html).toContain("script-src 'self'")
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))).flat()
  for (const f of (await walk('dist')).filter(f => /\.(js|css|html|json|webmanifest)$/.test(f))) {
    const text = await readFile(f, 'utf8')
    expect(text, f).not.toMatch(/juninmd/i)
    expect(text, f).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/)
  }
})
