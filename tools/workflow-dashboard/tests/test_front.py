"""Critérios estruturais do shell (index.html + style.css), casca Baseline.

O comportamento dinâmico (aba inicial, render das ondas, copiáveis) é
verificado via Chrome headless contra o serve.py; aqui mora só o que é
contrato estático do painel: barato de checar e imune a refactor do JS.

Identidade IAE (manual da marca): tokens de design como bloco único, trilho
azul-marinho com o monograma na esquerda, topo branco com a logo, abas com ícone
e contador, canvas branco com cartões de borda fina, footer com hairline,
Montserrat 400 a 700 e primitivas de reveal.
"""

import re
from pathlib import Path

STATIC = Path(__file__).resolve().parents[1] / "static"
INDEX = (STATIC / "index.html").read_text(encoding="utf-8")
CSS = (STATIC / "style.css").read_text(encoding="utf-8")
UI_JS = (STATIC / "ui.js").read_text(encoding="utf-8")
APP_JS = (STATIC / "app.js").read_text(encoding="utf-8")
# módulos da SPA (vendor/ fica de fora: marked é vendorizado de propósito)
SPA_JS = {p.name: p.read_text(encoding="utf-8") for p in sorted(STATIC.glob("*.js"))}
CONTENT_JS = {p.name: p.read_text(encoding="utf-8") for p in sorted(STATIC.glob("content/*.js"))}


def _root_block():
    """O bloco :root{...}, única fonte de verdade da identidade visual."""
    m = re.search(r":root\{(.*?)\}", CSS, re.S)
    assert m, "style.css sem bloco :root de tokens"
    return m.group(1)


def _fora_do_root():
    return re.sub(r":root\{.*?\}", "", CSS, count=1, flags=re.S)


# ---------- navegação e branding ----------


def test_navegacao_tem_exatamente_4_abas_sem_grupos():
    # ADR 0062, decisão 3: Plano, Pendências e Guia saem; Issues é a home.
    # Mapa e Domínio viraram sub-pills de Documentação (PR da aba Documentação).
    abas = re.findall(r'data-tab="([^"]+)"', INDEX)
    assert abas == ["issues", "prs", "producao", "documentacao"]
    assert "tabgroup" not in INDEX  # sem rótulos nem separadores de grupo


def test_titulo_do_painel_e_iae_os():
    # ADR 0062, decisão 1: o painel se chama IAE OS (issue #947)
    assert re.search(r"<title>IAE OS</title>", INDEX)
    m = re.search(r'<h1 class="hero-title">(.*?)</h1>', INDEX, re.S)
    assert m, "hero sem h1.hero-title"
    texto = re.sub(r"<[^>]+>", "", m.group(1))  # só o texto, sem markup decorativo
    assert texto.strip() == "IAE OS"


# ---------- tokens de design (bloco único) ----------


def test_tokens_definem_a_paleta_da_marca():
    root = _root_block().lower()
    for hexa in (
        "#ffffff",  # canvas e cartão
        "#01213d",  # azul profundo do trilho e do estado ligado
        "#e8edf3",  # lavado azul da aba ativa
        "#1d1d1d",  # tinta, o cinza escuro do manual
        "#6b625f",  # tinta suave, quente
        "#e8e2de",  # hairline quente
        "#ccbab0",  # areia do manual
        "#c4282c",  # vermelho do erro e do contador
    ):
        assert hexa in root, f"token {hexa} fora do bloco :root"


def test_tokens_definem_tints_alpha_e_raios():
    root = _root_block()
    for tok in (
        "--w10",
        "--w15",
        "--w20",
        "--w25",
        "--w40",
        "--w55",
        "--w65",
        "--w70",
        "--w80",
        "--navy40",
    ):
        assert f"{tok}:" in root, f"tint {tok} ausente do bloco de tokens"
    assert "--r-card:6px" in root
    assert "--r-card-lg:8px" in root
    assert "--r-inner:5px" in root
    assert "--r-pill:" in root


def test_nenhuma_cor_fixa_fora_do_bloco_de_tokens():
    resto = _fora_do_root()
    hexas = re.findall(r"#[0-9a-fA-F]{3,8}\b", resto)
    assert not hexas, f"cores hex fora do :root: {sorted(set(hexas))}"
    funcs = re.findall(r"\b(?:rgba?|hsla?)\(", resto)
    assert not funcs, "rgb()/hsl() fora do bloco de tokens"
    # nem cor embutida em data-uri (ex.: seta do select, grão de papel)
    assert "%23" not in resto, "cor codificada em data-uri fora dos tokens"


