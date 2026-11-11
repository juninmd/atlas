export const STATUS = { ativo: 'Ativo', manutencao: 'Manutenção', experimento: 'Experimento', abandonado: 'Abandonado' }
export const STATUS_ORDER = ['ativo', 'manutencao', 'experimento', 'abandonado']
export const SEV = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }
export const statusOf = r => r.scan.status
export const statusVar = r => `var(--st-${r.scan.status})`
export const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
export const healthOf = r => r.scan.health
export const initial = r => (r.name || '?')[0].toUpperCase()
