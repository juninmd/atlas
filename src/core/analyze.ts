import type { DeepSignals, Ecosystem, RepoMeta, Risk, Scan, Severity, StackEntry, Status, Tech } from './types.ts'

// Raio-X de um repositorio calculado so com o que a API do GitHub entrega (metadados e, opcionalmente, o indice de stack).
const DAY = 86400000
const LOCKS: Partial<Record<Ecosystem, string[]>> = { npm: ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb'], cargo: ['Cargo.lock'], go: ['go.sum'] }
const WEIGHT: Record<Severity, number> = { alta: 4, media: 2.5, baixa: 1 }
const BASE: Record<Status, number> = { ativo: 72, manutencao: 58, experimento: 46, abandonado: 24 }

type Meta = Pick<RepoMeta, 'pushed_at' | 'archived' | 'license' | 'description' | 'topics' | 'fork' | 'open_issues'>
export const ageDays = (repo: Pick<RepoMeta, 'pushed_at'>, now = Date.now()): number => repo.pushed_at ? Math.floor((now - Date.parse(repo.pushed_at)) / DAY) : Infinity

export function statusOf(repo: Meta, deep: DeepSignals | null, now = Date.now()): Status {
  const age = ageDays(repo, now)
  if (repo.archived || age > 365) return 'abandonado'
  if (age > 90) return 'manutencao'
  const structured = [repo.license, repo.description, repo.topics?.length, deep?.ci].filter(Boolean).length
  return structured >= 2 ? 'ativo' : 'experimento'
}

// Entrada de indice usavel: coletada com sucesso (ok) ou mantida de uma coleta anterior (stale).
export const usable = (entry: StackEntry | null | undefined): entry is StackEntry => entry != null && ['ok', 'stale'].includes(entry.status)

export function deepSignals(entry: StackEntry | null | undefined): DeepSignals | null {
  if (!usable(entry)) return null
  const { stack } = entry
  const ecosystems = [...new Set(stack.deps.map(d => d.ecosystem))]
  const needing = ecosystems.filter(e => LOCKS[e])
  return {
    ci: stack.ci.workflows > 0,
    lockfile: needing.length ? needing.every(e => stack.lockfiles.some(l => LOCKS[e]!.includes(l))) : null,
    ecosystems, docker: ([] as string[]).concat(stack.runtimes.docker ?? []), parseErrors: stack.parseErrors.length,
  }
}

export function risksOf(repo: Meta, deep: DeepSignals | null, now = Date.now()): Risk[] {
  const out: Risk[] = [], age = ageDays(repo, now)
  const add = (id: string, sev: Severity, text: string, fix: string) => out.push({ id, sev, text, fix })
  if (!repo.archived && age > 365) add('stale', 'media', `Sem push há ${Math.floor(age / 365)} ano(s).`, 'Arquive o repositório ou retome a manutenção.')
  if (!repo.description) add('no-description', 'baixa', 'Sem descrição no GitHub.', 'Escreva uma frase curta sobre a finalidade do projeto.')
  if (!repo.topics?.length) add('no-topics', 'baixa', 'Sem topics.', 'Adicione topics para facilitar a busca.')
  if (!repo.license && !repo.fork) add('no-license', 'media', 'Sem licença declarada.', 'Inclua um arquivo LICENSE.')
  if (repo.open_issues >= 20) add('many-issues', 'media', `${repo.open_issues} issues abertas.`, 'Faça uma triagem e feche o que ficou obsoleto.')
  if (deep && !repo.archived && !repo.fork) {
    if (!deep.ci) add('no-ci', 'media', 'Sem workflow de CI.', 'Adicione um workflow do GitHub Actions com build e testes.')
    if (deep.lockfile === false) add('no-lockfile', 'media', 'Manifesto de dependências sem lockfile.', 'Versione o lockfile para builds reproduzíveis.')
    if (deep.docker.some(i => !/[:@]/.test(i) || /:latest$/.test(i))) add('docker-latest', 'baixa', 'Imagem base do Dockerfile sem versão fixa.', 'Fixe a versão (ou o digest) da imagem base.')
    if (deep.parseErrors) add('bad-manifest', 'baixa', 'Manifesto com JSON inválido.', 'Corrija o arquivo de manifesto.')
  }
  return out.sort((a, b) => WEIGHT[b.sev] - WEIGHT[a.sev])
}

export function healthOf(status: Status, repo: Pick<RepoMeta, 'pushed_at'>, risks: Risk[], now = Date.now()): number {
  const recent = ageDays(repo, now) <= 30 ? 8 : 0
  const penalty = risks.reduce((a, r) => a + WEIGHT[r.sev] * 1.5, 0)
  return Math.max(4, Math.min(99, Math.round(BASE[status] + recent - penalty)))
}

export function techsOf(entry: StackEntry | null | undefined): Tech[] {
  if (!usable(entry)) return []
  const seen = new Map<string, Tech>()
  const order = ['prod', 'peer', 'dev', 'build', 'indirect']
  for (const d of [...entry.stack.deps].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))) if (!seen.has(`${d.ecosystem}:${d.name}`)) seen.set(`${d.ecosystem}:${d.name}`, { name: d.name, range: d.range, ecosystem: d.ecosystem, kind: d.kind })
  return [...seen.values()].slice(0, 80)
}

export function analyze(repo: Meta & Pick<RepoMeta, 'pushed_at'>, entry: StackEntry | null | undefined, now = Date.now()): Scan {
  const deep = deepSignals(entry)
  const status = statusOf(repo, deep, now)
  const risks = risksOf(repo, deep, now)
  return { status, health: healthOf(status, repo, risks, now), risks, riskCount: risks.length, deep: Boolean(deep), signals: deep, techs: techsOf(entry), runtimes: usable(entry) ? entry.stack.runtimes : {} }
}
