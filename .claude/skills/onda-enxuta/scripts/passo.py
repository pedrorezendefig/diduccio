#!/usr/bin/env python3
"""passo.py: o Passo de uma issue em arquivo, para o PedroOS ler (ADR 0027).

A sessão que trabalha numa issue, dentro ou fora de uma Onda, diz aqui o que está fazendo
nela agora. O formato está em `docs/passo.md` do PedroOS. Um registro por Projeto e issue,
ao lado do Estado da Onda:

    ${PEDROOS_PASSOS:-~/.pedroos/passos}/<slug do Projeto>/<issue>.json

Uso (da raiz do repositório do Projeto, que tem o `.claude/fluxo.json`):
    passo.py gravar   --issue 40 --passo Implementando [--projeto <slug>] [--sessao <nome>]
    passo.py sinal    --issue 40 [--projeto <slug>]
    passo.py encerrar --issue 40 [--projeto <slug>]

`gravar` grava o Passo (só um dos oito, com maiúscula e acento) e dá sinal; o mesmo Passo ainda
aberto mantém a hora em que começou. `sinal` só troca a hora do último sinal, e só com Passo aberto.
`encerrar` grava a hora do fim. Sem `--sessao`, vale o id da sessão do Claude Code.

Saída sempre 0: o Passo nunca para a skill. O que não deu para gravar sai numa linha no stderr.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import estado_onda  # noqa: E402
import fluxo as config_do_fluxo  # noqa: E402

CONTRATO = 1
PASSOS = ("Triando", "Planejando", "Implementando", "Revisão", "Correção", "Verde", "Mergeada", "Em produção")


def pasta_base() -> Path:
    return Path(os.environ.get("PEDROOS_PASSOS") or Path.home() / ".pedroos" / "passos")


def gravar(arq: Path, registro: dict) -> None:
    arq.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=arq.parent, prefix=".", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(registro, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, arq)


class Aviso(Exception):
    """Por que nada foi gravado, numa frase."""


def ler(arq: Path) -> dict | None:
    return json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else None


def aberto(registro: dict | None) -> bool:
    return registro is not None and registro.get("encerrado") is None


def novo(antes: dict | None, base: Path, slug: str, issue: int, passo: str, sessao: str | None) -> dict:
    """O registro do Passo. O mesmo Passo ainda aberto continua: a hora em que começou fica."""
    agora = estado_onda.agora()
    continua = aberto(antes) and antes.get("passo") == passo
    return {
        "contrato": CONTRATO,
        "slug": slug,
        "repo": estado_onda.repo_do_git(base),
        "issue": issue,
        "passo": passo,
        "desde": antes["desde"] if continua else agora,
        "sinal": agora,
        "encerrado": None,
        "sessao": sessao,
        "login": estado_onda.login_do_github(),
        "mac": estado_onda.nome_do_mac(),
    }


class Comando(argparse.ArgumentParser):
    """O comando mal escrito também vira aviso de uma linha, sem a saída 2 do argparse."""

    def error(self, message):
        raise Aviso(f"comando inválido ({message}); nada gravado")


def executar(argv: list[str]) -> None:
    ap = Comando(description="O Passo de uma issue em arquivo, para o PedroOS.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    comuns = argparse.ArgumentParser(add_help=False)
    comuns.add_argument("--issue", type=int, required=True)
    comuns.add_argument("--projeto", help="slug do Projeto (padrão: o do .claude/fluxo.json)")
    p = sub.add_parser("gravar", parents=[comuns])
    p.add_argument("--passo", required=True)
    p.add_argument("--sessao", help="nome da sessão (padrão: o id da sessão do Claude Code)")
    sub.add_parser("sinal", parents=[comuns])
    sub.add_parser("encerrar", parents=[comuns])
    args = ap.parse_args(argv)

    if args.cmd == "gravar" and args.passo not in PASSOS:
        raise Aviso(f"{args.passo!r} não é um Passo ({', '.join(PASSOS)}); nada gravado")
    base = config_do_fluxo.raiz()
    slug = args.projeto or config_do_fluxo.carregar(base)["slug"]
    if not estado_onda.NOME_VALIDO.match(slug):
        raise Aviso(f"Projeto inválido para nome de pasta: {slug!r}; nada gravado")
    arq = pasta_base() / slug / f"{args.issue}.json"
    antes = ler(arq)
    if args.cmd == "gravar":
        sessao = args.sessao or os.environ.get("CLAUDE_CODE_SESSION_ID") or None
        gravar(arq, novo(antes, base, slug, args.issue, args.passo, sessao))
    elif args.cmd == "sinal":
        if not aberto(antes):
            raise Aviso(f"#{args.issue} sem Passo aberto; sinal não gravado")
        gravar(arq, {**antes, "sinal": estado_onda.agora()})
    elif aberto(antes):
        gravar(arq, {**antes, "encerrado": estado_onda.agora()})


def main(argv: list[str]) -> int:
    """Sempre 0: o Passo nunca para a skill que o chama. O que não deu certo sai numa linha no stderr."""
    for f in (sys.stdout, sys.stderr):
        f.reconfigure(encoding="utf-8")
    try:
        executar(argv)
    except Aviso as e:
        print(f"passo: {e}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001 (pasta sem permissão, registro quebrado, fluxo.json ausente)
        motivo = " ".join(str(e).split()) or type(e).__name__
        print(f"passo: não gravei o Passo ({motivo})", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
