import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "../../ui";
import useDialogo from "../../ui/useDialogo";
import { numerosDasPaginas } from "../../lib/paginas";

/**
 * As peças da tela APP: a busca com filtros, as iniciais, a placa e a ficha
 * de dados dos modais. Cada aba monta a sua com elas, para as cinco terem a
 * mesma cara.
 */

/** Busca e, opcionalmente, os filtros em pílula ([valor, rótulo, contagem]). */
/**
 * `children` entra na MESMA linha da busca (o botão "Mais filtros"); `painel`
 * fica embaixo, fora da linha. Separados porque a linha não pode quebrar: com
 * o painel dentro dela, o navegador preferia descer o botão para a linha de
 * baixo a encolher as pílulas.
 */
export function Filtros({ busca, onBusca, placeholder, filtros, filtro, onFiltro, children, painel, rotuloFiltro = "Situação" }) {
  return (
    <div className="app-filtros">
      <div className="app-filtros__linha">
      <div className="cad-filtros__busca app-filtros__busca">
        <Search size={16} className="cad-filtros__lupa" aria-hidden="true" />
        <Input value={busca} onChange={(e) => onBusca(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </div>
      {filtros && (
        <div className="app-pilulas" role="group" aria-label="Filtrar">
          {filtros.map(([valor, rotulo, n]) => (
            <button key={valor} type="button" aria-pressed={filtro === valor} onClick={() => onFiltro(valor)}>
              {rotulo}{n != null && <span className="app-pilulas__n">{n}</span>}
            </button>
          ))}
        </div>
      )}
      {/* No celular as pílulas dão lugar a "Situação · Todas 16 ▾", na mesma
          linha do Mais filtros, que abre uma folha de baixo com as opções
          (o CSS mostra uma coisa ou outra). */}
      {filtros && <EscolhaDeFiltro rotulo={rotuloFiltro} filtros={filtros} filtro={filtro} onFiltro={onFiltro} />}
      {children}
      </div>
      {painel}
    </div>
  );
}

/**
 * O filtro de situação no celular: um campo que abre uma folha de baixo com
 * as opções em linhas grandes (contagem à direita, ✓ na escolhida). Toque
 * escolhe e fecha. A lista nativa do <select> destoava do sistema.
 */
function EscolhaDeFiltro({ rotulo, filtros, filtro, onFiltro }) {
  const [aberta, setAberta] = useState(false);
  const fechar = () => setAberta(false);
  const folhaRef = useDialogo(aberta, fechar);
  const atual = filtros.find(([valor]) => valor === filtro) ?? filtros[0];

  return (
    <>
      <button type="button" className="app-filtros__escolha" aria-haspopup="dialog" aria-expanded={aberta}
        aria-label={`${rotulo}: ${atual[1]}${atual[2] != null ? ` (${atual[2]})` : ""}`} onClick={() => setAberta(true)}>
        <span className="app-filtros__escolha-rotulo">{rotulo}</span>
        <b>{atual[1]}</b>
        {atual[2] != null && <span className="app-pilulas__n">{atual[2]}</span>}
        <ChevronDown size={16} aria-hidden="true" className="app-filtros__escolha-seta" />
      </button>
      {aberta && createPortal(
        <div className="app-folha__veu" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
          <div ref={folhaRef} className="app-folha" role="dialog" aria-modal="true" aria-label={rotulo} tabIndex={-1}>
            <span className="app-folha__alca" aria-hidden="true" />
            <header className="app-folha__topo">
              <h2>{rotulo}</h2>
              <button type="button" className="app-folha__fechar" aria-label="Fechar" onClick={fechar}><X size={18} /></button>
            </header>
            <div role="radiogroup" aria-label={rotulo} className="app-folha__opcoes">
              {filtros.map(([valor, nome, n]) => (
                <button key={valor} type="button" role="radio" aria-checked={filtro === valor}
                  className={`app-folha__opcao${filtro === valor ? " app-folha__opcao--on" : ""}`}
                  onClick={() => { onFiltro(valor); fechar(); }}>
                  <span className="app-folha__marca" aria-hidden="true">{filtro === valor && <Check size={16} />}</span>
                  <span className="app-folha__nome">{nome}</span>
                  {n != null && <span className="app-pilulas__n">{n}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * O botão "Mais filtros" (vai como filho de <Filtros>). `ativos` é quantos
 * filtros do painel estão ligados: aparece no botão, e com algum ligado surge
 * o "Limpar filtros". O painel em si é o <PainelDeFiltros>, que vai na prop
 * `painel` do <Filtros>.
 */
export function MaisFiltros({ aberto, onAlternar, ativos = 0, onLimpar }) {
  return (
    <>
      <button type="button" className={`app-mais${ativos ? " app-mais--ativo" : ""}`} aria-expanded={aberto} onClick={onAlternar}>
        <SlidersHorizontal size={15} aria-hidden="true" />
        Mais filtros{ativos ? <span className="app-pilulas__n">{ativos}</span> : null}
      </button>
      {ativos > 0 && (
        <button type="button" className="app-mais app-mais--limpar" onClick={onLimpar}>
          <X size={14} aria-hidden="true" />Limpar filtros
        </button>
      )}
    </>
  );
}

/** O painel do "Mais filtros": os campos lado a lado, embaixo da barra. */
export function PainelDeFiltros({ aberto, children }) {
  return aberto ? <div className="app-mais__painel">{children}</div> : null;
}

/**
 * Poucas opções lado a lado (Entrada/Saída, Manhã/Tarde): um radiogroup com
 * cara de botões, no lugar de um <select> que esconde as opções.
 */
export function Opcoes({ rotulo, valor, opcoes, onMudar }) {
  return (
    <div className="app-etapas" role="radiogroup" aria-label={rotulo} style={{ "--n": opcoes.length }}>
      {opcoes.map((o) => {
        const [v, r] = Array.isArray(o) ? o : [o, o];
        return (
          <button key={v} type="button" role="radio" aria-checked={valor === v}
            className={`app-etapas__op${valor === v ? " app-etapas__op--on" : ""}`} onClick={() => onMudar(v)}>
            {r}
          </button>
        );
      })}
    </div>
  );
}

/** As iniciais do nome num círculo: "Paula Lima" -> "PL". */
export function Iniciais({ nome, grande = false, apagado = false }) {
  const partes = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  const letras = ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
  return (
    <span className={`app-iniciais${grande ? " app-iniciais--grande" : ""}${apagado ? " app-iniciais--apagado" : ""}`} aria-hidden="true">
      {letras || "?"}
    </span>
  );
}

/** A placa no desenho do Mercosul: faixa azul em cima e os caracteres grandes. */
export function Placa({ placa, pequena = false }) {
  const p = String(placa ?? "").toUpperCase();
  const legivel = p.length === 7 ? `${p.slice(0, 3)}${/^[0-9]$/.test(p[4]) ? "-" : ""}${p.slice(3)}` : p;
  return (
    <span className={`app-placa${pequena ? " app-placa--pequena" : ""}`}>
      <span className="app-placa__faixa" aria-hidden="true">BRASIL</span>
      <span className="app-placa__num">{legivel}</span>
    </span>
  );
}

/**
 * Uma opção liga/desliga em cartão: o cartão inteiro é a chave (o mesmo
 * desenho da publicação de notícias).
 */
export function Chave({ ligada, onChange, disabled = false, icone, titulo, sub }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      className={ligada ? "app-chave app-chave--on" : "app-chave"}
      onClick={() => onChange(!ligada)}
      disabled={disabled}
    >
      {icone && <span className="app-chave__ic" aria-hidden="true">{icone}</span>}
      <span className="app-chave__tx">
        <strong>{titulo}</strong>
        {sub && <small>{sub}</small>}
      </span>
      <span className="app-chave__trilho" aria-hidden="true"><span /></span>
    </button>
  );
}

/** Uma seção do modal: título e os pares rótulo/valor. */
export function Ficha({ titulo, itens }) {
  const visiveis = itens.filter(Boolean);
  if (!visiveis.length) return null;
  return (
    <section className="app-ficha">
      <h3 className="app-ficha__titulo">{titulo}</h3>
      <dl className="app-ficha__dados">
        {visiveis.map(([rotulo, valor, mono]) => (
          <div key={rotulo} className="app-ficha__dado">
            <dt>{rotulo}</dt>
            <dd className={mono ? "conf-dado__mono" : undefined}>{valor ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Paginador do fim da lista: "1–20 de 312" e ‹ 1 … 4 5 6 … 16 ›. Mesmo desenho
 * do Histórico de Confirmações (classes `conf-paginas`). Some quando a lista
 * cabe numa página só; ao trocar de página, a tela volta ao topo da lista.
 * Decisão do usuário (23/11/2026): Piscina e Encomendas com 20 por página.
 */
export function Paginador({ total, pagina, porPagina, onPagina, rotulo = "Páginas da lista" }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (total <= porPagina) return null;
  const atual = Math.min(Math.max(1, pagina), paginas);
  const de = (atual - 1) * porPagina + 1;
  const ate = Math.min(atual * porPagina, total);
  const ir = (p) => {
    onPagina(p);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };
  return (
    <nav className="conf-paginas" aria-label={rotulo}>
      <span className="conf-paginas__conta">{de}–{ate} de {total}</span>
      <span className="conf-paginas__nums">
        <button type="button" className="conf-paginas__seta" disabled={atual <= 1} aria-label="Página anterior" onClick={() => ir(atual - 1)}>‹</button>
        {numerosDasPaginas(atual, paginas).map((p, i) => (p === "…"
          ? <span key={`r${i}`} className="conf-paginas__reticencias" aria-hidden="true">…</span>
          : (
            <button key={p} type="button" className={p === atual ? "conf-paginas__atual" : undefined}
              aria-current={p === atual ? "page" : undefined} aria-label={`Página ${p}`} onClick={() => ir(p)}>
              {p}
            </button>
          )))}
        <button type="button" className="conf-paginas__seta" disabled={atual >= paginas} aria-label="Próxima página" onClick={() => ir(atual + 1)}>›</button>
      </span>
    </nav>
  );
}
