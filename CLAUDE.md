# IAE

Repositório dos sócios para o projeto da plataforma de cursos do IAE. O glossário fica em `CONTEXT.md` e as decisões em `docs/adr/`. O mapa das pastas é o `README.md`.

## Regras

- Tudo em pt-BR.
- Sem travessão nem meia-risca em nada que alguém vai ler. Use vírgula, dois-pontos, parênteses ou ponto.
- Nunca faça push direto na `main`. Todo trabalho entra por branch e PR.
- Depois de clonar, rode uma vez `git config core.hooksPath .githooks`. Esse comando liga a trava local (o hook `.githooks/pre-push`) que bloqueia push na `main`.
- Issues e PRs não levam senha nem token.

## Idioma
Todo conteúdo voltado ao time é em **pt-BR**: PRDs, issues (título e corpo), user stories ("Como `<papel>`, quero `<ação>`, para `<valor>`"), critérios de aceite, comentários de PR, ADRs, `CONTEXT.md`, mensagens ao usuário. Tipo de commit em inglês (`feat`, `fix`, `chore`, `refactor`, `docs`) com descrição em pt-BR. Termos técnicos consagrados (commit, merge, deploy, endpoint) ficam em inglês.

## Tipografia
**Sem travessão (U+2014) nem meia-risca (U+2013)** em nada que alguém lê: docs, skills, telas, emails, PRs e issues. São marca de texto gerado por IA. Use vírgula, ou hífen entre números. O CI trava com o passo "Lint travessão" do `.github/workflows/ci.yml`, sobre `CONTEXT.md`, `CLAUDE.md`, `README.md`, `docs/` e `.claude/skills/`.

## Fluxo de trabalho
Fluxo centrado em GitHub Issues, copiado do Hospital (ADR 0001). O mapa de roteamento (qual skill usar em cada momento) vive no router **`/ask-iae`**. Espinha dorsal:
- **Planejar:** `/grill-with-docs` (desafia o plano contra o domínio, uma pergunta por vez, com a recomendação destacada; atualiza `CONTEXT.md` e ADR) → `/to-prd` → `/to-issues`.
- **Desenvolver:** `/pegar-issue <N>` → `/tdd` → `/ship` (PR de ferramenta: só CI; PR da plataforma, com arquivo em `plataforma/`: `iae-revisor` uma vez e CI; must-fix ou CI vermelho chamam o `iae-corretor`) → **subida** `fechar_onda.py --prs <N>`, que o `/ship` roda sozinho. O IAE ainda não tem deploy: a subida mergeia pela API depois do CI verde e para aí. **Modo AFK:** `/onda-enxuta`, a mesma subida por lote.
- Criou, renomeou ou apagou skill do fluxo? Atualize o `/ask-iae` no mesmo commit.

> O "como fazer" vive nas descrições das skills e no `/ask-iae`. Mantenha este arquivo mínimo.

## Agent skills
- **Issue tracker:** GitHub Issues via `gh`. Veja `docs/agents/issue-tracker.md` (inclui o protocolo de claim para sessões paralelas).
- **Triage labels:** 5 papéis canônicos (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) e `in-progress`. Todas as labels do repo, com `area:video`, em `docs/agents/triage-labels.md`.
- **Domain docs:** um contexto só, `CONTEXT.md` (glossário) e `docs/adr/`. Veja `docs/agents/domain.md`.

## Desenvolvimento paralelo
Várias sessões do Claude Code rodam issues `ready-for-agent` diferentes ao mesmo tempo: **um git worktree por issue**, claim atômico por label e assignee. Bloqueio entre issues é a dependência nativa do GitHub ("blocked by"); só entram na fila issues sem bloqueio aberto. Protocolo completo em `docs/agents/issue-tracker.md`.

## Proibido criar
- Docs de estado ou de processo paralelos (`PRODUCAO.md`, `deploy-history.md`, `dashboard.html`, pastas `planos/`, `implementacoes/`, `blueprint/`): estado vive em `docs/spec/deploy/*.json` e o trabalho nas **GitHub Issues**.
- Exceção: o **IAE OS** (`tools/workflow-dashboard/`), painel local só de leitura desses JSONs e do `gh` (`http://localhost:8800`).

## Docs vivos
- `CONTEXT.md` e `docs/adr/`: domínio e decisões (curados por humano). ADR: consuma só `status: accepted`; supersessão e emenda são bidirecionais (`supersedes`/`superseded_by`, `amends`/`amended_by`), travadas pelo CI `lint-adr`.
- `docs/spec/snapshots/`: mapa **factual** do app, gerado pelo `/snapshot`.
- `docs/spec/deploy/`: contrato e estado de deploy (`project.json`, `state.json`, `history.json`). Sem plataforma ainda.
- `docs/onboarding/`: do clone ao painel aberto (`dev.md`) e setup do Claude Code (`claude-setup.md`). O `/setup-maquina` confere.
- `README.md`: o mapa das pastas, com o bloco `cobertura` que o teste `tools/test_docs_fluxo.py` confere.
