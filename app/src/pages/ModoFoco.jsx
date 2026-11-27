import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CalendarCheck, Car, Check, ChevronLeft, ChevronRight, Clock, ExternalLink, MessageSquare, PackageCheck, RotateCcw, UserPlus } from "lucide-react";
import { supabase } from "../api/supabase";
import { listar } from "../api/db";
import { useToast } from "../ui";
import { useAtualizar } from "../lib/useAtualizar";
import { dataHoraBR } from "../lib/format";
import {
  apto, erroLegivel, esperaDesde, EVENTO_PENDENCIAS, folhaDaReserva, prontoHa, prontosParaRetirar, reais, telefoneLegivel, TIPOS_DE_SOLICITACAO,
} from "../lib/confirmacoes";
import { diaEmBrasilia, eventosDoCondominio, filaDoFoco, proximosDias } from "../lib/inicio";
import { Contador, DiasEmLista } from "../components/inicio/pecas";
import RecusarDialog from "../components/confirmacoes/RecusarDialog";
import { ConversaDaAdm } from "../components/confirmacoes/FilaSolicitacoes";

const lista = (r) => (Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []);
/** O relógio, fora do corpo do componente (o React pede render puro). */
const agora = () => Date.now();
const seguro = (p) => Promise.resolve(p).then((r) => r, () => []);

const TIPO = {
  cadastro: { nome: "Cadastro", Icone: UserPlus },
  reserva: { nome: "Reserva", Icone: CalendarCheck },
  veiculo: { nome: "Veículo e TAG", Icone: Car },
  chamado: { nome: "Chamado", Icone: MessageSquare },
};

/* Os mesmos textos da fila de veículos de Confirmações. */
const MOTIVO_TAG = { nova: "TAG nova", nao_funciona: "A TAG não funciona", perdida: "TAG roubada ou furtada" };
function nomeDoPedidoDeVeiculo(p) {
  if (p.tipo === "tag") return MOTIVO_TAG[p.motivo_tag] ?? "TAG";
  if (p.tipo === "desativar_tag") return "Desativar TAG do proprietário";
  if (p.tipo === "excluir_tag") return "Excluir TAG";
  const verbo = { cadastrar: "Cadastrar", trocar: "Trocar", retirar: "Excluir" }[p.tipo] ?? "Pedido";
  return `${verbo} ${p.veiculo === "Carro" ? "carro" : "moto"}`;
}
function tagDoPedido(p) {
  if (p.veiculo !== "Carro") return "Moto não usa TAG";
  if (p.tipo === "tag") return p.motivo_tag === "perdida" ? "TAG nova; a perdida deve ser bloqueada no portão" : p.motivo_tag === "nao_funciona" ? "TAG nova; a antiga deve ser desativada" : "TAG nova";
  if (p.tipo === "trocar") return p.passar_tag ? "Passar a TAG atual para o carro novo" : p.com_tag ? "TAG nova (a antiga deve ser desativada)" : "Sem TAG (a antiga deve ser desativada)";
  if (p.tipo === "cadastrar") return p.com_tag ? "Com TAG" : "Sem TAG";
  if (p.tipo === "excluir_tag") return "A TAG sai do carro; desative no portão";
  if (p.tipo === "retirar") return p.veiculo === "Carro" ? "O carro e a TAG saem do apartamento; desative a TAG no portão" : "A moto sai do apartamento";
  return "A TAG do carro deve ser desativada";
}

/** O título grande do cartão. */
function tituloDo(item) {
  const b = item.bruto;
  if (item.tipo === "cadastro") return `${b.nome} · ${b.tipo === "Não Morador" ? `${b.vinculo} (não mora)` : b.vinculo}`;
  if (item.tipo === "reserva") {
    const f = folhaDaReserva(b.data_reserva, b.faltam);
    return `${b.espacos} · ${f ? `${f.semana.toLowerCase()} ${f.dia}/${String(b.data_reserva).slice(5, 7)}` : b.data_reserva}`;
  }
  if (item.tipo === "veiculo") return `${nomeDoPedidoDeVeiculo(b)}${b.placa ? ` · ${b.placa}` : ""}`;
  return `${TIPOS_DE_SOLICITACAO[b.tipo] ?? b.tipo} Nº ${b.id}`;
}

