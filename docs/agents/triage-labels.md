# Labels de triage

As skills falam em **5 papéis canônicos** de triage. Esta página mapeia cada papel para a label real no GitHub do IAE e lista todas as outras labels do repo. Os nomes técnicos ficam em inglês (são identificadores estáveis que as skills aplicam); o significado vem em pt-BR.

As labels são as do Hospital mais `area:video` (PRD #1). Quem cria label nova no GitHub acrescenta a linha aqui no mesmo PR: o teste `tools/test_docs_fluxo.py` confere que esta página e o repo têm a mesma lista.

## Papéis de triage

| Label | Papel (mattpocock/skills) | Significado |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Precisa de avaliação antes de virar trabalho |
| `needs-info` | `needs-info` | Aguardando mais informação de quem reportou |
| `ready-for-agent` | `ready-for-agent` | Especificada por completo; um agente pega sem precisar de contexto humano |
| `ready-for-human` | `ready-for-human` | Precisa de implementação ou decisão humana |
| `wontfix` | `wontfix` | Não será tratada |

Quando uma skill mencionar um papel (ex.: "aplique a label de AFK-ready"), use a label da primeira coluna.

## Apoio ao paralelismo

| Label | Significado |
| --- | --- |
| `in-progress` | Uma sessão deu claim e está trabalhando; a issue sai da fila `ready-for-agent` |

Bloqueio entre issues não tem label: é a **dependência nativa** do GitHub ("blocked by"), e a fila filtra com `-is:blocked`. Veja `docs/agents/issue-tracker.md`.

## Loop do revisor

| Label | Significado |
| --- | --- |
| `revisor-comentou` | Um login de `REVIEWER_LOGINS` comentou na issue; curadoria pendente: o agente lê, classifica, age com aprovação humana e tira a label no fim |

Quem acende a label é a Action de higiene (`.github/workflows/higiene-issues.yml`) em `issue_comment.created`. A Action **só sinaliza**, nunca reabre nem edita. Comentário em PR e comentário com o marcador `<!-- automacao -->` não acendem. O acesso do revisor e a variável `REVIEWER_LOGINS` estão em `docs/agents/issue-tracker.md`.

## Tamanho da fatia

Família descritiva, não de estado. O `/to-issues` aplica uma por fatia na quebra do PRD, nunca no PRD.

| Label | Significado |
| --- | --- |
| `fatia:P` | Pequena: poucas horas, escopo contido |
| `fatia:M` | Média: meio período, fatia vertical completa |
| `fatia:G` | Grande: dia cheio ou mais, mais risco (muitas camadas, tela nova, integração externa) |

O IAE OS agrupa essas labels no filtro `fatia:` da aba Issues, e a `/onda-enxuta` escolhe por elas o esforço do implementador.

## Natureza da mudança

Dizem **o que** é a mudança, não o estado dela. Alimentam o tipo do PR e do commit.

| Label | Significado |
| --- | --- |
| `type:feature` | Funcionalidade nova |
| `type:fix` | Correção de bug |
| `type:chore` | Manutenção (dependências, build, lint, doc) |
| `type:refactor` | Refactor sem mudar comportamento |
| `type:docs` | Documentação |
| `type:spec` | Mudança em `docs/spec/` ou nas skills |
| `type:test` | Testes |

## Área

Onde a mudança incide. A pasta do app é `plataforma/`.

| Label | Significado |
| --- | --- |
| `area:backend` | Backend em `plataforma/` |
| `area:frontend` | Frontend em `plataforma/` |
| `area:supabase` | Migrations, schema e políticas de acesso do banco |
| `area:infra` | `.github/` e deploy |
| `area:docs` | `docs/` fora de `docs/spec/`, `README.md`, `CLAUDE.md` |
| `area:skills` | `.claude/skills/` |
| `area:spec` | `docs/spec/` |
| `area:video` | Trabalho de vídeo: roteiro, gravação, edição e render |

## Wayfinding

Usadas só pela skill `/wayfinder`, antes de existir PRD. Ticket wayfinder nunca recebe `ready-for-agent`. Protocolo em `docs/agents/issue-tracker.md`.

| Label | Significado |
| --- | --- |
| `wayfinder:map` | O mapa: planejamento em várias sessões |
| `wayfinder:research` | Ticket de pesquisa, roda sem humano |
| `wayfinder:prototype` | Ticket de protótipo, com humano |
| `wayfinder:grilling` | Ticket de entrevista, com humano |
| `wayfinder:task` | Tarefa que destrava uma decisão |

## Labels de fábrica do GitHub

Vieram com o repo. Ficam, mas o fluxo não as usa: estado é triage, natureza é `type:*`.

| Label | Significado |
| --- | --- |
| `bug` | Algo não funciona |
| `enhancement` | Pedido de funcionalidade |
| `documentation` | Melhoria na documentação |
| `question` | Pergunta |
| `duplicate` | Issue ou PR repetido |
| `invalid` | Não procede |
| `good first issue` | Boa para quem está começando |
| `help wanted` | Precisa de ajuda |
| `accessibility` | Barreira para pessoas com deficiência |
