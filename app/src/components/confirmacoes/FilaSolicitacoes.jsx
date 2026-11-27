import React, { useCallback, useState } from "react";
import { Check, FileText, Image, ListTodo, MessageSquare, Paperclip, Send, X } from "lucide-react";
import { supabase } from "../../api/supabase";
import { Badge, Button, EmptyState, Input, Textarea, useConfirm, useToast } from "../../ui";
import {
  apto, aprovarEncerra, dadoLegivel, erroLegivel, esperaDesde, passosDoTipo, perguntaDeAprovar, perguntaDeFinalizar,
  soRegistra, telefoneLegivel, TIPOS_DE_SOLICITACAO as TIPOS,
} from "../../lib/confirmacoes";
import ListaQueAbre from "./ListaQueAbre";
import { useAtualizar } from "../../lib/useAtualizar";
import RecusarDialog from "./RecusarDialog";

const SITUACAO = {
  aberta: { texto: "Nova", tom: "brand" },
  em_analise: { texto: "Em análise", tom: "muted" },
  falta_documento: { texto: "Falta documento", tom: "danger" },
  aprovada: { texto: "Aprovada", tom: "positive" },
  pronta: { texto: "Pronto", tom: "positive" },
  registrada: { texto: "Registrada", tom: "brand" },
};
const CAMPOS = {
  para_quem: "Para quem", nascimento: "Data de nascimento", observacao: "Observação", descricao: "Descrição", inicio: "Começa em", fim: "Termina em",
  empresa: "Empresa ou profissional", nome: "Corretor", creci: "CRECI", quando: "Visita", assunto: "Assunto",
  sentido: "Chegando ou saindo", data: "Dia da mudança", periodo: "Período",
  // Aluguel de temporada (0111).
  hospede: "Hóspede titular", cpf: "CPF do hóspede", telefone: "Telefone do hóspede", entrada: "Entrada", saida: "Saída",
  hora_entrada: "Hora de entrada", hora_saida: "Hora de saída",
  veiculo: "Veículo", placa: "Placa", modelo: "Modelo", aceite: "Responsabilidade",
};
const ANEXO = { foto3x4: "Foto 3x4", atestado: "Atestado médico", rt: "RT", documento: "Documento do corretor", foto: "Foto", print: "Print", anexo: "Anexo" };
/** Respostas prontas: um toque escreve, a pessoa ainda pode editar antes de mandar. */
const PRONTAS = [
  "Recebido, obrigado! Vamos analisar.",
  "Falta um documento. Pode anexar aqui mesmo, nesta conversa?",
  "Está pronto. Pode retirar na administração.",
];
/**
 * As respostas prontas que fazem sentido para o tipo (13/11/2026): "Falta um
 * documento" só onde há documento a mandar; "Está pronto" só no cartão da
 * piscina, que é o único que se retira.
 */
const COM_DOCUMENTO = ["piscina", "obra", "corretor", "temporada"];
function prontasDoTipo(tipo) {
  return PRONTAS.filter((r) =>
    (!r.startsWith("Falta um documento") || COM_DOCUMENTO.includes(tipo))
    && (!r.startsWith("Está pronto") || tipo === "piscina"));
}

// As situações que a administração escolhe dependem do tipo (0110): ver
// `passosDoTipo` em lib/confirmacoes. "Andamento" é o meio do caminho; o resto
// é decisão (aprovar, pronto, concluir, encerrar).
const ANDAMENTO = ["em_analise", "falta_documento"];

const COLUNAS = [
  { rotulo: "Pedido", largura: "minmax(0, 1.6fr)" },
  { rotulo: "Quem", largura: "minmax(0, 1.2fr)" },
  { rotulo: "Situação", largura: "minmax(0, .9fr)" },
  { rotulo: "Última mensagem", largura: "minmax(0, .8fr)" },
];

