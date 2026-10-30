# INTEGRACOES.md
<!-- gerado por /snapshot; não editar à mão -->

Serviços externos do Diduccio. Só o nome das chaves, nunca o valor: as `VITE_*` vão para o bundle
(lidas de `app/.env.example`), as outras vivem nos Secrets do projeto Supabase e são lidas
pelas Edge Functions com `Deno.env.get`.

## Supabase
**Pra que serve:** Auth (login por CPF pela Edge Function `entrar`), Postgres com RLS, Storage dos anexos e as Edge Functions
**Onde aparece no código:** `src/api/config.js`, `src/api/edge.js`, `src/api/supabase.js`
**Secret/env primária:** `VITE_SUPABASE_URL`
**Variáveis relacionadas:** `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
**Secrets das Edge Functions:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
**Edge Functions:** `criar-usuario` (Cria conta de usuário do sistema); `entrar` (Login: resolve o identificador, conta as tentativas e devolve a sessão); `gerir-usuario` (Edita, reseta senha e exclui usuários do sistema); `ia` (Proxy de IA: gera comunicado e resume ata de assembleia); `receita` (Os números do gráfico de receita, sem os dados pessoais que vêm junto)

## Gemini
**Pra que serve:** Modelos de texto da função `ia` (comunicado, resumo e perguntas às atas); primeiro provedor da cascata
**Onde aparece no código:** `supabase/functions/ia/cascata.ts`, `supabase/functions/ia/index.ts`
**Secret/env primária:** `GEMINI_API_KEY`
**Variáveis relacionadas:** `GEMINI_API_KEY_B`
**Secrets das Edge Functions:** `GEMINI_API_KEY`, `GEMINI_API_KEY_B`

## Groq
**Pra que serve:** Segundo provedor da cascata da função `ia`, quando o Gemini falha ou está sobrecarregado
**Onde aparece no código:** `supabase/functions/ia/cascata.ts`, `supabase/functions/ia/index.ts`
**Secret/env primária:** `GROQ_API_KEY`
**Secrets das Edge Functions:** `GROQ_API_KEY`

## WhatsApp
**Pra que serve:** Click-to-chat: o app abre `wa.me` ou `api.whatsapp.com/send` com a mensagem pronta; sem API nem chave
**Onde aparece no código:** `src/pages/Confirmacao.jsx`, `src/pages/Encomendas.jsx`, `src/pages/Moradores.jsx`

## Vercel
**Pra que serve:** Hospedagem do build; `vercel.json` reescreve tudo para `index.html` e manda os cabeçalhos de segurança (CSP, HSTS)
**Onde aparece no código:** `vercel.json`

## Apps Script (herança)
**Pra que serve:** Backend antigo; só a presença de `VITE_API_URL` ainda importa: sem ela, ou com `VITE_DEMO=true`, o app sobe em modo demo com dados fictícios
**Onde aparece no código:** `src/api/config.js`
**Secret/env primária:** `VITE_API_URL`
**Variáveis relacionadas:** `VITE_SHEETS_TOKEN`, `VITE_DEMO`

## Outras chaves do .env.example
**Pra que serve:** Chaves que não pertencem a nenhum serviço acima; o comentário no `.env.example` diz para que servem
**Variáveis relacionadas:** `SENHA_PEPPER`

---
**Resumo:** 7 integrações externas.
