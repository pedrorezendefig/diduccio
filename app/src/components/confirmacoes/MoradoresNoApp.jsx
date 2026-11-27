import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, LogOut, MessageCircle, Pencil, Users } from "lucide-react";
import { supabase } from "../../api/supabase";
import { Badge, Button, EmptyState, Field, Input, Modal, useToast } from "../../ui";
import { dataBR, dataHoraBR, maskCPF, maskPhone } from "../../lib/format";
import { apto, erroLegivel, reais, telefoneLegivel } from "../../lib/confirmacoes";
import ListaQueAbre from "./ListaQueAbre";
import { Chave, Ficha, Filtros, Iniciais } from "../app/pecas";

const COLUNAS = [
  { rotulo: "Quem", largura: "minmax(0, 1.5fr)" },
  { rotulo: "CPF", largura: "minmax(0, 1fr)" },
  { rotulo: "Apto", largura: "minmax(0, .7fr)" },
  { rotulo: "Vínculo", largura: "minmax(0, .9fr)" },
  { rotulo: "Situação", largura: "minmax(0, .9fr)" },
];

const vinculoDe = (m) => (m.tipo === "Não Morador" ? `${m.vinculo} (não mora)` : m.vinculo);
// O dia em Brasília (o timestamptz em UTC viraria o dia seguinte depois das 21h).
const diaBR = (v) => (v ? dataHoraBR(v, { comSegundos: false }).slice(0, 10) : "");
const sem = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const chaveApto = (bloco, unidade) => `${bloco}-${unidade}`;

const ESPACO = { "CH-A": "Churrasqueira A", "CH-B": "Churrasqueira B", SALAO: "Salão de festas" };
const RESERVA = { segurando: "esperando o pagamento", pendente: "esperando a administração", aprovada: "confirmada" };
const SITUACAO_TAG = { pedida: "TAG pedida", portaria: "TAG na portaria", colada: "TAG colada" };

/**
 * Quem está no app (aprovado) e quem saiu no último ano (0073), em lista. A
 * linha abre o cadastro do app num modal (a `detalhe_do_cadastro` do 0065,
 * com o CPF mascarado) e os veículos do apartamento cadastrados pelo app (a
 * `veiculos_do_condominio` do 0070). Só o que veio do app: a ficha de
 * `moradores` do sistema não aparece aqui.
 * Do modal a administração registra a saída de quem deixou o apartamento.
 * O lápis (`podeEditar`: síndico, auxiliar e dev) corrige nome, telefone e
 * CPF pela `editar_cadastro_do_morador` (0081), que confere o cargo de novo.
 */
