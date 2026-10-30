---
name: snapshot
description: "Mantém docs/spec/snapshots/ (estrutura, rotas, entidades, schema, migrations, integrações, fluxogramas) gerado a partir de plataforma/. Sintaxe `python3 .claude/skills/snapshot/scripts/snapshot.py [--check]`."
---

# snapshot

Gera os sete arquivos de `docs/spec/snapshots/` a partir de `plataforma/`, para quem chega ter um mapa da aplicação sem manter nada à mão. Os nomes dos arquivos são os mesmos do Hospital: `ESTRUTURA.md`, `ROTAS.md`, `ENTIDADES.md`, `SCHEMA.md`, `MIGRATIONS.md`, `INTEGRACOES.md` e `FLUXOGRAMAS.md`.

## Como rodar

```bash
python3 .claude/skills/snapshot/scripts/snapshot.py           # regenera o que mudou
python3 .claude/skills/snapshot/scripts/snapshot.py --check   # só confere: sai com 1 e lista o que mudaria
```

O script não commita. Quem roda decide se o resultado entra no PR.

## O que cada arquivo traz hoje

| Arquivo | Fonte |
|---|---|
| `ESTRUTURA.md` | Árvore de `plataforma/`, dois níveis. |
| `MIGRATIONS.md` | Os `.sql` de `plataforma/supabase/migrations/`. |
| `INTEGRACOES.md` | O nome das chaves dos `.env.example` de `plataforma/`, nunca o valor. |
| `ROTAS.md`, `ENTIDADES.md`, `SCHEMA.md`, `FLUXOGRAMAS.md` | Uma linha dizendo que a stack ainda não foi escolhida. |

Enquanto `plataforma/` não existe, todos saem com uma linha dizendo isso. Quando a stack for escolhida, o gerador de rotas, entidades e schema entra no `scripts/snapshot.py`, usando o `/snapshot` do Hospital como modelo de formato.
