// Servidor MCP (stdio, JSON-RPC 2.0) com o catalogo do usuario autenticado, lido ao vivo do GitHub.
// Por padrao so repositorios publicos; ATLAS_INCLUDE_PRIVATE=1 inclui os privados (nunca saem da maquina).
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { inventory, readme } from './github.ts'
import { enrich } from '../src/core/catalog.ts'
import { analyze } from '../src/core/analyze.ts'
import { who } from '../src/core/stack-query.ts'
import type { Repo, StackIndex } from '../src/core/types.ts'

type McpRepo = Omit<Repo, '_i'>
type Args = Record<string, unknown>
interface Tool { description: string; inputSchema: object; run(args: Args): Promise<unknown> }
interface Message { jsonrpc?: string; id?: number | string | null; method?: string; params?: { protocolVersion?: string; name?: string; arguments?: Args } }

const slim = (r: McpRepo) => ({ name: r.name, url: r.url, purpose: r.purpose, language: r.language, categories: r.categories, topics: r.topics, projectType: r.projectType, status: r.scan.status, health: r.scan.health })
const text = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] })
let loader = async (): Promise<McpRepo[]> => (await inventory({ privateRepos: process.env.ATLAS_INCLUDE_PRIVATE === '1' })).map(r => ({ ...enrich(r), scan: analyze(r, null) }))
let cache: { at: number; repos: McpRepo[] } | null = null
export const setLoader = (fn: () => Promise<McpRepo[]>): void => { loader = fn; cache = null }
async function load(): Promise<McpRepo[]> {
  if (!cache || Date.now() - cache.at > 600000) cache = { at: Date.now(), repos: await loader() }
  return cache.repos
}
const str = (v: unknown): string => String(v ?? '')
const num = (v: unknown, d: number): number => typeof v === 'number' ? v : d

export const tools: Record<string, Tool> = {
  list_repos: {
    description: 'Lista repositórios, com filtros opcionais por categoria, linguagem e status (ativo, manutencao, experimento, abandonado).',
    inputSchema: { type: 'object', properties: { category: { type: 'string' }, language: { type: 'string' }, status: { type: 'string' }, limit: { type: 'number' } } },
    async run({ category, language, status, limit }) {
      return (await load()).filter(r => (!category || r.categories.includes(str(category))) && (!language || r.language?.toLowerCase() === str(language).toLowerCase()) && (!status || r.scan.status === status)).slice(0, num(limit, 50)).map(slim)
    },
  },
  search_repos: {
    description: 'Busca textual em nome, finalidade, tópicos e categorias dos repositórios.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
    async run({ query, limit }) {
      const terms = str(query).toLowerCase().split(/\s+/).filter(Boolean)
      return (await load()).filter(r => { const hay = `${r.name} ${r.purpose} ${r.topics.join(' ')} ${r.categories.join(' ')}`.toLowerCase(); return terms.every(t => hay.includes(t)) }).slice(0, num(limit, 20)).map(slim)
    },
  },
  get_repo: {
    description: 'Retorna os detalhes de um repositório pelo nome, com o raio-X (riscos e melhorias) e um trecho do README.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    async run({ name }) {
      const repo = (await load()).find(r => r.name.toLowerCase() === str(name).toLowerCase())
      if (!repo) throw new Error(`Repositório não encontrado: ${str(name)}`)
      const doc = repo.readme.status === 'unloaded' ? await readme(repo) : repo.readme
      const { readme: _omit, ...rest } = repo
      return { ...rest, readme: { status: doc.status, excerpt: (doc.text || '').slice(0, 2000) } }
    },
  },
  list_risks: {
    description: 'Lista os repositórios com mais riscos (sem licença, parados, sem descrição…) e como corrigir.',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
    async run({ limit }) {
      return [...(await load())].sort((a, b) => b.scan.riskCount - a.scan.riskCount).slice(0, num(limit, 10)).map(r => ({ name: r.name, status: r.scan.status, health: r.scan.health, risks: r.scan.risks }))
    },
  },
  who_uses: {
    description: 'Quais repositórios declaram uma dependência. Usa o índice local .catalog/stack.json (gere com pnpm stack:collect).',
    inputSchema: { type: 'object', properties: { dep: { type: 'string' }, range: { type: 'string' } }, required: ['dep'] },
    async run({ dep, range }) {
      let index: StackIndex
      try { index = JSON.parse(await readFile(process.env.STACK_FILE || '.catalog/stack.json', 'utf8')) as StackIndex } catch { throw new Error('Índice ausente. Execute pnpm stack:collect.') }
      return who(index, str(dep), range ? str(range) : undefined)
    },
  },
  list_categories: {
    description: 'Lista as categorias e a quantidade de repositórios em cada uma.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const counts: Record<string, number> = {}
      for (const r of await load()) for (const c of r.categories) counts[c] = (counts[c] ?? 0) + 1
      return counts
    },
  },
}

export async function handle(msg: Message) {
  const { id, method, params } = msg
  if (id === undefined) return null // notificação
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result })
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })
  switch (method) {
    case 'initialize': return ok({ protocolVersion: params?.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'atlas', version: '3.0.0' } })
    case 'ping': return ok({})
    case 'tools/list': return ok({ tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) })
    case 'tools/call': {
      const tool = tools[params?.name ?? '']
      if (!tool) return fail(-32602, `Ferramenta desconhecida: ${params?.name}`)
      try { return ok(text(await tool.run(params?.arguments || {}))) }
      catch (e) { return ok({ isError: true, content: [{ type: 'text', text: (e as Error).message }] }) }
    }
    default: return fail(-32601, `Método não suportado: ${method}`)
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  for await (const line of createInterface({ input: process.stdin })) {
    if (!line.trim()) continue
    let msg: Message
    try { msg = JSON.parse(line) as Message } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }) + '\n'); continue }
    const res = await handle(msg)
    if (res) process.stdout.write(JSON.stringify(res) + '\n')
  }
}
