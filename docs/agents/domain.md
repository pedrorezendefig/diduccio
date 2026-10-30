# Docs de domínio

Como as skills de engenharia devem consumir a documentação deste repo ao explorar o código.

## Antes de explorar, leia

- **`CONTEXT.md`** (na raiz): o glossário do projeto. Use a terminologia daqui em títulos de issue, hipóteses, nomes de teste e propostas de refactor. Não troque por sinônimos que o glossário pede para evitar.
- **`docs/adr/`**: leia as ADRs que tocam a área em que vai trabalhar. Decisões difíceis de desfazer, ou que surpreenderiam quem chega, vivem aqui.
- **`docs/spec/snapshots/`**: referência **factual e mecânica** do app, gerada do código pelo `/snapshot`: `ROTAS.md` (endpoints), `ENTIDADES.md` e `SCHEMA.md` (tabelas e chaves), `MIGRATIONS.md`, `INTEGRACOES.md`. Quando precisar saber qual rota ou tabela existe hoje, olhe aqui em vez de adivinhar. Enquanto `plataforma/` não tem código, os arquivos só dizem isso.

Se algum desses arquivos não existir, **siga em silêncio**. Não sinalize a ausência nem sugira criá-los de antemão: `CONTEXT.md` e ADRs nascem sob demanda no `/grill-with-docs`, quando um termo ou uma decisão de fato se resolve.

> **Distinção importante:** `CONTEXT.md` responde "o que os termos do domínio significam" (curado por humano, muda pouco). Os snapshots respondem "qual o estado mecânico do app agora" (gerados por máquina, mudam com o código). Um não substitui o outro.

## Layout

**Um contexto só** (este repo): um `CONTEXT.md` na raiz e `docs/adr/`. Não há `CONTEXT-MAP.md`.

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   └── 0001-iae-os-e-uma-copia-solta-do-hospital-os.md
│   ├── agents/          ← este diretório (config das skills)
│   └── spec/snapshots/  ← referência factual do app
└── plataforma/          ← o app (Plataforma de cursos), quando o código começar
```

## Status de uma ADR

Toda ADR tem frontmatter com `status:` de um conjunto fechado:

- **accepted**: decisão em vigor. É a única que você segue como regra atual.
- **superseded**: substituída por outra; vale como histórico. Traz `superseded_by: NNNN`.
- **deprecated**: não vale mais, sem substituta direta.
- **proposed** e **rejected**: em discussão, ou recusada.

Ao consultar ADRs para decidir como implementar, **filtre por `status: accepted`**. Leia as demais só quando quiser entender por que algo mudou.

A supersessão e a emenda são **bidirecionais**: se a ADR A traz `superseded_by: B` (ou `amended_by: B`), a ADR B traz o par `supersedes: A` (ou `amends: A`). Os quatro campos aceitam lista (`amends: 0003, 0004`). O CI (`lint-adr`, via `tools/lint_adr.py`) trava frontmatter faltando, status fora do conjunto, ponteiro sem o par de volta e ADR que falta no índice `docs/adr/README.md`.

## Conflito com ADR

Se o que você vai propor contradiz uma ADR, **diga isso** em vez de sobrescrever em silêncio:

> _Contradiz a ADR 0001 (cópia solta do Hospital OS), mas vale reabrir porque..._
