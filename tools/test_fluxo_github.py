"""Testes do fluxo do GitHub do IAE (issue #3).

O passo "Lint travessão" do `.github/workflows/ci.yml` roda aqui como roda no
CI: o `run:` do passo é lido do YAML e executado num diretório temporário que
imita o repositório. Os caracteres proibidos entram por escape para não existir
literal neste arquivo.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parent.parent
CI = RAIZ / ".github" / "workflows" / "ci.yml"
# Windows: "bash" nu no subprocess cai no System32 (WSL) antes do PATH.
BASH = shutil.which("bash") or "bash"
TRAVESSAO = "—"
MEIA_RISCA = "–"


def _passo_travessao() -> str:
    ci = yaml.safe_load(CI.read_text(encoding="utf-8"))
    for job in ci["jobs"].values():
        for passo in job["steps"]:
            if passo.get("name") == "Lint travessão":
                return passo["run"]
    raise AssertionError("ci.yml sem o passo 'Lint travessão'")


def _rodar_lint(repo: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [BASH, "-e", "-c", _passo_travessao()],
        cwd=repo,
        check=False,
        capture_output=True,
        text=True, encoding="utf-8",
    )


def _repo_limpo(tmp_path: Path) -> Path:
    (tmp_path / "docs" / "adr").mkdir(parents=True)
    (tmp_path / "docs" / "adr" / "0001-x.md").write_text("ok, sem traço\n", encoding="utf-8")
    (tmp_path / "CLAUDE.md").write_text("regras\n", encoding="utf-8")
    (tmp_path / "CONTEXT.md").write_text("glossário\n", encoding="utf-8")
    return tmp_path


def test_repo_sem_travessao_passa_no_lint(tmp_path: Path) -> None:
    assert _rodar_lint(_repo_limpo(tmp_path)).returncode == 0


def test_travessao_em_qualquer_pasta_de_docs_fica_vermelho(tmp_path: Path) -> None:
    repo = _repo_limpo(tmp_path)
    (repo / "docs" / "agents").mkdir()
    (repo / "docs" / "agents" / "x.md").write_text(f"a {TRAVESSAO} b\n", encoding="utf-8")
    assert _rodar_lint(repo).returncode != 0


def test_meia_risca_no_readme_fica_vermelho(tmp_path: Path) -> None:
    repo = _repo_limpo(tmp_path)
    (repo / "README.md").write_text(f"1{MEIA_RISCA}2\n", encoding="utf-8")
    assert _rodar_lint(repo).returncode != 0


def test_travessao_numa_skill_fica_vermelho(tmp_path: Path) -> None:
    repo = _repo_limpo(tmp_path)
    (repo / ".claude" / "skills" / "x").mkdir(parents=True)
    (repo / ".claude" / "skills" / "x" / "SKILL.md").write_text(f"a {TRAVESSAO} b\n", encoding="utf-8")
    assert _rodar_lint(repo).returncode != 0


def test_repo_real_passa_no_lint() -> None:
    assert _rodar_lint(RAIZ).returncode == 0, _rodar_lint(RAIZ).stdout


# Higiene de issues: o script do job `higiene` roda no Node com um `github`
# falso que registra as chamadas, como o actions/github-script rodaria.
HIGIENE = RAIZ / ".github" / "workflows" / "higiene-issues.yml"

ARNES_JS = """
const chamadas = [];
const github = {
  rest: { issues: {
    removeLabel: async (a) => { chamadas.push(['removeLabel', a.issue_number, a.name]); },
    createComment: async (a) => { chamadas.push(['createComment', a.issue_number]); },
    update: async (a) => { chamadas.push(['update', a.issue_number, a.state]); },
  } },
  graphql: async () => ({ repository: { issue: { parent: null } } }),
};
const context = {
  repo: { owner: 'pedrorezendefig', repo: 'iae' },
  payload: { issue: { number: 7, labels: [{ name: 'in-progress' }, { name: 'fatia:M' }] } },
};
const core = { info: () => {} };
(async () => {
  await (async () => { %s })();
  console.log(JSON.stringify(chamadas));
})().catch((e) => { console.error(e); process.exit(1); });
"""


def test_fechar_issue_com_in_progress_tira_a_label(tmp_path: Path) -> None:
    import json

    wf = yaml.safe_load(HIGIENE.read_text(encoding="utf-8"))
    # `on:` vira True no YAML 1.1 do PyYAML.
    gatilhos = wf.get("on", wf.get(True))
    assert "closed" in gatilhos["issues"]["types"]
    script = wf["jobs"]["higiene"]["steps"][0]["with"]["script"]
    arquivo = tmp_path / "higiene.js"
    arquivo.write_text(ARNES_JS % script, encoding="utf-8")
    saida = subprocess.run(
        ["node", str(arquivo)], check=True, capture_output=True, text=True, encoding="utf-8"
    ).stdout
    chamadas = json.loads(saida)
    assert ["removeLabel", 7, "in-progress"] in chamadas
    assert ["removeLabel", 7, "fatia:M"] not in chamadas


# Templates de issue: o GitHub só oferece o template cujo cabeçalho YAML tem
# `name` e `about`; cabeçalho quebrado some da tela de "New issue" sem aviso.
TEMPLATES = RAIZ / ".github" / "ISSUE_TEMPLATE"


def _cabecalho(arquivo: Path) -> dict:
    texto = arquivo.read_text(encoding="utf-8")
    assert texto.startswith("---\n"), arquivo.name
    return yaml.safe_load(texto.split("---\n", 2)[1])


def test_nova_issue_oferece_os_templates_do_hospital() -> None:
    nomes = {_cabecalho(t)["name"] for t in TEMPLATES.glob("*.md")}
    assert nomes == {"Tarefa de agente (fatia vertical)", "Bug", "Feature / melhoria"}
    for t in TEMPLATES.glob("*.md"):
        assert _cabecalho(t)["about"], t.name


def test_tarefa_de_agente_entra_na_fila_do_agente() -> None:
    cabecalho = _cabecalho(TEMPLATES / "agent-task.md")
    assert cabecalho["labels"] == ["ready-for-agent"]


def test_templates_sem_travessao() -> None:
    for t in TEMPLATES.glob("*.md"):
        texto = t.read_text(encoding="utf-8")
        assert TRAVESSAO not in texto and MEIA_RISCA not in texto, t.name
