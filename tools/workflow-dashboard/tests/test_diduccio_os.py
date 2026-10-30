"""O que a cópia do Hospital OS muda para virar o IAE OS (issue #2, PRD #1).

Os outros arquivos desta pasta vieram do Hospital e guardam as asserções de
lá (a pasta do app, `plataforma/`, mora no test_coletor_fases.py, com a
fixture adaptada). Aqui ficam os critérios que só existem no IAE: o nome na
tela, a paleta, o repo de reserva, o serviço na porta 8800 e as 4 abas
abrindo com os arquivos de um projeto que ainda não tem app.
"""

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

DASH = Path(__file__).resolve().parents[1]
RAIZ = DASH.parents[1]
STATIC = DASH / "static"
APP_JS = (STATIC / "app.js").read_text(encoding="utf-8")

sys.path.insert(0, str(DASH))
import collect  # noqa: E402

ISSUE_DO_IAE = {
    "number": 2,
    "title": "IAE OS de pé: painel copiado e adaptado",
    "state": "OPEN",
    "labels": [{"name": "in-progress"}],
    "createdAt": "2026-10-14T18:00:00Z",
    "closedAt": None,
    "assignees": [{"login": "pedrorezendefig"}],
    "author": {"login": "pedrorezendefig"},
    "body": "## Pai\n\n#1\n",
    "url": "https://github.com/pedrorezendefig/iae/issues/2",
}
PAGINA_VAZIA = json.dumps(
    {"data": {"repository": {"issues": {"pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": []}}}}
)


def _texto_da_tela():
    """Tudo que o painel pode mostrar: a SPA inteira e o que o Python manda para ela.

    O style.css fica de fora: não tem texto que aparece na tela, e o comentário
    da linha 1 continua o do Hospital porque só o bloco :root muda."""
    arquivos = [p for p in STATIC.rglob("*")
                if p.is_file() and "vendor" not in p.parts and p.suffix != ".css"]
    arquivos += sorted(DASH.glob("*.py"))
    return {str(p.relative_to(DASH)): p.read_text(encoding="utf-8") for p in arquivos}


def test_rodape_diz_iae_os():
    assert "IAE OS · somente leitura" in APP_JS


def test_nenhum_texto_do_painel_cita_o_hospital():
    citam = sorted(nome for nome, texto in _texto_da_tela().items() if "hospital" in texto.lower())
    assert citam == []


# ---------- coleta: o repo de reserva é o do IAE ----------


def _gh_do_iae(chamadas):
    """gh e git falsos: o gh responde uma issue do IAE; o git não tem origin."""

    def run(cmd, cwd, timeout=None):
        chamadas.append(cmd)
        if cmd[0] == "git":
            raise RuntimeError("sem origin")
        if cmd[:3] == ["gh", "issue", "list"]:
            return json.dumps([ISSUE_DO_IAE])
        if cmd[:3] == ["gh", "pr", "list"]:
            return "[]"
        return PAGINA_VAZIA

    return run


def test_coleta_sem_repo_no_state_le_as_issues_do_iae(monkeypatch, tmp_path):
    # o state.json do IAE não tem bloco production: a coleta cai no repo de reserva
    (tmp_path / "docs" / "spec" / "deploy").mkdir(parents=True)
    for nome in ("state.json", "history.json", "project.json"):
        shutil.copy(RAIZ / "docs" / "spec" / "deploy" / nome, tmp_path / "docs" / "spec" / "deploy" / nome)
    chamadas = []
    monkeypatch.setattr(collect, "_run", _gh_do_iae(chamadas))

    data = collect.collect(tmp_path)

    assert data["github"]["error"] is None
    assert [i["number"] for i in data["github"]["issues"]] == [2]
    assert data["repo_slug"] == "pedrorezendefig/iae"
    assert data["repo_url"] == "https://github.com/pedrorezendefig/iae"
    graphql = [c for c in chamadas if c[:3] == ["gh", "api", "graphql"]]
    assert graphql, "a coleta não pediu sub-issues nem bloqueios"
    for c in graphql:
        assert "owner=pedrorezendefig" in c and "name=iae" in c, c


