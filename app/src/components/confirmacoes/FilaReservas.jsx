import React, { useCallback, useState } from "react";
import { CalendarDays, CalendarCheck, ExternalLink } from "lucide-react";
import { supabase } from "../../api/supabase";
import { Button, EmptyState, useConfirm, useToast } from "../../ui";
import { dataBR, dataHoraBR } from "../../lib/format";
import { apto, erroLegivel, esperaDesde, esperaLonga, folhaDaReserva, reais, telefoneLegivel } from "../../lib/confirmacoes";
import ListaQueAbre from "./ListaQueAbre";
import RecusarDialog from "./RecusarDialog";
import Dado from "./Dado";

const COLUNAS = [
  { rotulo: "Data da reserva", largura: "minmax(0, 1.3fr)" },
  { rotulo: "Área", largura: "minmax(0, 1.2fr)" },
  { rotulo: "Quem", largura: "minmax(0, 1.3fr)" },
  { rotulo: "Valor", largura: "minmax(0, .7fr)" },
  { rotulo: "Pediu há", largura: "minmax(0, .6fr)" },
];

/** URL assinada do comprovante: o Storage confere de novo se quem pede é da administração. */
async function urlDoComprovante(caminho) {
  if (!caminho) return null;
  const { data, error } = await supabase.storage.from("anexos").createSignedUrl(caminho, 600);
  return error ? null : data.signedUrl;
}

/**
 * Reservas do app com comprovante enviado (0065). A data mais próxima vem
 * primeiro, e a folhinha fica amarela quando faltam 3 dias ou menos.
 */
export default function FilaReservas({ itens, carregando, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [aberto, setAberto] = useState(null);
  const [detalhes, setDetalhes] = useState({});
  const [recusando, setRecusando] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const alternar = useCallback(async (id) => {
    setAberto(id);
    if (id == null || detalhes[id]?.dados) return;
    setDetalhes((d) => ({ ...d, [id]: { carregando: true } }));
    const { data, error } = await supabase.rpc("detalhe_da_reserva", { p_id: id });
    if (error) {
      setDetalhes((d) => ({ ...d, [id]: { erro: erroLegivel(error) } }));
      return;
    }
    const url = await urlDoComprovante(data.comprovante);
    setDetalhes((d) => ({ ...d, [id]: { dados: data, url } }));
  }, [detalhes]);

  const aprovar = async (r) => {
    const folha = folhaDaReserva(r.data_reserva, r.faltam);
    const ok = await confirmar({
      title: `Aprovar ${r.espacos} para ${folha?.extenso ?? dataBR(r.data_reserva)}?`,
      description: `${r.morador}, ${apto(r.bloco, r.unidade)}. O morador recebe o aviso no app.`,
      confirmLabel: "Aprovar reserva",
    });
    if (!ok) return;
    setSalvando(true);
    const { error } = await supabase.rpc("aprovar_reserva", { p_id: r.id });
    setSalvando(false);
    if (error) { toast.error(erroLegivel(error)); return; }
    toast.success(`Reserva de ${r.morador} aprovada`);
    setAberto(null);
    onMudou();
  };

  const recusar = async (motivo) => {
    const r = recusando;
    setSalvando(true);
    const { error } = await supabase.rpc("recusar_reserva", { p_id: r.id, p_motivo: motivo });
    setSalvando(false);
    if (error) { toast.error(erroLegivel(error)); return; }
    setRecusando(null);
    toast.success(`Reserva de ${r.morador} recusada`);
    setAberto(null);
    onMudou();
  };

  if (!carregando && itens.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck size={20} />}
        title="Nenhuma reserva esperando"
        description="Reservas feitas pelo app aparecem aqui assim que o morador envia o comprovante do PIX."
      />
    );
  }

  return (
    <>
      <ListaQueAbre
        colunas={COLUNAS}
        itens={itens}
        carregando={carregando}
        chave={(r) => r.id}
        aberto={aberto}
        onAlternar={alternar}
        rotuloDaLinha={(r) => `${r.espacos}, ${dataBR(r.data_reserva)}, ${r.morador}: ver detalhes`}
        celulas={(r) => [
          <Folhinha key="f" reserva={r} />,
          <strong key="a">{r.espacos}</strong>,
          <span key="q" className="conf-duas">{r.morador}<small>{apto(r.bloco, r.unidade)}</small></span>,
          reais(r.valor),
          <span key="e" className={esperaLonga(r.pedido_em) ? "conf-espera conf-espera--longa" : "conf-espera"}>
            {esperaDesde(r.pedido_em)}
          </span>,
        ]}
        acoes={(r) => (
          <>
            <Button size="sm" variant="ghost" className="conf-recusar" disabled={salvando} onClick={() => setRecusando(r)}>Recusar</Button>
            <Button size="sm" variant="primary" disabled={salvando} onClick={() => aprovar(r)}>Aprovar</Button>
          </>
        )}
        detalhe={(r) => <DetalheDaReserva reserva={r} estado={detalhes[r.id]} />}
      />

      <RecusarDialog
        key={recusando?.id ?? "nenhum"}
        alvo={recusando}
        titulo={recusando ? `Recusar a reserva de ${recusando.morador}` : ""}
        explicacao="O motivo aparece para o morador no app, com o aviso de que o PIX será estornado."
        salvando={salvando}
        onCancelar={() => setRecusando(null)}
        onRecusar={recusar}
      />
    </>
  );
}

