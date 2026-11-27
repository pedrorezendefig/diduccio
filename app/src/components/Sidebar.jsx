import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  House, LayoutGrid, SquareCheckBig, Building2, Users, CarFront, Waves, Megaphone,
  PackageOpen, ArrowRightLeft, UserCheck, Vote, PartyPopper, Flame,
  Truck, CalendarClock, CalendarDays, UserCog, Palette, ShieldAlert, Smartphone, Banknote,
  BookOpen, LogOut, Moon, Sun, Menu, ChevronDown, ChevronUp, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { useTheme } from "../theme/useTheme";
import Logo from "../brand/Logo";

// Quem vê cada item mora em src/auth/menu.js, a mesma tabela que o Manual lê.
import { TELAS_DO_MENU as PERMISSIONS } from "../auth/menu";

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
  Inicio: "Início",
  Entregas: "Entradas e Saídas",
  Festas: "Salão de Festas",
  Usuarios: "Usuários",
  "Confirmação": "Confirmações",
  App: "Moradores no app",
  Cotas: "Cotas extras",
  Calendario: "Agenda",
  Vitrine: "Design system",
};

// Seis áreas no lugar da "Principal" de 12 itens, que misturava portaria,
// cadastro e comunicação numa lista só. Cada área responde a uma pergunta de
// quem usa ("chegou alguma coisa?", "quem mora no 304?"), e o modo encolhido
// separa uma da outra por um filete. Só muda onde o item aparece: chave,
// rota e permissão continuam as mesmas.
const CATEGORIAS = [
  {
    titulo: "Início",
    itens: [
      ["Inicio", House],
      ["Dashboard", LayoutGrid],
      ["Tarefas", SquareCheckBig],
    ],
  },
  {
    // A fila do dia do porteiro inteira numa área só, no alto do menu.
    titulo: "Portaria",
    itens: [
      ["Encomendas", PackageOpen],
      ["Entregas", ArrowRightLeft],
      ["Vagas", CarFront],
    ],
  },
  {
    // Piscina mora aqui porque a tela é o cadastro das carteirinhas, não uma
    // reserva de horário.
    titulo: "Cadastros",
    itens: [
      ["Unidades", Building2],
      ["Moradores", Users],
      ["Piscina", Waves],
    ],
  },
  {
    // Tudo o que entra ou sai do app do morador numa área só: aprovar o
    // cadastro, ver quem já usa, e o que se publica lá (notícias, agenda, cotas).
    titulo: "Aplicativo do morador",
    itens: [
      ["Confirmação", UserCheck],
      ["App", Smartphone],
      ["Comunicado", Megaphone],
      ["Calendario", CalendarDays],
      ["Cotas", Banknote],
    ],
  },
  {
    titulo: "Comunicação",
    itens: [
      ["Notificações", ShieldAlert],
      ["Assembleia", Vote],
    ],
  },
  {
    titulo: "Reservas",
    itens: [
      ["Festas", PartyPopper],
      ["Churrasqueira", Flame],
      ["Mudanças", Truck],
      ["Agendamento", CalendarClock],
    ],
  },
  {
    titulo: "Ajuda",
    itens: [["Manual", BookOpen]],
  },
  {
    titulo: "Sistema",
    itens: [
      ["Usuarios", UserCog],
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

/** Menu encolhido só com ícones: mesma lógica, fica como a pessoa deixou. */
const CHAVE_ENCOLHIDO = "vit:menuEncolhido";

function lerEncolhido() {
  try {
    return localStorage.getItem(CHAVE_ENCOLHIDO) === "1";
  } catch {
    return false;
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
  const [encolhida, setEncolhida] = useState(lerEncolhido);
  // Encolhido, o nome da tela some: o tooltip devolve. Fica em position:
  // fixed porque a lista rola e cortaria qualquer coisa ancorada nela.
  const [dica, setDica] = useState(null);
  const timerDica = useRef(null);
  const perfilRef = useRef(null);
  const gavetaRef = useRef(null);
  const botaoMenuRef = useRef(null);

  const podeVer = (rotulo) => (PERMISSIONS[rotulo] ?? []).includes(user?.cargo);

  // Mantém o item destacado em sincronia com a URL, inclusive após F5.
  useEffect(() => {
    const caminho = location.pathname.slice(1);
    if (!caminho) return;
    // O Modo foco abre pelo Início e não tem item próprio no menu.
    if (caminho === "modo-foco") { setActive("Inicio"); return; }
    const casado = Object.keys(PERMISSIONS).find((r) => paraRota(r) === caminho);
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

  const alternarEncolhida = () => {
    setEncolhida((antes) => {
      const proximo = !antes;
      try {
        localStorage.setItem(CHAVE_ENCOLHIDO, proximo ? "1" : "0");
      } catch {
        // Sem armazenamento o botão continua valendo até recarregar.
      }
      return proximo;
    });
    setMenuAberto(false);
    esconderDica();
  };

  // Espera 80ms antes de mostrar: o cursor que só passa pela lista a caminho
  // do conteúdo não acende uma fileira de tooltips.
  const mostrarDica = (e, texto) => {
    if (!encolhida) return;
    const alvo = e.currentTarget.getBoundingClientRect();
    clearTimeout(timerDica.current);
    timerDica.current = setTimeout(() => {
      setDica({ texto, top: alvo.top + alvo.height / 2, left: alvo.right + 12 });
    }, 80);
  };
  const esconderDica = () => {
    clearTimeout(timerDica.current);
    setDica(null);
  };
  useEffect(() => () => clearTimeout(timerDica.current), []);

  const ir = (rotulo) => {
    setActive(rotulo);
    setGavetaAberta(false);
    esconderDica();
    navigate(`/${paraRota(rotulo)}`);
  };

  // Aceita os dois sentidos para o controle Claro/Escuro: o provider só sabe
  // alternar, então só alterna quando o pedido é diferente do atual.
  const usarTema = (escuro) => {
    if (theme.isDark !== escuro) toggleTheme();
  };

  const inicial = user?.nome ? user.nome.charAt(0).toUpperCase() : "U";
  const tituloAtual = APELIDOS[active] ?? active ?? "Diduccio";

  const renderItem = ([rotulo, Icone]) => {
    if (!podeVer(rotulo)) return null;
    const ativo = active === rotulo;
    const contador = contadores[rotulo];
    const nome = APELIDOS[rotulo] ?? rotulo;

    return (
      <li key={rotulo}>
        <button
          type="button"
          className="vit-navitem"
          aria-current={ativo ? "page" : undefined}
          onClick={() => ir(rotulo)}
          onMouseEnter={(e) => mostrarDica(e, contador > 0 ? `${nome} · ${contador}` : nome)}
          onMouseLeave={esconderDica}
          onFocus={(e) => mostrarDica(e, nome)}
          onBlur={esconderDica}
        >
          {/* Encolhido, o contador vira bolinha no canto do ícone. O número
              sai do CSS (attr) para não duplicar o texto que o leitor de
              tela já lê no contador ao lado do nome. */}
          <span
            className="vit-navitem__icone"
            data-contador={contador > 0 ? (contador > 9 ? "9+" : contador) : undefined}
          >
            <Icone size={18} strokeWidth={ativo ? 2.25 : 1.75} aria-hidden="true" />
          </span>
          <span className="vit-navitem__texto">{nome}</span>
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
        className={
          "vit-sidebar" +
          (gavetaAberta ? " vit-sidebar--aberta" : "") +
          (encolhida ? " vit-sidebar--encolhida" : "")
        }
        aria-label="Navegação principal"
      >
        <div className="vit-sidebar__marca">
          <Logo variant="inverse" />
        </div>

        {/* Alça na borda: fica no mesmo lugar aberta ou encolhida, então a
            mão não precisa procurar o botão de volta. Some no celular, onde
            a lateral é gaveta. */}
        <button
          type="button"
          className="vit-sidebar__alca"
          onClick={alternarEncolhida}
          aria-label={encolhida ? "Expandir menu" : "Encolher menu"}
          aria-expanded={!encolhida}
          onMouseEnter={(e) => mostrarDica(e, "Expandir menu")}
          onMouseLeave={esconderDica}
        >
          {encolhida
            ? <PanelLeftOpen size={15} aria-hidden="true" />
            : <PanelLeftClose size={15} aria-hidden="true" />}
        </button>

        <nav className="vit-sidebar__nav">
          {CATEGORIAS.map(({ titulo, itens }) => {
            const visiveis = itens.filter(([rotulo]) => podeVer(rotulo));
            if (visiveis.length === 0) return null;

            // Encolhido não há título para clicar de volta: todas as seções
            // aparecem, separadas por filete, e o recolher volta ao expandir.
            const fechada = fechadas.has(titulo) && !encolhida;
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
                  /* "Processos" e "Assembleia" são nome de categoria E de
                     item. Sem este prefixo o leitor de tela anuncia dois
                     botões idênticos e não dá para saber qual navega e qual
                     recolhe. O rótulo visível continua dentro do nome. */
                  aria-label={`Seção ${titulo}`}
                  tabIndex={encolhida ? -1 : undefined}
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
          {/* Tema a um clique, sem abrir o menu do perfil. O item do menu
              continua lá para quem está com o menu encolhido. */}
          <div className="vit-tema" role="group" aria-label="Tema">
            <button
              type="button"
              className="vit-tema__opcao"
              aria-pressed={!theme.isDark}
              onClick={() => usarTema(false)}
            >
              <Sun size={15} aria-hidden="true" />
              Claro
            </button>
            <button
              type="button"
              className="vit-tema__opcao"
              aria-pressed={theme.isDark}
              onClick={() => usarTema(true)}
            >
              <Moon size={15} aria-hidden="true" />
              Escuro
            </button>
          </div>

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
            onMouseEnter={(e) => mostrarDica(e, user?.nome ?? "Perfil")}
            onMouseLeave={esconderDica}
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

        {dica && (
          <span
            className="vit-dica"
            role="tooltip"
            style={{ top: dica.top, left: dica.left }}
          >
            {dica.texto}
          </span>
        )}
      </aside>
    </>
  );
}
