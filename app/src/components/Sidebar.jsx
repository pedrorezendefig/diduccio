import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ListTodo, Building2, Users, Car, Waves, Megaphone, Package,
  ArrowLeftRight, BadgeCheck, BookOpen, Gavel, PartyPopper, Flame, Truck,
  CalendarDays, FileText, UsersRound, Palette,
  LogOut, Moon, Sun, Menu, ChevronDown, ChevronUp,
} from "lucide-react";
import { useTheme } from "../theme/useTheme";
import Logo from "../brand/Logo";
// Quem vê cada item mora em src/auth/menu.js, a mesma tabela que o Manual lê.
import { TELAS_DO_MENU, podeVerTela } from "../auth/menu";

// Nome exibido quando difere da chave de permissão.
//
// `Entregas` virou "Entradas e Saídas" porque a tela deixou de ser só de
// entregador: ela registra visitante, motorista de aplicativo, hóspede de
// temporada e prestador de serviço. E resolve de quebra a confusão mais antiga
// deste menu — "Entregas" e "Encomendas" eram duas coisas diferentes com nomes
// que ninguém separava de primeira.
//
// A CHAVE continua `Entregas`, e é de propósito: ela governa a permissão e casa
// com a rota `/entregas`, que já está em favorito de quem usa o sistema. Nome
// de tela é para quem lê; chave é para o código.
const APELIDOS = {
  Entregas: "Entradas e Saídas",
  Festas: "Salão de Festas",
  Usuarios: "Usuários",
  Vitrine: "Design system",
};

// Agrupamento IDÊNTICO ao anterior. A spec lista a categorização atual como
// item a preservar: ela já faz sentido para o domínio, e reagrupar quebraria
// a memória muscular de quem usa o sistema todo dia.
const CATEGORIAS = [
  {
    titulo: "Principal",
    itens: [
      ["Dashboard", LayoutDashboard],
      ["Tarefas", ListTodo],
      ["Unidades", Building2],
      ["Moradores", Users],
      ["Vagas", Car],
      ["Piscina", Waves],
      ["Comunicado", Megaphone],
      ["Encomendas", Package],
      ["Entregas", ArrowLeftRight],
      ["Confirmação", BadgeCheck],
    ],
  },
  {
    titulo: "Ajuda",
    itens: [["Manual", BookOpen]],
  },
  {
    titulo: "Assembleia",
    itens: [["Assembleia", Gavel]],
  },
  {
    titulo: "Agendamentos",
    itens: [
      ["Festas", PartyPopper],
      ["Churrasqueira", Flame],
      ["Mudanças", Truck],
      ["Agendamento", CalendarDays],
    ],
  },
  {
    titulo: "Administração",
    itens: [
      ["Usuarios", UsersRound],
      ["Vitrine", Palette],
    ],
  },
];

/**
 * Categorias recolhidas ficam no navegador, não no estado da sessão: quem
 * fecha "Agendamentos" porque nunca usa espera achar fechado amanhã também.
 */
const CHAVE_FECHADAS = "vit:categoriasFechadas";

function lerFechadas() {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE_FECHADAS) || "[]");
    return new Set(Array.isArray(dados) ? dados : []);
  } catch {
    return new Set();
  }
}

