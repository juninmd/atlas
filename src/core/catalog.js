import MarkdownIt from 'markdown-it'
const parser = new MarkdownIt({ html: false })
export function readmeSummary(text) {
  text = text.replace(/^```markdown\s*\n/i, '').replace(/\n```\s*$/, '')
  const tokens = parser.parse(text, {})
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token.type !== 'inline' || !['paragraph_open', 'heading_open'].includes(tokens[index - 1]?.type)) continue
    const content = (token.children || []).filter(t => ['text', 'code_inline'].includes(t.type)).map(t => t.content).join(' ').trim()
    if (content.length < 45 || /^https?:|^(?:git clone|npm |pnpm |yarn |cd |cargo |pip )|^<|standard software project|installation|install dependencies|configure|clone the repository/i.test(content)) continue
    if (tokens[index - 1]?.type === 'heading_open' && content.length < 45) continue
    return content.slice(0, 420)
  }
  return ''
}
export const categories = [
  { name: 'APIs e serviços', topic: 'backend', pattern: /\b(api|apis|backend|fastapi|express|nestjs)\b/i },
  { name: 'Documentação e estudos', topic: 'documentation', pattern: /\b(documentation|docs|tutorial|estudos|documentação)\b/i },
  { name: 'Design e recursos', topic: 'design-assets', pattern: /\b(brand|branding|logo|logos|design assets)\b/i },
  { name: 'Inteligência artificial', topic: 'artificial-intelligence', pattern: /\b(ai|llm|gpt|agent|agents|chatbot|ollama|vtuber)\b|intelig[eê]ncia artificial/i },
  { name: 'Automação e bots', topic: 'automation', pattern: /\b(bot|bots|scraper|automation|automação|monitor|scheduler)\b/i },
  { name: 'Ferramentas de desenvolvimento', topic: 'developer-tools', pattern: /\b(cli|sdk|compiler|developer|devtools|linter|generator)\b/i },
  { name: 'Jogos e mods', topic: 'gaming', pattern: /\b(game|games|gaming|minecraft|goldsrc|amxx|zombie|mod|mods)\b/i },
  { name: 'Infraestrutura', topic: 'infrastructure', pattern: /\b(kubernetes|docker|helm|terraform|devops|infrastructure|gitops)\b/i },
  { name: 'Aplicações web', topic: 'web-application', pattern: /\b(nextjs|vitepress|react|website|webapp|web application|dashboard)\b/i },
  { name: 'Desktop', topic: 'desktop-application', pattern: /\b(electron|tauri|desktop|widget)\b/i },
  { name: 'Mobile', topic: 'mobile-application', pattern: /\b(android|ios|flutter|react-native|expo)\b/i },
]
export const projectTypes = { application: 'Aplicação', library: 'Biblioteca', example: 'Exemplo de estudo', prototype: 'Protótipo', documentation: 'Documentação', assets: 'Recursos de design', placeholder: 'Implementação não confirmada' }
export function enrich(repo, documentation = { status: 'unloaded', text: '' }) {
  const summary = readmeSummary(documentation.text)
  const evidence = `${repo.name.replace(/[-_]/g, ' ')} ${repo.description || summary || ''} ${(repo.topics || []).join(' ')}`
  const matches = categories.filter(c => (repo.topics || []).includes(c.topic) || c.pattern.test(evidence))
  const language = (repo.language || '').toLowerCase().replace('c#', 'csharp').replace('c++', 'cpp').replace(/[^a-z0-9-]/g, '-')
  return { ...repo, categories: matches.map(c => c.name), purpose: repo.description || summary?.slice(0, 420) || 'Finalidade ainda não documentada. Consulte o README e complete a descrição no GitHub.',
    purposeSource: repo.description ? 'Descrição do GitHub' : summary ? 'Trecho do README' : 'Pendente',
    suggestedTopics: [...new Set([...matches.map(c => c.topic), ...(language ? [language] : [])])], readme: documentation }
}
