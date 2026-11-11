import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { inventory, readme, api } from './github.ts'
import { enrich } from '../src/core/catalog.ts'

interface PlanItem { name: string; owner: string; private?: boolean; archived?: boolean; purpose?: string; source?: string; before: string[]; add: string[] }
interface ReportItem { name: string; status: 'verified' | 'error'; topics?: string[]; empty?: boolean; error?: string }
const code = (e: unknown) => (e as NodeJS.ErrnoException).code
await mkdir('.catalog', { recursive: true })
if (process.argv.includes('--verify')) {
  const plan = JSON.parse(await readFile('.catalog/topics-plan.json', 'utf8')) as PlanItem[]
  const repos = await inventory({ privateRepos: true })
  const failures = plan.map(item => {
    const repo = repos.find(r => r.name === item.name && r.owner === item.owner)
    return { name: item.name, missing: repo ? [...new Set([...item.before, ...item.add])].filter(t => !repo.topics.includes(t)) : ['repository-not-found'], empty: !repo?.topics.length }
  }).filter(r => r.empty || r.missing.length)
  await writeFile('.catalog/topics-verification.json', JSON.stringify({ checked_at: new Date().toISOString(), planned: plan.length, current: repos.length, verified: plan.length - failures.length, failures }, null, 2))
  console.log(JSON.stringify({ checked: plan.length, verified: plan.length - failures.length, failed: failures.length }))
  if (failures.length) process.exitCode = 1
} else if (!process.argv.includes('--apply')) {
  const repos = await inventory({ privateRepos: true })
  const plan = []
  for (const repo of repos) {
    const doc = await readme(repo)
    if (doc.status === 'error') throw new Error('Falha ao coletar documentação; plano não foi salvo.')
    const item = enrich(repo, doc)
    // Existing tags are preserved. Inference is explicit and reviewable in a local file.
    plan.push({ name: repo.name, owner: repo.owner, private: repo.private, archived: repo.archived,
      purpose: item.purpose, source: item.purposeSource, before: repo.topics,
      add: (item.suggestedTopics.length || repo.topics.length ? item.suggestedTopics : ['needs-classification']).filter(t => !repo.topics.includes(t)),
      readme: doc.status })
  }
  await writeFile('.catalog/topics-plan.json', JSON.stringify(plan, null, 2))
  console.log(`Plano local salvo: ${plan.length} repositórios. Revise .catalog/topics-plan.json; execute pnpm topics:apply para aplicar.`)
} else {
  const plan = JSON.parse(await readFile('.catalog/topics-plan.json', 'utf8')) as PlanItem[]
  const owned = await inventory({ privateRepos: true })
  let report: ReportItem[] = []
  try { report = JSON.parse(await readFile('.catalog/topics-report.json', 'utf8')) as ReportItem[] } catch (e) { if (code(e) !== 'ENOENT') throw e }
  for (const item of plan) {
    const previous = report.find(r => r.name === item.name)
    if (previous?.status === 'verified' && [...item.before, ...item.add].every(t => (previous.topics ?? []).includes(t))) continue
    report = report.filter(r => r.name !== item.name)
    if (!owned.some(r => r.owner === item.owner && r.name === item.name)) throw new Error('Plano contém repositório fora do inventário autorizado.')
    if (!Array.isArray(item.add) || item.add.some(t => !/^[a-z0-9][a-z0-9-]{0,49}$/.test(t))) throw new Error('Topic inválido no plano.')
    const path = `repos/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.name)}/topics`
    try {
      const current = (await api<{ names: string[] }>(path)).names
      const names = [...new Set([...current, ...item.add])]
      if (names.length > 20) throw new Error('Limite de 20 topics: preservados os existentes; revise as adições.')
      if (names.length !== current.length) {
        await api(path, { method: 'PUT', body: { names } })
        await new Promise(resolve => setTimeout(resolve, 1100))
      }
      const verified = (await api<{ names: string[] }>(path)).names
      if (names.some(t => !verified.includes(t))) throw new Error('A verificação não confirmou os topics.')
      report.push({ name: item.name, status: 'verified', topics: verified, empty: !verified.length })
    } catch (e) { report.push({ name: item.name, status: 'error', error: (e as Error).message }) }
    await writeFile('.catalog/topics-report.json', JSON.stringify(report, null, 2))
    if (report.length % 25 === 0) console.log(`Verificados ${report.filter(r => r.status === 'verified').length}/${plan.length}; falhas ${report.filter(r => r.status === 'error').length}.`)
  }
  console.log(JSON.stringify({ verified: report.filter(r => r.status === 'verified').length, failed: report.filter(r => r.status === 'error').length, uncategorized: report.filter(r => r.empty).length }))
  if (report.some(r => r.status === 'error' || r.empty)) process.exitCode = 1
}
