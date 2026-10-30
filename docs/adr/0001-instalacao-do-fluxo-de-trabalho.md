---
status: accepted
---

# O fluxo de trabalho do Diduccio é uma cópia solta do IAE OS

O Diduccio precisa do mesmo fluxo de trabalho do Hospital e do IAE: issues no GitHub, skills que levam da ideia ao PR mergeado, e um painel local que mostra tudo. Copiamos o kit do IAE (`pedrorezendefig/iae`, commit `7bb2260`, em 2026-10-30), que por sua vez é a cópia solta do Hospital (ADR 0001 do IAE). Escolhemos o IAE como origem porque ele é a variante sem plataforma de deploy, o mesmo caso do Diduccio hoje. Depois da cópia, cada OS evolui sozinho.

## O que foi decidido na instalação

| Pergunta | Decisão |
|---|---|
| Nome e slug | Diduccio, `diduccio`. O painel é o Diduccio OS, serviço `com.diduccio.workflow-dashboard` na porta 8801 |
| Router | `/ask-diduccio` |
| Plataforma de deploy | Nenhuma ainda. O `/deploy` é um stub com o modo `status`; a subida (`fechar_onda.py`) termina no merge |
| Fonte da versão | `version` do `app/package.json`, começando em `0.1.0` |
| Gates | `npm run lint`, `npm test` e `npm run build` dentro de `app/` (job `app` do `ci.yml`), mais `pytest tools/` e o lint de travessão (job `ferramenta`) |
| Áreas do Mapa | Portaria, Moradores, Reservas, Administração, Infra. São também as labels `area:*` |
| Paleta | Vermelho claro `#d4432a` como marca (o mesmo `brand-600` do app, issue #7), marrom `#2a1a10` no trilho, fundo branco e superfície quente |
| Fontes | Plus Jakarta Sans no texto, Geist Mono em sha e comando |
| Cofre de chaves | 1Password |

## O app

O código em `app/` é um fork do ViT (`novorecreio351-droid/sistema-condominio`, commit `a179ab2`), o sistema do condomínio do Lucas, com o nome do condomínio e o project ref do Supabase trocados e os protótipos HTML removidos. O lint herdado tem 15 erros (regras `react-refresh` e `react-hooks`), que viram a primeira issue do repositório. A migration 0013 e as 0046 a 0062 não vieram no export de origem.

## As regras que vieram junto

Cada parágrafo resume uma ADR do Hospital, a origem do fluxo. O texto completo está no repositório do Hospital.

- **Sem travessão** ([0013](https://github.com/pedrorezendefig/hospital-reunioes/blob/main/docs/adr/0013-saida-ia-sem-travessao-sanitizador.md)): nenhum travessão nem meia-risca em texto que alguém lê. É marca de texto gerado por IA. O CI trava.
- **Ciclo de vida da issue** ([0020](https://github.com/pedrorezendefig/hospital-reunioes/blob/main/docs/adr/0020-ciclo-de-vida-da-issue-status-fiel-e-loop-do-diretor.md)): a issue nasce `needs-triage`, vira `ready-for-agent` quando está especificada, recebe `in-progress` no claim e fecha pelo PR. Labels de estado saem no fechamento.
- **Onda** ([0022](https://github.com/pedrorezendefig/hospital-reunioes/blob/main/docs/adr/0022-onda-execucao-autonoma-da-fila.md)): a `/onda-enxuta` roda a fila `ready-for-agent` em lote, AFK, com a mesma subida que o `/ship` usa para um PR só.
- **Diagramas do painel** ([0025](https://github.com/pedrorezendefig/hospital-reunioes/blob/main/docs/adr/0025-dashboard-diagramas-renderer-proprio.md)): os snapshots trazem diagramas num subset de Mermaid que o painel desenha sem dependência.
- **Wayfinder** ([0027](https://github.com/pedrorezendefig/hospital-reunioes/blob/main/docs/adr/0027-wayfinder-on-ramp-situacional.md)): antes de existir PRD, o planejamento em várias sessões vive em tickets `wayfinder:*`, que nunca entram na fila do agente.
- **Bloqueio nativo** ([0028](https://github.com/pedrorezendefig/hospital-reunioes/blob/main/docs/adr/0028-bloqueio-por-dependencia-nativa.md)): dependência entre issues é o "blocked by" do GitHub; só entra na fila quem não tem bloqueio aberto.
- **Skills locais** ([0043](https://github.com/pedrorezendefig/hospital-reunioes/blob/main/docs/adr/0043-skills-locais-sao-o-kit-do-workflow.md)): as skills do fluxo são forks em `.claude/skills/`, em pt-BR, não o plugin global do Matt Pocock.
- **Layout do repositório** ([0044](https://github.com/pedrorezendefig/hospital-reunioes/blob/main/docs/adr/0044-layout-do-repositorio.md)): o app numa pasta própria, `tools/` com os lints e o painel, `docs/` com ADR, agentes, onboarding e spec. Estado de trabalho vive nas Issues e nos JSONs de deploy, nunca em doc paralelo.