export default function MoradoresNoApp({ podeEditar = false }) {
  const toast = useToast();
  const [itens, setItens] = useState([]);
  const [veiculos, setVeiculos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [aberto, setAberto] = useState(null);
  const [editando, setEditando] = useState(null);
  const [saindo, setSaindo] = useState(null);

  const buscar = useCallback(() => Promise.all([
    supabase.rpc("moradores_no_app"),
    supabase.rpc("veiculos_do_condominio", { p_arquivados: false }),
  ]).then(([m, v]) => {
    const erro = m.error ?? v.error;
    if (erro) toast.error(erroLegivel(erro));
    setItens(Array.isArray(m.data) ? m.data : []);
    setVeiculos(Array.isArray(v.data) ? v.data : []);
    setCarregando(false);
  }), [toast]);
  useEffect(() => { buscar(); }, [buscar]);

  // O veículo é do apartamento, não da pessoa: quem saiu não leva os de
  // agora (os dele foram para o histórico na saída).
  const porApto = useMemo(() => {
    const mapa = {};
    for (const v of veiculos) (mapa[chaveApto(v.bloco, v.unidade)] ??= []).push(v);
    return mapa;
  }, [veiculos]);
  const veiculosDe = (m) => (m.status === "saiu" ? [] : porApto[chaveApto(m.bloco, m.unidade)] ?? []);

  const noApp = itens.filter((m) => m.status !== "saiu").length;
  const filtrados = useMemo(() => {
    const q = sem(busca.trim());
    return itens
      .filter((m) => filtro === "todos" || (filtro === "saiu") === (m.status === "saiu"))
      // O CPF vem mascarado (***.456.789-**): a busca acha pelos dígitos do meio.
      .filter((m) => !q || sem(`${m.nome} ${apto(m.bloco, m.unidade)} ${m.bloco}${m.unidade} ${m.vinculo} ${m.cpf ?? ""} ${
        String(m.cpf ?? "").replace(/\D/g, "")}`).includes(q));
  }, [itens, busca, filtro]);

  const saiu = () => {
    setSaindo(null);
    buscar();
  };
  const editado = () => {
    setEditando(null);
    buscar();
  };
  const podeEditarEste = (m) => podeEditar && m.status !== "saiu";

  return (
    <div className="app-aba">
      <Filtros
        busca={busca} onBusca={setBusca} placeholder="Buscar por nome, apto ou CPF"
        filtros={carregando ? null : [["todos", "Todos", itens.length], ["app", "No app", noApp], ["saiu", "Saíram", itens.length - noApp]]}
        filtro={filtro} onFiltro={setFiltro}
      />
      {!carregando && filtrados.length === 0 ? (
        <EmptyState
          icon={<Users size={20} />}
          title={busca || filtro !== "todos" ? "Ninguém com esse filtro" : "Ninguém no app ainda"}
          description="Quem tem o cadastro aprovado no app aparece aqui. Quando alguém deixa o apartamento, registre a saída para liberar a vaga."
        />
      ) : (
        <ListaQueAbre
          colunas={COLUNAS}
          larguraAcoes="96px"
          itens={filtrados}
          carregando={carregando}
          chave={(m) => m.id}
          onAbrir={setAberto}
          rotuloDaLinha={(m) => `${m.nome}, ${apto(m.bloco, m.unidade)}: ver cadastro`}
          celulas={(m) => [
            <span key="n" className="conf-duas">
              <strong>{m.nome}</strong>
              {m.dependente && <small>Dependente: {m.dependente}</small>}
            </span>,
            m.cpf ? <span key="c" className="conf-dado__mono">{m.cpf}</span> : <span key="c" className="conf-espera">Não informado</span>,
            apto(m.bloco, m.unidade),
            vinculoDe(m),
            m.status === "saiu"
              ? <Badge key="s" tone="muted">Saiu em {diaBR(m.saiu_em)}</Badge>
              : <span key="s" className="conf-duas"><Badge tone="positive">No app</Badge><small>desde {diaBR(m.aprovado_em)}</small></span>,
          ]}
          acoes={(m) => (
            <>
              <Button size="sm" variant="ghost" aria-label={`Ver o cadastro de ${m.nome}`} title="Ver"
                onClick={() => setAberto(m)} iconLeft={<Eye size={16} />} />
              {podeEditarEste(m) && (
                <Button size="sm" variant="ghost" aria-label={`Editar o cadastro de ${m.nome}`} title="Editar"
                  onClick={() => setEditando(m)} iconLeft={<Pencil size={16} />} />
              )}
            </>
          )}
        />
      )}

      {aberto && (
        <CadastroDoMorador
          key={aberto.id}
          morador={aberto}
          veiculos={veiculosDe(aberto)}
          onFechar={() => setAberto(null)}
          onEditar={podeEditarEste(aberto) ? () => { setEditando(aberto); setAberto(null); } : null}
          onRegistrarSaida={() => { setSaindo(aberto); setAberto(null); }}
        />
      )}
      {editando && <EditarCadastro key={editando.id} morador={editando} onCancelar={() => setEditando(null)} onSalvou={editado} />}
      {saindo && <SaidaDialog key={saindo.id} morador={saindo} onCancelar={() => setSaindo(null)} onSaiu={saiu} />}
    </div>
  );
}

/** O cadastro do app num modal: contato, datas, os veículos e a ação. */
function CadastroDoMorador({ morador: m, veiculos, onFechar, onEditar, onRegistrarSaida }) {
  const [det, setDet] = useState(null);
  const [erro, setErro] = useState("");
  const fora = m.status === "saiu";

  useEffect(() => {
    let vivo = true;
    supabase.rpc("detalhe_do_cadastro", { p_id: m.id }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) setErro(erroLegivel(error));
      else setDet(data);
    });
    return () => { vivo = false; };
  }, [m.id]);

  return (
    <Modal
      open
      onClose={onFechar}
      title="Cadastro no app"
      size="lg"
      footer={(!fora || onEditar) && (
        <div className="app-modal__acoes">
          {!fora
            ? <Button variant="danger" onClick={onRegistrarSaida} iconLeft={<LogOut size={16} />}>Registrar saída</Button>
            : <span />}
          {onEditar && <Button variant="primary" onClick={onEditar} iconLeft={<Pencil size={16} />}>Editar</Button>}
        </div>
      )}
    >
      <div className="app-modal">
        <div className="app-modal__topo">
          <Iniciais nome={m.nome} grande apagado={fora} />
          <div className="app-modal__quem">
            <strong>{m.nome}</strong>
            <small>{apto(m.bloco, m.unidade)} · {vinculoDe(m)}</small>
            <span className="app-modal__selos">
              {fora ? <Badge tone="muted">Saiu em {diaBR(m.saiu_em)}</Badge> : <Badge tone="positive">No app</Badge>}
            </span>
          </div>
        </div>

        {fora && (
          <p className="conf-alerta conf-alerta--neutro">
            <AlertTriangle size={16} aria-hidden="true" />
            Saída registrada em {diaBR(m.saiu_em)}{m.saida_registrada_por ? ` por ${m.saida_registrada_por}` : ""}. A pessoa não usa mais o app.
          </p>
        )}

        {erro && <p className="app-modal__aviso app-modal__aviso--erro">{erro}</p>}
        {!erro && !det && <p className="app-modal__aviso">Carregando o cadastro…</p>}

        {/* O desenho do detalhe de Encomendas: o contato à esquerda, grande;
            o cadastro, os veículos e quem mais usa o app à direita. */}
        {det && (
          <div className="app-detalhe">
            <div className="app-detalhe__visual">
              <p className="app-detalhe__legenda">Contato</p>
              <div className="app-cartao">
                <p className="app-cartao__rotulo">Telefone{det.aviso_whatsapp ? " · avisos por WhatsApp" : ""}</p>
                <p className="app-cartao__grande">{telefoneLegivel(det.telefone) || "—"}</p>
                <p className="app-cartao__sub">{det.email || "Sem e-mail"}</p>
              </div>
            </div>

            <div className="app-detalhe__dados">
              <Ficha titulo="Documento" itens={[
                ["CPF", det.cpf || "Não informado", true],
                ["Avisos por WhatsApp", det.aviso_whatsapp ? "Sim" : "Não"],
              ]} />
              <Ficha titulo="Cadastro no app" itens={[
                ["Pediu o cadastro", diaBR(det.pedido_em)],
                ["Confirmou o e-mail", det.email_confirmado_em ? diaBR(det.email_confirmado_em) : "Não confirmou"],
                ["Aprovado em", diaBR(m.aprovado_em)],
                ["Dependente", m.dependente || "Nenhum"],
              ]} />

              {!fora && (
                <section className="app-ficha">
                  <h3 className="app-ficha__titulo">Veículos do apartamento no app</h3>
                  {veiculos.length ? (
                    <ul className="app-pessoas">
                      {veiculos.map((v) => (
                        <li key={v.id}>
                          <span>
                            <span className="conf-dado__mono">{v.placa}</span> · {v.modelo}
                            <br /><small>{v.veiculo}{v.cor ? `, ${v.cor}` : ""}{v.tag_numero ? ` · TAG nº ${v.tag_numero}` : ""}</small>
                          </span>
                          {v.veiculo === "Carro" && (
                            <Badge tone={v.tag === "colada" ? "positive" : v.tag ? "brand" : "muted"}>{SITUACAO_TAG[v.tag] ?? "Sem TAG"}</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="app-modal__aviso">Nenhum veículo cadastrado pelo app.</p>}
                </section>
              )}

              {det.no_app?.length > 0 && (
                <section className="app-ficha">
                  <h3 className="app-ficha__titulo">Outros no app neste apartamento</h3>
                  <ul className="app-pessoas">
                    {det.no_app.map((o) => (
                      <li key={`${o.nome}-${o.tipo}`}>
                        <span>{o.nome}<br /><small>{o.vinculo}{o.tipo === "Dependente" ? " · dependente" : ""}</small></span>
                        <Badge tone={o.status === "aprovado" ? "positive" : "muted"}>{o.status === "aprovado" ? "No app" : "Em análise"}</Badge>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Corrigir o cadastro do app (0081): nome, telefone, WhatsApp e CPF. O CPF
 * de agora só aparece mascarado; o campo é para digitar outro, e vazio mantém
 * o que está. O e-mail não muda aqui: é o login, e tem troca própria (0059).
 */
function EditarCadastro({ morador: m, onCancelar, onSalvou }) {
  const toast = useToast();
  const [det, setDet] = useState(null);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState(m.primeiro_nome ?? "");
  const [sobrenome, setSobrenome] = useState(m.sobrenome ?? "");
  const [telefone, setTelefone] = useState("");
  const [whats, setWhats] = useState(false);
  const [cpf, setCpf] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase.rpc("detalhe_do_cadastro", { p_id: m.id }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) { setErro(erroLegivel(error)); return; }
      setDet(data);
      setTelefone(data.telefone ? maskPhone(data.telefone) : "");
      setWhats(Boolean(data.aviso_whatsapp));
    });
    return () => { vivo = false; };
  }, [m.id]);

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    const { error } = await supabase.rpc("editar_cadastro_do_morador", {
      p_id: m.id, p_nome: nome, p_sobrenome: sobrenome, p_telefone: telefone,
      p_aviso_whatsapp: whats && Boolean(telefone.replace(/\D/g, "")), p_cpf: cpf.replace(/\D/g, "") || null,
    });
    setSalvando(false);
    if (error) { toast.error(erroLegivel(error)); return; }
    toast.success("Cadastro salvo");
    onSalvou();
  };

  return (
    <Modal
      open
      onClose={onCancelar}
      title={`Editar o cadastro de ${m.nome}`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button variant="primary" type="submit" form="editar-cadastro-app" loading={salvando} disabled={!det}>Salvar</Button>
        </>
      }
    >
      {erro && <p className="app-modal__aviso app-modal__aviso--erro">{erro}</p>}
      {!erro && !det && <p className="app-modal__aviso">Carregando o cadastro…</p>}
      {det && (
        <form id="editar-cadastro-app" className="app-modal" onSubmit={salvar}>
          <p className="vit-modal__desc">{apto(m.bloco, m.unidade)} · {vinculoDe(m)} · e-mail {det.email}</p>
          <div className="app-ficha__dados">
            <Field label="Nome"><Input value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} /></Field>
            <Field label="Sobrenome"><Input value={sobrenome} maxLength={60} onChange={(e) => setSobrenome(e.target.value)} /></Field>
            <Field label="Telefone com DDD">
              <Input value={telefone} inputMode="tel" placeholder="(21) 98765-4321" onChange={(e) => setTelefone(maskPhone(e.target.value))} />
            </Field>
            <Field label="CPF" help={det.cpf ? `Agora: ${det.cpf}. Deixe em branco para manter.` : "Ainda não informado."}>
              <Input value={cpf} inputMode="numeric" placeholder="000.000.000-00" onChange={(e) => setCpf(maskCPF(e.target.value))} />
            </Field>
          </div>
          <Chave
            ligada={whats && Boolean(telefone.replace(/\D/g, ""))}
            onChange={setWhats}
            disabled={!telefone.replace(/\D/g, "")}
            icone={<MessageCircle size={18} />}
            titulo="Avisos por WhatsApp"
            sub={telefone.replace(/\D/g, "") ? "Os avisos do app também chegam no WhatsApp deste telefone." : "Informe o telefone para poder ligar."}
          />
          <p className="app-modal__aviso">
            O e-mail é o login do morador e não muda por aqui: a troca é feita pelo próprio app, com confirmação.
          </p>
        </form>
      )}
    </Modal>
  );
}

/**
 * Registrar saída, em linguagem de quem não conhece o sistema: o que acontece
 * sozinho e o que fica para a administração fazer. A prévia vem do banco
 * (`previa_da_saida`, 0073) antes de confirmar.
 */
function SaidaDialog({ morador, onCancelar, onSaiu }) {
  const toast = useToast();
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase.rpc("previa_da_saida", { p_id: morador.id }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) setErro(erroLegivel(error));
      else setPrevia(data);
    });
    return () => { vivo = false; };
  }, [morador.id]);

  const confirmar = async () => {
    setSalvando(true);
    const { error } = await supabase.rpc("registrar_saida_do_morador", { p_id: morador.id });
    setSalvando(false);
    if (error) { toast.error(erroLegivel(error)); return; }
    toast.success(`Saída de ${morador.nome} registrada`);
    onSaiu();
  };

  const primeiro = morador.nome.split(" ")[0];
  const p = previa;
  const abertos = p ? p.pedidos_veiculo.length + p.solicitacoes.length : 0;
  const sozinho = p ? [
    `${primeiro} não consegue mais entrar no app e recebe um e-mail avisando.`,
    p.dependente && `${p.dependente}, o dependente, sai junto.`,
    p.convite_pendente && "O convite de dependente que ainda não foi aceito é cancelado.",
    p.veiculos.length > 0 && `${p.veiculos.length === 1 ? "O veículo sai do apartamento e fica guardado" : "Os veículos saem do apartamento e ficam guardados"} no histórico: ${p.veiculos.map((v) => `${v.veiculo} ${v.placa} (${v.modelo})`).join(", ")}.`,
    abertos > 0 && (abertos === 1 ? "O pedido que estava aberto no app é cancelado." : `Os ${abertos} pedidos que estavam abertos no app são cancelados.`),
    morador.vinculo === "Locatário" && "O proprietário recebe um aviso no app.",
    `A vaga de ${morador.vinculo === "Locatário" ? "inquilino" : "proprietário"} do apartamento fica livre para o próximo cadastro.`,
  ].filter(Boolean) : [];
  const fazer = p ? [
    ...p.veiculos.filter((v) => v.tag).map((v) => `Desativar no portão a TAG ${v.tag_numero ? `nº ${v.tag_numero}` : `do carro ${v.placa}`}.`),
    ...p.reservas.map((r) => `Resolver a reserva de ${dataBR(r.data)} (${r.espacos.map((e) => ESPACO[e] ?? e).join(", ")}, ${reais(r.valor)}, ${RESERVA[r.status] ?? r.status}): devolver o valor ou passar para o novo morador.`),
    ...p.encomendas.map((e) => `Avisar sobre a encomenda ${e.etiqueta || "sem etiqueta"} que está na portaria${e.deposito ? " (no depósito)" : ""}.`),
  ] : [];

  return (
    <Modal
      open
      onClose={onCancelar}
      title={`${primeiro} deixou o apartamento?`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button variant="danger" onClick={confirmar} loading={salvando} disabled={!previa}>
            <LogOut size={16} aria-hidden="true" />Registrar saída
          </Button>
        </>
      }
    >
      <p className="vit-modal__desc">
        Use quando {morador.nome} não mora mais no {apto(morador.bloco, morador.unidade)}. O cadastro não é apagado: fica guardado como &quot;saiu&quot;.
      </p>
      {erro && <p className="conf-detalhe__aviso conf-detalhe__aviso--erro">{erro}</p>}
      {!erro && !p && <p className="conf-detalhe__aviso">Conferindo o que vai acontecer…</p>}
      {p && (
        <div className="saida">
          <section className="saida__secao">
            <h3>Acontece sozinho</h3>
            <ul className="saida__passos">
              {sozinho.map((t) => <li key={t}><CheckCircle2 size={16} aria-hidden="true" />{t}</li>)}
            </ul>
          </section>
          <section className="saida__secao">
            <h3>Fica com você</h3>
            {fazer.length ? (
              <ul className="saida__passos saida__passos--fazer">
                {fazer.map((t) => <li key={t}><AlertTriangle size={16} aria-hidden="true" />{t}</li>)}
              </ul>
            ) : <p className="conf-bloco__vazio">Nada. Depois de confirmar, não sobra pendência.</p>}
          </section>
        </div>
      )}
    </Modal>
  );
}
