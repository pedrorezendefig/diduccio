#!/usr/bin/env python3
"""status_deploy.py: o `/deploy status` do IAE (issue #5).

O IAE ainda não tem deploy. A plataforma existe quando o
`docs/spec/deploy/project.json` lista algum serviço em `services`: é a lista
que a subida (`onda-enxuta/scripts/fechar_onda.py`) constrói, confere no
health e registra. Sem serviço, a subida termina no merge, e este script diz
isso.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT = "docs/spec/deploy/project.json"


def tem_plataforma(projeto: dict) -> bool:
    """True quando o project.json tem algum serviço para a subida levar ao ar."""
    return bool(projeto.get("services"))


def main() -> int:
    ap = argparse.ArgumentParser(description="Diz se o projeto tem deploy e o que a subida faz sem ele.")
    ap.add_argument("--raiz", help="raiz do repositorio (default: a deste checkout)")
    args = ap.parse_args()
    raiz = Path(args.raiz) if args.raiz else Path(__file__).resolve().parents[4]
    projeto = json.loads((raiz / PROJECT).read_text(encoding="utf-8"))
    nome = (projeto.get("project") or {}).get("name") or "projeto"
    if not tem_plataforma(projeto):
        print(f"O {nome} ainda não tem deploy: o {PROJECT} não lista nenhum serviço.")
        print("Enquanto for assim, a subida termina no merge, sem versão, build, health nem registro.")
        print("Quando a plataforma for escolhida, os serviços entram no project.json e o /deploy ganha o status dela.")
        return 0
    servicos = ", ".join(s.get("id", "?") for s in projeto["services"])
    print(f"O {PROJECT} já lista serviços ({servicos}), mas este /deploy status ainda não sabe consultar a "
          "plataforma. Escreva o modo status dela antes de confiar na subida.")
    return 2


if __name__ == "__main__":
    for fluxo in (sys.stdout, sys.stderr):  # Windows: o pipe sai em cp1252
        fluxo.reconfigure(encoding="utf-8")
    sys.exit(main())
