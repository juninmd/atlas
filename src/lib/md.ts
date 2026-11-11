// Renderizador de README seguro: HTML desativado, links so http/https, imagens viram legenda.
import MarkdownIt from 'markdown-it'
export function createRenderer(baseFor?: () => string): (text: string) => string {
  const md = new MarkdownIt({ html: false, linkify: false, breaks: false })
  md.renderer.rules.image = (tokens, i) => `<span class="image-note">[Imagem: ${md.utils.escapeHtml(tokens[i]!.content)}]</span>`
  const original = md.renderer.rules.link_open || ((t, i, o, _e, s) => s.renderToken(t, i, o))
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!, href = String(token.attrGet('href') ?? '')
    try {
      const url = new URL(href, baseFor?.() || 'https://github.com/')
      token.attrSet('href', ['https:', 'http:'].includes(url.protocol) ? url.href : '#')
    } catch { token.attrSet('href', '#') }
    token.attrSet('target', '_blank'); token.attrSet('rel', 'noopener noreferrer')
    return original(tokens, idx, options, env, self)
  }
  return text => md.render(String(text || ''))
}
