import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Pages publica em /<repositorio>/: defina ATLAS_BASE=/atlas/ no build. O app nao tem usuario nem credencial embutidos.
const csp = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
  "connect-src 'self' https://api.github.com", "object-src 'none'", "base-uri 'self'", "form-action 'none'", "manifest-src 'self'", "worker-src 'self'",
].join('; ')
const cspPlugin = () => ({
  name: 'atlas-csp', apply: 'build',
  transformIndexHtml: html => html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">`),
})
export default defineConfig({ base: process.env.ATLAS_BASE || '/', plugins: [vue(), cspPlugin()], server: { host: '127.0.0.1' } })