def test_fonte_montserrat_e_geist_mono():
    m = re.search(r"@import url\('([^']+)'\)", CSS)
    assert m, "style.css sem @import de fontes"
    assert "fonts.googleapis.com" in m.group(1)
    assert "family=Montserrat:wght@400;500;600;700" in m.group(1)
    assert "family=Geist+Mono" in m.group(1)
    root = _root_block()
    assert re.search(r"--sans:\s*\"Montserrat\"", root)
    assert re.search(r"--mono:\s*\"Geist Mono\"", root)


def test_identidade_papel_coral_serifada_removida():
    todo = CSS + INDEX + "".join(SPA_JS.values())
    for marca in ("Fraunces", "IBM Plex Sans", "feTurbulence", "fractalNoise"):
        assert marca not in todo, f"identidade antiga sobrou: {marca}"
    for hexa in ("#DE5630", "#F4EFE4", "#2B2E7E", "#FBF8F0"):
        assert hexa.lower() not in todo.lower(), f"cor da identidade antiga: {hexa}"
    assert "var(--serif)" not in CSS, "tipografia serifada ainda referenciada"


# ---------- casca: hero, pills, inset, footer ----------


def test_barra_lateral_com_a_logo_e_titulo_em_caixa_normal():
    # a navegação inteira mora na barra lateral azul; o meio da tela é só conteúdo
    assert '<header class="hero side">' in INDEX
    hero = re.search(r"\.hero\{[^}]*\}", CSS)
    assert hero and "position:fixed" in hero.group(0) and "var(--rail)" in hero.group(0)
    assert "var(--brand)" in hero.group(0), "barra lateral fora do azul da marca"
    titulo = re.search(r"\.hero-title\{[^}]*\}", CSS)
    assert titulo, ".hero-title sumiu"
    assert "text-transform:uppercase" not in titulo.group(0), "título não pode forçar caixa alta (corta o til)"
    assert "IAE OS" in INDEX, "título perdeu o texto"
    assert 'href="#logo-iae"' in INDEX, "barra sem a logo"


def test_clip_protege_diacriticos_em_cima_e_embaixo():
    # issue 268: overflow:hidden do reveal cortava acentos acima da linha
    clip = re.search(r"\.clip\{[^}]*\}", CSS)
    assert clip, ".clip sumiu"
    assert "padding-bottom" in clip.group(0), "clip sem proteção de descendentes"
    assert "padding-top" in clip.group(0), "clip sem proteção de diacríticos no topo"


def test_hero_sem_linha_de_versao_duplicada():
    # issue 268: a cápsula de status já mostra a versão; a linha extra saiu
    assert "hero-version" not in INDEX, "linha de versão duplicada segue no hero"
    assert "hero-version" not in APP_JS, "renderMast ainda alimenta a linha duplicada"


def test_tabs_sem_caixa_alta_forcada():
    # issue 268: menos caps na casca; os rótulos já são capitalizados no HTML
    btn = re.search(r"\.tabs-row button\{[^}]*\}", CSS)
    assert btn, ".tabs-row button sumiu"
    assert "text-transform:uppercase" not in btn.group(0), "tabs não precisam de caixa alta"


def test_capsula_de_saude_translucida_na_barra():
    caps = re.search(r"\.capsule\{[^}]*\}", CSS)
    assert caps, "cápsula de saúde sumiu"
    assert "var(--w10)" in caps.group(0) and "var(--w15)" in caps.group(0), "cápsula fora do tint da barra"
    # o estado fica no pé da barra, dentro do header
    assert INDEX.index('id="mast-status"') < INDEX.index("</header>")


def test_abas_so_na_barra_com_icone_e_contador():
    btn = re.search(r"\.tabs-row button\{[^}]*\}", CSS)
    assert btn and "var(--r-inner)" in btn.group(0), "abas sem o canto arredondado"
    on = re.search(r"\.tabs-row button\.on\{[^}]*\}", CSS)
    assert on and "var(--card)" in on.group(0), "aba ativa fora do branco"
    assert INDEX.count('class="ico"') == 4, "cada aba leva um ícone, e só existe um menu"
    assert INDEX.index('id="tabs"') < INDEX.index("</header>"), "abas fora da barra lateral"
    assert ".tab-badge" in CSS and "contador(" in APP_JS, "abas sem o contador de abertos"


def test_sem_trilho_duplicado():
    # o trilho de ícones virou a barra lateral: um menu só
    assert "data-rail" not in INDEX and "data-rail" not in APP_JS
    assert ".rail{" not in CSS


def test_canvas_branco_com_secoes_cartao():
    body = re.search(r"(?<![\w-])body\{[^}]*\}", CSS)
    assert body and "var(--canvas)" in body.group(0), "página sem fundo canvas"
    assert "var(--rail)" in body.group(0), "conteúdo sem o recuo da barra lateral"
    card = re.search(r"\.card\{[^}]*\}", CSS)
    assert card and "var(--r-card)" in card.group(0), "cartões fora do raio de contêiner"
    assert "var(--shadow)" in card.group(0), "cartão sem a sombra de base"