# ---------- paleta: só o :root muda, e o favicon segue ----------

CSS = (STATIC / "style.css").read_text(encoding="utf-8")
INDEX = (STATIC / "index.html").read_text(encoding="utf-8")


def _raiz():
    return re.search(r":root\{(.*?)\}", CSS, re.S).group(1)


def _token(nome):
    m = re.search(rf"--{nome}:\s*(#[0-9a-fA-F]{{6}})", _raiz())
    assert m, f"--{nome} fora do :root"
    return m.group(1).lower()


def test_paleta_da_marca_no_root():
    # manual da marca IAE: o preenchimento escuro é o azul profundo
    assert (_token("brand"), _token("navy")) == ("#01213d", "#01213d")
    assert "rgba(15,47,99" not in _raiz() and "rgba(8,26,58" not in _raiz()
    assert "--navy40:rgba(1,33,61,.40)" in _raiz()


def test_favicon_segue_a_paleta():
    fundo = re.search(r"%3Crect[^%]*fill='%23([0-9a-fA-F]{6})'", INDEX).group(1).lower()
    circulo = re.search(r"%3Ccircle[^%]*fill='%23([0-9a-fA-F]{6})'", INDEX).group(1).lower()
    assert ("#" + fundo, "#" + circulo) == (_token("navy"), _token("on-navy"))


# ---------- serviço do macOS: porta 8800, ao lado do Hospital OS ----------

# o label do serviço do Hospital OS, partido para o test_fluxo_iae.py não acusar a pasta do app de lá
PLIST_DO_HOSPITAL = "com.hospital" + "-reunioes.workflow-dashboard.plist"


def _rodar_instalador(tmp_path, *args):
    """Roda o install-launchd.sh numa árvore principal falsa, com HOME e launchctl falsos.

    O launchctl de verdade nunca roda: o falso vem antes no PATH e só anota os
    argumentos. O HOME falso nasce com o plist do Hospital OS, que não pode mudar."""
    repo = tmp_path / "repo"
    (repo / ".git").mkdir(parents=True, exist_ok=True)  # árvore principal: .git é pasta, não arquivo
    (repo / "tools" / "workflow-dashboard").mkdir(parents=True, exist_ok=True)
    script = repo / "tools" / "workflow-dashboard" / "install-launchd.sh"
    shutil.copy(DASH / "install-launchd.sh", script)
    agentes = tmp_path / "home" / "Library" / "LaunchAgents"
    if not agentes.exists():
        agentes.mkdir(parents=True)
        (agentes / PLIST_DO_HOSPITAL).write_text("plist do Hospital OS\n", encoding="utf-8")
    bin_falso = tmp_path / "bin"
    bin_falso.mkdir(exist_ok=True)
    registro = tmp_path / "launchctl.txt"
    registro.write_text("", encoding="utf-8")
    launchctl = bin_falso / "launchctl"
    launchctl.write_text(f'#!/bin/sh\necho "$@" >> "{registro}"\n', encoding="utf-8")
    launchctl.chmod(0o755)
    assert os.access(launchctl, os.X_OK)
    env = {**os.environ, "HOME": str(tmp_path / "home"), "PATH": f"{bin_falso}{os.pathsep}{os.environ['PATH']}"}
    # Windows: "bash" nu no subprocess cai no System32 (WSL) antes do PATH.
    out = subprocess.run([shutil.which("bash") or "bash", str(script), *args], env=env, capture_output=True, text=True, check=False)
    assert out.returncode == 0, out.stderr
    return agentes, registro.read_text(encoding="utf-8").splitlines()


