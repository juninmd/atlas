// Credenciais ficam so neste navegador. O token vai para sessionStorage por padrao e para localStorage so se a pessoa pedir.
const TOKEN = 'atlas-token', USER = 'atlas-user'
let memory: string | null = null
const safe = <T>(fn: () => T, d: T | null = null): T | null => { try { return fn() } catch { return d } }
export const credentials = {
  token(): string | null { return memory ?? safe(() => sessionStorage.getItem(TOKEN)) ?? safe(() => localStorage.getItem(TOKEN)) },
  remembered(): boolean { return Boolean(safe(() => localStorage.getItem(TOKEN))) },
  saveToken(token: string, remember: boolean): void {
    this.clearToken()
    if (!token) return
    memory = token
    safe(() => (remember ? localStorage : sessionStorage).setItem(TOKEN, token))
  },
  clearToken(): void { memory = null; safe(() => { sessionStorage.removeItem(TOKEN); localStorage.removeItem(TOKEN) }) },
  user(): string { return safe(() => localStorage.getItem(USER)) || '' },
  saveUser(user: string): void { safe(() => localStorage.setItem(USER, user)) },
  clearAll(): void { this.clearToken(); safe(() => localStorage.removeItem(USER)) },
}
