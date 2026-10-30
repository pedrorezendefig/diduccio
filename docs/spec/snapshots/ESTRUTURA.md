# ESTRUTURA.md
<!-- gerado por /snapshot; não editar à mão -->

Pastas de `app/` do Diduccio, dois níveis. Para o detalhe, abra o código.

## Aplicação (React 19 + Vite 7, JSX)

Localização: `app/`

```
app/
├── public/                  # ícones, manifest PWA, service worker e fontes
│   ├── fonts/
│   ├── apple-touch-icon.png
│   ├── favicon.png
│   ├── favicon.svg
│   ├── icone-192-mascara.png
│   ├── icone-192.png
│   ├── icone-512-mascara.png
│   ├── icone-512.png
│   ├── logo.png
│   ├── manifest.webmanifest
│   ├── sw.js
│   ├── template.jpg
│   └── vite.svg
├── src/                     # o app React
│   ├── __tests__/           # vitest
│   ├── api/                 # Supabase, Edge Functions, sessão e autenticação
│   ├── assets/
│   ├── auth/                # cargos (permissions.js), sessão e inatividade
│   ├── brand/               # logo e marcas
│   ├── components/          # componentes compartilhados entre telas
│   ├── demo/                # modo demo com dados fictícios
│   ├── lib/                 # regras e helpers sem React
│   ├── pages/               # uma tela por arquivo; rotas em App.jsx
│   ├── styles/              # CSS por tela
│   ├── theme/               # tema claro/escuro e tokens
│   ├── ui/                  # primitivos do design system
│   ├── App.jsx              # rotas e guard de login
│   ├── index.css
│   └── main.jsx             # ponto de entrada
├── supabase/                # banco e funções
│   ├── functions/           # Edge Functions (Deno), uma pasta por função
│   ├── migrations/          # SQL numerado, aplicado em ordem
│   ├── RECARGA.md           # como recarregar o banco a partir da planilha
│   └── reset-dev.sql        # apaga e recria o schema em dev
├── .env.example             # nomes das variáveis; copiar para .env.local
├── README.md
├── eslint.config.js         # lint
├── index.html               # shell da SPA
├── package-lock.json
├── package.json             # dependências e scripts npm
├── vercel.json              # rewrite da SPA e cabeçalhos de segurança
└── vite.config.js           # build e dev server
```
