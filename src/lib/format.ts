import type { Repo, Severity, Status } from '../core/types.ts'

export const STATUS: Record<Status, string> = { ativo: 'Ativo', manutencao: 'Manutenção', experimento: 'Experimento', abandonado: 'Abandonado' }
export const STATUS_ORDER: Status[] = ['ativo', 'manutencao', 'experimento', 'abandonado']
export const SEV: Record<Severity, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }
export const statusOf = (r: Repo): Status => r.scan.status
export const statusVar = (r: Repo): string => `var(--st-${r.scan.status})`
export const fmtDate = (iso: string | null | undefined): string => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
export const healthOf = (r: Repo): number => r.scan.health
export const initial = (r: Pick<Repo, 'name'>): string => (r.name || '?')[0]!.toUpperCase()
