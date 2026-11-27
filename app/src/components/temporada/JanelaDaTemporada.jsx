import React, { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Eye, Pencil, Plus, Search, Trash2, UserPlus, X, XCircle } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Modal, Textarea, useConfirm, useToast } from "../../ui";
import ListaQueAbre from "../confirmacoes/ListaQueAbre";
import BuscaUnidade from "../BuscaUnidade";
import { Chave, Ficha, Filtros, Placa } from "../app/pecas";
import { criar, editar, remover } from "../../api/db";
import { supabase } from "../../api/supabase";
import { can } from "../../auth/permissions";
import { dataBR, maskCPF, maskCPFPrivacy, maskPhone, nomeProprio } from "../../lib/format";
import { hojeEmBrasilia } from "../../lib/portaria";
import {
  GRUPOS, ROTULO_SITUACAO, TOM_SITUACAO, acompanhantesDa, comHora, descreverCarro, paraGravar, pessoasDa, problemasDaTemporada,
  situacaoNaTela, soCpf, soPlaca, veiculosDa,
} from "../../lib/temporada";

/** Quantas linhas a lista mostra de cada vez; "Mostrar mais" soma outras tantas. */
const LOTE = 30;

const FORM_VAZIO = {
  id: null, id_unidade: "", entrada: "", saida: "", horaEntrada: "", horaSaida: "", hospede: "", cpf: "", telefone: "", acompanhantes: [],
  comCarro: true, veiculos: [{ placa: "", modelo: "", cor: "" }], observacao: "", proprietario: "",
};

const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied|42501|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para mexer nas liberações de temporada.";
  }
  if (/column .* does not exist|could not find the .* column/i.test(msg)) {
    return "Falta aplicar no banco as migrações da temporada (0092, 0093 e 0094).";
  }
  if (/relation .*temporadas.* does not exist|temporadas/i.test(msg) && /exist/i.test(msg)) {
    return "A tabela de temporada ainda não existe no banco: falta aplicar a migração 0091.";
  }
  return msg;
};

/** "05/11 a 10/11". */
const periodo = (t) => `${dataBR(t.entrada)?.slice(0, 5) || "—"} a ${dataBR(t.saida)?.slice(0, 5) || "—"}`;

/**
 * O botão "Temporada" de Entradas e Saídas: as liberações que a administração
 * fez, em lista (modelo B, escolhido em 05/11/2026), com o ver no desenho de
 * Encomendas e o cadastro da administração.
 */
