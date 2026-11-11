import { reactive, computed } from 'vue'
import { categories as categoryDefs, projectTypes, enrich } from './core/catalog.js'
import { createClient } from './core/github.js'
import { analyze, usable } from './core/analyze.js'
import { collectRepo, collectStack, SCHEMA } from './core/stack-collect.js'
import { forgetSecrets } from './core/redact.js'
import { createRenderer } from './lib/md.js'
import { credentials } from './lib/credentials.js'
import { db } from './lib/db.js'
import { statusOf } from './lib/format.js'

export const CATEGORY_NAMES = categoryDefs.map(c => c.name)
export { projectTypes }
const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* armazenamento indisponível */ } }
const FRESH_MS = 30 * 60 * 1000

export const state = reactive({
  phase: 'welcome', loading: false, error: '', connectOpen: false, notice: '',
  conn: { user: '', login: '', scope: 'public', hasToken: false, remembered: false }, rate: { limit: null, remaining: null, reset: null },
  analysis: { running: false, done: 0, total: 0, message: '' },
  generated: '', repos: [],
  view: 'const', q: '', status: '', lang: '', cat: '', topic: '', ptype: '', kind: '', vis: '', pending: false, sort: 'recent', colorBy: 'status',
  removed: new Set(store('atlas-removed', [])), notes: store('atlas-notes', {}),
  selected: null, tab: 'over', palette: false, toast: null, tip: null, online: navigator.onLine, installEvent: null, theme: document.documentElement.dataset.theme || '',
})

const client = createClient({ getToken: () => credentials.token(), onRate: r => { state.rate = r } })
let raw = [], stackIndex = { schema: SCHEMA, repos: [] }

/* filtros */
const hay = r => [r.name, r.purpose, r.language, ...(r.topics || []), ...(r.categories || []), ...(r.scan.techs || []).map(t => t.name)].join(' ').toLocaleLowerCase('pt-BR')
const SORTS = {
  recent: (a, b) => (b.pushed_at || '').localeCompare(a.pushed_at || ''),
  stars: (a, b) => b.stars - a.stars,
  name: (a, b) => a.name.localeCompare(b.name),
  health: (a, b) => b.scan.health - a.scan.health,
  risks: (a, b) => b.scan.riskCount - a.scan.riskCount,
}
export const filtered = computed(() => {
  const q = state.q.trim().toLocaleLowerCase('pt-BR')
  return state.repos.filter(r => !state.removed.has(r.name)
    && (!q || hay(r).includes(q))
    && (!state.status || statusOf(r) === state.status)
    && (!state.cat || (state.cat === 'uncategorized' ? !r.categories.length : r.categories.includes(state.cat)))
    && (!state.lang || r.language === state.lang)
    && (!state.topic || (state.topic === 'missing' ? !r.topics.length : r.topics.includes(state.topic)))
    && (!state.ptype || r.projectType === state.ptype)
    && (!state.vis || r.private === (state.vis === 'private'))
    && (!state.pending || r.purposeSource === 'Pendente')
    && (!state.kind || (state.kind === 'fork' ? r.fork : state.kind === 'archived' ? r.archived : !r.fork && !r.archived))
  ).sort(SORTS[state.sort])
})
export const activeSet = computed(() => new Set(filtered.value.map(r => r._i)))
export const options = computed(() => ({
  languages: [...new Set(state.repos.map(r => r.language).filter(Boolean))].sort(),
  topics: [...new Set(state.repos.flatMap(r => r.topics))].sort(),
  types: [...new Set(state.repos.map(r => r.projectType).filter(Boolean))],
}))
export const totals = computed(() => {
  const deep = state.repos.filter(r => r.scan.deep)
  return { all: state.repos.length, deep: deep.length, risks: state.repos.reduce((a, r) => a + r.scan.riskCount, 0), noCI: deep.filter(r => r.scan.risks.some(x => x.id === 'no-ci')).length, private: state.repos.filter(r => r.private).length }
})
export function resetFilters() { Object.assign(state, { q: '', status: '', lang: '', cat: '', topic: '', ptype: '', kind: '', vis: '', pending: false, sort: 'recent' }) }

