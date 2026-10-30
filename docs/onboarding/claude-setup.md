# Setup do Claude Code para trabalhar no IAE

Guia de setup da máquina, feito uma vez. Depois dele, siga o [`dev.md`](./dev.md), que leva do clone ao IAE OS aberto e explica o dia a dia. Tempo estimado: 15 minutos.

O IAE ainda não tem deploy nem serviço externo. Por isso este guia não tem CLI de plataforma, token de produção nem `tokens/.env`: quando a plataforma for escolhida, a seção de acessos externos entra aqui.

## Checklist

> Atalho: depois do clone, rode `/setup-maquina` no Claude Code. Ele confere esta lista e diz o que falta (`.claude/skills/setup-maquina/references/chaves.md` diz de onde vem cada acesso).

- [ ] [1.](#1-pré-requisitos) Pré-requisitos instalados (Claude Code, gh, jq, python3, uv)
- [ ] [2.](#2-acesso-ao-repo) Acesso de colaborador ao repo e `gh auth login` feito
- [ ] [3.](#3-plugins) Plugins do Claude Code habilitados
- [ ] [4.](#4-permissões) Allow-list mínima de permissões
- [ ] [5.](#5-verificação) `/pegar-issue` e `/deploy status` respondendo

Todas as skills do time já vêm no clone, em `.claude/skills/` (lista e roteamento: `/ask-iae`). Nada a instalar por máquina.

## 1. Pré-requisitos

| Ferramenta | Comando (macOS) | Para quê |
|---|---|---|
| **Claude Code** | `curl -fsSL https://claude.ai/install.sh \| bash` | O agente |
| **GitHub CLI** (`gh`) | `brew install gh` | Issues, PRs e merge. As skills falam com o GitHub por ele |
| **`jq`** | `brew install jq` | Leitura de JSON nos scripts das skills |
| **Python 3** | já vem no macOS, ou `brew install python@3.12` | O IAE OS (Python sem dependências) e os scripts das skills |
| **`uv`** | `curl -LsSf https://astral.sh/uv/install.sh \| sh` | Roda os testes de `tools/` com o Python 3.12, como no CI |

Conferir:

```bash
claude --version       # 2.1.280 ou mais (a /onda-enxuta lança sessão de fundo)
gh --version
jq --version
python3 --version
uv --version
```

## 2. Acesso ao repo

O repo `pedrorezendefig/iae` é privado. Peça ao Pedro para adicionar você como colaborador e aceite o convite que chega por e-mail. Depois:

```bash
gh auth login          # GitHub.com, HTTPS, Login with browser
gh repo view pedrorezendefig/iae --json viewerPermission --jq .viewerPermission
# esperado: WRITE ou ADMIN
```

O clone e a trava da `main` (`git config core.hooksPath .githooks`) estão no passo a passo do [`dev.md`](./dev.md).

## 3. Plugins

Dentro de uma sessão do Claude Code (`claude` no terminal):

```
/plugin install code-review@claude-plugins-official
/plugin install security-guidance@claude-plugins-official
/plugin install context7@claude-plugins-official
/plugin install skill-creator@claude-plugins-official
```

| Plugin | Para quê |
|---|---|
| `code-review` | `/code-review`, revisão avulsa do diff. No `/ship`, quem revisa o PR da plataforma é o `iae-revisor` |
| `security-guidance` | `/security-review`, revisão de segurança avulsa |
| `context7` | Documentação atualizada das bibliotecas |
| `skill-creator` | Criar e editar skills do time |

Conferir: `jq -r '.enabledPlugins | keys[]' ~/.claude/settings.json` lista os quatro.

## 4. Permissões

O Claude Code pede confirmação a cada comando novo. Para reduzir os pedidos sem afrouxar a segurança, ponha uma allow-list só de leitura no seu `~/.claude/settings.json`:

```json
{
  "permissions": {
    "defaultMode": "auto",
    "allow": [
      "Bash(jq:*)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(grep:*)",
      "Bash(date:*)"
    ]
  },
  "language": "pt-BR"
}
```

`git`, `gh`, `uv` e `curl` ficam de fora de propósito: no modo `auto` o classificador olha cada um desses comandos, e um allow amplo tiraria esse olhar de quem publica no GitHub ou roda código do repo. O mesmo vale para o `.claude/settings.local.json` do projeto, que fica fora do git.

## 5. Verificação

Abra uma sessão nova dentro do repo (`cd ~/PedroDev/IAE && claude`) e rode:

```
/pegar-issue
```

Esperado: a tabela das issues `ready-for-agent` desbloqueadas (pode estar vazia). Se o comando não existe, você não está na pasta do repo.

```
/deploy status
```

Esperado: "O IAE ainda não tem deploy", e que a subida termina no merge.

## 6. Problemas comuns

| Problema | Causa | Conserto |
|---|---|---|
| `/pegar-issue` não responde | Sessão fora da pasta do repo | `cd ~/PedroDev/IAE && ls .claude/skills/pegar-issue/SKILL.md` |
| Push recusado com "Push direto na main bloqueado" | O hook da `main` está ligado, como deve | Crie uma branch e abra PR |
| `/setup-maquina` acusa a trava da `main` | O clone não tem o hook ligado | `git config core.hooksPath .githooks` |
| Issue não aparece na fila | Sem `ready-for-agent`, já tem dono ou está bloqueada | `gh issue view <N>` mostra labels e assignee |
| Pedido de permissão a cada comando | `defaultMode` não é `auto` ou a allow-list está vazia | Passo 4 |

## 7. Pronto

Siga para o [`dev.md`](./dev.md). As duas entradas do dia a dia:

```
/grill-with-docs     # ideia nova
/pegar-issue         # trabalho da fila
```
