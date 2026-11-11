// Credenciais ficam so neste navegador. O token vai para sessionStorage por padrao e para localStorage so se a pessoa pedir.
const TOKEN = 'atlas-token', USER = 'atlas-user'
let memory = null
const safe = (fn, d = null) => { try { return fn() } catch { return d } }
export const credentials = {
  token() { return memory ?? safe(() => sessionStorage.getItem(TOKEN)) ?? safe(() => localStorage.getItem(TOKEN)) },
  remembered() { return Boolean(safe(() => localStorage.getItem(TOKEN))) },
  saveToken(token, remember) {
    this.clearToken()
    if (!token) return
    memory = token
    safe(() => (remember ? localStorage : sessionStorage).setItem(TOKEN, token))
  },
  clearToken() { memory = null; safe(() => { sessionStorage.removeItem(TOKEN); localStorage.removeItem(TOKEN) }) },
  user() { return safe(() => localStorage.getItem(USER)) || '' },
  saveUser(user) { safe(() => localStorage.setItem(USER, user)) },
  clearAll() { this.clearToken(); safe(() => localStorage.removeItem(USER)) },
}