export default function JanelaDaTemporada({ aberta, onFechar, temporadas, unidades, user, carregando, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const podeLiberar = can(user, "liberarTemporada");
  const podeExcluir = can(user, "excluirTemporada");
  const hoje = hojeEmBrasilia();

  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState("todas");
  const [limite, setLimite] = useState(LOTE);
  const [vendo, setVendo] = useState(null);
  const [form, setForm] = useState(null);
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);
  // Quem está aprovado no app do morador: é de lá que sai o proprietário da
  // unidade. Só a administração lê (moradores_no_app); falhou, o campo aparece
  // para escrever o nome.
  const [noApp, setNoApp] = useState([]);
  // Falhou a leitura do app: a tela diz, em vez de mostrar o campo como se a
  // unidade não tivesse dono — o que fazia parecer que o app não se liga às unidades.
  const [erroDoApp, setErroDoApp] = useState("");
  const formAberto = Boolean(form);
  useEffect(() => {
    if (!formAberto || !podeLiberar) return undefined;
    let vivo = true;
    Promise.resolve()
      .then(() => supabase.rpc("moradores_no_app"))
      .then((r) => {
        if (!vivo) return;
        if (r?.error) { setErroDoApp(r.error.message || "erro desconhecido"); setNoApp([]); return; }
        setErroDoApp("");
        setNoApp(Array.isArray(r?.data) ? r.data : []);
      })
      .catch((err) => { if (vivo) { setErroDoApp(err?.message || "sem conexão"); setNoApp([]); } });
    return () => { vivo = false; };
  }, [formAberto, podeLiberar]);

  const unidadePorId = useMemo(() => new Map((unidades ?? []).map((u) => [String(u.id), u])), [unidades]);
  const rotuloUnidade = (id) => {
    const u = unidadePorId.get(String(id));
    return u ? `B${u.bloco}-${u.unidade}` : String(id ?? "—");
  };

  const comSituacao = useMemo(
    () => (temporadas ?? []).map((t) => ({ ...t, _s: situacaoNaTela(t, hoje) })),
    [temporadas, hoje]
  );

  const contagem = useMemo(() => {
    const c = {};
    Object.entries(GRUPOS).forEach(([g, casa]) => { c[g] = comSituacao.filter((t) => casa(t._s)).length; });
    return c;
  }, [comSituacao]);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const placa = soPlaca(busca);
    const ordem = { sai_hoje: 0, chega_hoje: 1, liberada: 2, hospedado: 3, proxima: 4, encerrada: 5, cancelada: 6 };
    return comSituacao
      .filter((t) => GRUPOS[grupo](t._s))
      .filter((t) => !termo
        || String(t.hospede ?? "").toLowerCase().includes(termo)
        || rotuloUnidade(t.id_unidade).toLowerCase().includes(termo)
        || (soCpf(busca).length >= 4 && [t.cpf, ...acompanhantesDa(t).map((a) => a.cpf)].some((c) => soCpf(c).includes(soCpf(busca))))
        || acompanhantesDa(t).some((a) => String(a.nome).toLowerCase().includes(termo))
        || (placa.length >= 3 && veiculosDa(t).some((v) => soPlaca(v.placa).includes(placa))))
      .sort((a, b) => (ordem[a._s] - ordem[b._s]) || String(a.entrada).localeCompare(String(b.entrada)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comSituacao, grupo, busca, unidadePorId]);

  /* ---------------- cadastro ---------------- */

  /** O(s) proprietário(s) aprovado(s) no app para a unidade escolhida; "" quando ninguém. */
  const donoNoApp = useMemo(() => {
    const u = form ? unidadePorId.get(String(form.id_unidade)) : null;
    if (!u) return "";
    return noApp
      .filter((m) => m.status === "aprovado" && /propriet/i.test(String(m.vinculo ?? ""))
        && String(m.bloco) === String(u.bloco) && String(m.unidade) === String(u.unidade))
      .map((m) => nomeProprio(m.nome))
      .join(" e ");
  }, [form, noApp, unidadePorId]);

  /** Quem a unidade tem no app mas não serve de proprietário (locatário, ou já saiu): a ajuda do campo diz. */
  const donosFora = useMemo(() => {
    const u = form ? unidadePorId.get(String(form.id_unidade)) : null;
    if (!u || donoNoApp) return "";
    return noApp
      .filter((m) => String(m.bloco) === String(u.bloco) && String(m.unidade) === String(u.unidade))
      .map((m) => `${nomeProprio(m.nome)} (${m.status === "saiu" ? "já saiu" : String(m.vinculo ?? "").toLowerCase()})`)
      .join(", ");
  }, [form, noApp, unidadePorId, donoNoApp]);

  const abrirNova = () => { setErros({}); setForm({ ...FORM_VAZIO, entrada: hoje }); };
  const abrirEdicao = (t) => {
    const v = veiculosDa(t);
    setErros({});
    setForm({
      id: t.id, id_unidade: t.id_unidade, entrada: String(t.entrada ?? "").slice(0, 10), saida: String(t.saida ?? "").slice(0, 10),
      horaEntrada: String(t.hora_entrada ?? "").slice(0, 5), horaSaida: String(t.hora_saida ?? "").slice(0, 5),
      hospede: t.hospede ?? "", cpf: t.cpf ? maskCPF(String(t.cpf)) : "", telefone: t.telefone ? maskPhone(String(t.telefone)) : "",
      acompanhantes: acompanhantesDa(t).map((a) => ({ nome: a.nome, cpf: a.cpf ? maskCPF(String(a.cpf)) : "" })),
      // Um veículo por temporada (13/11/2026): de liberação antiga com mais, fica o primeiro.
      comCarro: v.length > 0, veiculos: v.length ? v.slice(0, 1).map((x) => ({ placa: x.placa, modelo: x.modelo ?? "", cor: x.cor ?? "" })) : FORM_VAZIO.veiculos,
      observacao: t.observacao ?? "", proprietario: t.proprietario ?? "",
    });
  };
  const mudar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const mudarAcompanhante = (i, campo, valor) =>
    setForm((f) => ({ ...f, acompanhantes: f.acompanhantes.map((a, j) => (j === i ? { ...a, [campo]: valor } : a)) }));
  const mudarVeiculo = (i, campo, valor) =>
    setForm((f) => ({ ...f, veiculos: f.veiculos.map((v, j) => (j === i ? { ...v, [campo]: valor } : v)) }));

  const salvar = async () => {
    // Com proprietário no app, é ele; sem, vale o nome que quem cadastra escreveu.
    const completo = { ...form, proprietario: donoNoApp || form.proprietario };
    const e = problemasDaTemporada(completo);
    setErros(e);
    if (Object.keys(e).length) return;
    setSalvando(true);
    try {
      const dados = paraGravar(completo);
      const r = form.id
        ? await editar("TEMPORADAS", form.id, dados)
        : await criar("TEMPORADAS", { ...dados, created_by: user?.nome || "Administração" });
      if (!r?.success) { toast.error(mensagemErro(r?.message)); return; }
      toast.success(form.id ? "Liberação atualizada" : `Temporada liberada para ${rotuloUnidade(dados.id_unidade)}`);
      setForm(null);
      await onMudou?.();
    } catch (err) {
      toast.error(mensagemErro(err?.message));
    } finally {
      setSalvando(false);
    }
  };

  const cancelar = async (t) => {
    const ok = await confirmar({
      title: `Cancelar a temporada de ${nomeProprio(t.hospede)}?`,
      description: "A portaria deixa de ver esta liberação como válida. Ela continua no histórico.",
      confirmLabel: "Cancelar liberação",
      danger: true,
    });
    if (!ok) return;
    const r = await editar("TEMPORADAS", t.id, { situacao: "cancelada" });
    if (!r?.success) { toast.error(mensagemErro(r?.message)); return; }
    setVendo(null);
    toast.success("Liberação cancelada");
    await onMudou?.();
  };

  const excluir = async (t) => {
    const ok = await confirmar({
      title: `Excluir a temporada de ${nomeProprio(t.hospede)}?`,
      description: "Some da lista para todos. Não dá para desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    const r = await remover("TEMPORADAS", t.id);
    if (!r?.success) { toast.error(mensagemErro(r?.message)); return; }
    setVendo(null);
    toast.success("Liberação excluída");
    await onMudou?.();
  };

  const t = vendo;
  const sV = t ? situacaoNaTela(t, hoje) : null;
  const editavel = (x) => podeLiberar && !["encerrada", "cancelada"].includes(situacaoNaTela(x, hoje));

  return (
    <>
      <Modal
        open={aberta}
        onClose={onFechar}
        title="Temporada"
        size="lg"
        className="tem-janela"
      >
        <div className="tem-topo">
          <p className="tem-topo__meta">
            {carregando ? "Carregando liberações…"
              : `${contagem.todas} liberações · ${contagem.chega_hoje} chegam hoje · ${contagem.hospedados} hospedados · ${contagem.proximas} próximas`}
          </p>
          {podeLiberar && (
            <Button variant="primary" iconLeft={<Plus size={16} />} onClick={abrirNova}>Nova liberação</Button>
          )}
        </div>

        <Filtros
          busca={busca}
          onBusca={(x) => { setBusca(x); setLimite(LOTE); }}
          placeholder="Placa, nome, CPF ou unidade"
          filtro={grupo}
          onFiltro={(x) => { setGrupo(x); setLimite(LOTE); }}
          filtros={[
            ["todas", "Todas", contagem.todas],
            ["chega_hoje", "Chegam hoje", contagem.chega_hoje],
            ["hospedados", "Hospedados", contagem.hospedados],
            ["proximas", "Próximas", contagem.proximas],
            ["antigas", "Encerradas", contagem.antigas],
          ]}
        />

        {!carregando && linhas.length === 0 ? (
          <EmptyState
            icon={busca ? <Search size={20} /> : <CalendarCheck size={20} />}
            title={busca || grupo !== "todas" ? "Nenhuma liberação neste filtro" : "Nenhuma temporada liberada"}
            description={podeLiberar
              ? "Quando o proprietário avisar de um hóspede, registre aqui a unidade, o período e o carro."
              : "Quando a administração liberar um hóspede de temporada, ele aparece aqui com a placa do carro."}
            action={podeLiberar && !busca && <Button variant="primary" iconLeft={<Plus size={16} />} onClick={abrirNova}>Nova liberação</Button>}
          />
        ) : (
          <ListaQueAbre
            colunas={[
              { rotulo: "Placa", largura: "130px" },
              { rotulo: "Veículo e hóspede", largura: "minmax(0, 1.6fr)" },
              { rotulo: "Unidade", largura: "96px" },
              { rotulo: "Período", largura: "130px" },
              { rotulo: "Situação", largura: "120px" },
            ]}
            larguraAcoes="96px"
            itens={linhas.slice(0, limite)}
            carregando={carregando}
            chave={(x) => x.id}
            onAbrir={setVendo}
            rotuloDaLinha={(x) => `Abrir a temporada de ${nomeProprio(x.hospede)} (${rotuloUnidade(x.id_unidade)})`}
            celulas={(x) => {
              const v = veiculosDa(x);
              return [
                v.length ? <Placa key="p" placa={v[0].placa} pequena /> : <span key="p" className="tem-sem-carro">Sem carro</span>,
                <span key="v" className="mud-quem">
                  <b>{v.length ? descreverCarro(v[0]) + (v.length > 1 ? ` +${v.length - 1}` : "") : "A pé ou de aplicativo"}</b>
                  <small>{nomeProprio(x.hospede)}{acompanhantesDa(x).length ? ` +${acompanhantesDa(x).length} ${acompanhantesDa(x).length === 1 ? "acompanhante" : "acompanhantes"}` : ""}</small>
                </span>,
                <b key="u" className="conf-dado__mono">{rotuloUnidade(x.id_unidade)}</b>,
                <span key="d">{periodo(x)}</span>,
                <Badge key="s" tone={TOM_SITUACAO[x._s]}>{ROTULO_SITUACAO[x._s]}</Badge>,
              ];
            }}
            acoes={(x) => (
              <>
                <Button size="sm" variant="ghost" aria-label={`Ver a temporada de ${nomeProprio(x.hospede)}`}
                        onClick={() => setVendo(x)}><Eye size={16} /></Button>
                {editavel(x) && (
                  <Button size="sm" variant="ghost" aria-label={`Editar a temporada de ${nomeProprio(x.hospede)}`}
                          onClick={() => abrirEdicao(x)}><Pencil size={16} /></Button>
                )}
              </>
            )}
          />
        )}
        {linhas.length > limite && (
          <div className="mud-mais">
            <Button variant="ghost" onClick={() => setLimite((n) => n + LOTE)}>
              Mostrar mais ({linhas.length - limite} restantes)
            </Button>
          </div>
        )}
      </Modal>

      {/* ---- Ver: o desenho do detalhe de Encomendas ---- */}
      <Modal
        open={Boolean(t)}
        onClose={() => setVendo(null)}
        title="Detalhes da temporada"
        size="lg"
        footer={t && (podeLiberar || podeExcluir) && (
          <div className="app-modal__acoes">
            {podeExcluir
              ? <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => excluir(t)}>Excluir</Button>
              : <span />}
            {editavel(t) && (
              <Button variant="ghost" iconLeft={<XCircle size={15} />} onClick={() => cancelar(t)}>Cancelar liberação</Button>
            )}
            {editavel(t) && (
              <Button variant="primary" iconLeft={<Pencil size={15} />} onClick={() => { setVendo(null); abrirEdicao(t); }}>Editar</Button>
            )}
          </div>
        )}
      >
        {t && (
          <div className="app-modal">
            <div className="app-modal__topo">
              <span className="app-veiculo__ic" aria-hidden="true"><CalendarCheck size={22} /></span>
              <div className="app-modal__quem">
                <strong>{nomeProprio(t.hospede)}</strong>
                <small>{rotuloUnidade(t.id_unidade)} · {periodo(t)}</small>
                <span className="app-modal__selos"><Badge tone={TOM_SITUACAO[sV]}>{ROTULO_SITUACAO[sV]}</Badge></span>
              </div>
            </div>
            <div className="app-detalhe">
              <div className="app-detalhe__visual">
                <p className="app-detalhe__legenda">{veiculosDa(t).length > 1 ? "Veículos liberados" : "Veículo liberado"}</p>
                {veiculosDa(t).length ? veiculosDa(t).map((v) => (
                  <div key={v.placa} className="app-veiculo">
                    <div className="app-modal__quem">
                      <strong>{v.modelo || "Carro"}</strong>
                      <small>{v.cor || "Cor não informada"}</small>
                    </div>
                    <Placa placa={v.placa} />
                  </div>
                )) : <p className="app-modal__aviso">Vem sem carro: a pé ou de aplicativo.</p>}
              </div>
              <div className="app-detalhe__dados">
                <Ficha titulo="Hospedagem" itens={[
                  ["Unidade", rotuloUnidade(t.id_unidade), true],
                  ["Proprietário", t.proprietario ? nomeProprio(t.proprietario) : "Não informado"],
                  ["Entrada", t.entrada ? comHora(dataBR(t.entrada), t.hora_entrada) : "—"],
                  ["Saída", t.saida ? comHora(dataBR(t.saida), t.hora_saida) : "—"],
                  ["Pessoas", String(pessoasDa(t))],
                  t.chegou_em ? ["Chegou em", dataBR(t.chegou_em)] : null,
                ]} />
                <Ficha titulo="Hóspede responsável" itens={[
                  ["Nome", nomeProprio(t.hospede)],
                  ["CPF", t.cpf ? maskCPFPrivacy(String(t.cpf)) : "Não informado", true],
                  ["Telefone", t.telefone ? maskPhone(String(t.telefone)) : "Não informado"],
                  ["Liberado por", t.created_by || "Administração"],
                ]} />
                {acompanhantesDa(t).length > 0 && (
                  <Ficha titulo="Acompanhantes" itens={acompanhantesDa(t).map((a, i) => [
                    `${i + 1}. ${nomeProprio(a.nome)}`, a.cpf ? maskCPFPrivacy(String(a.cpf)) : "Sem CPF", Boolean(a.cpf),
                  ])} />
                )}
                {t.observacao?.trim() && (
                  <section className="app-ficha">
                    <h3 className="app-ficha__titulo">Observação para a portaria</h3>
                    <p className="mud-obs">{t.observacao}</p>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Nova e editar liberação: só a administração ---- */}
      <Modal
        open={Boolean(form)}
        onClose={() => { if (!salvando) setForm(null); }}
        title={form?.id ? "Editar liberação de temporada" : "Nova liberação de temporada"}
        size="md"
        footer={form && (
          <div className="app-modal__acoes">
            <span />
            <Button variant="ghost" onClick={() => setForm(null)} disabled={salvando}>Cancelar</Button>
            <Button variant="primary" type="submit" form="form-temporada" loading={salvando}>
              {form.id ? "Salvar" : "Liberar temporada"}
            </Button>
          </div>
        )}
      >
        {form && (
          <form id="form-temporada" className="mud-form" noValidate onSubmit={(e) => { e.preventDefault(); salvar(); }}>
            <Field label="Unidade" required error={erros.id_unidade}>
              <BuscaUnidade
                unidades={unidades}
                valor={unidadePorId.get(String(form.id_unidade)) ?? null}
                onEscolher={(u) => mudar("id_unidade", u?.id ?? "")}
              />
            </Field>
            {/* O proprietário vem do app; sem ninguém no app, quem cadastra
                escreve. É o nome que a portaria põe em "Liberado por". */}
            {form.id_unidade && (donoNoApp ? (
              <p className="tem-dono">
                Proprietário no app: <b>{donoNoApp}</b>. É ele quem aparece como “liberado por” na portaria.
              </p>
            ) : (
              <Field label="Nome do proprietário" required error={erros.proprietario}
                     help={erroDoApp
                       ? `Não consegui ler o app do morador (${erroDoApp}). Escreva quem autorizou o hóspede.`
                       : donosFora
                         ? `No app, esta unidade tem ${donosFora}. Escreva o proprietário que autorizou o hóspede.`
                         : "Esta unidade não tem proprietário aprovado no app. Escreva quem autorizou o hóspede."}>
                <Input value={form.proprietario} placeholder="Nome e sobrenome do dono do apartamento"
                       onChange={(e) => mudar("proprietario", e.target.value)}
                       onBlur={(e) => mudar("proprietario", nomeProprio(e.target.value))} />
              </Field>
            ))}
            <div className="mud-form__par">
              <Field label="Entrada" required error={erros.entrada}>
                <Input type="date" value={form.entrada} onChange={(e) => mudar("entrada", e.target.value)} />
              </Field>
              <Field label="Saída" required error={erros.saida}>
                <Input type="date" value={form.saida} min={form.entrada || undefined} onChange={(e) => mudar("saida", e.target.value)} />
              </Field>
            </div>
            {/* A hora prevista (0111): o pedido do app já vem com ela. */}
            <div className="mud-form__par">
              <Field label="Hora de entrada" help="Opcional">
                <Input type="time" value={form.horaEntrada} onChange={(e) => mudar("horaEntrada", e.target.value)} />
              </Field>
              <Field label="Hora de saída" help="Opcional">
                <Input type="time" value={form.horaSaida} onChange={(e) => mudar("horaSaida", e.target.value)} />
              </Field>
            </div>

            <Field label="Hóspede responsável" required error={erros.hospede}>
              <Input value={form.hospede} placeholder="Nome e sobrenome"
                     onChange={(e) => mudar("hospede", e.target.value)}
                     onBlur={(e) => mudar("hospede", nomeProprio(e.target.value))} />
            </Field>
            <div className="mud-form__par">
              <Field label="CPF do hóspede" required error={erros.cpf} help="A portaria acha a liberação pelo CPF.">
                <Input value={form.cpf} inputMode="numeric" placeholder="000.000.000-00"
                       onChange={(e) => mudar("cpf", maskCPF(e.target.value))} />
              </Field>
              <Field label="Telefone">
                <Input value={form.telefone} inputMode="tel" placeholder="(00) 00000-0000"
                       onChange={(e) => mudar("telefone", maskPhone(e.target.value))} />
              </Field>
            </div>
            {/* Quem vem junto: nome de cada um e, se tiver, o CPF. O porteiro acha
                a liberação pelo CPF de qualquer um deles. */}
            <Field label="Acompanhantes" error={erros.acompanhantes}
                   help={form.acompanhantes.length ? `${1 + form.acompanhantes.length} pessoas no total, com o responsável.` : "Quem vem junto com o responsável. O CPF é opcional."}>
              <div className="tem-veiculos">
                {form.acompanhantes.map((a, i) => (
                  <div key={i} className="tem-acompanhante">
                    <Input aria-label={`Nome do acompanhante ${i + 1}`} value={a.nome} placeholder="Nome e sobrenome"
                           onChange={(e) => mudarAcompanhante(i, "nome", e.target.value)}
                           onBlur={(e) => mudarAcompanhante(i, "nome", nomeProprio(e.target.value))} />
                    <Input aria-label={`CPF do acompanhante ${i + 1}`} value={a.cpf} inputMode="numeric" placeholder="CPF (opcional)"
                           onChange={(e) => mudarAcompanhante(i, "cpf", maskCPF(e.target.value))} />
                    <Button variant="ghost" size="sm" aria-label={`Tirar o acompanhante ${i + 1}`}
                            onClick={() => setForm((f) => ({ ...f, acompanhantes: f.acompanhantes.filter((_, j) => j !== i) }))}>
                      <X size={16} />
                    </Button>
                  </div>
                ))}
                {form.acompanhantes.length < 20 && (
                  <Button variant="ghost" size="sm" iconLeft={<UserPlus size={14} />} className="tem-veiculos__mais"
                          onClick={() => setForm((f) => ({ ...f, acompanhantes: [...f.acompanhantes, { nome: "", cpf: "" }] }))}>
                    Adicionar acompanhante
                  </Button>
                )}
              </div>
            </Field>

            <Chave
              ligada={form.comCarro}
              onChange={(v) => mudar("comCarro", v)}
              titulo="Vem de veículo"
              sub="Carro ou moto. Desligue se o hóspede chega a pé ou de aplicativo"
            />
            {/* Um veículo só por temporada (13/11/2026). */}
            {form.comCarro && (
              <Field label="Veículo" error={erros.veiculos} help="Só 1 veículo, carro ou moto. A placa é o que a portaria confere no portão.">
                <div className="tem-veiculos">
                  {form.veiculos.slice(0, 1).map((v, i) => (
                    <div key={i} className="tem-veiculo">
                      <Input aria-label="Placa do veículo" value={v.placa} placeholder="ABC1D23" className="tem-veiculo__placa"
                             onChange={(e) => mudarVeiculo(i, "placa", soPlaca(e.target.value))} />
                      <Input aria-label="Modelo do veículo" value={v.modelo} placeholder="Modelo (opcional)"
                             onChange={(e) => mudarVeiculo(i, "modelo", e.target.value)} />
                      <Input aria-label="Cor do veículo" value={v.cor} placeholder="Cor (opcional)"
                             onChange={(e) => mudarVeiculo(i, "cor", e.target.value)} />
                    </div>
                  ))}
                </div>
              </Field>
            )}

            <Field label="Observação para a portaria" help="Ex.: chega de madrugada, chave no cofre.">
              <Textarea rows={2} value={form.observacao} maxLength={1000} onChange={(e) => mudar("observacao", e.target.value)} />
            </Field>
          </form>
        )}
      </Modal>
    </>
  );
}