/** A pasta do chamado (a mesma da conversa em Confirmações). */
function caminhoDoAnexo(id, nome) {
  const limpo = String(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `solicitacoes-morador/${id}/${Date.now()}-${limpo}`;
}

async function urlAssinada(caminho) {
  if (!caminho) return null;
  const { data, error } = await supabase.storage.from("anexos").createSignedUrl(caminho, 600);
  return error ? null : data.signedUrl;
}

async function buscarDetalhe(item) {
  const nome = { cadastro: "detalhe_do_cadastro", reserva: "detalhe_da_reserva", veiculo: "detalhe_do_pedido_veiculo", chamado: "detalhe_da_solicitacao" }[item.tipo];
  const { data, error } = await supabase.rpc(nome, { p_id: item.id });
  if (error) return { erro: erroLegivel(error) };
  const url = item.tipo === "reserva" || item.tipo === "veiculo" ? await urlAssinada(data?.comprovante) : null;
  return { dados: data, url };
}

const buscarTudo = () => Promise.all([
  seguro(supabase.rpc("cadastros_para_aprovar")), seguro(supabase.rpc("reservas_para_aprovar")),
  seguro(supabase.rpc("pedidos_veiculo_para_aprovar")), seguro(supabase.rpc("solicitacoes_para_responder")),
  seguro(listar("UNIDADES")), seguro(listar("FESTAS")), seguro(listar("CHURRASQUEIRA")),
  seguro(listar("MUDANCAS")), seguro(listar("AGENDAMENTOS")), seguro(supabase.rpc("tags_a_entregar")),
]).then(([c, r, v, s, unidades, festas, churras, mudancas, agenda, tags]) => ({
  filas: { cadastros: lista(c), reservas: lista(r), veiculos: lista(v), solicitacoes: lista(s) },
  // Pronto, esperando o morador buscar (o cartão "Falta concluir" do lado).
  pendentes: prontosParaRetirar({ tags: lista(tags), solicitacoes: lista(s) }),
  eventos: eventosDoCondominio({ unidades: lista(unidades), festas: lista(festas), churrasqueira: lista(churras), mudancas: lista(mudancas), agendamentos: lista(agenda) }),
}));

/**
 * Modo foco: os pedidos do app um de cada vez, do que espera há mais tempo
 * para o mais novo. Os mesmos pedidos e as mesmas ações da tela de
 * Confirmações (as funções do banco são as mesmas), num cartão grande.
 * Arrastar para a direita aprova, para a esquerda pula. Chamado não se aprova
 * arrastando: ele se responde, na conversa dentro do cartão.
 */
export default function ModoFoco() {
  const toast = useToast();
  const navigate = useNavigate();
  const [fila, setFila] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [pendentes, setPendentes] = useState(null);
  const [feitos, setFeitos] = useState(0);
  const [inicio] = useState(() => Date.now());
  const [ultimaAcao, setUltimaAcao] = useState(inicio);
  const [hoje, setHoje] = useState(() => diaEmBrasilia(Date.now()));
  const [detalhes, setDetalhes] = useState({});
  const [saindo, setSaindo] = useState(null); // "direita" | "esquerda" | "baixo"
  const [ocupado, setOcupado] = useState(false);
  const [recusando, setRecusando] = useState(null);
  const [pulado, setPulado] = useState(null);

  const aplicar = useCallback(({ filas, eventos: ev, pendentes: pend }, juntar) => {
    const nova = filaDoFoco(filas);
    setEventos(ev);
    setPendentes(pend ?? []);
    setHoje(diaEmBrasilia(Date.now()));
    setFila((atual) => {
      if (!juntar || !atual) return nova;
      // Atualização de fundo: não mexe na ordem de quem já está na fila (a
      // pessoa pode estar no meio de um cartão); só tira o que já foi
      // resolvido em outra tela e põe no fim o que chegou.
      const vivas = new Set(nova.map((i) => i.chave));
      const mantidas = atual.filter((i) => vivas.has(i.chave) || i === atual[0]);
      const ja = new Set(mantidas.map((i) => i.chave));
      const novas = nova.filter((i) => !ja.has(i.chave));
      return [...mantidas, ...novas];
    });
  }, []);

  useEffect(() => { buscarTudo().then((d) => aplicar(d, false)); }, [aplicar]);
  useAtualizar(() => buscarTudo().then((d) => aplicar(d, true)), 60_000);

  const atual = fila?.[0] ?? null;
  // O detalhe do cartão da frente (e do próximo, para a troca ser instantânea).
  useEffect(() => {
    if (!fila) return;
    fila.slice(0, 2).forEach((item) => {
      if (detalhes[item.chave]) return;
      setDetalhes((d) => ({ ...d, [item.chave]: { carregando: true } }));
      buscarDetalhe(item).then((r) => setDetalhes((d) => ({ ...d, [item.chave]: r })));
    });
  }, [fila]); // eslint-disable-line react-hooks/exhaustive-deps

  const tirarDaFrente = (direcao, depois) => {
    setSaindo(direcao);
    setTimeout(() => {
      setSaindo(null);
      depois();
    }, 420);
  };

  const concluir = (item, mensagem) => {
    setUltimaAcao(agora());
    window.dispatchEvent(new Event(EVENTO_PENDENCIAS));
    toast.success(mensagem);
    tirarDaFrente("direita", () => {
      setFeitos((n) => n + 1);
      setFila((f) => f.filter((i) => i.chave !== item.chave));
    });
  };

  const aprovar = async (item = atual) => {
    if (!item || ocupado || item.tipo === "chamado") return;
    const b = item.bruto;
    const rpc = { cadastro: "aprovar_cadastro", reserva: "aprovar_reserva", veiculo: "aprovar_pedido_veiculo" }[item.tipo];
    setOcupado(true);
    const { error } = await supabase.rpc(rpc, { p_id: item.id });
    setOcupado(false);
    if (error) { toast.error(erroLegivel(error)); voltarAoLugar(); return; }
    const msg = {
      cadastro: `Cadastro de ${b.nome} aprovado. A pessoa recebeu o e-mail.`,
      reserva: `Reserva de ${b.morador} aprovada. O morador foi avisado no app.`,
      veiculo: "Pedido de veículo aprovado.",
    }[item.tipo];
    concluir(item, msg);
  };

  const recusar = async (motivo) => {
    const item = recusando;
    const rpc = { cadastro: "recusar_cadastro", reserva: "recusar_reserva", veiculo: "recusar_pedido_veiculo" }[item.tipo];
    setOcupado(true);
    const { error } = item.tipo === "chamado"
      ? await supabase.rpc("mudar_situacao_da_solicitacao", { p_id: item.id, p_status: "recusada", p_motivo: motivo })
      : await supabase.rpc(rpc, { p_id: item.id, p_motivo: motivo });
    setOcupado(false);
    if (error) { toast.error(erroLegivel(error)); return; }
    setRecusando(null);
    setUltimaAcao(agora());
    window.dispatchEvent(new Event(EVENTO_PENDENCIAS));
    toast.success("Recusado. O motivo foi para o morador.");
    tirarDaFrente("baixo", () => { setFeitos((n) => n + 1); setFila((f) => f.filter((i) => i.chave !== item.chave)); });
  };

  const pular = (item = atual) => {
    if (!item || ocupado || (fila?.length ?? 0) < 2) return;
    tirarDaFrente("esquerda", () => {
      setFila((f) => [...f.filter((i) => i.chave !== item.chave), item]);
      setPulado(item);
    });
  };
  const desfazerPulo = () => {
    const item = pulado; if (!item) return;
    setPulado(null);
    setFila((f) => [item, ...f.filter((i) => i.chave !== item.chave)]);
  };
  useEffect(() => { if (!pulado) return undefined; const t = setTimeout(() => setPulado(null), 6000); return () => clearTimeout(t); }, [pulado]);

  /* ---- chamado: as mesmas ações da conversa de Confirmações ---- */
  const recarregarDetalhe = (item) => buscarDetalhe(item).then((r) => setDetalhes((d) => ({ ...d, [item.chave]: r })));
  const mudarChamado = async (item, status) => {
    if (status === "recusada") { setRecusando(item); return; }
    setOcupado(true);
    const { error } = await supabase.rpc("mudar_situacao_da_solicitacao", { p_id: item.id, p_status: status, p_motivo: null });
    setOcupado(false);
    if (error) { toast.error(erroLegivel(error)); return; }
    if (["concluida", "aprovada", "pronta", "falta_documento", "em_analise"].includes(status)) concluir(item, "Situação mudada. O morador foi avisado.");
  };
  const responderChamado = async (item, texto, arquivo) => {
    setOcupado(true);
    let caminho = null;
    if (arquivo) {
      caminho = caminhoDoAnexo(item.id, arquivo.name);
      const { error } = await supabase.storage.from("anexos").upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (error) { setOcupado(false); toast.error("Não foi possível enviar o anexo."); return false; }
    }
    const { error } = await supabase.rpc("responder_solicitacao", { p_id: item.id, p_texto: texto || null, p_caminho: caminho, p_nome: arquivo?.name ?? null });
    setOcupado(false);
    if (error) { toast.error(erroLegivel(error)); return false; }
    // Respondeu: a última palavra é da administração, o chamado sai da fila.
    concluir(item, "Resposta enviada. O morador foi avisado no app.");
    return true;
  };

  /* ---- arrastar ---- */
  const cartaoRef = useRef(null);
  const arrasto = useRef(null);
  // O deslocamento vale só para o cartão que estava na frente: trocou o cartão, volta a zero.
  const [desloc, setDesloc] = useState({ chave: null, dx: 0 });
  const dx = desloc.chave === atual?.chave ? desloc.dx : 0;
  const setDx = (v) => setDesloc({ chave: atual?.chave ?? null, dx: v });
  const voltarAoLugar = () => { arrasto.current = null; setDx(0); };
  const aoApertar = (e) => {
    if (!atual || ocupado || e.button > 0 || e.target.closest("button, a, input, textarea, label, select, .foco-conversa")) return;
    arrasto.current = { x0: e.clientX };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const aoMover = (e) => { if (arrasto.current) setDx(e.clientX - arrasto.current.x0); };
  const aoSoltar = () => {
    if (!arrasto.current) return;
    const d = dx; arrasto.current = null;
    if (d > 170 && atual.tipo !== "chamado") { aprovar(atual); return; }
    if (d < -170 && fila.length > 1) { setDx(0); pular(atual); return; }
    setDx(0);
  };

  const dias = useMemo(() => proximosDias(eventos, hoje, 6), [eventos, hoje]);
  // O total da sessão: o que já foi resolvido mais o que ainda está na fila.
  const total = feitos + (fila?.length ?? 0);
  const fora = fila?.filter((i) => i.foraDoPrazo).length ?? 0;
  const carregando = fila == null;
  const terminou = !carregando && fila.length === 0;
  const tempo = Math.max(1, Math.round((ultimaAcao - inicio) / 1000));

  const estiloFrente = dx ? { transform: `translateX(${dx}px) rotate(${dx / 24}deg)`, transition: "none" } : undefined;
  const tintaOk = atual?.tipo !== "chamado" ? Math.max(0, Math.min(1, dx / 180)) : 0;
  const tintaPula = Math.max(0, Math.min(1, -dx / 180));

  return (
    <div className="foco">
      <header className="foco-topo">
        <span className="foco-anel" aria-hidden="true">
          <svg viewBox="0 0 36 36"><circle className="foco-anel__trilho" cx="18" cy="18" r="15.9155" />
            <circle className="foco-anel__arco" cx="18" cy="18" r="15.9155" pathLength="100" style={{ strokeDashoffset: total ? 100 - (feitos / total) * 100 : 100 }} /></svg>
          <b>{feitos}/{total}</b>
        </span>
        <div className="foco-topo__texto">
          <h1>Modo foco</h1>
          <p>Um pedido por vez, do mais antigo para o mais novo · {carregando ? "carregando" : fila.length ? `${fila.length} esperando` : "tudo em dia"}</p>
        </div>
        <div className="foco-topo__acoes">
          <button type="button" className="ini-link ini-link--borda" onClick={() => navigate("/inicio")}><ArrowLeft size={15} aria-hidden="true" />Voltar ao início</button>
        </div>
      </header>

      <div className="foco-segs" aria-hidden="true">
        {Array.from({ length: Math.min(total, 40) }, (_, i) => <i key={i} className={i < feitos ? "feito" : i === feitos && !terminou ? "atual" : ""} />)}
      </div>

      <div className="foco-grade">
        <div className="foco-palco" aria-live="polite">
          {carregando && <div className="foco-cartao foco-cartao--esqueleto" aria-label="Carregando os pedidos" />}

          {!carregando && fila.slice(0, 3).reverse().map((item, k, arr) => {
            const pos = arr.length - 1 - k; // 0 = frente
            const frente = pos === 0;
            const classe = ["foco-cartao", `foco-cartao--${item.tipo}`, frente ? "foco-cartao--frente" : "", frente && saindo ? `foco-cartao--sai-${saindo}` : ""].join(" ");
            return (
              <article
                key={item.chave}
                ref={frente ? cartaoRef : undefined}
                className={classe}
                style={{ "--pos": pos, ...(frente ? estiloFrente : null) }}
                aria-hidden={!frente}
                onPointerDown={frente ? aoApertar : undefined}
                onPointerMove={frente ? aoMover : undefined}
                onPointerUp={frente ? aoSoltar : undefined}
                onPointerCancel={frente ? voltarAoLugar : undefined}
              >
                {frente && (
                  <>
                    <div className="foco-tinta foco-tinta--ok" style={{ opacity: tintaOk }} aria-hidden="true"><i><Check size={40} /></i></div>
                    <div className="foco-tinta foco-tinta--pula" style={{ opacity: tintaPula }} aria-hidden="true"><i><ChevronLeft size={40} /></i></div>
                    <ConteudoDoCartao
                      item={item}
                      estado={detalhes[item.chave]}
                      ocupado={ocupado}
                      podePular={fila.length > 1}
                      onAprovar={() => aprovar(item)}
                      onRecusar={() => setRecusando(item)}
                      onPular={() => pular(item)}
                      onResponder={(texto, arquivo) => responderChamado(item, texto, arquivo)}
                      onMudar={(status) => mudarChamado(item, status)}
                      onRecarregar={() => recarregarDetalhe(item)}
                    />
                  </>
                )}
              </article>
            );
          })}

          {terminou && (
            <div className="foco-fim">
              <span className="foco-fim__selo"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength="1" /></svg></span>
              <h2>Tudo em dia</h2>
              <p>Nenhum pedido do app esperando. Os novos aparecem aqui e no menu.</p>
              <div className="foco-fim__resumo">
                <span><b><Contador valor={feitos} /></b>resolvidos</span>
                <span><b>{Math.floor(tempo / 60)}m {String(tempo % 60).padStart(2, "0")}s</b>nesta sessão</span>
              </div>
              <button type="button" className="foco-botao foco-botao--pri" onClick={() => navigate("/inicio")}>Voltar ao início</button>
              <span className="foco-confete" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ "--k": i }} />)}</span>
            </div>
          )}
        </div>

        <aside className="foco-lado">
          <section className="ini-cartao">
            <header className="ini-cartao__topo"><h2>Na fila</h2><span className="foco-selo">{fila?.length ?? "–"}</span></header>
            <ul className="foco-fila">
              {(fila ?? []).slice(0, 3).map((item, k) => {
                const { Icone } = TIPO[item.tipo];
                return (
                  <li key={item.chave} className={k === 0 ? "atual" : ""}>
                    <span className={`ini-ico ini-ico--t-${item.tipo}`}><Icone size={15} aria-hidden="true" /></span>
                    <span className="ini-lista__texto"><b>{tituloDo(item)}</b><small>{apto(item.bloco, item.unidade)} · {item.quem}</small></span>
                    <span className={`foco-idade${item.foraDoPrazo ? " foco-idade--fora" : ""}`}>{esperaDesde(item.quando)}</span>
                  </li>
                );
              })}
              {fila && fila.length > 3 && <li className="foco-fila__mais">e mais {fila.length - 3} na fila</li>}
              {fila && fila.length === 0 && <li className="foco-fila__mais">Fila vazia.</li>}
            </ul>
          </section>
          <section className="ini-cartao">
            <header className="ini-cartao__topo"><h2>Seu ritmo</h2></header>
            <div className="foco-ritmo">
              <div><b><Contador valor={feitos} /></b><span>resolvidos agora</span></div>
              <div><b className={fora ? "foco-ritmo--fora" : ""}><Contador valor={fora} /></b><span>fora do prazo</span></div>
            </div>
          </section>
          <section className="ini-cartao">
            <header className="ini-cartao__topo"><h2>Falta concluir</h2><span className="foco-selo">{pendentes?.length ?? "–"}</span></header>
            {/* Pronto e esperando o morador buscar (TAG na portaria, cartão da
                piscina pronto...). Concluir é em Confirmações → Pendentes. */}
            <ul className="foco-fila">
              {(pendentes ?? []).slice(0, 3).map((p) => (
                <li key={p.chave}>
                  <span className="ini-ico ini-ico--t-chamado"><PackageCheck size={15} aria-hidden="true" /></span>
                  <span className="ini-lista__texto"><b>{p.titulo}</b><small>{apto(p.bloco, p.unidade)}{p.quem ? ` · ${p.quem}` : ""}</small></span>
                  <span className="foco-idade">{prontoHa(p.desde).replace(/^pronto (há )?/, "")}</span>
                </li>
              ))}
              {pendentes && pendentes.length > 3 && <li className="foco-fila__mais">e mais {pendentes.length - 3} prontos</li>}
              {pendentes && pendentes.length === 0 && <li className="foco-fila__mais">Nada esperando o morador buscar.</li>}
            </ul>
            {pendentes && pendentes.length > 0 && (
              <button type="button" className="foco-lado__link" onClick={() => navigate("/confirmacao?fila=pendentes")}>
                Ver e concluir os pendentes
              </button>
            )}
          </section>
          <section className="ini-cartao">
            <header className="ini-cartao__topo"><h2>Próximos dias</h2></header>
            <DiasEmLista dias={dias} />
          </section>
        </aside>
      </div>

      {pulado && (
        <div className="foco-desfazer" role="status">
          <span>Pulado: {tituloDo(pulado)}. Volta no fim da fila.</span>
          <button type="button" onClick={desfazerPulo}><RotateCcw size={14} aria-hidden="true" />Desfazer</button>
        </div>
      )}

      <RecusarDialog
        key={recusando?.chave ?? "nenhum"}
        alvo={recusando}
        titulo={recusando ? `Recusar: ${tituloDo(recusando)}` : ""}
        explicacao={recusando?.tipo === "reserva" ? "O motivo aparece para o morador no app, com o aviso de que o PIX será estornado." : "O motivo aparece para o morador no app."}
        salvando={ocupado}
        onCancelar={() => setRecusando(null)}
        onRecusar={recusar}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ConteudoDoCartao({ item, estado, ocupado, podePular, onAprovar, onRecusar, onPular, onResponder, onMudar }) {
  const { nome, Icone } = TIPO[item.tipo];
  const b = item.bruto;
  return (
    <>
      <div className="foco-cartao__topo">
        <span className={`ini-ico ini-ico--grande ini-ico--t-${item.tipo}`}><Icone size={20} aria-hidden="true" /></span>
        <span className="foco-cartao__meta"><b>{nome}</b><span>pedido nº {item.id} · {item.quando ? dataHoraBR(item.quando, { comSegundos: false }) : ""}</span></span>
        <span className={`foco-prazo${item.foraDoPrazo ? " foco-prazo--fora" : ""}`}><Clock size={12} aria-hidden="true" />{item.foraDoPrazo ? "fora do prazo" : `há ${esperaDesde(item.quando)}`}</span>
      </div>
      <h2 className="foco-cartao__titulo">{tituloDo(item)}</h2>
      <div className="foco-quem">
        <b>{item.quem}</b>
        <span className="ini-un">{apto(item.bloco, item.unidade)}</span>
        {b.vinculo && <span>{String(b.vinculo).toLowerCase()}</span>}
      </div>

      <div className="foco-corpo">
        {item.tipo === "chamado" ? (
          <div className="foco-conversa">
            <ConversaDaAdm chamado={b} estado={estado} salvando={ocupado} onResponder={onResponder} onMudar={onMudar} />
          </div>
        ) : (
          <DetalheDoPedido item={item} estado={estado} />
        )}
      </div>

      <div className="foco-rodape">
        <span className="foco-dica">
          {item.tipo === "chamado" ? "Responda na conversa ou mude a situação" : <><ChevronLeft size={13} aria-hidden="true" />arraste<ChevronRight size={13} aria-hidden="true" /></>}
        </span>
        {item.tipo !== "chamado" && <button type="button" className="foco-botao foco-botao--recusar" disabled={ocupado} onClick={onRecusar}>Recusar…</button>}
        <button type="button" className="foco-botao" disabled={ocupado || !podePular} onClick={onPular}>Pular</button>
        {item.tipo !== "chamado" && (
          <button type="button" className="foco-botao foco-botao--pri" disabled={ocupado || estado?.carregando} onClick={onAprovar}>
            <Check size={16} aria-hidden="true" />Aprovar
          </button>
        )}
      </div>
    </>
  );
}

