import React, { useCallback, useState } from "react";
import { AlertTriangle, Car, ExternalLink, Tag } from "lucide-react";
import { supabase } from "../../api/supabase";
import { Badge, Button, EmptyState, Field, Input, Modal, useConfirm, useToast } from "../../ui";
import { dataHoraBR } from "../../lib/format";
import { apto, erroLegivel, esperaDesde, esperaLonga, reais, telefoneLegivel } from "../../lib/confirmacoes";
import ListaQueAbre from "./ListaQueAbre";
import RecusarDialog from "./RecusarDialog";
import Dado from "./Dado";

const COLUNAS = [
  { rotulo: "Pedido", largura: "minmax(0, 1.4fr)" },
  { rotulo: "Placa", largura: "minmax(0, .8fr)" },
  { rotulo: "Quem", largura: "minmax(0, 1.3fr)" },
  { rotulo: "Situação", largura: "minmax(0, 1fr)" },
  { rotulo: "Pediu há", largura: "minmax(0, .6fr)" },
];

const MOTIVO_TAG = { nova: "TAG nova", nao_funciona: "A TAG não funciona", perdida: "TAG roubada ou furtada" };

/** "Cadastrar carro", "Trocar moto", "TAG perdida"... */
function nomeDoPedido(p) {
  if (p.tipo === "tag") return MOTIVO_TAG[p.motivo_tag] ?? "TAG";
  if (p.tipo === "desativar_tag") return "Desativar TAG do proprietário";
  if (p.tipo === "excluir_tag") return "Excluir TAG";
  const verbo = { cadastrar: "Cadastrar", trocar: "Trocar", retirar: "Excluir" }[p.tipo];
  return `${verbo} ${p.veiculo === "Carro" ? "carro" : "moto"}`;
}

/** O que acontece com a TAG se aprovar. */
function tagDoPedido(p) {
  if (p.veiculo !== "Carro") return "Moto não usa TAG";
  if (p.tipo === "tag") return p.motivo_tag === "perdida" ? "TAG nova; a perdida deve ser bloqueada no portão" : p.motivo_tag === "nao_funciona" ? "TAG nova; a antiga deve ser desativada" : "TAG nova";
  if (p.tipo === "trocar") return p.passar_tag ? "Passar a TAG atual para o carro novo" : p.com_tag ? "TAG nova (a antiga deve ser desativada)" : "Sem TAG (a antiga deve ser desativada)";
  if (p.tipo === "cadastrar") return p.com_tag ? "Com TAG" : "Sem TAG";
  if (p.tipo === "excluir_tag") return "A TAG sai do carro; desative no portão";
  if (p.tipo === "retirar") return p.veiculo === "Carro" ? "O carro e a TAG saem do apartamento (ficam no histórico); desative a TAG no portão" : "A moto sai do apartamento (fica no histórico)";
  return "A TAG do carro deve ser desativada";
}

const SITUACAO = {
  pendente: { texto: "Esperando", tom: "brand" },
  comprovante: { texto: "Comprovante enviado", tom: "brand" },
  pagar: { texto: "Aguardando PIX", tom: "muted" },
};

const podeCobrar = (p) => p.status === "pendente" && p.origem === "morador" && (p.tipo === "tag" || p.com_tag);

async function urlDoComprovante(caminho) {
  if (!caminho) return null;
  const { data, error } = await supabase.storage.from("anexos").createSignedUrl(caminho, 600);
  return error ? null : data.signedUrl;
}

/**
 * TAG e veículos (0066): os pedidos do app (cadastrar, trocar, retirar, TAG)
 * e as pendências do sistema (chegou inquilino: desativar a TAG do
 * proprietário). Aprovar aplica o pedido no cadastro de veículos do app;
 * cobrar devolve para o morador pagar o PIX; recusar pede o motivo. Embaixo,
 * as TAGs a entregar: marcar quando chega na portaria (o morador é avisado) e
 * quando é colada.
 */
// Os veículos cadastrados e o histórico ficavam aqui, em botões acima da
// fila; foram para a tela APP. Aqui ficam só os pedidos.
export default function FilaVeiculos(props) {
  return <PedidosDeVeiculo {...props} />;
}

