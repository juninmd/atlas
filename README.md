# Atlas

Catálogo e raio-X dos seus repositórios do GitHub, **100% no navegador**. Funciona para qualquer usuário: informe o usuário (e, se quiser os privados, um token) e o Atlas mostra todos os repositórios com status, pontuação de saúde, riscos com sugestão de correção e a stack de cada um.

Não há servidor, usuário fixo nem credencial no código. Tudo é buscado direto em `api.github.com` pelo seu navegador.

## Visões

| Visão | Para quê |
|---|---|
| Constelação | Um ponto por repositório, agrupado por linguagem. Cor por status ou linguagem. |
| Grade | Cards com busca, filtros (status, linguagem, categoria, topic, tipo, origem) e ordenação. |
| Deck | Um repositório por vez, com o README ao lado. |
| Saúde | Mosaico por status com a pontuação de cada repositório. |
| Quem usa? | Quais repositórios usam uma tecnologia, quais têm mais riscos e quais não têm CI. |

Atalhos: `Ctrl K` paleta de comandos, `/` busca, `← →` no Deck.

## Como o raio-X funciona

- **Status** (ativo, manutenção, experimento, abandonado): vem da data do último push, de o repositório estar arquivado e de ele ter licença, descrição, topics e CI.
- **Riscos e melhorias**: sem licença, parado há mais de um ano, sem descrição ou topics, muitas issues abertas. Cada risco traz como corrigir.
- **Análise a fundo** (botão "Analisar stack e CI"): lê a árvore de arquivos, os manifestos (`package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Dockerfile`) e os workflows. Acrescenta riscos de CI, lockfile e imagem Docker sem versão fixa, e alimenta o "Quem usa?". Custa cerca de 6 consultas por repositório, então exige token. Para e retoma de onde parou quando a cota acaba.
- **Saúde** (0 a 99): heurística sobre status, atividade recente e riscos.

## Credenciais e privacidade

- Sem token: só repositórios públicos, 60 consultas por hora. Com token: privados incluídos e 5.000 por hora.
- Use um token **fine-grained somente leitura** (Contents e Metadata). O token fica em `sessionStorage` (some ao fechar a aba) ou, se você marcar "Lembrar", em `localStorage`.
- O token só é enviado para `api.github.com`. Nunca vai para URL, log ou arquivo, e erros passam por um filtro que remove padrões de token.
- A página usa Content-Security-Policy estrita: `script-src 'self'` e `connect-src 'self' https://api.github.com`. Não há scripts de terceiros.
- O inventário e o índice de stack ficam em cache no IndexedDB deste navegador. **Sair e apagar dados** limpa credenciais e cache.
- READMEs renderizam com HTML desativado, links só http/https e imagens trocadas pela legenda.
- Fichas pessoais (finalidade e categorias) e itens removidos ficam só no navegador e não alteram nada no GitHub.
- O build é verificado: `scripts/pwa.mjs` e os testes E2E falham se houver credencial ou usuário embutido nos arquivos publicados.

## Desenvolvimento

Node >= 18 e pnpm 10.

```bash
pnpm install
pnpm dev            # http://127.0.0.1:5173
pnpm build          # gera dist/ (ATLAS_BASE=/atlas/ para subcaminho)
pnpm test           # unitários
pnpm test:e2e       # Playwright contra dist/, com a API do GitHub simulada
```

`src/core/` roda no navegador e no Node: cliente do GitHub, categorização, análise de stack e raio-X.

## Publicar no GitHub Pages

Em **Settings → Pages**, escolha **Source: GitHub Actions**. O workflow `pages.yml` testa, compila com `ATLAS_BASE=/<repositório>/` e publica.

## CLI e agentes (opcional)

Usam a credencial do `gh` ou `GH_TOKEN`, só no processo Node.

```bash
pnpm topics:plan | topics:apply | topics:verify   # organiza topics no GitHub
pnpm stack:collect | stack:who <dep> | stack:report
pnpm mcp                                          # servidor MCP (stdio)
```

Ferramentas MCP: `list_repos`, `search_repos`, `get_repo`, `list_categories`, `list_risks`, `who_uses`. Por padrão só repositórios públicos; `ATLAS_INCLUDE_PRIVATE=1` inclui os privados. O `.mcp.json` registra o servidor `atlas`.
