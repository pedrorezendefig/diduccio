#!/usr/bin/env python3
"""snapshot.py: gera os sete arquivos de `docs/spec/snapshots/` a partir de
`app/` (issue #5).

A stack do Diduccio: React 19 + Vite 7 (JSX, sem TypeScript), react-router-dom
7 com as rotas em `app/src/App.jsx`, Supabase (migrations SQL em
`app/supabase/migrations/`, Edge Functions em `app/supabase/functions/`) e
Vercel na frente. O que cada arquivo lê:
  - ESTRUTURA.md: árvore de `app/` até dois níveis (sem node_modules/dist);
  - ROTAS.md: as `<Route>` de `App.jsx`, com os cargos que o guard de cada
    bloco deixa passar (nomes em `app/src/auth/permissions.js`);
  - ENTIDADES.md e SCHEMA.md: as tabelas reconstruídas das migrations
    (CREATE TABLE, ADD/DROP COLUMN, FOREIGN KEY, CREATE INDEX, DROP TABLE);
  - MIGRATIONS.md: uma linha por `.sql`, com o primeiro comentário como resumo;
  - INTEGRACOES.md: as chaves do `app/.env.example` e os secrets que as Edge
    Functions leem com `Deno.env.get`, agrupados por serviço;
  - FLUXOGRAMAS.md: o diagrama de contexto (app no centro, serviços em volta)
    no subset Mermaid que o dashboard desenha.

O parser de SQL e os geradores de ENTIDADES, SCHEMA e MIGRATIONS vieram do
`/snapshot` do Hospital; o de rotas é novo, porque lá é FastAPI.

Uso:
    python3 .claude/skills/snapshot/scripts/snapshot.py [--check] [--root <repo>]

`--check` não escreve: sai com 1 e lista os arquivos que mudariam, 0 se está
em dia. Sem data nos arquivos, para o `--check` não acusar só o relógio.
O que o parser não entendeu (ALTER em tabela que nenhuma migration criou,
ALTER montado com `format()`) sai como aviso no stderr.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import OrderedDict
from pathlib import Path

PROJETO = "Diduccio"
APP = "app"
MIGRATIONS = f"{APP}/supabase/migrations"
FUNCOES = f"{APP}/supabase/functions"
APP_JSX = f"{APP}/src/App.jsx"
PERMISSIONS = f"{APP}/src/auth/permissions.js"
SAIDA = "docs/spec/snapshots"
SEM_APP = "A aplicação ainda não existe em `app/`."
IGNORAR = {"node_modules", ".venv", "__pycache__", ".next", "dist", "build", ".git"}
MOSTRAR_OCULTOS = {".env.example"}

AVISOS: list[str] = []


def _avisar(texto: str) -> None:
    if texto not in AVISOS:
        AVISOS.append(texto)


def _doc(titulo: str, linhas: list[str]) -> str:
    texto = "\n".join([f"# {titulo}", "<!-- gerado por /snapshot; não editar à mão -->", "", *linhas]) + "\n"
    # Travessão e meia-risca não entram em arquivo gerado, nem quando o
    # comentário de uma migration os traz.
    travessao, meia_risca = chr(0x2014), chr(0x2013)
    return texto.replace(f" {travessao} ", ", ").replace(travessao, "-").replace(meia_risca, "-")


def _celula(texto: str) -> str:
    return texto.replace("|", "\\|")


# ---------------------------------------------------------------------------
# ESTRUTURA
# ---------------------------------------------------------------------------

COMENTARIOS = {
    "public/": "ícones, manifest PWA, service worker e fontes",
    "src/": "o app React",
    "src/api/": "Supabase, Edge Functions, sessão e autenticação",
    "src/auth/": "cargos (permissions.js), sessão e inatividade",
    "src/brand/": "logo e marcas",
    "src/components/": "componentes compartilhados entre telas",
    "src/demo/": "modo demo com dados fictícios",
    "src/lib/": "regras e helpers sem React",
    "src/pages/": "uma tela por arquivo; rotas em App.jsx",
    "src/styles/": "CSS por tela",
    "src/theme/": "tema claro/escuro e tokens",
    "src/ui/": "primitivos do design system",
    "src/__tests__/": "vitest",
    "src/App.jsx": "rotas e guard de login",
    "src/main.jsx": "ponto de entrada",
    "supabase/": "banco e funções",
    "supabase/migrations/": "SQL numerado, aplicado em ordem",
    "supabase/functions/": "Edge Functions (Deno), uma pasta por função",
    "supabase/reset-dev.sql": "apaga e recria o schema em dev",
    "supabase/RECARGA.md": "como recarregar o banco a partir da planilha",
    ".env.example": "nomes das variáveis; copiar para .env.local",
    "vercel.json": "rewrite da SPA e cabeçalhos de segurança",
    "vite.config.js": "build e dev server",
    "index.html": "shell da SPA",
    "package.json": "dependências e scripts npm",
    "eslint.config.js": "lint",
}


def _filhos(pasta: Path) -> list[Path]:
    def mostrar(p: Path) -> bool:
        if p.name in IGNORAR:
            return False
        return not p.name.startswith(".") or p.name in MOSTRAR_OCULTOS

    return sorted((p for p in pasta.iterdir() if mostrar(p)), key=lambda p: (not p.is_dir(), p.name))


def _no(nome: str, chave: str, prefixo: str, ultimo: bool) -> str:
    linha = f"{prefixo}{'└── ' if ultimo else '├── '}{nome}"
    comentario = COMENTARIOS.get(chave)
    return f"{linha:<28} # {comentario}" if comentario else linha


def estrutura(raiz: Path) -> str:
    app = raiz / APP
    if not app.is_dir():
        return _doc("ESTRUTURA.md", [SEM_APP])
    linhas = ["```", f"{APP}/"]
    filhos = _filhos(app)
    for i, filho in enumerate(filhos):
        ultimo = i == len(filhos) - 1
        nome = f"{filho.name}/" if filho.is_dir() else filho.name
        linhas.append(_no(nome, nome, "", ultimo))
        if filho.is_dir():
            netos = _filhos(filho)
            for j, neto in enumerate(netos):
                nome_neto = f"{neto.name}/" if neto.is_dir() else neto.name
                linhas.append(_no(nome_neto, f"{filho.name}/{nome_neto}", "    " if ultimo else "│   ", j == len(netos) - 1))
    return _doc("ESTRUTURA.md", [
        f"Pastas de `{APP}/` do {PROJETO}, dois níveis. Para o detalhe, abra o código.",
        "",
        "## Aplicação (React 19 + Vite 7, JSX)",
        "",
        f"Localização: `{APP}/`",
        "",
        *linhas,
        "```",
    ])


# ---------------------------------------------------------------------------
# ROTAS: as <Route> de App.jsx
# ---------------------------------------------------------------------------

_ROLES_BLOCO = re.compile(r"export\s+const\s+ROLES\s*=\s*\{([^}]*)\}", re.S)
_ROLE_VALOR = re.compile(r'"([^"]+)"')
_IMPORT_PAGINA = re.compile(r'^import\s+(\w+)\s+from\s+"\./([^"]+)";', re.M)
_TOKEN = re.compile(
    r"(?P<logado>^\s*\)\s*:\s*\(\s*$)"
    r"|(?P<abre>\{[^{}\n]*&&\s*\($)"
    r"|(?P<fecha>^\s*\)\}\s*$)"
    r'|(?P<rota><Route\s+path="(?P<path>[^"]+)"\s+element=\{\s*<(?P<comp>\w+)(?P<attrs>[^>]*)>)',
    re.M,
)
_COND_LISTA = re.compile(r"\[([^\]]*)\]\.includes\(usuarioLogado\.cargo\)")
_COND_IGUAL = re.compile(r'usuarioLogado\.cargo\s*(===|!==)\s*"([^"]+)"')
_NAVIGATE_TO = re.compile(r'to="([^"]+)"')


def _cargos(raiz: Path) -> list[str]:
    arquivo = raiz / PERMISSIONS
    if not arquivo.is_file():
        return []
    m = _ROLES_BLOCO.search(arquivo.read_text(encoding="utf-8"))
    return _ROLE_VALOR.findall(m.group(1)) if m else []


def _cargos_da_condicao(texto: str, todos: list[str]) -> list[str] | None:
    """Cargos que a condição `{... && (` deixa passar; None quando ela não fala de cargo."""
    m = _COND_LISTA.search(texto)
    if m:
        return _ROLE_VALOR.findall(m.group(1))
    m = _COND_IGUAL.search(texto)
    if m:
        return [m.group(2)] if m.group(1) == "===" else [c for c in todos if c != m.group(2)]
    return None


def parse_rotas(raiz: Path) -> list[dict]:
    arquivo = raiz / APP_JSX
    if not arquivo.is_file():
        return []
    fonte = arquivo.read_text(encoding="utf-8")
    todos = _cargos(raiz)
    paginas = {nome: f"src/{caminho}.jsx" for nome, caminho in _IMPORT_PAGINA.findall(fonte)}
    rotas: list[dict] = []
    pilha: list[list[str] | None] = []
    logado = False
    for m in _TOKEN.finditer(fonte):
        if m.group("logado"):
            logado = True
        elif m.group("abre"):
            pilha.append(_cargos_da_condicao(m.group("abre"), todos))
        elif m.group("fecha"):
            if pilha:
                pilha.pop()
        else:
            comp = m.group("comp")
            if comp == "Navigate":
                destino = _NAVIGATE_TO.search(m.group("attrs"))
                desc = f"Redireciona para `{destino.group(1)}`" if destino else "Redireciona"
            elif comp in paginas:
                desc = f"Tela {comp} (`{paginas[comp]}`)"
            else:
                continue  # o <div> que embrulha a sidebar e o <main> não é tela
            cargos = todos
            for restricao in pilha:
                if restricao is not None:
                    cargos = [c for c in cargos if c in restricao]
            rotas.append({"path": m.group("path"), "desc": desc, "auth": logado,
                          "cargos": cargos if logado else []})
    return rotas


def gen_rotas_md(rotas: list[dict], todos: list[str]) -> str:
    if not rotas:
        return _doc("ROTAS.md", [SEM_APP if not rotas else f"Nenhuma `<Route>` em `{APP_JSX}`."])
    out = [
        f"Rotas de página do React Router do {PROJETO}, lidas de `{APP_JSX}`. Toda rota de página é GET;",
        "a coluna Cargos vem dos guards de `App.jsx` (nomes em `src/auth/permissions.js`).",
        "",
    ]
    grupos = [("Entrada", [r for r in rotas if not r["auth"]]), ("Painel", [r for r in rotas if r["auth"]])]
    for nome, itens in grupos:
        if not itens:
            continue
        out += [f"## {nome} (`{APP_JSX}`)", "", "| Método | Rota | O que faz | Auth | Cargos |", "|--------|------|-----------|------|--------|"]
        for r in itens:
            if not r["auth"]:
                cargos = "sem login"
            elif todos and r["cargos"] == todos:
                cargos = "todos"
            else:
                cargos = ", ".join(r["cargos"]) or "nenhum"
            out.append(f"| GET | `{r['path']}` | {_celula(r['desc'])} | {'✅' if r['auth'] else '❌'} | {cargos} |")
        out.append("")
    total = len(rotas)
    com_auth = sum(1 for r in rotas if r["auth"])
    out += ["---", "", f"**Totais:** {total} rotas em {sum(1 for _, i in grupos if i)} grupos, {com_auth * 100 // total}% exigem login."]
    return _doc("ROTAS.md", out)


# ---------------------------------------------------------------------------
# Migrations SQL (parser cumulativo, do Hospital, com `public.` na frente)
# ---------------------------------------------------------------------------

_ID = r'(?:[A-Za-z_][A-Za-z0-9_]*\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?'
SQL_CREATE_TABLE = re.compile(
    rf"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{_ID}\s*\(([^;]+?)\)\s*;",
    re.IGNORECASE | re.DOTALL,
)
SQL_ALTER_ADD_COL = re.compile(
    rf"ALTER\s+TABLE\s+(?:ONLY\s+)?{_ID}\s+(ADD\s+COLUMN\s+[^;]+?);",
    re.IGNORECASE | re.DOTALL,
)
SQL_ADD_COL_SEP = re.compile(r"(?:^|,)\s*ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?", re.IGNORECASE)
SQL_ALTER_DROP_COL = re.compile(
    rf"ALTER\s+TABLE\s+(?:ONLY\s+)?{_ID}\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?\"?([A-Za-z_][A-Za-z0-9_]*)\"?",
    re.IGNORECASE,
)
SQL_ALTER_FK = re.compile(
    rf"ALTER\s+TABLE\s+(?:ONLY\s+)?{_ID}\s+ADD\s+CONSTRAINT\s+\w+\s+FOREIGN\s+KEY\s*\(\s*\"?(\w+)\"?\s*\)\s*REFERENCES\s+{_ID}\s*\(\s*\"?(\w+)\"?\s*\)",
    re.IGNORECASE,
)
SQL_DROP_TABLE = re.compile(rf"DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?{_ID}", re.IGNORECASE)
SQL_CREATE_INDEX = re.compile(
    rf"CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?\"?([A-Za-z_][A-Za-z0-9_]*)\"?\s+ON\s+{_ID}\s*(?:USING\s+\w+\s*)?\(([^)]+)\)",
    re.IGNORECASE,
)
SQL_REFERENCES = re.compile(rf"REFERENCES\s+{_ID}\s*\(\s*\"?([A-Za-z_][A-Za-z0-9_]*)\"?\s*\)", re.IGNORECASE)
SQL_ALTER_DINAMICO = re.compile(r"format\s*\(\s*'[^']*alter\s+table[^']*'", re.IGNORECASE)
SQL_COMENTARIO = re.compile(r"--[^\n]*")
SQL_FIRST_COMMENT = re.compile(r"^\s*--\s*(.+?)$", re.MULTILINE)

_SQL_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _parse_column_def(text: str) -> dict | None:
    """Parse '<nome> <tipo> [constraints] [REFERENCES ...]'. Retorna dict ou None."""
    text = text.strip().rstrip(",").strip()
    if not text:
        return None
    if re.match(r"^(PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK|CONSTRAINT|LIKE)\b", text, re.IGNORECASE):
        return None
    parts = text.split(None, 1)
    if len(parts) < 2:
        return None
    name = parts[0].strip('"`')
    if not _SQL_IDENT_RE.match(name):
        return None
    rest = parts[1]
    type_match = re.match(r"^([a-zA-Z_][a-zA-Z0-9_]*(?:\([^)]+\))?(?:\s*\[\])?)", rest)
    col_type = type_match.group(1) if type_match else rest.split()[0]
    not_null = bool(re.search(r"\bNOT\s+NULL\b", rest, re.IGNORECASE))
    is_pk = bool(re.search(r"\bPRIMARY\s+KEY\b", rest, re.IGNORECASE))
    is_unique = bool(re.search(r"\bUNIQUE\b", rest, re.IGNORECASE))
    default_match = re.search(r"\bDEFAULT\s+([^,;]+?)(?:\s+(?:NOT\s+NULL|UNIQUE|REFERENCES|PRIMARY|CHECK)|\s*$)",
                              rest, re.IGNORECASE)
    default = default_match.group(1).strip() if default_match else None
    ref_match = SQL_REFERENCES.search(rest)
    return {
        "name": name,
        "type": col_type,
        "not_null": not_null,
        "is_pk": is_pk,
        "is_unique": is_unique,
        "default": default,
        "fk_table": ref_match.group(1) if ref_match else None,
        "fk_column": ref_match.group(2) if ref_match else None,
    }


def _split_table_body(body: str) -> list[str]:
    """Split table body by top-level commas (ignorando commas dentro de parens)."""
    parts = []
    depth = 0
    buf = []
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    if buf:
        parts.append("".join(buf))
    return parts


_DECORATIVE_RE = re.compile(r"^[=\-*#~_\s]+$")
_MIGRATION_PREFIX_RE = re.compile(r"^migration\s+\d+[:\s\-]+", re.IGNORECASE)


def _migration_summary(content: str) -> str:
    """Pega 1ª linha de comentário '-- foo' real (pula decoração e 'Migration N:')."""
    for m in SQL_FIRST_COMMENT.finditer(content):
        line = m.group(1).strip()
        if not line or _DECORATIVE_RE.match(line):
            continue
        line = _MIGRATION_PREFIX_RE.sub("", line)
        if line.lower().startswith("noqa"):
            continue
        if line:
            return line[:80]
    sem_comentarios = SQL_COMENTARIO.sub("", content)
    if SQL_CREATE_TABLE.search(sem_comentarios):
        names = SQL_CREATE_TABLE.findall(sem_comentarios)
        return f"criar tabela(s) {', '.join(n[0] for n in names)}"[:80]
    if SQL_ALTER_ADD_COL.search(sem_comentarios):
        return "alter table(s): add column(s)"
    if SQL_DROP_TABLE.search(sem_comentarios):
        return "drop table(s)"
    return "sem resumo"


def _aplicar_fk(tables: dict, table_name: str, col_name: str, fk_table: str, fk_column: str, arquivo: str) -> None:
    if table_name not in tables:
        _avisar(f"{arquivo}: FOREIGN KEY em `{table_name}`, tabela que nenhuma migration criou")
        return
    for col in tables[table_name]["columns"]:
        if col["name"] == col_name:
            col["fk_table"], col["fk_column"] = fk_table, fk_column
            break
    else:
        _avisar(f"{arquivo}: FOREIGN KEY em `{table_name}.{col_name}`, coluna que o parser não viu")
    tables[table_name]["altered_in"].append(arquivo)


def parse_migrations(migrations_dir: Path) -> dict:
    """Reconstrói estado cumulativo das tabelas + history das migrations."""
    tables: dict[str, dict] = OrderedDict()
    history: list[dict] = []

    if not migrations_dir.exists():
        return {"tables": tables, "history": history}

    for sql_file in sorted(migrations_dir.glob("*.sql")):
        bruto = sql_file.read_text(encoding="utf-8")
        # Comentário dentro de CREATE TABLE ou de um ALTER de várias colunas
        # traz vírgula e ponto e vírgula de prosa; sai antes do parse.
        content = SQL_COMENTARIO.sub("", bruto)
        nome = sql_file.name

        adds = [p for m in SQL_ALTER_ADD_COL.finditer(content)
                for p in SQL_ADD_COL_SEP.split(m.group(2)) if p.strip()]
        counts = {
            "create_table": len(SQL_CREATE_TABLE.findall(content)),
            "alter_table": len(adds) + len(SQL_ALTER_DROP_COL.findall(content)) + len(SQL_ALTER_FK.findall(content)),
            "create_index": len(SQL_CREATE_INDEX.findall(content)),
            "drop": len(SQL_DROP_TABLE.findall(content)) + len(SQL_ALTER_DROP_COL.findall(content)),
        }
        history.append({"file": nome, "summary": _migration_summary(bruto), "counts": counts, "order": _extract_order(nome)})

        if SQL_ALTER_DINAMICO.search(content):
            _avisar(f"{nome}: ALTER TABLE montado com format() em bloco DO; o parser não vê essas colunas")

        for match in SQL_CREATE_TABLE.finditer(content):
            table_name, body = match.group(1), match.group(2)
            cols = []
            fks = []
            for part in _split_table_body(body):
                col = _parse_column_def(part)
                if col:
                    cols.append(col)
                fk = re.search(rf"FOREIGN\s+KEY\s*\(\s*\"?(\w+)\"?\s*\)\s*{SQL_REFERENCES.pattern}", part, re.IGNORECASE)
                if fk:
                    fks.append(fk.groups())
            tables[table_name] = {"columns": cols, "indexes": [], "first_seen": nome, "altered_in": []}
            for col_name, fk_table, fk_column in fks:
                _aplicar_fk(tables, table_name, col_name, fk_table, fk_column, nome)

        for match in SQL_ALTER_ADD_COL.finditer(content):
            table_name = match.group(1)
            if table_name not in tables:
                _avisar(f"{nome}: ADD COLUMN em `{table_name}`, tabela que nenhuma migration criou")
                continue
            for col_text in SQL_ADD_COL_SEP.split(match.group(2)):
                col = _parse_column_def(col_text)
                if not col:
                    continue
                existing_idx = next((i for i, c in enumerate(tables[table_name]["columns"]) if c["name"] == col["name"]), -1)
                if existing_idx >= 0:
                    tables[table_name]["columns"][existing_idx] = col
                else:
                    tables[table_name]["columns"].append(col)
                tables[table_name]["altered_in"].append(nome)

        for match in SQL_ALTER_DROP_COL.finditer(content):
            table_name, col_name = match.group(1), match.group(2)
            if table_name in tables:
                tables[table_name]["columns"] = [c for c in tables[table_name]["columns"] if c["name"] != col_name]
                tables[table_name]["altered_in"].append(nome)
            else:
                _avisar(f"{nome}: DROP COLUMN em `{table_name}`, tabela que nenhuma migration criou")

        for match in SQL_ALTER_FK.finditer(content):
            _aplicar_fk(tables, *match.groups(), nome)

        for match in SQL_DROP_TABLE.finditer(content):
            tables.pop(match.group(1), None)

        for match in SQL_CREATE_INDEX.finditer(content):
            idx_name, table_name, cols = match.group(1), match.group(2), match.group(3).strip()
            if table_name in tables:
                tables[table_name]["indexes"].append({"name": idx_name, "cols": cols, "file": nome})
            else:
                _avisar(f"{nome}: CREATE INDEX em `{table_name}`, tabela que nenhuma migration criou")

    return {"tables": tables, "history": history}


def _extract_order(filename: str) -> int:
    m = re.match(r"^(\d+)", filename)
    return int(m.group(1)) if m else 9999


# ---------------------------------------------------------------------------
# ENTIDADES, SCHEMA e MIGRATIONS (geradores do Hospital)
# ---------------------------------------------------------------------------

def gen_entidades_md(parsed: dict) -> str:
    tables = parsed["tables"]
    if not tables:
        return _doc("ENTIDADES.md", [f"Nenhuma tabela nas migrations de `{MIGRATIONS}/`."])
    out = [f"Modelo de dados do {PROJETO}. Tabelas no Postgres (via Supabase), reconstruídas das migrations.", ""]
    for table_name, info in tables.items():
        out += [f"## {table_name}", ""]
        provenance = f"Origem: `{info['first_seen']}`"
        if info["altered_in"]:
            provenance += f" (alterada em: {', '.join(OrderedDict.fromkeys(info['altered_in']))})"
        out += [f"> {provenance}", "", "| Campo | Tipo | Constraints | Default | FK |", "|-------|------|-------------|---------|-----|"]
        for col in info["columns"]:
            constraints = [n for ok, n in ((col["is_pk"], "PK"), (col["is_unique"], "UNIQUE"), (col["not_null"], "NOT NULL")) if ok]
            constraints_str = ", ".join(constraints) if constraints else "-"
            default_str = f"`{_celula(col['default'])}`" if col["default"] else "-"
            fk_str = f"`{col['fk_table']}.{col['fk_column']}`" if col["fk_table"] else "-"
            out.append(f"| `{col['name']}` | `{col['type']}` | {constraints_str} | {default_str} | {fk_str} |")
        out.append("")
        if info["indexes"]:
            out.append("**Indexes:**")
            out += [f"- `{idx['name']}` em `({idx['cols']})` (de `{idx['file']}`)" for idx in info["indexes"]]
            out.append("")
    out += ["---", "", f"**Resumo:** {len(tables)} tabelas vivas."]
    return _doc("ENTIDADES.md", out)


def gen_schema_md(parsed: dict) -> str:
    tables = parsed["tables"]
    if not tables:
        return _doc("SCHEMA.md", [f"Nenhuma tabela nas migrations de `{MIGRATIONS}/`."])
    out = [f"Diagrama relacional do {PROJETO}. Renderiza nativo no GitHub.", "", "## Diagrama ER (Mermaid)", "", "```mermaid", "erDiagram"]
    edges: set[tuple[str, str, str]] = set()
    for table_name, info in tables.items():
        for col in info["columns"]:
            if col["fk_table"] and col["fk_table"] in tables:
                edges.add((col["fk_table"], table_name, col["name"]))
    for parent, child, col_name in sorted(edges):
        out.append(f'    {parent} ||--o{{ {child} : "{col_name}"')
    out.append("")
    for table_name, info in tables.items():
        out.append(f"    {table_name} {{")
        for col in info["columns"][:8]:
            type_short = col["type"].split("(")[0]
            marker = "PK" if col["is_pk"] else "FK" if col["fk_table"] else ""
            out.append(f"        {type_short} {col['name']} {marker}".rstrip())
        if len(info["columns"]) > 8:
            out.append(f'        _ mais_colunas "+{len(info["columns"]) - 8}"')
        out.append("    }")
    out += ["```", "", "## Indexes principais", "", "| Tabela | Index | Colunas | Origem |", "|--------|-------|---------|--------|"]
    for table_name, info in tables.items():
        for idx in info["indexes"]:
            out.append(f"| `{table_name}` | `{idx['name']}` | `{idx['cols']}` | `{idx['file']}` |")
    out += ["", "---", f"**Resumo:** {len(tables)} tabelas, {len(edges)} relacionamentos FK detectados."]
    return _doc("SCHEMA.md", out)


def gen_migrations_md(parsed: dict) -> str:
    history = parsed["history"]
    if not history:
        return _doc("MIGRATIONS.md", [f"Nenhuma migration em `{MIGRATIONS}/`."])
    out = [f"Ordem cronológica das migrations do Postgres do {PROJETO} (`{MIGRATIONS}/`).", "",
           "| # | Arquivo | Resumo | C | A | I | D |", "|---|---------|--------|---|---|---|---|"]
    for h in history:
        c = h["counts"]
        out.append(f"| {h['order']} | `{h['file']}` | {_celula(h['summary'])} | "
                   f"{c['create_table']} | {c['alter_table']} | {c['create_index']} | {c['drop']} |")
    out += ["", "**Legenda:** C = CREATE TABLE, A = ALTER TABLE (coluna ou FK), I = CREATE INDEX, D = DROP.",
            f"**Total:** {len(history)} migrations."]
    return _doc("MIGRATIONS.md", out)


# ---------------------------------------------------------------------------
# INTEGRACOES: chaves do .env.example e secrets das Edge Functions, por serviço
# ---------------------------------------------------------------------------

_CHAVE_ENV = re.compile(r"^\s*([A-Z][A-Z0-9_]*)\s*=", re.M)
_DENO_ENV = re.compile(r'Deno\.env\.get\(\s*"([A-Z][A-Z0-9_]*)"')
_PRIMEIRO_COMENTARIO_TS = re.compile(r"^//\s*(.+?)\s*$", re.M)

# Cada serviço: as chaves que pertencem a ele (prefixo) e os textos que marcam
# onde ele aparece no código. Chave de ambiente que não casa com nenhum entra
# em "Outras chaves do .env.example", para nada sumir.
SERVICOS = [
    {
        "nome": "Supabase",
        "papel": "Auth (login por CPF pela Edge Function `entrar`), Postgres com RLS, Storage dos anexos e as Edge Functions",
        "primaria": "VITE_SUPABASE_URL",
        "prefixos": ("VITE_SUPABASE_", "SUPABASE_"),
        "marcas": ("VITE_SUPABASE_URL", "SUPABASE_URL"),
    },
    {
        "nome": "Gemini",
        "papel": "Modelos de texto da função `ia` (comunicado, resumo e perguntas às atas); primeiro provedor da cascata",
        "primaria": "GEMINI_API_KEY",
        "prefixos": ("GEMINI_",),
        "marcas": ("GEMINI_API_KEY", "generativelanguage.googleapis.com"),
    },
    {
        "nome": "Groq",
        "papel": "Segundo provedor da cascata da função `ia`, quando o Gemini falha ou está sobrecarregado",
        "primaria": "GROQ_API_KEY",
        "prefixos": ("GROQ_",),
        "marcas": ("GROQ_API_KEY", "api.groq.com"),
    },
    {
        "nome": "WhatsApp",
        "papel": "Click-to-chat: o app abre `wa.me` ou `api.whatsapp.com/send` com a mensagem pronta; sem API nem chave",
        "primaria": "",
        "prefixos": (),
        "marcas": ("wa.me", "api.whatsapp.com"),
    },
    {
        "nome": "Vercel",
        "papel": "Hospedagem do build; `vercel.json` reescreve tudo para `index.html` e manda os cabeçalhos de segurança (CSP, HSTS)",
        "primaria": "",
        "prefixos": ("VERCEL_",),
        "marcas": (),
        "arquivos": ("vercel.json",),
    },
    {
        "nome": "Apps Script (herança)",
        "papel": "Backend antigo; só a presença de `VITE_API_URL` ainda importa: sem ela, ou com `VITE_DEMO=true`, o app sobe em modo demo com dados fictícios",
        "primaria": "VITE_API_URL",
        "prefixos": ("VITE_API_URL", "VITE_SHEETS_", "VITE_DEMO"),
        "marcas": ("VITE_API_URL", "VITE_DEMO"),
    },
]


def _arquivos_de_codigo(raiz: Path):
    app = raiz / APP
    for pasta in (app / "src", app / "supabase" / "functions"):
        if pasta.is_dir():
            for p in sorted(pasta.rglob("*")):
                if p.is_file() and p.suffix in {".js", ".jsx", ".ts", ".tsx", ".json", ".sql"}:
                    yield p
    for nome in ("vercel.json", "vite.config.js"):
        if (app / nome).is_file():
            yield app / nome


def _onde_aparece(raiz: Path, termos: tuple[str, ...], maximo: int = 3) -> list[str]:
    achados = []
    if not termos:
        return achados
    for p in _arquivos_de_codigo(raiz):
        try:
            texto = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if any(t in texto for t in termos):
            achados.append(p.relative_to(raiz / APP).as_posix())
    return achados[:maximo]


def _edge_functions(raiz: Path) -> list[tuple[str, str]]:
    pasta = raiz / FUNCOES
    if not pasta.is_dir():
        return []
    funcoes = []
    for d in sorted(p for p in pasta.iterdir() if p.is_dir() and (p / "index.ts").is_file()):
        m = _PRIMEIRO_COMENTARIO_TS.search((d / "index.ts").read_text(encoding="utf-8"))
        funcoes.append((d.name, m.group(1).rstrip(".") if m else ""))
    return funcoes


def gen_integracoes_md(raiz: Path) -> str:
    app = raiz / APP
    if not app.is_dir():
        return _doc("INTEGRACOES.md", [SEM_APP])
    exemplo = app / ".env.example"
    chaves_env = list(OrderedDict.fromkeys(_CHAVE_ENV.findall(exemplo.read_text(encoding="utf-8")))) if exemplo.is_file() else []
    secrets_edge: list[str] = []
    for p in sorted((raiz / FUNCOES).rglob("*.ts")) if (raiz / FUNCOES).is_dir() else []:
        for chave in _DENO_ENV.findall(p.read_text(encoding="utf-8")):
            if chave not in secrets_edge:
                secrets_edge.append(chave)
    funcoes = _edge_functions(raiz)

    out = [
        f"Serviços externos do {PROJETO}. Só o nome das chaves, nunca o valor: as `VITE_*` vão para o bundle",
        "(lidas de `app/.env.example`), as outras vivem nos Secrets do projeto Supabase e são lidas",
        "pelas Edge Functions com `Deno.env.get`.",
        "",
    ]
    sobraram = list(chaves_env)
    for s in SERVICOS:
        minhas_env = [c for c in chaves_env if c.startswith(s["prefixos"])]
        minhas_edge = [c for c in secrets_edge if c.startswith(s["prefixos"]) and c not in minhas_env]
        for c in minhas_env:
            sobraram.remove(c)
        relacionadas = [c for c in minhas_env + minhas_edge if c != s["primaria"]]
        onde = [*s.get("arquivos", ()), *_onde_aparece(raiz, s["marcas"])][:3]
        if not (minhas_env or minhas_edge or onde):
            continue
        out += [f"## {s['nome']}", f"**Pra que serve:** {s['papel']}"]
        if onde:
            out.append("**Onde aparece no código:** " + ", ".join(f"`{o}`" for o in onde))
        if s["primaria"]:
            out.append(f"**Secret/env primária:** `{s['primaria']}`")
        if relacionadas:
            out.append("**Variáveis relacionadas:** " + ", ".join(f"`{c}`" for c in relacionadas))
        if minhas_edge:
            out.append("**Secrets das Edge Functions:** " + ", ".join(f"`{c}`" for c in minhas_edge))
        if s["nome"] == "Supabase" and funcoes:
            out.append("**Edge Functions:** " + "; ".join(f"`{n}` ({d})" if d else f"`{n}`" for n, d in funcoes))
        out.append("")
    if sobraram:
        out += ["## Outras chaves do .env.example",
                "**Pra que serve:** Chaves que não pertencem a nenhum serviço acima; o comentário no `.env.example` diz para que servem",
                "**Variáveis relacionadas:** " + ", ".join(f"`{c}`" for c in sobraram), ""]
    out += ["---", f"**Resumo:** {sum(1 for l in out if l.startswith('## '))} integrações externas."]
    return _doc("INTEGRACOES.md", out)


# ---------------------------------------------------------------------------
# FLUXOGRAMAS: diagrama de contexto
# ---------------------------------------------------------------------------

def gen_fluxogramas_md(raiz: Path) -> str:
    if not (raiz / APP).is_dir():
        return _doc("FLUXOGRAMAS.md", [SEM_APP])
    nomes = [n for n, _ in _edge_functions(raiz)]
    edge = "Edge Functions<br/>" + ", ".join(nomes) if nomes else "Edge Functions"
    return _doc("FLUXOGRAMAS.md", [
        f"Fluxos do {PROJETO} no subset Mermaid que o dashboard desenha (flowchart TD, sequenceDiagram,",
        "stateDiagram-v2). Renderiza nativo no GitHub.",
        "",
        "## Contexto: quem fala com quem",
        "",
        "```mermaid",
        "flowchart TD",
        f"    vercel[Vercel] -- hospeda o build --> app[{PROJETO}<br/>React 19 + Vite 7]",
        "    app -- login e sessão --> auth[Supabase Auth]",
        "    app -- leitura e escrita com RLS --> db[Supabase Postgres]",
        "    app -- anexos e fotos --> storage[Supabase Storage]",
        f"    app -- fetch com o token da sessão --> edge[{edge}]",
        "    edge -- service role --> db",
        "    edge -- texto, primeiro da cascata --> gemini[Gemini]",
        "    edge -- texto, segundo da cascata --> groq[Groq]",
        "    app -- link click-to-chat --> whatsapp[WhatsApp]",
        "```",
        "",
        "**Quem é quem (para leigo):**",
        f"- **app** - o {PROJETO} no navegador: React servido pela Vercel, fala direto com o Supabase.",
        "- **vercel** - hospeda o build estático e reescreve toda URL para `index.html`.",
        "- **auth** - Supabase Auth guarda as contas; o login entra pela função `entrar`, que converte CPF em e-mail.",
        "- **db** - Postgres do Supabase; o RLS decide o que cada cargo lê e escreve.",
        "- **storage** - bucket do Supabase com fotos, atestados, notas e assinaturas.",
        "- **edge** - funções Deno no Supabase para o que não pode rodar no navegador: criar e gerir usuário, login, IA e receita.",
        "- **gemini** - modelos de texto do Google, primeiro provedor da função `ia`.",
        "- **groq** - segundo provedor da função `ia`, usado quando o Gemini falha.",
        "- **whatsapp** - link pronto que abre a conversa com o morador; o app não manda mensagem sozinho.",
    ])


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def gerar(raiz: Path) -> dict[str, str]:
    AVISOS.clear()
    parsed = parse_migrations(raiz / MIGRATIONS)
    rotas = parse_rotas(raiz)
    return {
        "ESTRUTURA.md": estrutura(raiz),
        "ROTAS.md": gen_rotas_md(rotas, _cargos(raiz)),
        "ENTIDADES.md": gen_entidades_md(parsed),
        "SCHEMA.md": gen_schema_md(parsed),
        "MIGRATIONS.md": gen_migrations_md(parsed),
        "INTEGRACOES.md": gen_integracoes_md(raiz),
        "FLUXOGRAMAS.md": gen_fluxogramas_md(raiz),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Gera docs/spec/snapshots/ a partir de app/.")
    ap.add_argument("--check", action="store_true", help="não escreve; sai com 1 se algum arquivo mudaria")
    ap.add_argument("--root", default=".", help="raiz do repositório (default: cwd)")
    args = ap.parse_args()
    raiz = Path(args.root).resolve()
    pasta = raiz / SAIDA
    gerados = gerar(raiz)
    mudariam = [nome for nome, texto in gerados.items()
                if not (pasta / nome).is_file() or (pasta / nome).read_text(encoding="utf-8") != texto]
    for aviso in AVISOS:
        print(f"aviso: {aviso}", file=sys.stderr)
    if args.check:
        if mudariam:
            print("snapshot desatualizado: " + ", ".join(mudariam))
            return 1
        print("snapshot em dia.")
        return 0
    pasta.mkdir(parents=True, exist_ok=True)
    for nome in mudariam:
        (pasta / nome).write_text(gerados[nome], encoding="utf-8")
    print("snapshot: " + (", ".join(mudariam) if mudariam else "nada mudou"))
    return 0


if __name__ == "__main__":
    for fluxo in (sys.stdout, sys.stderr):  # Windows: o pipe sai em cp1252
        fluxo.reconfigure(encoding="utf-8")
    sys.exit(main())
