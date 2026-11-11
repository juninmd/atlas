import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { inventory } from './github.mjs'
import { collectStack } from '../src/core/stack-collect.js'
import { formatReport, formatWho, parseWhoArgs, report, who } from '../src/core/stack-query.js'
const FILE = '.catalog/stack.json'
const [command, ...args] = process.argv.slice(2)
const usage = 'Uso: stack:collect | stack:who <dependência> [--range <trecho>] [--json] | stack:report'
async function load() {
  try { return JSON.parse(await readFile(FILE, 'utf8')) } catch (e) {
    if (e.code === 'ENOENT') { console.error('Índice ausente. Execute pnpm stack:collect.'); process.exit(1) }
    throw e
  }
}
if (command === 'collect') {
  const repos = await inventory({ privateRepos: true })
  let previous = {}
  try { previous = JSON.parse(await readFile(FILE, 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
  const { index, fetched, failed, halted } = await collectStack(repos, previous)
  await mkdir('.catalog', { recursive: true })
  await writeFile(FILE + '.tmp', JSON.stringify(index))
  await rename(FILE + '.tmp', FILE)
  console.log(JSON.stringify({ repos: repos.length, fetched, cached: repos.length - fetched - failed, failed }))
  if (failed) { console.error(`${failed} repositórios falharam${halted ? ` (${halted})` : ''}; o snapshot anterior foi mantido para eles. Execute novamente para retomar.`); process.exitCode = 1 }
} else if (command === 'who') {
  const parsed = parseWhoArgs(args)
  if (!parsed) { console.error(usage); process.exit(2) }
  const rows = who(await load(), parsed.name, parsed.range)
  console.log(parsed.json ? JSON.stringify(rows, null, 2) : formatWho(rows))
} else if (command === 'report') {
  console.log(formatReport(report(await load())))
} else { console.error(usage); process.exit(2) }
