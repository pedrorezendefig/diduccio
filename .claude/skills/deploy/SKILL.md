---
name: deploy
description: "Diz se o IAE tem deploy, lendo docs/spec/deploy/project.json. Hoje só tem o modo status, e ele responde que ainda não há deploy: a subida termina no merge. Sintaxe `/deploy status`."
---

# deploy

O IAE ainda não tem plataforma de deploy. Esta skill tem um modo só, `status`, e ele lê o `docs/spec/deploy/project.json`. Levar PR para a `main` não é dela: quem faz isso é a subida (`.claude/skills/onda-enxuta/scripts/fechar_onda.py`), que o `/ship` e a `/onda-enxuta` chamam.

| Comando | O que faz |
|---|---|
| `/deploy status` | Diz se o projeto tem deploy e o que a subida faz sem ele. Não escreve nada. |
| `/deploy` sem modo, `rollback`, `setup` | Ainda não existem. Responda com o `status` e diga que o modo pedido chega junto com a plataforma. |

## Modo `status`

1. Rode `python3 .claude/skills/deploy/scripts/status_deploy.py`.
2. Repasse a saída como está.

Sem serviço no `services` do `project.json`, o script diz que o IAE ainda não tem deploy e sai com 0. A subida usa a mesma regra (`tem_plataforma`, no mesmo script): sem serviço, todo lote é tratado como ferramenta e termina no merge, sem versão, tag, build, health nem registro.

Com algum serviço no `project.json`, o script avisa que este `status` ainda não sabe consultar a plataforma e sai com 2. Nesse dia, escreva os modos `status`, `rollback` e `setup` para a plataforma escolhida, usando o `/deploy` do Hospital como modelo de estrutura (Fase 4.4 do `tools/instalar-fluxo/ROTEIRO.md` de lá).

## Trava

O `scripts/semaforo.sh` é a trava que a subida pega antes do primeiro merge. Ele fica aqui, mesmo sem deploy, porque a subida o chama em todo lote.