/** A pasta do chamado: o Storage só deixa gravar ali quem é da administração ou abriu o chamado. */
function caminhoDoAnexo(id, nome) {
  const limpo = String(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `solicitacoes-morador/${id}/${Date.now()}-${limpo}`;
}

async function abrirAnexo(caminho) {
  const { data, error } = await supabase.storage.from("anexos").createSignedUrl(caminho, 600);
  if (!error) window.open(data.signedUrl, "_blank", "noopener");
  return !error;
}

/**
 * Solicitações do app (0068): os chamados abertos, com a conversa. A linha
 * abre o chamado: o pedido, os anexos, as mensagens, o campo de resposta (com
 * respostas prontas e anexo) e os botões de situação. Recusar pede motivo.
 */
export default function FilaSolicitacoes({ itens, carregando, onMudou, registros = false }) {
  const toast = useToast();
  const [aberto, setAberto] = useState(null);
  const [detalhes, setDetalhes] = useState({});
  const [recusando, setRecusando] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const buscar = useCallback(async (id) => {
    const { data, error } = await supabase.rpc("detalhe_da_solicitacao", { p_id: id });
    setDetalhes((d) => ({ ...d, [id]: error ? { erro: erroLegivel(error) } : { dados: data } }));
  }, []);

  // A conversa aberta confere mensagem nova do morador a cada 8 segundos.
  useAtualizar(() => { if (aberto != null) buscar(aberto); }, 8000);

  const alternar = useCallback((id) => {
    setAberto(id);
    if (id == null) return;
    setDetalhes((d) => ({ ...d, [id]: d[id]?.dados ? d[id] : { carregando: true } }));
    buscar(id);
  }, [buscar]);

  const mudar = async (s, status, motivo) => {
    setSalvando(true);
    const { error } = await supabase.rpc("mudar_situacao_da_solicitacao", { p_id: s.id, p_status: status, p_motivo: motivo ?? null });
    setSalvando(false);
    if (error) { toast.error(erroLegivel(error)); return false; }
    toast.success("Situação mudada. O morador foi avisado.");
    if (["concluida", "recusada"].includes(status)) setAberto(null);
    else buscar(s.id);
    onMudou();
    return true;
  };

  // Reclamação, sugestão e erro (0110): vira tarefa em "A fazer".
  const paraTarefas = async (s) => {
    setSalvando(true);
    const { error } = await supabase.rpc("mandar_para_tarefas", { p_id: s.id });
    setSalvando(false);
    if (error) { toast.error(erroLegivel(error)); return; }
    toast.success("Foi para Tarefas, em A fazer.");
    buscar(s.id);
    onMudou();
  };

  const responder = async (s, texto, arquivo) => {
    setSalvando(true);
    let caminho = null;
    if (arquivo) {
      caminho = caminhoDoAnexo(s.id, arquivo.name);
      const { error } = await supabase.storage.from("anexos").upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (error) { setSalvando(false); toast.error("Não foi possível enviar o anexo."); return false; }
    }
    const { error } = await supabase.rpc("responder_solicitacao", { p_id: s.id, p_texto: texto || null, p_caminho: caminho, p_nome: arquivo?.name ?? null });
    setSalvando(false);
    if (error) { toast.error(erroLegivel(error)); return false; }
    buscar(s.id);
    onMudou();
    return true;
  };

  if (!carregando && itens.length === 0) {
    return registros ? (
      <EmptyState
        icon={<MessageSquare size={20} />}
        title="Nenhuma reclamação ou sugestão registrada"
        description="Reclamações, sugestões e erros no app entram aqui já registrados. Dá para conversar com o morador e mandar para Tarefas."
      />
    ) : (
      <EmptyState
        icon={<MessageSquare size={20} />}
        title="Nenhuma solicitação em andamento"
        description="Pedidos de cartão da piscina, obra, mudança e visita de corretor aparecem aqui."
      />
    );
  }

  return (
    <>
      <ListaQueAbre
        colunas={COLUNAS}
        larguraAcoes="0px"
        itens={itens}
        carregando={carregando}
        chave={(s) => s.id}
        aberto={aberto}
        onAlternar={alternar}
        rotuloDaLinha={(s) => `${TIPOS[s.tipo]} Nº ${s.id}, ${s.quem}${s.nao_lida ? ", mensagem nova" : ""}: abrir conversa`}
        celulas={(s) => [
          <span key="p" className="conf-duas">
            <strong>{TIPOS[s.tipo] ?? s.tipo} <span className="conf-num">Nº {s.id}</span></strong>
            {s.resumo && <small>{s.resumo}</small>}
          </span>,
          <span key="q" className="conf-duas">{s.quem}<small>{apto(s.bloco, s.unidade)}{s.tipo_morador === "Não Morador" ? " · não mora" : ""}</small></span>,
          <Badge key="s" tone={SITUACAO[s.status]?.tom ?? "neutral"}>{SITUACAO[s.status]?.texto ?? s.status}</Badge>,
          <span key="u" className={s.nao_lida ? "conf-espera conf-espera--longa" : "conf-espera"}>
            {s.nao_lida && <span className="conf-ponto" aria-hidden="true" />}
            {s.ultima_msg_de === "morador" ? "Morador, " : ""}{esperaDesde(s.ultima_msg_em ?? s.enviada_em)}
          </span>,
        ]}
        acoes={() => null}
        detalhe={(s) => (
          <ConversaDaAdm
            chamado={s}
            estado={detalhes[s.id]}
            salvando={salvando}
            onResponder={(texto, arquivo) => responder(s, texto, arquivo)}
            onMudar={(status) => (status === "recusada" ? setRecusando(s) : mudar(s, status))}
            extra={registros && (
              s.tarefa_id
                ? <Badge tone="positive"><ListTodo size={14} aria-hidden="true" />Nas Tarefas</Badge>
                : <Button size="sm" variant="primary" disabled={salvando} onClick={() => paraTarefas(s)}>
                    <ListTodo size={15} aria-hidden="true" />Mandar para Tarefas
                  </Button>
            )}
          />
        )}
      />

      <RecusarDialog
        key={recusando?.id ?? "nenhum"}
        alvo={recusando}
        titulo={recusando ? `Recusar: ${TIPOS[recusando.tipo]} Nº ${recusando.id}` : ""}
        explicacao="O motivo aparece na conversa e o morador recebe um aviso."
        salvando={salvando}
        onCancelar={() => setRecusando(null)}
        onRecusar={async (motivo) => { if (await mudar(recusando, "recusada", motivo)) setRecusando(null); }}
      />
    </>
  );
}

/**
 * `fechada`: só leitura, para as solicitações finalizadas da tela APP. O banco
 * já recusa resposta e mudança de situação em chamado fechado; aqui some o
 * que não funcionaria.
 */
export function ConversaDaAdm({ chamado, estado, salvando, onResponder, onMudar, fechada = false, extra = null }) {
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState(null);
  const confirmar = useConfirm();
  // Concluir pergunta antes: finalizado, o chamado não volta (12/11/2026).
  const pedirMudanca = async (status) => {
    const nome = `${TIPOS[chamado?.tipo] ?? "Solicitação"} Nº ${chamado?.id ?? ""}`.trim();
    const onde = [apto(chamado?.bloco, chamado?.unidade), chamado?.quem].filter(Boolean).join(", ");
    if (status === "concluida" && !(await confirmar(perguntaDeFinalizar(nome, onde)))) return;
    // Corretor, obra e mudança: aprovar também encerra (0110).
    if (status === "aprovada" && aprovarEncerra(chamado?.tipo) && !(await confirmar(perguntaDeAprovar(nome, onde)))) return;
    onMudar(status);
  };
  if (!estado || estado.carregando) return <p className="conf-detalhe__aviso">Carregando a conversa…</p>;
  if (estado.erro) return <p className="conf-detalhe__aviso conf-detalhe__aviso--erro">{estado.erro}</p>;
  const d = estado.dados;
  const iniciais = d.mensagens.filter((m) => m.inicial);
  const conversa = d.mensagens.filter((m) => !m.inicial);

  const enviar = async (e) => {
    e.preventDefault();
    if (!texto.trim() && !arquivo) return;
    if (await onResponder(texto.trim(), arquivo)) { setTexto(""); setArquivo(null); }
  };

  // Layout (13/11/2026): os dados do pedido numa grade em cima, na largura
  // toda; embaixo, a conversa ocupa o espaço e, ao lado, anexos e situação.
  // Antes os dados empilhados numa coluna estreita deixavam a tela vazia.
  return (
    <div className="conf-chamado">
      <dl className="conf-dados conf-chamado__dados">
        {Object.entries(d.dados ?? {}).map(([k, v]) => <div key={k} className="conf-dado"><dt>{CAMPOS[k] ?? k}</dt><dd>{dadoLegivel(v, k)}</dd></div>)}
        <div className="conf-dado"><dt>CPF de quem pediu</dt><dd className="conf-dado__mono">{d.cpf || "Não informado"}</dd></div>
        <div className="conf-dado"><dt>Telefone</dt><dd>{telefoneLegivel(d.telefone) || "Não informado"}</dd></div>
        <div className="conf-dado conf-dado--largo"><dt>E-mail</dt><dd className="conf-dado__linha" title={d.email || undefined}>{d.email || "-"}</dd></div>
      </dl>
      <div className="conf-chamado__lado">
        {iniciais.length > 0 && (
          <div className="conf-bloco">
            <small>Anexos do pedido</small>
            {iniciais.map((m) => <Anexo key={m.id} m={m} />)}
          </div>
        )}
        {!fechada && (() => {
          // Três faixas (13/11/2026): a situação atual; o andamento (em
          // análise, falta documento), com o passo atual marcado em vez de
          // sumir, para os botões não trocarem de lugar; e a decisão.
          const passos = passosDoTipo(chamado.tipo);
          const andamento = passos.filter(([s]) => ANDAMENTO.includes(s));
          const decisao = passos.filter(([s]) => !ANDAMENTO.includes(s) && s !== chamado.status);
          const sit = SITUACAO[chamado.status];
          return (
            <section className="conf-passos" aria-label="Situação do chamado">
              <div className="conf-passos__topo">
                <span className="conf-passos__rotulo">Situação</span>
                {sit && <Badge tone={sit.tom}>{sit.texto}</Badge>}
              </div>
              {andamento.length > 0 && (
                <div className="conf-passos__faixa">
                  {andamento.map(([s, rotulo]) => {
                    const atual = s === chamado.status;
                    return (
                      <Button key={s} size="sm" variant="secondary" className={atual ? "conf-passos__atual" : undefined}
                        aria-pressed={atual} disabled={salvando || atual} onClick={() => pedirMudanca(s)}>
                        {atual && <Check size={14} aria-hidden="true" />}{rotulo}
                      </Button>
                    );
                  })}
                </div>
              )}
              {(decisao.length > 0 || !soRegistra(chamado.tipo) || extra) && (
                <div className="conf-passos__faixa conf-passos__faixa--decisao">
                  {!soRegistra(chamado.tipo) && (
                    <Button size="sm" variant="secondary" className="conf-recusar" disabled={salvando} onClick={() => onMudar("recusada")}>
                      <X size={14} aria-hidden="true" />Recusar
                    </Button>
                  )}
                  {decisao.map(([s, rotulo]) => (
                    <Button key={s} size="sm" variant={s === "concluida" && !soRegistra(chamado.tipo) ? "secondary" : "primary"}
                      disabled={salvando} onClick={() => pedirMudanca(s)}>
                      {(s === "aprovada" || s === "concluida") && <Check size={14} aria-hidden="true" />}{rotulo}
                    </Button>
                  ))}
                  {extra}
                </div>
              )}
            </section>
          );
        })()}
      </div>

      <div className="conf-chamado__conversa">
        <div className="conf-msgs" aria-label="Conversa com o morador">
          {conversa.length === 0 && <p className="conf-detalhe__aviso">{fechada ? "Sem mensagens." : "Ainda sem mensagens. Responda abaixo."}</p>}
          {conversa.map((m) => (m.autor === "sistema" ? (
            <p key={m.id} className="conf-evento">{m.texto}</p>
          ) : (
            <div key={m.id} className={m.autor === "adm" ? "conf-balao conf-balao--adm" : "conf-balao"}>
              {m.autor === "morador" && <span className="conf-balao__quem">{chamado.quem}</span>}
              {m.texto && <p>{m.texto}</p>}
              {m.anexo && <Anexo m={m} />}
              <small>{m.autor === "adm" && m.autor_nome ? `${m.autor_nome}, ` : ""}{new Date(m.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>
            </div>
          )))}
        </div>
        {!fechada && <>
        <div className="conf-prontas">
          {prontasDoTipo(chamado.tipo).map((r) => <button key={r} type="button" onClick={() => setTexto(r)}>{r}</button>)}
        </div>
        <form className="conf-responder" onSubmit={enviar}>
          {arquivo && (
            <p className="conf-responder__arq"><Paperclip size={14} aria-hidden="true" />{arquivo.name}
              <button type="button" aria-label="Tirar o anexo" onClick={() => setArquivo(null)}><X size={14} /></button></p>
          )}
          <div className="conf-responder__linha">
            <label className="vit-btn vit-btn--secondary vit-btn--sm" aria-label="Anexar arquivo">
              <Paperclip size={15} aria-hidden="true" />
              <Input type="file" className="conf-responder__campo" accept="image/*,application/pdf" onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </label>
            <Textarea className="conf-responder__texto" rows={1} aria-label="Resposta ao morador" placeholder="Responder ao morador…" value={texto} maxLength={2000} onChange={(e) => setTexto(e.target.value)} />
            <Button type="submit" variant="primary" disabled={salvando || (!texto.trim() && !arquivo)} iconLeft={<Send size={15} />}>Enviar</Button>
          </div>
        </form>
        </>}
      </div>
    </div>
  );
}

function Anexo({ m }) {
  const [falhou, setFalhou] = useState(false);
  const pdf = /\.pdf$/i.test(m.anexo_nome ?? "");
  return (
    <button type="button" className="conf-anexo" onClick={async () => setFalhou(!(await abrirAnexo(m.anexo)))}>
      {pdf ? <FileText size={15} aria-hidden="true" /> : <Image size={15} aria-hidden="true" />}
      <span>{ANEXO[m.anexo_tipo] ?? "Anexo"}: {m.anexo_nome}</span>
      {falhou && <small> (não abriu)</small>}
    </button>
  );
}
