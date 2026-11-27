import React, { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "../../api/supabase";
import { Badge, EmptyState, Field, Input, useToast } from "../../ui";
import { dataHoraBR } from "../../lib/format";
import {
  apto, erroLegivel, filtrarHistorico, historicoDeSolicitacoes, paginar, POR_PAGINA_HISTORICO,
  SITUACOES_DO_HISTORICO, TIPOS_DE_SOLICITACAO as TIPOS,
} from "../../lib/confirmacoes";
import ListaQueAbre from "./ListaQueAbre";
import { Filtros, MaisFiltros, Opcoes, PainelDeFiltros } from "../app/pecas";
import { ConversaSoLeitura } from "./SolicitacoesFinalizadas";

const COLUNAS = [
  { rotulo: "Pedido", largura: "minmax(0, 1.6fr)" },
  { rotulo: "Quem", largura: "minmax(0, 1.2fr)" },
  { rotulo: "Situação", largura: "minmax(0, .9fr)" },
  { rotulo: "Última movimentação", largura: "minmax(0, .9fr)" },
];
const diaBR = (v) => (v ? dataHoraBR(v, { comSegundos: false }).slice(0, 10) : "—");

/**
 * Histórico (pedido do usuário, 12/11/2026): todas as solicitações do app,
 * abertas e fechadas, da mais recente para a mais antiga. Busca por nome, nº
 * ou apartamento; filtro por situação; bloco e unidade em "Mais filtros".
 * 15 por página (ou 30), com ‹ 1 2 ›. A linha abre a conversa só para ler:
 * responder e mudar a situação continuam nas abas de cada fila.
 */
export default function HistoricoDeSolicitacoes() {
  const toast = useToast();
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("todas");
  const [bloco, setBloco] = useState("");
  const [unidade, setUnidade] = useState("");
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [porPagina, setPorPagina] = useState(POR_PAGINA_HISTORICO[0]);
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([supabase.rpc("solicitacoes_para_responder"), supabase.rpc("solicitacoes_finalizadas")])
      .then(([abertas, fechadas]) => {
        if (!vivo) return;
        const erro = abertas.error ?? fechadas.error;
        if (erro) toast.error(erroLegivel(erro));
        setItens(historicoDeSolicitacoes(abertas.data, fechadas.data));
        setCarregando(false);
      });
    return () => { vivo = false; };
  }, [toast]);

  const filtrados = useMemo(() => filtrarHistorico(itens, { busca, situacao, bloco, unidade }), [itens, busca, situacao, bloco, unidade]);
  const pag = paginar(filtrados, pagina, porPagina);
  const blocos = useMemo(() => [...new Set(itens.map((s) => s.bloco).filter((b) => b != null))].sort((a, b) => a - b), [itens]);
  const conta = (st) => itens.filter((s) => s.status === st).length;
  const mudar = (fn) => (v) => { fn(v); setPagina(1); };

  return (
    <div className="app-aba">
      <Filtros
        busca={busca} onBusca={mudar(setBusca)} placeholder="Buscar por nome, nº ou apartamento"
        filtros={carregando ? null : [["todas", "Todas", itens.length],
          ...SITUACOES_DO_HISTORICO.filter(([st]) => conta(st) > 0).map(([st, rotulo]) => [st, rotulo, conta(st)])]}
        filtro={situacao} onFiltro={mudar(setSituacao)}
        painel={
          <PainelDeFiltros aberto={maisFiltros}>
            {blocos.length > 1 && (
              <Field label="Bloco">
                <Opcoes rotulo="Bloco" valor={bloco || "todos"} onMudar={(b) => mudar(setBloco)(b === "todos" ? "" : b)}
                  opcoes={[["todos", "Todos"], ...blocos.map((b) => [String(b), `B${b}`])]} />
              </Field>
            )}
            <Field label="Unidade">
              <Input inputMode="numeric" placeholder="Ex.: 101" value={unidade} maxLength={4}
                onChange={(e) => mudar(setUnidade)(e.target.value.replace(/\D/g, ""))} aria-label="Unidade" />
            </Field>
          </PainelDeFiltros>
        }
      >
        <MaisFiltros aberto={maisFiltros} onAlternar={() => setMaisFiltros((v) => !v)}
          ativos={(bloco ? 1 : 0) + (unidade ? 1 : 0)} onLimpar={() => { setBloco(""); setUnidade(""); setPagina(1); }} />
      </Filtros>

      {!carregando && filtrados.length === 0 ? (
        <EmptyState
          icon={<History size={20} />}
          title={itens.length ? "Nenhuma solicitação com esse filtro" : "Nenhuma solicitação ainda"}
          description="Todas as solicitações do app, abertas e fechadas, ficam aqui."
        />
      ) : (
        <>
          <ListaQueAbre
            colunas={COLUNAS}
            larguraAcoes="0px"
            rotuloAcoes=""
            itens={pag.itens}
            carregando={carregando}
            chave={(s) => s.id}
            onAbrir={setAberto}
            rotuloDaLinha={(s) => `${TIPOS[s.tipo] ?? s.tipo} Nº ${s.id}, ${s.quem}: ver conversa`}
            celulas={(s) => [
              <span key="p" className="conf-duas">
                <strong>{TIPOS[s.tipo] ?? s.tipo} <span className="conf-num">Nº {s.id}</span></strong>
                {s.resumo && <small>{s.resumo}</small>}
              </span>,
              <span key="q" className="conf-duas">{s.quem}<small>{apto(s.bloco, s.unidade)}</small></span>,
              <Badge key="s" tone={s.situacao.tom}>{s.situacao.texto}</Badge>,
              <span key="f" className="conf-espera">{diaBR(s.quando)}</span>,
            ]}
          />
          {!carregando && (
            <nav className="conf-paginas" aria-label="Páginas do histórico">
              <label className="conf-paginas__por">
                Por página
                <select value={porPagina} onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(1); }} aria-label="Solicitações por página">
                  {POR_PAGINA_HISTORICO.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <span className="conf-paginas__conta">{pag.de}–{pag.ate} de {filtrados.length}</span>
              {pag.paginas > 1 && (
                <span className="conf-paginas__nums">
                  <button type="button" className="conf-paginas__seta" disabled={pag.pagina <= 1} aria-label="Página anterior" onClick={() => setPagina(pag.pagina - 1)}>‹</button>
                  {Array.from({ length: pag.paginas }, (_, k) => k + 1).map((p) => (
                    <button key={p} type="button" className={p === pag.pagina ? "conf-paginas__atual" : undefined}
                      aria-current={p === pag.pagina ? "page" : undefined} aria-label={`Página ${p}`} onClick={() => setPagina(p)}>
                      {p}
                    </button>
                  ))}
                  <button type="button" className="conf-paginas__seta" disabled={pag.pagina >= pag.paginas} aria-label="Próxima página" onClick={() => setPagina(pag.pagina + 1)}>›</button>
                </span>
              )}
            </nav>
          )}
        </>
      )}

      {aberto && <ConversaSoLeitura key={aberto.id} chamado={aberto} onFechar={() => setAberto(null)} />}
    </div>
  );
}