function DetalheDoPedido({ item, estado }) {
  const b = item.bruto;
  if (!estado || estado.carregando) return <p className="foco-aviso">Carregando os detalhes…</p>;
  if (estado.erro) return <p className="foco-aviso foco-aviso--erro">{estado.erro}</p>;
  const d = estado.dados ?? {};

  const dados = [];
  const verif = [];
  if (item.tipo === "cadastro") {
    dados.push(["CPF", d.cpf || "Ainda não informado"], ["Telefone", telefoneLegivel(d.telefone) || "Ainda não informado"], ["E-mail", d.email], ["WhatsApp", d.aviso_whatsapp ? "Aceitou os avisos" : "Não aceitou"]);
    verif.push(d.email_confirmado_em ? { ok: true, t: "E-mail confirmado" } : { ok: false, t: "E-mail ainda não confirmado" });
    const noApp = (d.no_app ?? []).filter((m) => m.status !== "pendente");
    verif.push(noApp.length ? { ok: true, t: `Já no app neste apto: ${noApp.map((m) => m.nome).join(", ")}` } : { ok: true, t: "Primeiro cadastro deste apartamento no app" });
    verif.push((d.no_condominio ?? []).length ? { ok: true, t: `No cadastro do condomínio: ${d.no_condominio.map((m) => m.nome).join(", ")}` } : { ok: false, t: "O condomínio não tem morador cadastrado neste apartamento. Confira antes de aprovar." });
  } else if (item.tipo === "reserva") {
    const f = folhaDaReserva(b.data_reserva, b.faltam);
    dados.push(["Data", f ? `${f.extenso} (${f.falta})` : b.data_reserva], ["Valor", reais(b.valor)], ["Telefone", telefoneLegivel(d.telefone) || "Não informado"], ["E-mail", d.email || "Não informado"]);
    verif.push(d.livres ? { ok: true, t: `Nesse dia, ${d.livres} ${d.livres.includes(",") ? "estão livres" : "está livre"}` } : { ok: false, t: "Os outros espaços estão ocupados nesse dia" });
    if (d.ocupados) verif.push({ ok: true, t: `Já reservado nesse dia: ${d.ocupados}` });
    verif.push(d.comprovante ? { ok: false, t: "Confira o valor do PIX no extrato antes de aprovar" } : { ok: false, t: "Sem comprovante anexado" });
  } else {
    const novo = b.tipo === "cadastrar" || b.tipo === "trocar";
    if (novo) dados.push(["Veículo", `${b.modelo ?? ""}${b.cor ? `, ${b.cor}` : ""}`]);
    if (d.atual) dados.push([novo ? "Veículo de agora" : "Veículo", `${d.atual.placa} · ${d.atual.modelo}, ${d.atual.cor}`]);
    dados.push(["TAG", tagDoPedido(b)]);
    if (b.origem === "morador") dados.push(["Telefone", telefoneLegivel(d.telefone) || "Não informado"]);
    if (d.observacao) dados.push(["Observação", d.observacao]);
    verif.push(b.placa_em_outro ? { ok: false, t: `A placa ${b.placa} também está no ${b.placa_em_outro}. Confira.` } : { ok: true, t: "Placa sem conflito com outro apartamento" });
    if (d.comprovante) verif.push({ ok: false, t: "Confira o valor do PIX no extrato antes de aprovar" });
  }

  const pdf = /\.pdf$/i.test(d.comprovante ?? "");
  return (
    <div className="foco-detalhe">
      <div className="foco-col">
        <div>
          <p className="foco-secao">Dados do pedido</p>
          <dl className="foco-dados">{dados.map(([r, v]) => <React.Fragment key={r}><dt>{r}</dt><dd>{v}</dd></React.Fragment>)}</dl>
        </div>
        <div>
          <p className="foco-secao">Verificações</p>
          <ul className="foco-verif">
            {verif.map((v, k) => (
              <li key={k} className={v.ok ? "ok" : "atencao"}>
                {v.ok ? <Check size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}{v.t}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {(item.tipo === "reserva" || item.tipo === "veiculo") && (
        <div className="foco-col">
          <div>
            <p className="foco-secao">Comprovante</p>
            {!d.comprovante ? <p className="foco-aviso">Sem comprovante.</p>
              : !estado.url ? <p className="foco-aviso">Não foi possível abrir o comprovante.</p>
                : (
                  <a className="foco-recibo" href={estado.url} target="_blank" rel="noopener noreferrer">
                    <span className="foco-recibo__topo"><i>PIX</i>Comprovante de pagamento</span>
                    <span className="foco-recibo__valor">{reais(b.valor)}</span>
                    {pdf ? <span className="foco-recibo__abrir">Abrir o PDF <ExternalLink size={13} aria-hidden="true" /></span>
                      : <img src={estado.url} alt={`Comprovante do PIX de ${item.quem}`} />}
                  </a>
                )}
          </div>
        </div>
      )}
    </div>
  );
}