function PedidosDeVeiculo({ itens, tags, carregando, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [aberto, setAberto] = useState(null);
  const [detalhes, setDetalhes] = useState({});
  const [recusando, setRecusando] = useState(null);
  const [cobrando, setCobrando] = useState(null);
  const [valor, setValor] = useState("50,00");
  const [salvando, setSalvando] = useState(false);

  const alternar = useCallback(async (id) => {
    setAberto(id);
    if (id == null || detalhes[id]?.dados) return;
    setDetalhes((d) => ({ ...d, [id]: { carregando: true } }));
    const { data, error } = await supabase.rpc("detalhe_do_pedido_veiculo", { p_id: id });
    if (error) {
      setDetalhes((d) => ({ ...d, [id]: { erro: erroLegivel(error) } }));
      return;
    }
    const url = await urlDoComprovante(data.comprovante);
    setDetalhes((d) => ({ ...d, [id]: { dados: data, url } }));
  }, [detalhes]);

  const chamar = async (nome, args, ok) => {
    setSalvando(true);
    const { error } = await supabase.rpc(nome, args);
    setSalvando(false);
    if (error) { toast.error(erroLegivel(error)); return false; }
    toast.success(ok);
    setAberto(null);
    onMudou();
    return true;
  };

  const aprovar = async (p) => {
    const ok = await confirmar({
      title: `Aprovar: ${nomeDoPedido(p).toLowerCase()} ${p.placa ?? ""}?`,
      description: `${apto(p.bloco, p.unidade)}. ${tagDoPedido(p)}.`,
      confirmLabel: "Aprovar",
    });
    if (ok) await chamar("aprovar_pedido_veiculo", { p_id: p.id }, "Pedido aprovado");
  };

  const cobrar = async () => {
    const numero = Number(String(valor).replace(/\./g, "").replace(",", "."));
    if (!(numero > 0)) { toast.error("Informe o valor."); return; }
    if (await chamar("cobrar_pedido_veiculo", { p_id: cobrando.id, p_valor: numero }, "Cobrança enviada ao morador")) setCobrando(null);
  };

  const recusar = async (motivo) => {
    if (await chamar("recusar_pedido_veiculo", { p_id: recusando.id, p_motivo: motivo }, "Pedido recusado")) setRecusando(null);
  };

  const marcar = (v, situacao) =>
    chamar("marcar_tag", { p_veiculo_id: v.id, p_situacao: situacao },
      situacao === "portaria" ? "Marcada: TAG na portaria. O morador foi avisado." : "Marcada: TAG colada.");

  return (
    <>
      {!carregando && itens.length === 0 ? (
        <EmptyState
          icon={<Car size={20} />}
          title="Nenhum pedido de veículo esperando"
          description="Cadastro, troca e retirada de veículo e pedidos de TAG feitos pelo app aparecem aqui."
        />
      ) : (
        <ListaQueAbre
          colunas={COLUNAS}
          larguraAcoes="290px"
          itens={itens}
          carregando={carregando}
          chave={(p) => p.id}
          aberto={aberto}
          onAlternar={alternar}
          rotuloDaLinha={(p) => `${nomeDoPedido(p)}, ${apto(p.bloco, p.unidade)}: ver detalhes`}
          celulas={(p) => [
            <span key="p" className="conf-duas">
              <strong>{nomeDoPedido(p)}</strong>
              {p.placa_em_outro && <small className="conf-placa-repetida">Placa também no {p.placa_em_outro}</small>}
            </span>,
            <span key="pl" className="conf-dado__mono">{p.placa ?? "-"}</span>,
            <span key="q" className="conf-duas">{p.quem}<small>{apto(p.bloco, p.unidade)}</small></span>,
            <Badge key="s" tone={SITUACAO[p.status]?.tom ?? "neutral"}>
              {SITUACAO[p.status]?.texto ?? p.status}
            </Badge>,
            <span key="e" className={esperaLonga(p.pedido_em) ? "conf-espera conf-espera--longa" : "conf-espera"}>
              {esperaDesde(p.pedido_em)}
            </span>,
          ]}
          acoes={(p) => (
            <>
              <Button size="sm" variant="ghost" className="conf-recusar" disabled={salvando} onClick={() => setRecusando(p)}>Recusar</Button>
              {podeCobrar(p) && (
                <Button size="sm" disabled={salvando} onClick={() => { setValor("50,00"); setCobrando(p); }}>Cobrar</Button>
              )}
              <Button size="sm" variant="primary" disabled={salvando || p.status === "pagar"} onClick={() => aprovar(p)}>Aprovar</Button>
            </>
          )}
          detalhe={(p) => <DetalheDoPedido pedido={p} estado={detalhes[p.id]} />}
        />
      )}

      <TagsAEntregar tags={tags} carregando={carregando} salvando={salvando} onMarcar={marcar} />

      <RecusarDialog
        key={recusando?.id ?? "nenhum"}
        alvo={recusando}
        titulo={recusando ? `Recusar: ${nomeDoPedido(recusando).toLowerCase()}` : ""}
        explicacao="O motivo aparece para o morador no app."
        salvando={salvando}
        onCancelar={() => setRecusando(null)}
        onRecusar={recusar}
      />

      <Modal
        open={Boolean(cobrando)}
        onClose={() => setCobrando(null)}
        title="Cobrar a TAG"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCobrando(null)}>Cancelar</Button>
            <Button variant="primary" onClick={cobrar} loading={salvando}>Cobrar</Button>
          </>
        }
      >
        <p className="vit-modal__desc app-export__texto">
          O pedido volta para o morador pagar o PIX (a mesma chave das reservas) e anexar o comprovante. Depois ele aparece aqui de novo, para você conferir e aprovar.
        </p>
        <Field label="Valor (R$)" required>
          <Input value={valor} inputMode="decimal" onChange={(e) => setValor(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}

function DetalheDoPedido({ pedido, estado }) {
  if (!estado || estado.carregando) return <p className="conf-detalhe__aviso">Carregando os detalhes…</p>;
  if (estado.erro) return <p className="conf-detalhe__aviso conf-detalhe__aviso--erro">{estado.erro}</p>;
  const d = estado.dados;
  const novo = pedido.tipo === "cadastrar" || pedido.tipo === "trocar";
  const pdf = /\.pdf$/i.test(d.comprovante ?? "");

  return (
    <div className="conf-detalhe__grade">
      {pedido.placa_em_outro && (
        <p className="conf-alerta">
          <AlertTriangle size={16} aria-hidden="true" />
          A placa {pedido.placa} também está cadastrada no {pedido.placa_em_outro}. Confira antes de aprovar.
        </p>
      )}
      <dl className="conf-dados">
        {pedido.origem === "morador" ? (
          <>
            <Dado rotulo="CPF" mono>{d.cpf || "Não informado"}</Dado>
            <Dado rotulo="Telefone">{telefoneLegivel(d.telefone) || "Não informado"}</Dado>
            <Dado rotulo="E-mail">{d.email || "-"}</Dado>
          </>
        ) : (
          <Dado rotulo="Por quê">Um inquilino foi aprovado no apartamento, e a TAG do carro não é dele.</Dado>
        )}
        {novo && <Dado rotulo={pedido.tipo === "trocar" ? "Veículo novo" : "Veículo"}>{pedido.modelo}, {pedido.cor}</Dado>}
        {d.atual && <Dado rotulo={novo ? "Veículo de agora" : "Veículo"}><span className="conf-dado__mono">{d.atual.placa}</span> · {d.atual.modelo}, {d.atual.cor}</Dado>}
        <Dado rotulo="TAG">{tagDoPedido(pedido)}</Dado>
        <Dado rotulo="Pediu em">{dataHoraBR(pedido.pedido_em, { comSegundos: false })}</Dado>
        {d.observacao && <Dado rotulo="Observação">{d.observacao}</Dado>}
      </dl>
      {d.comprovante ? (
        <div className="conf-comprovante">
          <small>Comprovante do PIX · {reais(pedido.valor)}</small>
          {!estado.url ? (
            <span className="conf-bloco__vazio">Não foi possível abrir o comprovante.</span>
          ) : pdf ? (
            <a href={estado.url} target="_blank" rel="noopener noreferrer" className="conf-comprovante__link">
              Abrir o PDF <ExternalLink size={14} aria-hidden="true" />
            </a>
          ) : (
            <a href={estado.url} target="_blank" rel="noopener noreferrer" className="conf-comprovante__img">
              <img src={estado.url} alt="Comprovante do PIX da TAG" />
              <span className="conf-comprovante__link">Abrir em tamanho real <ExternalLink size={14} aria-hidden="true" /></span>
            </a>
          )}
        </div>
      ) : <span />}
    </div>
  );
}

function TagsAEntregar({ tags, carregando, salvando, onMarcar }) {
  if (carregando || tags.length === 0) return null;
  return (
    <section className="conf-tags" aria-labelledby="conf-tags-titulo">
      <h3 id="conf-tags-titulo"><Tag size={16} aria-hidden="true" />TAGs a entregar</h3>
      <p>Depois de aprovar, marque quando a TAG chegar na portaria (o morador recebe o aviso) e quando for colada.</p>
      <ul>
        {tags.map((v) => (
          <li key={v.id}>
            <span className="conf-dado__mono">{v.placa}</span>
            <span className="conf-duas">{v.modelo}, {v.cor}<small>{apto(v.bloco, v.unidade)}</small></span>
            <Badge tone={v.tag === "portaria" ? "brand" : "muted"}>{v.tag === "portaria" ? "Na portaria" : "Pedida"}</Badge>
            <span className="conf-tags__acoes">
              {v.tag === "pedida" && <Button size="sm" disabled={salvando} onClick={() => onMarcar(v, "portaria")}>Chegou na portaria</Button>}
              <Button size="sm" variant="primary" disabled={salvando} onClick={() => onMarcar(v, "colada")}>Colada</Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
