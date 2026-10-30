# Onboarding: sócio no IAE

Esta página leva você do clone até o IAE OS aberto no navegador, e depois explica o dia a dia. O setup do Claude Code (plugins, permissões) está em [`claude-setup.md`](./claude-setup.md).

## A regra de ouro

Todo trabalho nasce de uma Issue no GitHub e termina num PR que fecha essa Issue. Você decora **duas entradas**:

- **Tem uma ideia nova?** `/grill-with-docs` (afia a ideia, que vira PRD e depois issues).
- **Vai pegar trabalho da fila?** `/pegar-issue` (sem número lista a fila; com número pega a issue).

O resto do caminho (`/tdd`, `/ship` e a subida `fechar_onda.py`) as skills encadeiam sozinhas. O IAE ainda não tem deploy, então a subida termina no merge.

## Primeiro dia: do clone ao painel aberto

Antes de começar, tenha `git`, `gh`, `jq`, `python3` e o Claude Code instalados (a lista com os comandos está na seção 1 do [`claude-setup.md`](./claude-setup.md)) e peça ao Pedro acesso de colaborador ao repo.

1. **Entre no GitHub pelo terminal:**

   ```bash
   gh auth login
   git config --global user.name "Seu Nome"
   git config --global user.email "o-email-da-sua-conta-github"
   ```

2. **Clone o repo:**

   ```bash
   gh repo clone pedrorezendefig/iae ~/PedroDev/IAE
   cd ~/PedroDev/IAE
   ```

3. **Ligue a trava da `main`** (uma vez por clone):

   ```bash
   git config core.hooksPath .githooks
   ```

   O hook `.githooks/pre-push` recusa push direto na `main`. O repo é privado no plano grátis do GitHub, que não protege a `main` do lado de lá; quem protege é este hook, na sua máquina.

4. **Confira a máquina.** Abra o Claude Code dentro da pasta (`claude`) e rode `/setup-maquina`. Ele mostra uma tabela com `OK` e `FALTA` e o conserto de cada item.

5. **Suba o IAE OS como serviço do Mac** (uma vez; ele volta sozinho quando o Mac liga):

   ```bash
   bash tools/workflow-dashboard/install-launchd.sh
   ```

   Rode a partir do clone, nunca de um worktree de issue: o serviço aponta para a pasta onde o script mora. Para tirar o serviço: `bash tools/workflow-dashboard/install-launchd.sh uninstall`.

