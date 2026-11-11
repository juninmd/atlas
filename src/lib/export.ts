// Exportacao do catalogo filtrado: JSON, CSV, relatorio em Markdown e plano de topics (formato da CLI).
import type { Repo } from '../core/types.ts'

export interface TopicsPlanItem { name: string; owner: string; private: boolean; archived: boolean; purpose: string; source: string; before: string[]; add: string[]; readme: string }

/** Escapa uma celula de CSV e neutraliza formulas (=, +, -, @) para planilhas. */
export function csvCell(value: unknown): string {
  let s = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const HEADER = ['nome', 'visibilidade', 'linguagem', 'status', 'saude', 'riscos', 'ultimo_push', 'estrelas', 'licenca', 'topics', 'finalidade', 'url']
export function toCsv(repos: Repo[]): string {
  const rows = repos.map(r => [r.name, r.private ? 'privado' : 'publico', r.language ?? '', r.scan.status, r.scan.health, r.scan.riskCount, r.pushed_at?.slice(0, 10) ?? '', r.stars, r.license ?? '', r.topics.join(' '), r.purpose, r.url])
  return [HEADER, ...rows].map(row => row.map(csvCell).join(',')).join('\n') + '\n'
}

export function toJson(repos: Repo[]): string {
  return JSON.stringify(repos.map(r => ({
    name: r.name, url: r.url, private: r.private, fork: r.fork, archived: r.archived, language: r.language, stars: r.stars, topics: r.topics,
    pushed_at: r.pushed_at, license: r.license, purpose: r.purpose, categories: r.categories,
    status: r.scan.status, health: r.scan.health, risks: r.scan.risks, analyzed: r.scan.deep, dependencies: r.scan.techs,
  })), null, 2) + '\n'
}

export function toMarkdown(repos: Repo[], { user, date }: { user: string; date: string }): string {
  const by: Record<string, number> = {}
  repos.forEach(r => { by[r.scan.status] = (by[r.scan.status] ?? 0) + 1 })
  const avg = repos.length ? Math.round(repos.reduce((a, r) => a + r.scan.health, 0) / repos.length) : 0
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const lines = [
    `# Atlas · Raio-X de ${user}`, '', `Gerado em ${date}. ${repos.length} repositórios, saúde média ${avg}.`, '',
    `Ativo: ${by.ativo ?? 0} · Manutenção: ${by.manutencao ?? 0} · Experimento: ${by.experimento ?? 0} · Abandonado: ${by.abandonado ?? 0}`, '',
    '| Repositório | Status | Saúde | Riscos | Linguagem |', '|---|---|---|---|---|',
    ...[...repos].sort((a, b) => b.scan.riskCount - a.scan.riskCount || a.name.localeCompare(b.name)).map(r => `| [${cell(r.name)}](${r.url}) | ${r.scan.status} | ${r.scan.health} | ${r.scan.riskCount} | ${cell(r.language ?? '—')} |`),
  ]
  const withRisks = repos.filter(r => r.scan.riskCount)
  if (withRisks.length) {
    lines.push('', '## Riscos e como corrigir', '')
    for (const r of withRisks) lines.push(`### ${cell(r.name)}`, '', ...r.scan.risks.map(x => `- **${x.sev}:** ${cell(x.text)} ${cell(x.fix)}`), '')
  }
  return lines.join('\n') + '\n'
}

/** Mesmo formato de .catalog/topics-plan.json: revise e aplique com `pnpm topics:apply`. */
export function topicsPlan(repos: Repo[]): TopicsPlanItem[] {
  return repos.map(r => ({
    name: r.name, owner: r.owner, private: r.private, archived: r.archived, purpose: r.purpose, source: r.purposeSource, before: r.topics,
    add: (r.suggestedTopics.length || r.topics.length ? r.suggestedTopics : ['needs-classification']).filter(t => !r.topics.includes(t)),
    readme: r.readme.status,
  }))
}

export function download(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.rel = 'noopener'
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
