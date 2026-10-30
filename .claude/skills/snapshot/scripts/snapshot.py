#!/usr/bin/env python3
"""snapshot.py: gera os sete arquivos de `docs/spec/snapshots/` a partir de
`plataforma/` (issue #5).

O IAE ainda não escolheu a stack. Enquanto `plataforma/` não existir, cada
arquivo sai com uma linha dizendo por quê. O que já dá para ler sem stack:
  - ESTRUTURA.md: árvore de `plataforma/` até dois níveis;
  - MIGRATIONS.md: os `.sql` de `plataforma/supabase/migrations/`;
  - INTEGRACOES.md: as chaves dos `.env.example` de `plataforma/`.
ROTAS, ENTIDADES e SCHEMA esperam a stack: quando ela chegar, o gerador de
cada um entra aqui, no mesmo formato do snapshot do Hospital.

Uso:
    python3 .claude/skills/snapshot/scripts/snapshot.py [--check] [--root <repo>]

`--check` não escreve: sai com 1 e lista os arquivos que mudariam, 0 se está
em dia. Sem data nos arquivos, para o `--check` não acusar só o relógio.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

APP = "plataforma"
MIGRATIONS = f"{APP}/supabase/migrations"
SAIDA = "docs/spec/snapshots"
SEM_APP = "A plataforma ainda não existe em `plataforma/`."
SEM_STACK = "A stack da plataforma ainda não foi escolhida; este arquivo ganha gerador quando ela chegar."
IGNORAR = {"node_modules", ".venv", "__pycache__", ".next", "dist", "build", ".git"}


def _doc(titulo: str, linhas: list[str]) -> str:
    return "\n".join([f"# {titulo}", "<!-- gerado por /snapshot; não editar à mão -->", "", *linhas]) + "\n"


def estrutura(raiz: Path) -> str:
    app = raiz / APP
    if not app.is_dir():
        return _doc("ESTRUTURA.md", [SEM_APP])
    linhas = ["```", f"{APP}/"]
    for filho in sorted(p for p in app.iterdir() if p.name not in IGNORAR):
        linhas.append(f"├── {filho.name}{'/' if filho.is_dir() else ''}")
        if filho.is_dir():
            for neto in sorted(p for p in filho.iterdir() if p.name not in IGNORAR):
                linhas.append(f"│   ├── {neto.name}{'/' if neto.is_dir() else ''}")
    return _doc("ESTRUTURA.md", [*linhas, "```"])


def migrations(raiz: Path) -> str:
    pasta = raiz / MIGRATIONS
    sqls = sorted(p.name for p in pasta.glob("*.sql")) if pasta.is_dir() else []
    if not sqls:
        return _doc("MIGRATIONS.md", [f"Nenhuma migration em `{MIGRATIONS}/`."])
    return _doc("MIGRATIONS.md", ["| Arquivo |", "|---|", *(f"| `{s}` |" for s in sqls)])


def integracoes(raiz: Path) -> str:
    app = raiz / APP
    exemplos = sorted(p for p in app.rglob(".env.example") if not IGNORAR & set(p.parts)) if app.is_dir() else []
    linhas = []
    for ex in exemplos:
        chaves = re.findall(r"^\s*([A-Z][A-Z0-9_]*)\s*=", ex.read_text(encoding="utf-8"), re.M)
        if chaves:
            linhas += ["", f"## `{ex.relative_to(raiz).as_posix()}`", "", *(f"- `{c}`" for c in chaves)]
    if not linhas:
        return _doc("INTEGRACOES.md", [SEM_APP if not app.is_dir() else "Nenhum `.env.example` em `plataforma/`."])
    return _doc("INTEGRACOES.md", ["Chaves de ambiente lidas dos `.env.example` (só o nome, nunca o valor).", *linhas])


def gerar(raiz: Path) -> dict[str, str]:
    sem_stack = SEM_APP if not (raiz / APP).is_dir() else SEM_STACK
    return {
        "ESTRUTURA.md": estrutura(raiz),
        "ROTAS.md": _doc("ROTAS.md", [sem_stack]),
        "ENTIDADES.md": _doc("ENTIDADES.md", [sem_stack]),
        "SCHEMA.md": _doc("SCHEMA.md", [sem_stack]),
        "MIGRATIONS.md": migrations(raiz),
        "INTEGRACOES.md": integracoes(raiz),
        "FLUXOGRAMAS.md": _doc("FLUXOGRAMAS.md", [sem_stack]),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Gera docs/spec/snapshots/ a partir de plataforma/.")
    ap.add_argument("--check", action="store_true", help="não escreve; sai com 1 se algum arquivo mudaria")
    ap.add_argument("--root", default=".", help="raiz do repositório (default: cwd)")
    args = ap.parse_args()
    raiz = Path(args.root).resolve()
    pasta = raiz / SAIDA
    mudariam = [nome for nome, texto in gerar(raiz).items()
                if not (pasta / nome).is_file() or (pasta / nome).read_text(encoding="utf-8") != texto]
    if args.check:
        if mudariam:
            print("snapshot desatualizado: " + ", ".join(mudariam))
            return 1
        print("snapshot em dia.")
        return 0
    pasta.mkdir(parents=True, exist_ok=True)
    for nome, texto in gerar(raiz).items():
        if nome in mudariam:
            (pasta / nome).write_text(texto, encoding="utf-8")
    print("snapshot: " + (", ".join(mudariam) if mudariam else "nada mudou"))
    return 0


if __name__ == "__main__":
    for fluxo in (sys.stdout, sys.stderr):  # Windows: o pipe sai em cp1252
        fluxo.reconfigure(encoding="utf-8")
    sys.exit(main())
