"""Testes do lint das ADRs (tools/lint_adr.py), issue #3.

Cada teste monta uma pasta de ADRs num diretório temporário e roda o lint
contra ela, como o workflow `lint-adr.yml` faz. O último roda contra o
`docs/adr/` real.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
LINT = RAIZ / "tools" / "lint_adr.py"


def _rodar(pasta: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(LINT), "--dir", str(pasta)],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def _adrs(pasta: Path, **arquivos: str) -> Path:
    pasta.mkdir(parents=True, exist_ok=True)
    nomes = []
    for nome, conteudo in arquivos.items():
        arquivo = f"{nome}.md"
        (pasta / arquivo).write_text(conteudo, encoding="utf-8")
        nomes.append(arquivo)
    indice = "\n".join(f"- [{n}]({n})" for n in nomes)
    (pasta / "README.md").write_text(f"# ADRs\n\n{indice}\n", encoding="utf-8")
    return pasta


def test_adr_com_status_aceito_passa(tmp_path: Path) -> None:
    pasta = _adrs(tmp_path / "adr", **{"0001-x": "---\nstatus: accepted\n---\n\n# X\n"})
    assert _rodar(pasta).returncode == 0


def test_adr_sem_frontmatter_de_status_fica_vermelha(tmp_path: Path) -> None:
    pasta = _adrs(tmp_path / "adr", **{"0001-x": "# X\n\nSem cabeçalho.\n"})
    resultado = _rodar(pasta)
    assert resultado.returncode == 1
    assert "status" in resultado.stderr


def test_adr_com_status_fora_do_conjunto_fica_vermelha(tmp_path: Path) -> None:
    pasta = _adrs(tmp_path / "adr", **{"0001-x": "---\nstatus: aprovada\n---\n\n# X\n"})
    assert _rodar(pasta).returncode == 1


def test_supersessao_sem_o_par_de_volta_fica_vermelha(tmp_path: Path) -> None:
    pasta = _adrs(
        tmp_path / "adr",
        **{
            "0001-velha": "---\nstatus: accepted\n---\n\n# Velha\n",
            "0002-nova": "---\nstatus: accepted\nsupersedes: 0001\n---\n\n# Nova\n",
        },
    )
    assert _rodar(pasta).returncode == 1


def test_adrs_do_repo_passam() -> None:
    resultado = _rodar(RAIZ / "docs" / "adr")
    assert resultado.returncode == 0, resultado.stderr