function Folhinha({ reserva }) {
  const f = folhaDaReserva(reserva.data_reserva, reserva.faltam);
  if (!f) return dataBR(reserva.data_reserva);
  return (
    <span className={`conf-dia${f.perto ? " conf-dia--perto" : ""}`}>
      <span className="conf-folha" aria-hidden="true">
        <span>{f.mes}</span>
        <b>{f.dia}</b>
      </span>
      <span className="conf-duas">
        <strong>{f.semana}</strong>
        <small className="conf-falta">{f.falta}</small>
      </span>
    </span>
  );
}

function DetalheDaReserva({ reserva, estado }) {
  const f = folhaDaReserva(reserva.data_reserva, reserva.faltam);
  const faixa = f && (
    <p className={`conf-faixa-data${f.perto ? " conf-faixa-data--perto" : ""}`}>
      <CalendarDays size={20} aria-hidden="true" />
      <span>Reserva para <b>{f.extenso}</b></span>
      <span className="conf-faixa-data__falta">{f.falta}</span>
    </p>
  );
  if (!estado || estado.carregando) return <>{faixa}<p className="conf-detalhe__aviso">Carregando os detalhes…</p></>;
  if (estado.erro) return <>{faixa}<p className="conf-detalhe__aviso conf-detalhe__aviso--erro">{estado.erro}</p></>;
  const d = estado.dados;
  const pdf = /\.pdf$/i.test(d.comprovante ?? "");

  return (
    <div className="conf-detalhe__grade">
      {faixa}
      <dl className="conf-dados">
        <Dado rotulo="CPF" mono>{d.cpf || "Não informado"}</Dado>
        <Dado rotulo="Telefone">{telefoneLegivel(d.telefone) || "Não informado"}</Dado>
        <Dado rotulo="E-mail">{d.email || "Não informado"}</Dado>
        <Dado rotulo="Pediu em">{dataHoraBR(d.pedido_em, { comSegundos: false })}</Dado>
        <Dado rotulo="Comprovante enviado em">{d.enviada_em ? dataHoraBR(d.enviada_em, { comSegundos: false }) : "-"}</Dado>
        <Dado rotulo="Nesse dia">
          {d.livres ? `${d.livres}: ${d.livres.includes(",") ? "livres" : "livre"}` : "Os outros espaços estão ocupados"}
          {d.ocupados ? <small className="conf-dado__extra">Ocupado: {d.ocupados}</small> : null}
        </Dado>
        {reserva.data_anterior && <Dado rotulo="Data trocada">Era {dataBR(reserva.data_anterior)}</Dado>}
      </dl>
      <div className="conf-comprovante">
        <small>Comprovante do PIX · {reais(reserva.valor)}</small>
        {!estado.url ? (
          <span className="conf-bloco__vazio">Não foi possível abrir o comprovante.</span>
        ) : pdf ? (
          <a href={estado.url} target="_blank" rel="noopener noreferrer" className="conf-comprovante__link">
            Abrir o PDF <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : (
          <a href={estado.url} target="_blank" rel="noopener noreferrer" className="conf-comprovante__img">
            <img src={estado.url} alt={`Comprovante do PIX de ${reserva.morador}`} />
            <span className="conf-comprovante__link">Abrir em tamanho real <ExternalLink size={14} aria-hidden="true" /></span>
          </a>
        )}
      </div>
    </div>
  );
}