def test_footer_claro_com_hairline():
    foot = re.search(r"\.foot\{[^}]*\}", CSS)
    assert foot and "var(--navy)" not in foot.group(0), "footer voltou ao fundo escuro"
    assert "border-top:1px solid var(--hairline)" in foot.group(0), "footer sem hairline"


def test_breakpoints_convencionais_640_768_1024():
    medias = re.findall(r"@media[^{]+", CSS)
    larguras = {bp for m in medias for bp in re.findall(r"width:(\d+px)", m)}
    assert {"640px", "768px", "1024px"} <= larguras, f"breakpoints ausentes: {larguras}"
    permitidos = {"640px", "768px", "769px", "1024px"}
    assert larguras <= permitidos, f"breakpoint fora do contrato: {larguras - permitidos}"
    assert "min-width:769px" in CSS, "hovers sem gate de viewport >768px"


# ---------- componentes base e movimento ----------


def test_eyebrow_com_ponto_colorido():
    assert ".eyebrow" in CSS
    dot = re.search(r"\.eyebrow::before\{[^}]*\}", CSS)
    assert dot and "border-radius" in dot.group(0), "eyebrow sem ponto (voltou a barra?)"


def test_pill_button_disponivel_e_usado_na_casca():
    assert ".btn-pill" in CSS, "pill button ausente do CSS"
    for variante in (".btn-pill.solid", ".btn-pill.outline"):
        assert variante in CSS, f"variante {variante} ausente"
    assert "btn-arrow" in CSS, "pill button sem seta deslizante"
    assert "btn-pill" in APP_JS, "casca não usa o pill button"


def test_primitivas_de_reveal():
    assert "IntersectionObserver" in UI_JS
    assert "revealOnScroll" in APP_JS, "casca não usa o reveal por IntersectionObserver"
    assert ".rv.in" in CSS, "fade+rise sem estado .in"
    assert "clip-inner" in CSS, "clip-mask dos títulos ausente"
    assert "--ease-expo" in CSS and "--ease-quart" in CSS, "easings nomeados ausentes"


def test_reveals_morrem_com_prefers_reduced_motion():
    m = re.search(r"@media \(prefers-reduced-motion:reduce\)\{(.*?)\n\}", CSS, re.S)
    assert m, "bloco prefers-reduced-motion ausente"
    bloco = m.group(1)
    assert "animation:none" in bloco and "transition:none" in bloco
    assert "opacity:1" in bloco, "elementos .rv ficariam invisíveis sem motion"


def test_painel_abre_sem_cerimonia():
    todo = "".join(SPA_JS.values()) + INDEX
    for proibido in ("lenis", "Lenis", "parallax", "autoplay", "preloader"):
        assert proibido not in todo, f"cerimônia de carregamento: {proibido}"


# ---------- higiene ----------


def test_sem_travessao_nem_meia_risca_nos_arquivos_do_painel():
    arquivos = {"index.html": INDEX, "style.css": CSS, **SPA_JS, **CONTENT_JS}
    for nome, texto in arquivos.items():
        assert "\u2014" not in texto, f"{nome} contém travessão"
        assert "\u2013" not in texto, f"{nome} contém meia-risca"


def test_spa_nao_carrega_a_biblioteca_mermaid():
    """Os diagramas são dos renderers próprios (ADR 0025); mermaid.js fora.

    A classe `language-mermaid` (fence do markdown dos snapshots) continua
    permitida: é como a SPA localiza os blocos que os renderers substituem.
    """
    proibidos = (
        "loadMermaid",
        "mermaidify",
        "mermaidP",
        "window.mermaid",
        "mermaid.min.js",
    )
    for nome, js in SPA_JS.items():
        for token in proibidos:
            assert token not in js, f"{nome} reintroduziu {token}"


def test_spa_nao_referencia_url_externa():
    """Painel 100% offline (ADR 0025): nenhum módulo da SPA aponta pra http(s)."""
    for nome, js in SPA_JS.items():
        assert "http://" not in js and "https://" not in js, f"{nome} referencia URL externa"


def test_index_so_carrega_script_local():
    srcs = re.findall(r'<script[^>]+src="([^"]+)"', INDEX)
    assert srcs, "index.html sem <script src>"
    for src in srcs:
        assert not src.startswith(("http:", "https:", "//")), f"script de CDN: {src}"


def test_fila_humana_virou_card_da_aba_issues():
    """Pendências saiu (ADR 0062, decisão 3): as issues abertas ready-for-human
    são o card Humana do funil da aba Issues, lidas do GitHub como o resto."""
    assert "renderPendencias" not in APP_JS
    assert "['humana', 'Humana'" in APP_JS
    assert "fhumana" not in APP_JS
    assert ".pend-card" not in CSS
