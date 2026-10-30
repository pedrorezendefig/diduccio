# Stack

O que o projeto usa hoje e o que está previsto. Peça nova na stack entra aqui, no mesmo PR que a traz. O Diduccio OS mostra este arquivo na Documentação, sub-aba Stack.

## Hoje: o app em `app/`

Base importada do ViT (`novorecreio351-droid/sistema-condominio`), o sistema do condomínio do Lucas, com o nome e a marca trocados.

| Peça | Para que serve |
|---|---|
| React 19 com Vite 7, JavaScript puro (JSX) | o app: telas de portaria, encomendas, cadastros, reservas e administração |
| react-router-dom 7 | as rotas, liberadas por cargo em `app/src/App.jsx` e `app/src/auth/permissions.js` |
| CSS puro com tokens em `app/src/styles/tokens.css` | o design system próprio em `app/src/ui/`; sem Tailwind em uso |
| Supabase (Postgres, Auth, Storage, Edge Functions) | banco com RLS por cargo, login por e-mail ou CPF, bucket privado `anexos`, funções `entrar`, `criar-usuario`, `gerir-usuario`, `ia`, `receita` |
| Gemini e Groq | a função `ia`: resumo de ata, comunicado e perguntas sobre as atas |
| jsPDF, html2canvas, xlsx | PDF e planilha gerados no navegador |
| PWA (manifest e service worker) | o app instalável no celular; o SW guarda só a casca |
| Vitest e Testing Library, ESLint 9 | os gates de teste e lint (`npm test`, `npm run lint`, `npm run build`) |

## Hoje: Diduccio OS

| Peça | Para que serve |
|---|---|
| Python 3.12, só a biblioteca padrão | o coletor e o servidor do painel (`tools/workflow-dashboard/`), sem dependências para instalar |
| HTML, CSS e JavaScript sem build | o front do painel, servido como arquivos estáticos; o `marked` vem copiado em `static/vendor/` |
| `gh` (GitHub CLI) | a fonte dos dados do painel: issues, PRs e comentários |
| GitHub Actions | o CI dos PRs (gates do app, testes de `tools/` e o lint de texto) |
| pytest e Node | os testes do painel; o Node roda o `app.js` de verdade nos testes |

## Prevista

Nada desta lista existe ainda. Cada peça entra na tabela de cima quando o primeiro PR com ela for mergeado.

| Peça | Papel previsto |
|---|---|
| Vercel | o deploy do app, como na origem (previsto; ainda não há deploy) |
| Supabase local no Docker (`supabase start`) | o banco de desenvolvimento com dados falsos, sem dado real de morador (previsto) |
| Web Push (service worker + VAPID) | o aviso de encomenda no celular do morador, sem loja de aplicativos (previsto) |
| Cargo de morador | o app do morador: ver encomendas, receber o aviso, confirmar a retirada (previsto) |