/** "Confirmação" -> "confirmacao", "Mudanças" -> "mudancas". */
function paraRota(rotulo) {
  return rotulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Navegação principal do ViT.
 *
 * `contadores` é opcional: { Encomendas: 14, Entregas: 3, "Confirmação": 2 }.
 * A Sidebar RENDERIZA contador, não busca dado. Quem tem os números passa
 * por prop, para a navegação não virar dona de uma chamada de rede.
 */
export default function Sidebar({ active, setActive, user, onLogout, contadores = {} }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  const [menuAberto, setMenuAberto] = useState(false);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [fechadas, setFechadas] = useState(lerFechadas);
  const perfilRef = useRef(null);
  const gavetaRef = useRef(null);
  const botaoMenuRef = useRef(null);

  const podeVer = (rotulo) => podeVerTela(user?.cargo, rotulo);

  // Mantém o item destacado em sincronia com a URL, inclusive após F5.
  useEffect(() => {
    // Só o primeiro trecho: /manual/encomendas ainda é o item Manual.
    const caminho = location.pathname.split("/")[1];
    if (!caminho) return;
    const casado = Object.keys(TELAS_DO_MENU).find((r) => paraRota(r) === caminho);
    setActive(casado ?? caminho.charAt(0).toUpperCase() + caminho.slice(1));
  }, [location, setActive]);

  // Fecha o menu de perfil ao clicar fora.
  useEffect(() => {
    const aoClicarFora = (e) => {
      if (perfilRef.current && !perfilRef.current.contains(e.target)) {
        setMenuAberto(false);
      }
    };
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  // Esc fecha o que estiver aberto.
  useEffect(() => {
    const aoTeclar = (e) => {
      if (e.key !== "Escape") return;
      setMenuAberto(false);
      setGavetaAberta(false);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, []);

  // Gaveta mobile: trava o scroll do fundo, prende o Tab dentro dela e
  // devolve o foco ao botão de menu ao fechar. Mesma disciplina do Modal;
  // sem isso, no celular o leitor de tela vaza para o conteúdo atrás.
  useEffect(() => {
    if (!gavetaAberta) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const gaveta = gavetaRef.current;
    // Capturado agora: no cleanup o ref já pode apontar para outro nó.
    const botaoParaDevolverFoco = botaoMenuRef.current;
    const focaveis = () =>
      [...(gaveta?.querySelectorAll("button, a[href], [tabindex]:not([tabindex='-1'])") ?? [])]
        .filter((el) => el.offsetParent !== null);

    focaveis()[0]?.focus();

    const aoTabular = (e) => {
      if (e.key !== "Tab") return;
      const alvos = focaveis();
      if (alvos.length === 0) return;
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoTabular, true);
    return () => {
      document.removeEventListener("keydown", aoTabular, true);
      document.body.style.overflow = overflowAnterior;
      botaoParaDevolverFoco?.focus();
    };
  }, [gavetaAberta]);

  const alternarCategoria = (titulo) => {
    setFechadas((antes) => {
      const proximo = new Set(antes);
      if (proximo.has(titulo)) proximo.delete(titulo);
      else proximo.add(titulo);
      try {
        localStorage.setItem(CHAVE_FECHADAS, JSON.stringify([...proximo]));
      } catch {
        // Modo anônimo ou cota cheia: recolher continua funcionando na sessão.
      }
      return proximo;
    });
  };

  const ir = (rotulo) => {
    setActive(rotulo);
    setGavetaAberta(false);
    navigate(`/${paraRota(rotulo)}`);
  };

  const inicial = user?.nome ? user.nome.charAt(0).toUpperCase() : "U";
  const tituloAtual = APELIDOS[active] ?? active ?? "Diduccio";

  const renderItem = ([rotulo, Icone]) => {
    if (!podeVer(rotulo)) return null;
    const ativo = active === rotulo;
    const contador = contadores[rotulo];

    return (
      <li key={rotulo}>
        <button
          type="button"
          className="vit-navitem"
          aria-current={ativo ? "page" : undefined}
          onClick={() => ir(rotulo)}
        >
          <span className="vit-navitem__icone">
            <Icone size={17} strokeWidth={ativo ? 2.4 : 2} aria-hidden="true" />
          </span>
          <span className="vit-navitem__texto">{APELIDOS[rotulo] ?? rotulo}</span>
          {contador > 0 && (
            <span className="vit-navitem__contador">{contador}</span>
          )}
        </button>
      </li>
    );
  };

  return (
    <>
      {/* Topbar mobile de verdade, no lugar do botão flutuante que sobrepunha
          o conteúdo. Some no desktop por media query. */}
      <div className="vit-topbar">
        <button
          ref={botaoMenuRef}
          type="button"
          className="vit-topbar__menu"
          onClick={() => setGavetaAberta(true)}
          aria-label="Abrir navegação"
          aria-expanded={gavetaAberta}
        >
          <Menu size={22} aria-hidden="true" />
        </button>
        <Logo variant="mark" size={22} />
        <span className="vit-topbar__titulo">{tituloAtual}</span>
      </div>

      {gavetaAberta && (
        <div
          className="vit-gaveta-fundo"
          onClick={() => setGavetaAberta(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={gavetaRef}
        className={`vit-sidebar${gavetaAberta ? " vit-sidebar--aberta" : ""}`}
        aria-label="Navegação principal"
      >
        <div className="vit-sidebar__marca">
          <Logo variant="horizontal" />
        </div>

        <nav className="vit-sidebar__nav">
          {CATEGORIAS.map(({ titulo, itens }) => {
            const visiveis = itens.filter(([rotulo]) => podeVer(rotulo));
            if (visiveis.length === 0) return null;

            const fechada = fechadas.has(titulo);
            // Com a categoria fechada o item ativo some da vista. O título
            // assume o destaque para não perder a referência de onde se está.
            const escondeAtivo = fechada && visiveis.some(([r]) => r === active);
            const idLista = `vit-nav-${paraRota(titulo)}`;

            return (
              <React.Fragment key={titulo}>
                <button
                  type="button"
                  className={
                    "vit-sidebar__cat" +
                    (fechada ? " vit-sidebar__cat--fechada" : "") +
                    (escondeAtivo ? " vit-sidebar__cat--marcada" : "")
                  }
                  onClick={() => alternarCategoria(titulo)}
                  aria-expanded={!fechada}
                  aria-controls={idLista}
                  /* "Assembleia" é nome de categoria E de
                     item. Sem este prefixo o leitor de tela anuncia dois
                     botões idênticos e não dá para saber qual navega e qual
                     recolhe. O rótulo visível continua dentro do nome. */
                  aria-label={`Seção ${titulo}`}
                >
                  <ChevronDown size={13} className="vit-sidebar__seta" aria-hidden="true" />
                  <span className="vit-sidebar__cat-texto">{titulo}</span>
                </button>
                <ul id={idLista} className="vit-sidebar__lista" hidden={fechada}>
                  {visiveis.map(renderItem)}
                </ul>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="vit-sidebar__perfil" ref={perfilRef}>
          {menuAberto && (
            <div className="vit-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="vit-menu__item"
                onClick={() => { toggleTheme(); setMenuAberto(false); }}
              >
                {theme.isDark
                  ? <Sun size={16} aria-hidden="true" />
                  : <Moon size={16} aria-hidden="true" />}
                {theme.isDark ? "Modo claro" : "Modo escuro"}
              </button>
              <hr className="vit-menu__sep" />
              <button
                type="button"
                role="menuitem"
                className="vit-menu__item vit-menu__item--sair"
                onClick={onLogout}
              >
                <LogOut size={16} aria-hidden="true" />
                Sair do sistema
              </button>
            </div>
          )}

          <button
            type="button"
            className={`vit-perfil${menuAberto ? " vit-perfil--aberto" : ""}`}
            onClick={() => setMenuAberto((v) => !v)}
            aria-expanded={menuAberto}
            aria-haspopup="menu"
          >
            <span className="vit-perfil__avatar" aria-hidden="true">{inicial}</span>
            <span className="vit-perfil__texto">
              <span className="vit-perfil__nome">{user?.nome}</span>
              <span className="vit-perfil__cargo">{user?.cargo}</span>
            </span>
            {/* Chevron em vez de X: o botão abre e fecha o mesmo menu, então a
                seta diz a direção. O X sugeria descartar alguma coisa. */}
            <span className="vit-perfil__seta" aria-hidden="true">
              {menuAberto ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