def test_instalador_sobe_o_iae_os_na_porta_8800_sem_tocar_no_hospital(tmp_path):
    agentes, chamadas = _rodar_instalador(tmp_path)

    plist = (agentes / "com.iae.workflow-dashboard.plist").read_text(encoding="utf-8")
    assert "<key>Label</key><string>com.iae.workflow-dashboard</string>" in plist
    assert "<string>--port</string><string>8800</string>" in plist
    # log próprio: o do Hospital OS é ~/Library/Logs/workflow-dashboard.log
    assert "/Library/Logs/workflow-dashboard.log" not in plist
    assert (agentes / PLIST_DO_HOSPITAL).read_text(encoding="utf-8") == "plist do Hospital OS\n"
    assert chamadas and all("com.iae.workflow-dashboard" in c for c in chamadas), chamadas
    assert not any("hospital" in c for c in chamadas), chamadas


def test_desinstalar_tira_so_o_iae_os(tmp_path):
    _rodar_instalador(tmp_path)
    agentes, chamadas = _rodar_instalador(tmp_path, "uninstall")

    assert not (agentes / "com.iae.workflow-dashboard.plist").exists()
    assert (agentes / PLIST_DO_HOSPITAL).read_text(encoding="utf-8") == "plist do Hospital OS\n"
    assert chamadas and not any("hospital" in c for c in chamadas), chamadas


# ---------- as 4 abas abrem com os arquivos de verdade do IAE ----------

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_router import _app, com_node  # noqa: E402

ABAS = {
    "#issues": ("issues", "Issues"),
    "#prs": ("prs", "PRs"),
    # o history.json do IAE ainda não tem deploy (issue #8)
    "#producao": ("producao", "sem deploy ainda"),
    "#documentacao/fluxo": ("documentacao", "Do pedido à produção"),
    "#documentacao/mapa": ("documentacao", "Mapa da app"),
    "#documentacao/decisoes": ("documentacao", "Decisões de arquitetura"),
    "#documentacao/glossario": ("documentacao", "Glossário do domínio"),
}


def _payload_do_iae(monkeypatch):
    """O /api/data montado dos arquivos do repo (contrato de deploy, snapshots, ADRs,
    CONTEXT.md), com o gh falso devolvendo uma issue do IAE."""
    monkeypatch.setattr(collect, "_run", _gh_do_iae([]))
    return json.loads(json.dumps(collect.collect(RAIZ)))


def test_snapshots_do_iae_chegam_ao_mapa_sem_diagrama_e_sem_erro(monkeypatch):
    dados = _payload_do_iae(monkeypatch)
    nomes = [s["name"] for s in dados["snapshots"]]
    assert nomes == ["ROTAS", "ENTIDADES", "SCHEMA", "MIGRATIONS", "INTEGRACOES", "ESTRUTURA", "FLUXOGRAMAS"]
    for s in dados["snapshots"]:
        assert s["body_md"].strip() and s["diagramas"] == [], s["name"]


@com_node
def test_as_quatro_abas_e_as_sub_abas_abrem_com_os_dados_do_iae(monkeypatch, tmp_path):
    dados = _payload_do_iae(monkeypatch)
    fluxo = (STATIC / "fluxo.json").read_text(encoding="utf-8")
    marked = (
        f"import _marked from '{(STATIC / 'vendor' / 'marked.min.js').as_uri()}';\n"
        "globalThis.marked = window.marked = _marked;\n"
    )
    for hash_, (aba, titulo) in ABAS.items():
        tab, rota, html = _app(
            tmp_path,
            "[S.tab, location.hash, _view.innerHTML]",
            hash_inicial=hash_,
            dados=dados,
            preludio_extra=marked + f"_respostas['/fluxo.json'] = {fluxo};\n",
            antes="await _esperar();",
        )
        assert (tab, rota) == (aba, hash_)
        assert titulo in html, hash_
    assert ISSUE_DO_IAE["title"] in _app(tmp_path, "_view.innerHTML", hash_inicial="#issues", dados=dados)
