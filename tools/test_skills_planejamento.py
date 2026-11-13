"""Skills de planejamento e claim do Diduccio (issue #4).

Vieram do repositório do Hospital pelo MANIFESTO do kit
`tools/instalar-fluxo/`. Estes testes travam a adaptação: o router é o
`/ask-diduccio`, e nenhuma regra fala do Hospital, do diretor ou do Manual. Citar o
Hospital como origem é permitido (a linha diz "origem"), e como exemplo só nos
trechos de EXEMPLO_DO_HOSPITAL e SECAO_DA_DEMANDA.

O critério do lint do cabeçalho mora no último teste de `test_lint_skills.py`,
que roda contra o `.claude/skills/` real.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

SKILLS = Path(__file__).resolve().parent.parent / ".claude" / "skills"

# As skills desta issue. `ship`, `onda-enxuta` e `deploy` são da issue #5.
DA_ISSUE = [
    "ask-diduccio",
    "to-prd",
    "to-issues",
    "pegar-issue",
    "minhas-issues",
    "triage",
    "tdd",
    "wayfinder",
    "express",
    "passagem",
    "research",
    "prototype",
    "resolver-conflitos",
    "diagnose",
    "codebase-design",
    "improve-codebase-architecture",
    "montar-ondas-enxutas",
    "grill-with-docs",
    "grill-me",
]

# O que só existe no Hospital: o router antigo, as skills de entrega ao
# diretor e o Manual do usuário.
PROIBIDO = re.compile(
    r"/ask-pedro|/divulgar|/mensagem-prd|/manual\b|/montar-manual|\bManual\b|docs/manual"
    r"|[Dd]iretor|hospital-issue-|Hospital OS"
)

# O Pacote do fluxo do PedroOS cita o Hospital de propósito, como exemplo. Só estes
# trechos saem da busca: o parêntese "(no Hospital, ...)", o parêntese com o caminho
# do roteiro do manual de lá, o nome da seção "Manual: páginas que mudam" do PRD e a
# seção do triage que só vale para a Demanda que chega do app do Hospital.
EXEMPLO_DO_HOSPITAL = re.compile(
    r"\(no Hospital, [^()]*\)|\(`hospital-" r"reunioes/frontend/scripts/manual/[^`]*`[^()]*\)"
    r"|Manual: páginas que mudam"
)
SECAO_DA_DEMANDA = ("triage", "## Primeira resposta numa Demanda")


def _linhas_conferidas(arquivo: Path):
    """(número, linha) do arquivo sem os trechos de EXEMPLO_DO_HOSPITAL e sem a
    SECAO_DA_DEMANDA, do título dela até o próximo `## ` fora de bloco de código."""
    na_secao = no_codigo = False
    for n, linha in enumerate(arquivo.read_text(encoding="utf-8").splitlines(), 1):
        if linha.startswith("```"):
            no_codigo = not no_codigo
        elif not no_codigo and linha.startswith("## "):
            na_secao = (arquivo.parent.name, linha.strip()) == SECAO_DA_DEMANDA
        if not na_secao:
            yield n, EXEMPLO_DO_HOSPITAL.sub("", linha)


def _arquivos(skill: str) -> list[Path]:
    return sorted(p for p in (SKILLS / skill).rglob("*") if p.is_file() and p.suffix in {".md", ".py", ".sh"})


def _cabecalho(arquivo: Path) -> dict:
    texto = arquivo.read_text(encoding="utf-8")
    return yaml.safe_load(texto.split("---", 2)[1])


def test_ask_iae_e_o_router_e_nao_cita_ask_pedro_divulgar_nem_manual() -> None:
    skill = SKILLS / "ask-diduccio" / "SKILL.md"
    assert skill.is_file()
    assert _cabecalho(skill)["name"] == "ask-diduccio"
    texto = skill.read_text(encoding="utf-8")
    assert "/ask-diduccio" in texto
    for termo in ("/ask-pedro", "/divulgar", "Manual", "/manual"):
        assert termo not in texto, termo
    assert not (SKILLS / "ask-pedro").exists()


@pytest.mark.parametrize("skill", DA_ISSUE)
def test_skill_so_cita_o_hospital_como_origem(skill: str) -> None:
    arquivos = _arquivos(skill)
    assert arquivos, f"a skill {skill} não está instalada"
    achados = []
    for arquivo in arquivos:
        for n, linha in _linhas_conferidas(arquivo):
            regra_do_hospital = "hospital" in linha.lower() and "origem" not in linha.lower()
            if regra_do_hospital or PROIBIDO.search(linha):
                achados.append(f"{arquivo.relative_to(SKILLS)}:{n}: {linha.strip()[:120]}")
    assert not achados, "\n".join(achados)


@pytest.mark.parametrize("skill", DA_ISSUE)
def test_skill_sem_travessao_nem_meia_risca(skill: str) -> None:
    achados = [
        f"{arquivo.relative_to(SKILLS)}:{n}"
        for arquivo in _arquivos(skill)
        for n, linha in enumerate(arquivo.read_text(encoding="utf-8").splitlines(), 1)
        if "—" in linha or "–" in linha
    ]
    assert not achados, "\n".join(achados)


def test_pegar_issue_faz_o_claim_com_in_progress_e_assignee() -> None:
    texto = (SKILLS / "pegar-issue" / "SKILL.md").read_text(encoding="utf-8")
    claim = re.search(r"gh issue edit <N>[^\n`]*", texto)
    assert claim, "o /pegar-issue perdeu o comando de claim"
    assert "--add-label in-progress" in claim.group(0)
    assert "--add-assignee @me" in claim.group(0)
    assert "--remove-label ready-for-agent" in claim.group(0)
