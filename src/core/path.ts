// Subconjunto de node:path/posix que roda no navegador.
export const posix = {
  basename: (p: string): string => p.split('/').pop() ?? '',
  dirname: (p: string) => { const i = p.lastIndexOf('/'); return i < 0 ? '.' : p.slice(0, i) },
  join: (...parts: string[]) => parts.filter(Boolean).join('/'),
}
