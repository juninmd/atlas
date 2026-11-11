// Pos-build: gera manifest e service worker (so o shell estatico) e barra o publish se achar credencial nos arquivos.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const root = 'dist'
const base = process.env.ATLAS_BASE || '/'
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('ATLAS_BASE inválido; use / ou /atlas/.')
const files = []
async function walk(path = '') {
  for (const entry of await readdir(root + '/' + path, { withFileTypes: true })) {
    const name = path + entry.name
    if (entry.isDirectory()) await walk(name + '/')
    else if (!name.endsWith('.map') && !['sw.js', 'manifest.webmanifest'].includes(name)) files.push(name)
  }
}
await walk()
const secret = /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [^-]*PRIVATE KEY-----/
const env = [process.env.GH_TOKEN, process.env.GITHUB_TOKEN].filter(t => t && t.length >= 8)
const hash = createHash('sha256')
for (const file of files.sort()) {
  const content = await readFile(root + '/' + file)
  const text = content.toString('latin1')
  if (secret.test(text) || env.some(t => text.includes(t))) throw new Error(`Publicação bloqueada: credencial detectada em ${file}.`)
  hash.update(content)
}
const manifest = { id: base, name: 'Atlas · Biblioteca de aplicações', short_name: 'Atlas', lang: 'pt-BR', start_url: base, scope: base,
  display: 'standalone', background_color: '#090c16', theme_color: '#090c16', icons: [
    { src: base + 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: base + 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ] }
await writeFile(root + '/manifest.webmanifest', JSON.stringify(manifest))
const urls = [base, base + 'manifest.webmanifest', ...files.map(f => base + f)]
// O service worker guarda apenas arquivos do proprio dominio. Chamadas a api.github.com nunca passam por ele.
await writeFile(root + '/sw.js', `const CACHE = 'atlas-shell-${hash.digest('hex').slice(0, 16)}';
const URLS = ${JSON.stringify(urls)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('atlas-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? caches.match('${base}') : Response.error())));
});
`)
console.log('PWA gerada: só o shell estático é guardado; a API do GitHub nunca passa pelo cache do service worker.')
