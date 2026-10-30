#!/usr/bin/env bash
# diagnostico.sh: confere o que a máquina tem para trabalhar no IAE.
#
# Uso:
#   bash .claude/skills/setup-maquina/scripts/diagnostico.sh [--nivel N]
#   N = 1 pipeline | 2 onda e subida (padrão)
#
# Saída: uma linha por checagem: OK, FALTA (conta, exit 1), AVISO (não conta) ou OPC
# (opcional ausente, não conta), com o conserto ao lado. Exit 2 = uso errado ou repo
# inacessível. NUNCA imprime valor de chave.

set -u
NIVEL=2
while [ $# -gt 0 ]; do
  case "$1" in
    --nivel) [ $# -ge 2 ] || { echo "uso: --nivel 1..2" >&2; exit 2; }; NIVEL="$2"; shift 2 ;;
    --nivel=*) NIVEL="${1#--nivel=}"; shift ;;
    --env|--mapa) shift ;;   # modos da skill (SKILL.md); o script só diagnostica
    *) echo "argumento desconhecido: $1 (uso: --nivel 1..2)" >&2; exit 2 ;;
  esac
done
case "$NIVEL" in 1|2) ;; *) echo "uso: --nivel 1..2 (recebi '$NIVEL')" >&2; exit 2 ;; esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
FALHAS=0
cd "$REPO_ROOT" || exit 2   # gh resolve o repositório pelo cwd
# Abaixo deste Claude Code o lancar_sessao.sh falha por flag desconhecida (--bg, --strict-mcp-config, --effort).
CLAUDE_MIN="2.1.280"   # piso da /onda-enxuta

ok()    { printf '  OK     %-34s %s\n' "$1" "${2:-}"; }
falta() { printf '  FALTA  %-34s %s\n' "$1" "${2:-}"; FALHAS=$((FALHAS+1)); }
aviso() { printf '  AVISO  %-34s %s\n' "$1" "${2:-}"; }
titulo(){ printf '\n%s\n' "$1"; }

bin_ok() { command -v "$1" >/dev/null 2>&1 && ok "$1" || falta "$1" "$2"; }
versao_min() { # atual minima -> 0 se atual >= minima, comparando por número
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]
}

# ---------------------------------------------------------------- Nível 1
titulo "Nível 1: pipeline (issues, tdd, PR)"
bin_ok git "xcode-select --install"
if [ "$(git config core.hooksPath)" = ".githooks" ]; then
  ok "trava de push na main" ".githooks"
else
  falta "trava de push na main" "git config core.hooksPath .githooks (o hook bloqueia push direto na main)"
fi
if ! git show-ref --verify --quiet refs/heads/main; then
  aviso "clone atualizado" "não existe branch main local; crie com git checkout -b main origin/main"
elif git fetch -q origin main 2>/dev/null; then
  atras="$(git rev-list --count main..origin/main)"
  [ "$atras" -eq 0 ] && ok "clone atualizado (main = origin/main)" \
    || falta "clone atualizado" "main está $atras commit(s) atrás: git checkout main && git pull --ff-only origin main"
else
  aviso "clone atualizado" "sem acesso ao origin agora; rode git pull --ff-only origin main quando tiver rede"
fi
bin_ok jq "brew install jq"
bin_ok claude "curl -fsSL https://claude.ai/install.sh | bash"
if ! command -v gh >/dev/null 2>&1; then
  falta "gh" "brew install gh && gh auth login"
elif ! gh auth status >/dev/null 2>&1; then
  falta "gh autenticado" "gh auth login"
else
  ok "gh autenticado"
  perm="$(gh repo view --json viewerPermission --jq .viewerPermission 2>/dev/null || echo "?")"
  case "$perm" in
    WRITE|ADMIN|MAINTAIN) ok "permissão no repo" "$perm" ;;
    *) falta "permissão no repo" "tem $perm; peça WRITE ao Pedro" ;;
  esac
fi
if [ -n "$(git config user.name)" ] && [ -n "$(git config user.email)" ]; then
  ok "git config user.name e user.email"
else
  falta "git config user.name e user.email" "git config --global user.name \"Nome\"; git config --global user.email \"email da conta gh\""
fi

# ---------------------------------------------------------------- Nível 2
if [ "$NIVEL" -ge 2 ]; then
  titulo "Nível 2: onda e subida (/ship, fechar_onda.py, /onda-enxuta)"
  v="$(claude --version 2>/dev/null | awk 'NR==1 {print $1}')"
  case "$v" in
    [0-9]*.[0-9]*)
      versao_min "$v" "$CLAUDE_MIN" && ok "claude >= $CLAUDE_MIN" "$v" \
        || falta "claude >= $CLAUDE_MIN" "tem $v; atualize: curl -fsSL https://claude.ai/install.sh | bash" ;;
    *) falta "claude >= $CLAUDE_MIN" "claude --version não respondeu com uma versão" ;;
  esac
  bin_ok bash "brew install bash"
  bin_ok python3 "brew install python"
  bin_ok uv "curl -LsSf https://astral.sh/uv/install.sh | sh (os testes de tools/ rodam com o Python 3.12 do uv)"
  # O IAE ainda não tem deploy: sem plataforma, não há CLI nem token de plataforma para conferir.
  if status="$(python3 .claude/skills/deploy/scripts/status_deploy.py 2>/dev/null)"; then
    ok "deploy" "$(printf '%s' "$status" | head -1)"
  else
    aviso "deploy" "o project.json já lista serviço: acrescente aqui a CLI e o token da plataforma"
  fi
fi

printf '\n'
if [ "$FALHAS" -eq 0 ]; then
  echo "Tudo obrigatório está OK."
  exit 0
else
  echo "$FALHAS item(ns) obrigatório(s) faltando. Conserte um por vez, com confirmação."
  exit 1
fi
