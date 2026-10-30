"""Testes da documentação do fluxo (issue #6).

Cada teste trava um critério de aceite da issue: as labels documentadas são as
do repo, o onboarding leva do clone ao painel aberto, o README tem o mapa de
pastas no formato do Hospital e nenhum doc diz que o IAE já tem Coolify,
Vercel ou Manual.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]

# As labels do repo pedrorezendefig/iae em 2026-10-14 (`gh label list`).
# Label nova no GitHub entra aqui e em docs/agents/triage-labels.md juntas.
LABELS_DO_REPO = {
    "accessibility", "bug", "documentation", "duplicate", "enhancement", "good first issue",
    "help wanted", "invalid", "question", "wontfix",
    "needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "in-progress", "revisor-comentou",
    "fatia:P", "fatia:M", "fatia:G",
    "type:feature", "type:fix", "type:chore", "type:refactor", "type:docs", "type:spec", "type:test",
    "area:backend", "area:frontend", "area:supabase", "area:infra", "area:docs", "area:skills", "area:spec",
    "area:video",
    "wayfinder:map", "wayfinder:research", "wayfinder:prototype", "wayfinder:grilling", "wayfinder:task",
}


def _labels_nas_tabelas(texto: str) -> set[str]:
    """Primeira célula de cada linha de tabela, quando ela é um código: é a label."""
    return set(re.findall(r"^\| `([^`]+)` \|", texto, re.M))


def test_triage_labels_lista_as_mesmas_labels_do_repo_com_area_video() -> None:
    texto = (RAIZ / "docs/agents/triage-labels.md").read_text(encoding="utf-8")
    assert _labels_nas_tabelas(texto) == LABELS_DO_REPO


def test_onboarding_dev_leva_do_clone_ao_painel_aberto_passando_pelo_hook() -> None:
    texto = (RAIZ / "docs/onboarding/dev.md").read_text(encoding="utf-8")
    passos = [
        "gh repo clone pedrorezendefig/iae",
        "git config core.hooksPath .githooks",
        "tools/workflow-dashboard/install-launchd.sh",
        "http://localhost:8800",
    ]
    posicoes = [texto.find(p) for p in passos]
    assert -1 not in posicoes, dict(zip(passos, posicoes))
    assert posicoes == sorted(posicoes), "os passos têm de aparecer na ordem do primeiro dia"


CABECALHO_RAIZ = "| Pasta ou arquivo | O que é | Por que existe | O que você acha dentro | Para que serve no dia a dia |"
CABECALHO_DOCS = "| Pasta | O que é | Por que existe | O que tem | Quando abrir |"


def _pastas_do_git() -> set[str]:
    """Pastas de nível 1 e 2 que o git conhece, sem cache de Python."""
    arquivos = subprocess.run(["git", "ls-files"], cwd=RAIZ, check=True, capture_output=True,
                              text=True, encoding="utf-8").stdout.splitlines()
    pastas = set()
    for arquivo in arquivos:
        partes = arquivo.split("/")[:-1]
        for nivel in (1, 2):
            if len(partes) >= nivel:
                pastas.add("/".join(partes[:nivel]))
    return {p for p in pastas if "__pycache__" not in p}


def test_readme_tem_o_mapa_de_pastas_no_formato_do_hospital() -> None:
    texto = (RAIZ / "README.md").read_text(encoding="utf-8")
    assert CABECALHO_RAIZ in texto
    assert CABECALHO_DOCS in texto
    bloco = re.search(r"<!-- cobertura:start -->\n```\n(.*?)```\n<!-- cobertura:end -->", texto, re.S)
    assert bloco, "falta o bloco cobertura"
    cobertura = set(bloco.group(1).split())
    assert _pastas_do_git() - cobertura == set()
    for pasta in {p for p in cobertura if "/" not in p}:
        assert f"| `{pasta}/` |" in texto, f"{pasta}/ fora da tabela da raiz"


# Coolify, Vercel e o Manual do usuário são do Hospital. Num doc do IAE eles só
# aparecem como plano ou como ausência, nunca como algo que já existe aqui.
# `docs/comercial/` fica de fora: é a proposta ao Cliente, escrita no futuro.
# "manual" minúsculo é adjetivo ("passo manual"); o produto é "Manual" ou `docs/manual/`.
DO_HOSPITAL = re.compile(r"(?i:coolify|vercel)|\bManual\b|docs/manual")
PLANO_OU_AUSENCIA = re.compile(r"ainda não|não tem|não há|previst|quando (a|o) ", re.I)


def test_nenhum_doc_diz_que_o_iae_ja_tem_coolify_vercel_ou_manual() -> None:
    citam = [
        f"{doc.relative_to(RAIZ)}:{n}"
        for doc in sorted((RAIZ / "docs").rglob("*.md"))
        if "comercial" not in doc.relative_to(RAIZ).parts
        for n, linha in enumerate(doc.read_text(encoding="utf-8").splitlines(), 1)
        if DO_HOSPITAL.search(linha) and not PLANO_OU_AUSENCIA.search(linha)
    ]
    assert citam == []
