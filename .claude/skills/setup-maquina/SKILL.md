---
name: setup-maquina
description: "Diagnostica a máquina clonada (binários, gh, trava da main, Claude Code, uv), diz o que falta, de onde vem cada acesso e o que é cada pasta. Sintaxe `/setup-maquina [--nivel N] [--mapa]`."
---

# Setup de máquina nova

Quem clona o repositório do IAE precisa de pouca coisa para trabalhar no fluxo (planejar, desenvolver, abrir PR, mergear). O IAE ainda não tem deploy, então não há CLI nem token de plataforma para conferir. Esta skill diz, numa tabela, o que já está pronto e o que falta.

## Níveis

| Nível | Para quê | O que exige |
|---|---|---|
| 1 Pipeline | `/grill-with-docs`, `/pegar-issue`, `/tdd`, `/ship` até o PR | git com `core.hooksPath .githooks` (a trava de push na `main`), clone com a `main` igual à `origin/main`, gh autenticado com WRITE, jq, Claude Code, `git config user.*` com o e-mail da conta `gh` |
| 2 Onda e subida | `/ship` até o merge, a subida `fechar_onda.py`, `/onda-enxuta`, `/deploy status` | Claude Code 2.1.280 ou mais (a `/onda-enxuta` lança sessão de fundo), bash, python3 e uv (os testes de `tools/` rodam com o Python 3.12 do uv, como no CI) |

O padrão confere os dois níveis. `--nivel 1` fica só no primeiro.

## Como rodar

```bash
bash .claude/skills/setup-maquina/scripts/diagnostico.sh            # níveis 1 e 2
bash .claude/skills/setup-maquina/scripts/diagnostico.sh --nivel 1  # só o pipeline
```

Saída: uma linha por checagem, com `OK`, `FALTA` (conta e dá exit 1) ou `AVISO` (não conta), e o comando de conserto ao lado. O script nunca imprime valor de chave.

## O que fazer com o resultado

1. Rode o script e mostre a tabela.
2. Para cada `FALTA`, execute o conserto indicado **um por vez, com confirmação**, nunca com `sudo`. Clone atrasado é `git pull --ff-only origin main` na `main` (se a árvore tiver mudança não commitada, avise e não puxe). Binário é `brew install`. Login no GitHub é humano (`gh auth login`).
3. Para acesso a serviço, consulte `references/chaves.md`.
4. Feche com a lista do que ficou pendente de humano.

## O que esta skill nunca faz

- Nunca imprime, ecoa ou cola valor de segredo, nem em log.
- Nunca commita `.env` nem `~/.claude/settings.json`.
- Nunca instala sem confirmação e nunca usa `sudo`.

## Explicar o repositório (`/setup-maquina --mapa`, ou "o que é a pasta X")

Leia o `README.md` da raiz quando ele existir; sem ele, o `CLAUDE.md` e o `CONTEXT.md`. Antes de responder sobre uma pasta, rode `ls` nela: o disco manda, o mapa explica. As decisões ficam em `docs/adr/`.
