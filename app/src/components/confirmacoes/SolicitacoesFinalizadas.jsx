import React, { useEffect, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { supabase } from "../../api/supabase";
import { Badge, EmptyState, Modal, useToast } from "../../ui";
import { dataHoraBR } from "../../lib/format";
import { apto, erroLegivel, TIPOS_DE_SOLICITACAO as TIPOS } from "../../lib/confirmacoes";
import ListaQueAbre from "./ListaQueAbre";
import { Ficha, Filtros, Iniciais } from "../app/pecas";
import { ConversaDaAdm } from "./FilaSolicitacoes";

const COLUNAS = [
  { rotulo: "Pedido", largura: "minmax(0, 1.6fr)" },
  { rotulo: "Quem", largura: "minmax(0, 1.2fr)" },
  { rotulo: "Situação", largura: "minmax(0, .9fr)" },
  { rotulo: "Fechou em", largura: "minmax(0, .7fr)" },
];
const SITUACAO = {
  concluida: { texto: "Concluída", tom: "positive" },
  // Corretor, obra e mudança: aprovar encerra (0110).
  aprovada: { texto: "Aprovada", tom: "positive" },
  recusada: { texto: "Recusada", tom: "danger" },
  cancelada: { texto: "Cancelada pelo morador", tom: "muted" },
};
// O dia em Brasília (o timestamptz em UTC viraria o dia seguinte depois das 21h).
const diaBR = (v) => (v ? dataHoraBR(v, { comSegundos: false }).slice(0, 10) : "");
const sem = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * As solicitações que já fecharam (0080): concluídas, recusadas e canceladas
 * pelo morador, em lista. A linha abre a conversa num modal, só para ler:
 * chamado fechado não recebe resposta nem muda de situação.
 */
export default function SolicitacoesFinalizadas() {
  const toast = useToast();
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [aberto, setAberto] = useState(null);

  useEffect(() => {
    supabase.rpc("solicitacoes_finalizadas").then(({ data, error }) => {
      if (error) toast.error(erroLegivel(error));
      setItens(Array.isArray(data) ? data : []);
      setCarregando(false);
    });
  }, [toast]);

  const filtrados = useMemo(() => {
    const q = sem(busca.trim());
    return itens
      .filter((s) => filtro === "todos" || s.status === filtro)
      .filter((s) => !q ||
        sem(`${s.id} ${TIPOS[s.tipo] ?? s.tipo} ${s.quem ?? ""} ${apto(s.bloco, s.unidade)} ${s.bloco}${s.unidade} ${s.resumo ?? ""}`).includes(q));
  }, [itens, busca, filtro]);

  const conta = (st) => itens.filter((s) => s.status === st).length;

  return (
    <div className="app-aba">
      <Filtros
        busca={busca} onBusca={setBusca} placeholder="Buscar por nº, tipo, nome ou apto"
        filtros={carregando ? null : [["todos", "Todas", itens.length], ["concluida", "Concluídas", conta("concluida")],
          ["recusada", "Recusadas", conta("recusada")], ["cancelada", "Canceladas", conta("cancelada")]]}
        filtro={filtro} onFiltro={setFiltro}
      />
      {!carregando && filtrados.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={20} />}
          title={busca || filtro !== "todos" ? "Nenhuma solicitação com esse filtro" : "Nenhuma solicitação finalizada"}
          description="As solicitações concluídas, recusadas ou canceladas pelo morador ficam aqui, com a conversa inteira."
        />
      ) : (
        <ListaQueAbre
          colunas={COLUNAS}
          larguraAcoes="0px"
          rotuloAcoes=""
          itens={filtrados}
          carregando={carregando}
          chave={(s) => s.id}
          onAbrir={setAberto}
          rotuloDaLinha={(s) => `${TIPOS[s.tipo] ?? s.tipo} Nº ${s.id}, ${s.quem}: ver conversa`}
          celulas={(s) => [
            <span key="p" className="conf-duas">
              <strong>{TIPOS[s.tipo] ?? s.tipo} <span className="conf-num">Nº {s.id}</span></strong>
              {s.resumo && <small>{s.resumo}</small>}
            </span>,
            <span key="q" className="conf-duas">{s.quem}<small>{apto(s.bloco, s.unidade)}{s.tipo_morador === "Não Morador" ? " · não mora" : ""}</small></span>,
            <Badge key="s" tone={SITUACAO[s.status]?.tom ?? "neutral"}>{SITUACAO[s.status]?.texto ?? s.status}</Badge>,
            <span key="f" className="conf-espera">{diaBR(s.fechada_em)}</span>,
          ]}
        />
      )}

      {aberto && <ConversaSoLeitura key={aberto.id} chamado={aberto} onFechar={() => setAberto(null)} />}
    </div>
  );
}

/**
 * A conversa num modal, só para ler (as finalizadas e o Histórico, 12/11/2026).
 * Chamado ainda aberto aparece igual: responder e mudar a situação ficam nas
 * abas de cada fila.
 */
export function ConversaSoLeitura({ chamado: s, onFechar }) {
  const [estado, setEstado] = useState({ carregando: true });

  useEffect(() => {
    let vivo = true;
    supabase.rpc("detalhe_da_solicitacao", { p_id: s.id }).then(({ data, error }) => {
      if (vivo) setEstado(error ? { erro: erroLegivel(error) } : { dados: data });
    });
    return () => { vivo = false; };
  }, [s.id]);

  return (
    <Modal
      open
      onClose={onFechar}
      title={`${TIPOS[s.tipo] ?? s.tipo} · Nº ${s.id}`}
      size="lg"
    >
      <div className="app-modal">
        <div className="app-modal__topo">
          <Iniciais nome={s.quem} grande />
          <div className="app-modal__quem">
            <strong>{s.quem}</strong>
            <small>{apto(s.bloco, s.unidade)}{s.tipo_morador === "Não Morador" ? " · não mora" : ""}{s.fechada_em ? ` · fechou em ${diaBR(s.fechada_em)}` : " · em andamento"}</small>
            <span className="app-modal__selos">
              <Badge tone={SITUACAO[s.status]?.tom ?? s.situacao?.tom ?? "neutral"}>{SITUACAO[s.status]?.texto ?? s.situacao?.texto ?? s.status}</Badge>
            </span>
          </div>
        </div>

        {/* O desenho do detalhe de Encomendas: a conversa à esquerda (é o que
            se lê), os dados do pedido à direita. Chamado fechado não tem ação:
            o rodapé fica vazio e o X fecha. */}
        <div className="app-detalhe app-detalhe--largo">
          <div className="app-detalhe__visual">
            <p className="app-detalhe__legenda">Conversa</p>
            <ConversaDaAdm chamado={s} estado={estado} fechada />
          </div>
          <div className="app-detalhe__dados">
            <Ficha titulo="Solicitação" itens={[
              ["Tipo", TIPOS[s.tipo] ?? s.tipo],
              ["Número", `Nº ${s.id}`, true],
              ["Apartamento", apto(s.bloco, s.unidade)],
              ["Situação", SITUACAO[s.status]?.texto ?? s.situacao?.texto ?? s.status],
              ["Fechou em", diaBR(s.fechada_em) || "—"],
              s.motivo_recusa ? ["Motivo da recusa", s.motivo_recusa] : null,
            ]} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
