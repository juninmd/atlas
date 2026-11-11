// Adaptador Node do cliente do GitHub: a credencial vem de GH_TOKEN, GITHUB_TOKEN ou do gh CLI, so no processo.
import { execFileSync } from 'node:child_process'
import { createClient } from '../src/core/github.js'
import { redact, registerSecret } from '../src/core/redact.js'
export { redact }
let cached
export function credential() {
  const env = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (env) { registerSecret(env); return env }
  if (cached !== undefined) return cached
  try { cached = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { cached = null }
  registerSecret(cached)
  return cached
}
const client = createClient({ getToken: credential })
export const api = (path, options) => client.api(path, options)
export async function inventory({ privateRepos = false, user = process.env.GH_USER } = {}) {
  const token = credential()
  if (privateRepos && !token) throw new Error('Autentique com gh auth login (ou defina GH_TOKEN) para consultar o inventário privado.')
  const login = token ? (await client.me()).login : null
  const target = user || login
  if (!target) throw new Error('Defina GH_USER ou autentique com gh auth login.')
  if (privateRepos && login.toLowerCase() !== target.toLowerCase()) throw new Error('GH_USER precisa ser o usuário autenticado.')
  return client.inventory({ user: target, includePrivate: privateRepos })
}
export const readme = repo => client.readme(repo)