/* montagem do catálogo a partir da lista crua */
const entryOf = r => stackIndex.repos.find(e => e.owner === r.owner && e.name === r.name)
function applyNote(repo) {
  const n = state.notes[repo.name]
  if (n) { repo.purpose = n.purpose; repo.categories = n.categories; repo.purposeSource = 'Anotação pessoal' }
  return repo
}
function build(list) {
  raw = list
  state.repos = list.map((r, i) => applyNote({ ...enrich(r), _i: i, scan: analyze(r, entryOf(r)) }))
}
function rescan(repo) { const r = raw.find(x => x.name === repo.name); if (r) repo.scan = analyze(r, entryOf(r)) }

function explain(e) {
  if (e.rateLimited) return `O limite de requisições do GitHub esgotou${e.resetAt ? `. Volta às ${new Date(e.resetAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}. Um token aumenta o limite de 60 para 5.000 por hora.`
  if (e.status === 401) return 'Token inválido ou expirado. Gere um novo e tente de novo.'
  if (e.status === 404) return 'Usuário não encontrado no GitHub.'
  if (e.status === 403) return 'O GitHub recusou a consulta. Confira as permissões do token (Contents e Metadata, somente leitura).'
  return e.message || 'Algo deu errado ao falar com o GitHub.'
}

/* conexão */
export async function connect({ user, token, remember, force = false }) {
  state.error = ''; state.loading = true
  try {
    credentials.saveToken(token || '', remember); credentials.saveUser((user || '').trim())
    let login = null
    if (token) login = (await client.me()).login
    const target = (user || '').trim() || login
    if (!target) throw new Error('Informe o usuário do GitHub ou um token.')
    const includePrivate = Boolean(token) && login.toLowerCase() === target.toLowerCase()
    state.conn = { user: target, login: login || '', scope: includePrivate ? 'private' : 'public', hasToken: Boolean(token), remembered: Boolean(token) && remember }
    const key = `snap:${target.toLowerCase()}:${includePrivate}`
    const snap = force ? null : await db.get(key)
    stackIndex = (await db.get(`stack:${target.toLowerCase()}`)) || { schema: SCHEMA, repos: [] }
    if (snap && Date.now() - snap.at < FRESH_MS) { state.generated = new Date(snap.at).toISOString(); build(snap.repos) }
    else {
      const list = await client.inventory({ user: target, includePrivate })
      await db.set(key, { at: Date.now(), repos: list }); state.generated = new Date().toISOString(); build(list)
    }
    state.phase = 'ready'; state.connectOpen = false
    return true
  } catch (e) { state.error = explain(e); return false } finally { state.loading = false }
}
export const refresh = () => connect({ user: state.conn.user, token: credentials.token(), remember: credentials.remembered(), force: true })
export async function disconnect() {
  credentials.clearAll(); forgetSecrets(); await db.clear()
  raw = []; stackIndex = { schema: SCHEMA, repos: [] }
  Object.assign(state, { repos: [], phase: 'welcome', error: '', conn: { user: '', login: '', scope: 'public', hasToken: false, remembered: false }, rate: { limit: null, remaining: null, reset: null }, generated: '', selected: null })
  resetFilters()
}
export async function init() {
  const token = credentials.token(), user = credentials.user()
  if (!token && !user) { state.connectOpen = true; return }
  state.conn.user = user
  if (!await connect({ user, token, remember: credentials.remembered() })) state.connectOpen = true
}

/* análise profunda (árvore, manifestos e workflows) */
const lowQuota = () => { const { remaining, reset } = client.rate(); return remaining != null && remaining < 40 ? `cota do GitHub quase esgotada${reset ? `, volta às ${new Date(reset).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}` : null }
export async function analyzeAll() {
  if (!state.conn.hasToken) { state.analysis.message = 'A análise completa gasta ~6 requisições por repositório. Conecte um token para usá-la.'; return }
  const a = state.analysis
  if (a.running) return
  Object.assign(a, { running: true, done: 0, total: raw.length, message: '' })
  const { index, fetched, failed, halted } = await collectStack(raw, stackIndex, { get: (p, o) => client.api(p, o), onProgress: (d, t) => { a.done = d; a.total = t }, shouldStop: lowQuota })
  stackIndex = index; await db.set(`stack:${state.conn.user.toLowerCase()}`, index)
  state.repos.forEach(rescan)
  Object.assign(a, { running: false, message: halted ? `Parou: ${halted}. Rode de novo para continuar de onde parou.` : `${fetched} repositórios analisados${failed ? `, ${failed} com falha` : ''}.` })
}
export async function analyzeOne(repo) {
  const r = raw.find(x => x.name === repo.name); if (!r) return
  const stop = lowQuota(); if (stop) { state.analysis.message = `Não analisei: ${stop}.`; return }
  try {
    const result = await collectRepo(r, (p, o) => client.api(p, o))
    const entry = { name: r.name, owner: r.owner, private: r.private, archived: r.archived, fork: r.fork, branch: r.branch, pushed_at: r.pushed_at, ...result }
    stackIndex = { ...stackIndex, repos: [...stackIndex.repos.filter(e => !(e.owner === r.owner && e.name === r.name)), entry] }
    await db.set(`stack:${state.conn.user.toLowerCase()}`, stackIndex); rescan(repo)
  } catch (e) { state.analysis.message = explain(e) }
}
export const stackRepos = () => stackIndex

/* README sob demanda */
export async function loadReadme(repo) {
  const cur = repo.readme
  if (cur && cur.status !== 'unloaded' && !(cur.status === 'error' && !cur.rateLimited)) return cur
  const doc = await client.readme(repo)
  repo.readme = doc
  if (doc.status === 'ok' && !state.notes[repo.name] && repo.purposeSource === 'Pendente') { const e = enrich(raw.find(x => x.name === repo.name) || repo, doc); Object.assign(repo, { purpose: e.purpose, purposeSource: e.purposeSource, categories: e.categories, suggestedTopics: e.suggestedTopics, projectType: e.projectType }) }
  return doc
}
let current = null
export const renderMarkdown = createRenderer(() => current ? `${current.url}/blob/${current.branch || 'main'}/README.md` : 'https://github.com/')
export const renderFor = (repo, text) => { current = repo; return renderMarkdown(text) }

/* ficha pessoal, remoção, toast, tema */
export async function saveNote(repo, { purpose, categories }) {
  state.notes[repo.name] = { purpose, categories }; persist('atlas-notes', state.notes)
  repo.purpose = purpose; repo.categories = categories; repo.purposeSource = 'Anotação pessoal'
}
export function toast(msg, undo) { state.toast = { msg, undo }; clearTimeout(toast.t); toast.t = setTimeout(() => state.toast = null, 5200) }
export function removeRepo(repo) {
  state.removed.add(repo.name); persist('atlas-removed', [...state.removed])
  toast(`${repo.name} removido do catálogo.`, () => { state.removed.delete(repo.name); persist('atlas-removed', [...state.removed]) })
}
export function setTip(text, x, y) { state.tip = text ? { text, x, y } : null }
export function toggleTheme() {
  const el = document.documentElement, dark = el.dataset.theme ? el.dataset.theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches
  el.dataset.theme = dark ? 'light' : 'dark'; state.theme = el.dataset.theme; persist('atlas-theme', el.dataset.theme)
}
export function openRepo(repo, tab = 'over') { state.selected = repo; state.tab = tab }
