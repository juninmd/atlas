// Subconjunto de node:path/posix que roda no navegador.
export const posix = {
  basename: p => p.split('/').pop(),
  dirname: p => { const i = p.lastIndexOf('/'); return i < 0 ? '.' : p.slice(0, i) },
  join: (...parts) => parts.filter(Boolean).join('/'),
}
