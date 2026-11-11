// Remove credenciais e padroes de segredo de qualquer texto que vira dado ou mensagem de erro.
const secrets = new Set<string>()
export const registerSecret = (value: unknown): void => { if (typeof value === 'string' && value.length >= 8) secrets.add(value) }
export const forgetSecrets = () => secrets.clear()
export function redact(text: unknown = ''): string {
  let out = String(text)
  for (const secret of secrets) out = out.split(secret).join('[credencial removida]')
  return out.replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,})/g, '[credencial removida]')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[chave removida]')
    .replace(/((?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*)["']?[^\s"'<>]{8,}/gi, '$1[valor removido]')
}
