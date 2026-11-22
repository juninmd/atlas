# AGENTS.md

Instruções para agentes que trabalham neste repositório.

## Stack

- **TypeScript** (`strict`) + Vue 3 + Vite. SPA estática publicada no GitHub Pages. Node >= 22.18 (executa `.ts` sem compilar), pnpm 10.
- `src/core/` é isomórfico (navegador e Node): cliente do GitHub, catálogo, stack, raio-X, tipos.
- `scripts/` são CLIs Node opcionais (topics, stack, MCP, pós-build da PWA).

## Comandos

- `pnpm check`: typecheck + testes (obrigatório antes de commit).
- `pnpm build && pnpm test:e2e`: o E2E roda contra o build, então rode `pnpm build` antes.
- `pnpm dev`: servidor de desenvolvimento.

## Estrutura

```
src/core/        núcleo isomórfico (+ *.test.ts) e types.ts
src/lib/         credenciais, IndexedDB, constelação, markdown seguro, formatação
src/components/  views, painel, paleta e pop-up de conexão (<script setup lang="ts">)
src/store.ts     estado reativo, conexão, análise, filtros
scripts/         CLIs, MCP e pwa.ts
tests/           E2E Playwright (API do GitHub simulada)
```

## Convenções

- **TypeScript**: sem `any` implícito. Importe com a extensão `.ts`, use `import type` para tipos. Não use `enum`, `namespace` nem parameter properties (`erasableSyntaxOnly`: o Node roda `.ts` só removendo tipos). Tipos compartilhados ficam em `src/core/types.ts`.
- **Nada hardcoded.** Nenhum usuário, token, repositório ou dado pessoal no código ou no build. O teste E2E "build sem nada hardcoded" precisa continuar passando.
- **Token**: só em `src/lib/credentials.ts`, nunca em URL, log, mensagem de erro ou arquivo. Só vai para `api.github.com`. Mantenha a CSP do `vite.config.ts` (`script-src 'self'`, `connect-src 'self' https://api.github.com`) e não adicione scripts de terceiros.
- Mudou o cálculo do raio-X? Atualize `src/core/analyze.ts` e `analyze.test.ts` juntos, e a tabela do README.
- Chamadas à API passam por `createClient` (`src/core/github.ts`), que trata cota, retry e erros.

## Gotchas

- O E2E usa o build de produção. Sem `pnpm build` antes, ele testa a versão antiga.

<!-- base-actions-main-policy -->
## GitHub Actions — padrão obrigatório (@main)

- Referencie as actions internas sempre pelo branch, nunca por SHA:
  - `uses: juninmd/base-actions/<action>@main`
  - `uses: juninmd/base-actions/.github/workflows/<arquivo>.yml@main`
- Não fixe `@<sha>` em `juninmd/base-actions`: a atualização é centralizada no
  `main` e passa a valer no próximo run.
- PRs cujos checks não iniciam por billing/spending limit são mesclados pelo bot central
  `juninmd/base-actions/.github/workflows/auto-merge-billing-blocked.yml`.
  Para impedir o merge automático de um PR, aplique a label `do-not-merge`.
