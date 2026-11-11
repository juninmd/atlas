// Tipos compartilhados entre navegador, CLIs e MCP.

/** Repositorio como a API do GitHub entrega, ja reduzido ao que o Atlas usa. */
export interface RepoMeta {
  name: string
  owner: string
  description: string
  url: string
  private: boolean
  fork: boolean
  archived: boolean
  language: string | null
  stars: number
  topics: string[]
  pushed_at: string | null
  updated_at: string | null
  created_at: string | null
  branch: string | null
  license: string | null
  open_issues: number
  size: number
}

export type ReadmeStatus = 'ok' | 'missing' | 'error' | 'unloaded'
export interface ReadmeDoc { status: ReadmeStatus; text: string; path?: string; message?: string; rateLimited?: boolean }

export type Status = 'ativo' | 'manutencao' | 'experimento' | 'abandonado'
export type Severity = 'alta' | 'media' | 'baixa'
export interface Risk { id: string; sev: Severity; text: string; fix: string }

export type Ecosystem = 'npm' | 'pypi' | 'cargo' | 'go'
export type DepKind = 'prod' | 'dev' | 'peer' | 'build' | 'indirect'
export interface Dep { ecosystem: Ecosystem; name: string; range: string; kind: DepKind; path: string }
export interface WorkflowRef { repo: string; file: string; ref: string }
export interface Stack {
  deps: Dep[]
  runtimes: Record<string, string | string[]>
  lockfiles: string[]
  ci: { workflows: number; reusable: WorkflowRef[] }
  parseErrors: string[]
}
export type EntryStatus = 'ok' | 'empty' | 'stale' | 'error'
export interface StackEntry {
  name: string
  owner: string
  private: boolean
  archived: boolean
  fork: boolean
  branch: string | null
  pushed_at: string | null
  status: EntryStatus
  stack: Stack
  truncated?: boolean
  unread?: string[]
  error?: string
}
export interface StackIndex { schema: number; generated_at?: string; repos: StackEntry[] }

export interface DeepSignals { ci: boolean; lockfile: boolean | null; ecosystems: Ecosystem[]; docker: string[]; parseErrors: number }
export interface Tech { name: string; range: string; ecosystem: Ecosystem; kind: DepKind }
export interface Scan {
  status: Status
  health: number
  risks: Risk[]
  riskCount: number
  deep: boolean
  signals: DeepSignals | null
  techs: Tech[]
  runtimes: Record<string, string | string[]>
}

/** Resultado de enrich(): metadados + finalidade e categorias inferidas. */
export interface Enrichment { categories: string[]; purpose: string; purposeSource: string; suggestedTopics: string[]; readme: ReadmeDoc; projectType?: string }
export type Enriched = RepoMeta & Enrichment
/** Repositorio como a interface o usa: enriquecido, indexado e com o raio-X. */
export type Repo = Enriched & { _i: number; scan: Scan }