6. **Abra o painel:** [http://localhost:8800](http://localhost:8800). Ele mostra as abas Issues, PRs, Produção e Documentação. A porta 8800 não briga com a do Hospital OS, então os dois rodam juntos.

   Sem o serviço (ou fora do macOS), suba na mão: `python3 tools/workflow-dashboard/serve.py --port 8800`.

7. **Pergunte o próximo passo:** `/ask-iae` diz qual skill usar em cada momento.

O painel só lê o GitHub. Nada que você faz nele muda o repo.

## Como trabalhar

### Cenário A: tenho uma ideia nova

```
/grill-with-docs
```

A skill desafia a ideia contra o glossário (`CONTEXT.md`) e as decisões (`docs/adr/`), uma pergunta por vez, e grava o que fecha. Com o plano redondo:

```
/to-prd      # vira o PRD, uma issue no GitHub, com você de dono
/to-issues   # quebra o PRD em fatias verticais independentes, uma issue cada
```

Agora há fatias na fila para qualquer sócio pegar.

### Cenário B: vou pegar trabalho da fila

```
/pegar-issue          # lista as issues ready-for-agent desbloqueadas
/pegar-issue 42       # claim (a issue vira sua), branch e spec carregada
/tdd                  # red, green, refactor: os critérios de aceite viram testes
/ship                 # abre o PR, roda os gates e, com o PR verde, roda a subida
```

A subida (`fechar_onda.py --prs <PR>`) mergeia o PR pela API depois do CI verde. A issue fecha pelo `Closes #42` do corpo do PR.

### Cenário C: a sessão fechou no meio do trabalho

O contexto do trabalho está na Issue:

```
git checkout <tipo>/<slug>-42     # a branch é determinística pelo número da issue
gh issue view 42                  # relê a spec e os critérios de aceite
/tdd                              # continua do teste onde parou
```

### Cenário D: um bug que não sei resolver

```
/diagnose
```

Reproduz, minimiza, levanta hipótese, instrumenta, corrige e deixa um teste de regressão.

## O caminho de uma issue

```
/grill-with-docs   desafia a ideia contra CONTEXT.md e as ADRs; grava o que fecha
   ▼
/to-prd            PRD (problema, solução, histórias, decisões) numa issue
   ▼
/to-issues         fatias verticais independentes, uma issue cada, ready-for-agent
   ▼
/pegar-issue <N>   claim atômico (label e assignee), branch <tipo>/<slug>-<N>, spec
   ▼
/tdd               red, green, refactor; critérios de aceite viram testes
   ▼
/ship              PR de ferramenta (nada em plataforma/): só o CI verde
                   PR da plataforma: iae-revisor uma vez e CI verde
                   must-fix ou CI vermelho chamam o iae-corretor
                   com o PR verde, roda a subida sozinho
   ▼
fechar_onda.py     merge pela API (squash). Sem deploy ainda: sem versão, build nem health
                   Na /onda-enxuta é o mesmo script, com o lote da onda em --prs
```

## Onde acho as coisas

| Pergunta | Olhar em |
|---|---|
| O que tem para fazer, o que estou fazendo? | GitHub Issues, ou a aba Issues do IAE OS |
| Qual o contexto deste trabalho? | A própria Issue (`gh issue view <N>`) |
| O que significa cada termo do projeto? | `CONTEXT.md` |
| Por que decidimos X? | `docs/adr/` (só vale `status: accepted`) |
| Como o time trabalha (claim, labels, paralelismo)? | `docs/agents/` |
| O que é cada pasta do repo? | `README.md` da raiz |
| O que existe no app hoje (rotas, tabelas)? | `docs/spec/snapshots/` (vazio até a plataforma ter código) |
| Tem algo em produção? | `docs/spec/deploy/` e `/deploy status` (hoje: ainda não há deploy) |

## Regras importantes

1. **Nunca dê push na `main`.** Todo trabalho entra por branch e PR. O hook do passo 3 trava.
2. **Uma issue por vez, uma branch por issue.** Em paralelo (vários terminais), um git worktree por issue; o claim atômico evita que duas sessões peguem a mesma. Protocolo em `docs/agents/issue-tracker.md`.
3. **A árvore principal do clone fica na `main`** e só recebe `git pull`. Voltou de uma pausa? `git pull` antes de tudo.
4. **O contexto vive na Issue.** Os critérios de aceite viram os testes do `/tdd`.
5. **Todo PRD tem dono:** quem fez o grilling. Pegar fatia do PRD de outro sócio se combina antes com ele.
6. **Mexeu numa skill de `.claude/skills/`?** Ela é do time: avise os outros sócios no PR.

## Atalhos

| Comando | Para quê |
|---|---|
| `/setup-maquina` | Confere a máquina e diz o que falta |
| `/ask-iae` | Qual skill usar agora |
| `/grill-with-docs` | Afiar uma ideia nova |
| `/to-prd` | A conversa vira PRD |
| `/to-issues` | O PRD vira fatias |
| `/pegar-issue` | Sem número: a fila. Com `<N>`: claim, branch e spec |
| `/tdd` | Teste primeiro, a partir dos critérios de aceite |
| `/ship` | PR, gates e, com o PR verde, a subida |
| `/onda-enxuta` | Várias fatias em ondas, sem parar |
| `/deploy status` | Diz se há deploy (hoje: ainda não) |
| `/diagnose` | Bug difícil |
| `/passagem` | Passa o contexto desta sessão para outra |

## Quando algo dá errado

- **`/tdd` vermelho que não fecha?** O teste é a spec: confira o critério na Issue. Se o critério está errado, ajuste a Issue primeiro.
- **`/ship` reprovou num gate?** O `iae-corretor` entra sozinho. Só a baixa (`ready-for-human`, com o diagnóstico na issue) volta para você.
- **Conflito com a `main`?** `/resolver-conflitos`.
- **Push recusado com "Push direto na main bloqueado"?** É o hook. Crie uma branch e abra PR.
- Na dúvida, pergunte ao Claude dentro do repo, ou abra uma Issue.

## Para aprofundar

- [`claude-setup.md`](./claude-setup.md): setup do Claude Code, uma vez por máquina.
- `CLAUDE.md`: as regras do repo.
- `CONTEXT.md` e `docs/adr/`: domínio e decisões.
- `docs/agents/`: `issue-tracker.md` (claim e paralelismo), `triage-labels.md`, `domain.md`.
