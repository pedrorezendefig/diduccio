# Acessos: de onde vem cada um

O app em `app/` fala com o Supabase e, pelas Edge Functions, com o Gemini e o Groq. O Diduccio ainda não tem deploy, então não existe `tokens/.env` da plataforma. As chaves do app ficam em `app/.env` (fora do git) e moram no 1Password, no cofre do Diduccio.

## Serviços

| Serviço | Para quê | O que você precisa | Como conseguir |
|---|---|---|---|
| **GitHub** (`pedrorezendefig/diduccio`) | Issues, PRs, CI, merge | Permissão WRITE e `gh auth login` | O Pedro adiciona você como colaborador; depois `gh auth login` |
| **Claude Code** | Skills e agentes do fluxo | A sua conta | Instale com `curl -fsSL https://claude.ai/install.sh \| bash` |
| **Supabase** (projeto do Diduccio) | Banco, login, anexos e Edge Functions | `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em `app/.env`; `SUPABASE_SECRET_KEY` e `SENHA_PEPPER` só nos secrets das funções | 1Password, item "Diduccio Supabase". Para rodar local com dados falsos, `supabase start` em `app/` dá URL e chave próprias |
| **Gemini** | A função `ia` (resumo de ata, comunicado) | `GEMINI_API_KEY` e `GEMINI_API_KEY_B` como secret da Edge Function | 1Password, item "Diduccio Gemini". Sem a chave, a função cai para o Groq |
| **Groq** | Reserva da função `ia` | `GROQ_API_KEY` como secret da Edge Function | 1Password, item "Diduccio Groq" |

Modelo das variáveis do app: `app/.env.example`. Issue e PR não levam senha nem token (regra do `CLAUDE.md`).
