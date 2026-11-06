---
name: snapshot
description: "Mantém docs/spec/snapshots/ (estrutura, rotas, entidades, schema, migrations, integrações, fluxogramas) gerado a partir de app/. Sintaxe `python3 .claude/skills/snapshot/scripts/snapshot.py [--check]`."
---

# snapshot

Gera os sete arquivos de `docs/spec/snapshots/` a partir de `app/`, para quem chega ter um mapa da aplicação sem manter nada à mão. Os nomes dos arquivos são os mesmos do Hospital: `ESTRUTURA.md`, `ROTAS.md`, `ENTIDADES.md`, `SCHEMA.md`, `MIGRATIONS.md`, `INTEGRACOES.md` e `FLUXOGRAMAS.md`.

## Como rodar

```bash
python3 .claude/skills/snapshot/scripts/snapshot.py           # regenera o que mudou
python3 .claude/skills/snapshot/scripts/snapshot.py --check   # só confere: sai com 1 e lista o que mudaria
```

O script não commita. Quem roda decide se o resultado entra no PR.

## O que cada arquivo traz

| Arquivo | Fonte |
|---|---|
| `ESTRUTURA.md` | Árvore de `app/`, dois níveis, sem `node_modules/` nem `dist/`. |
| `ROTAS.md` | As `<Route>` de `app/src/App.jsx` (React Router 7), com os cargos que cada guard deixa passar; nomes em `app/src/auth/permissions.js`. |
| `ENTIDADES.md` | Ficha de cada tabela reconstruída das migrations (colunas, constraints, default, FK, indexes). |
| `SCHEMA.md` | Diagrama ER (Mermaid) das mesmas tabelas e os indexes. |
| `MIGRATIONS.md` | Uma linha por `.sql` de `app/supabase/migrations/`, com o primeiro comentário como resumo. |
| `INTEGRACOES.md` | O nome das chaves do `app/.env.example` e dos secrets que as Edge Functions leem com `Deno.env.get`, por serviço (Supabase, Gemini, Groq, WhatsApp, Vercel). Nunca o valor. |
| `FLUXOGRAMAS.md` | O diagrama de contexto (app no centro, serviços em volta) no subset Mermaid que o dashboard desenha. |

O formato é o do `/snapshot` do Hospital, que a Página do Projeto no PedroOS lê (aba Áreas). O que o parser de SQL não entende (ALTER em tabela que nenhuma migration criou, como `usuarios`; ALTER montado com `format()` em bloco DO) sai como aviso no stderr.
