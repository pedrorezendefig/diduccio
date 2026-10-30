"""Sub-aba Stack da Documentação (issue #7, só no IAE).

O coletor lê `docs/STACK.md` e manda o texto no `/api/data` (`stack_md`); a
sub-aba Stack, depois do Glossário, mostra o markdown no mesmo componente das
sub-abas de texto. Sem o arquivo, a sub-aba avisa que a stack ainda não foi
documentada e o painel segue de pé. O app.js roda de verdade no Node, pelo
harness do test_router.
"""

import json
import shutil
import sys
from pathlib import Path

import pytest

DASH = Path(__file__).resolve().parents[1]
STATIC = DASH / "static"
RAIZ = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(DASH))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import collect  # noqa: E402
from test_coletor_fases import _fake_coleta  # noqa: E402
from test_documentacao import DADOS_DOC  # noqa: E402
from test_router import _app  # noqa: E402

com_node = pytest.mark.skipif(not shutil.which("node"), reason="node ausente")

STACK = "# Stack\n\n## IAE OS\n\nPython sem dependências e front sem build.\n"
AVISO = "A stack ainda não foi documentada"
MARKED = (
    f"import _marked from '{(STATIC / 'vendor' / 'marked.min.js').as_uri()}';\n"
    "globalThis.marked = window.marked = _marked;\n"
)


# ---------- coletor ----------


def test_coleta_traz_o_stack_md_quando_o_arquivo_existe(monkeypatch, tmp_path):
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "STACK.md").write_text(STACK, encoding="utf-8")
    monkeypatch.setattr(collect, "_run", _fake_coleta())
    data = collect.collect(tmp_path)
    assert data["stack_md"] == STACK
    json.dumps(data)


def test_coleta_sem_o_arquivo_manda_stack_vazia(monkeypatch, tmp_path):
    monkeypatch.setattr(collect, "_run", _fake_coleta())
    data = collect.collect(tmp_path)
    assert "stack_md" in data and data["stack_md"] is None


def test_o_repo_tem_a_stack_de_hoje_e_a_prevista():
    texto = (RAIZ / "docs" / "STACK.md").read_text(encoding="utf-8")
    for peca in ("Python", "gh", "Next.js", "FastAPI", "Postgres", "Coolify", "Hostinger"):
        assert peca in texto, f"STACK.md sem {peca}"
    assert "prevista" in texto.lower()
    assert chr(0x2014) not in texto and chr(0x2013) not in texto


# ---------- front: a sub-aba ----------


@com_node
def test_sub_aba_stack_mostra_o_markdown_depois_do_glossario(tmp_path):
    html = _app(
        tmp_path,
        "_view.innerHTML",
        hash_inicial="#documentacao/stack",
        dados={**DADOS_DOC, "stack_md": STACK},
        preludio_extra=MARKED,
    )
    pills = html[: html.index("</div>")]
    assert pills.index('data-sub="glossario"') < pills.index('data-sub="stack"')
    assert 'class="fchip on" data-act="docsub" data-sub="stack">Stack<' in html
    assert '<div class="md">' in html
    assert "<h2>IAE OS</h2>" in html
    assert "Python sem dependências e front sem build." in html
    assert AVISO not in html


@com_node
def test_sem_o_arquivo_a_sub_aba_avisa_e_o_painel_nao_quebra(tmp_path):
    dados = {k: v for k, v in DADOS_DOC.items() if k != "stack_md"}
    html = _app(
        tmp_path,
        "_view.innerHTML",
        hash_inicial="#documentacao/stack",
        dados={**dados, "stack_md": None},
        preludio_extra=MARKED,
    )
    assert AVISO in html
    assert 'data-sub="stack">Stack<' in html


@com_node
def test_rota_de_hash_da_sub_aba_stack_vai_e_volta(tmp_path):
    passos = _app(
        tmp_path,
        "_h",
        hash_inicial="#documentacao/glossario",
        dados={**DADOS_DOC, "stack_md": STACK},
        antes="""
        const _h = [[location.hash, subDoc()]];
        _clicar({ act: 'docsub', sub: 'stack' }); _h.push([location.hash, subDoc()]);
        _clicar({ act: 'docsub', sub: 'decisoes' }); _h.push([location.hash, subDoc()]);
        _navegar('#documentacao/stack'); _h.push([location.hash, subDoc()]);
        """,
    )
    assert passos == [
        ["#documentacao/glossario", "glossario"],
        ["#documentacao/stack", "stack"],
        ["#documentacao/decisoes", "decisoes"],
        ["#documentacao/stack", "stack"],
    ]
