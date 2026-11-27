import React, { useState, useEffect, useMemo } from "react";
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { listar, criar, editar, remover } from "../api/db";
import {
  useToast, useConfirm, Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea,
} from "../ui";
import BuscaUnidade from "../components/BuscaUnidade";
import { Ficha, Iniciais, Opcoes } from "../components/app/pecas";
import { dataBR, maskPhone, nomeProprio } from "../lib/format";

// `agendamentos` é administrativo: pelas políticas do 0015, porteiro e
// conselheiro não leem nem escrevem. A mensagem do Postgres fala de
// row-level security, que não diz nada a quem está na tela.
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para alterar agendamentos.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Sem conexão com o servidor. Tente de novo.";
  }
  return msg;
};

const HORARIOS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
const DURACOES = ["30min", "1h", "1h30", "2h"];
const STATUS_OPTIONS = ["Agendado", "Confirmado", "Realizado", "Cancelado"];
const TIPOS = ["Morador", "Prestador de Serviço", "Administradora", "Funcionário"];

/** O tom de cada situação: o mesmo do selo e da borda do cartão na agenda. */
const TOM_SITUACAO = { Agendado: "neutral", Confirmado: "brand", Realizado: "positive", Cancelado: "danger" };
const tomDe = (status) => TOM_SITUACAO[status] ?? "neutral";

function horaParaMinutos(hora) {
  if (!hora) return 0;
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}

function duracaoParaMinutos(dur) {
  if (!dur) return 60;
  if (dur === "30min") return 30;
  if (dur === "1h")    return 60;
  if (dur === "1h30")  return 90;
  if (dur === "2h")    return 120;
  return 60;
}

function calcHoraFim(inicio, duracao) {
  const total = horaParaMinutos(inicio) + duracaoParaMinutos(duracao);
  const h = Math.floor(total / 60).toString().padStart(2, "0");
  const m = (total % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDataExtenso(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long"
  });
}

// O Google Sheets pode converter "2026-06-15" em Date e o backend devolver
// "15/06/2026 00:00". Esta função sempre retorna "YYYY-MM-DD".
function normalizarData(valor) {
  if (!valor) return "";
  const datePart = valor.toString().trim().split(" ")[0].split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  if (datePart.includes("/")) {
    const [d, m, y] = datePart.split("/");
    if (d && m && y) return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return datePart;
}

// "10:00" pode virar "30/12/1899 10:00" no Sheets. Extrai sempre "HH:MM".
function normalizarHora(valor) {
  if (!valor) return "";
  const match = valor.toString().match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  return valor.toString().trim();
}

// Máscara de telefone enquanto digita: (dd) nnnnn-nnnn.
function maskTelefone(v) {
  let d = (v || "").toString().replace(/\D/g, "");
  if (d.length > 11) d = d.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const FORM_INICIAL = {
  tipo: "Morador",
  id_unidade: "",
  id_morador: "",
  nome: "",
  telefone: "",
  data: "",
  hora_inicio: "",
  duracao: "1h",
  assunto: "",
  obs: "",
  status: "Agendado",
};

export default function Agendamento({ user }) {
  const toast = useToast();
  const confirmar = useConfirm();

  const [agendamentos, setAgendamentos] = useState([]);
  const [unidades, setUnidades]         = useState([]);
  const [moradores, setMoradores]       = useState([]);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingGlobal,  setLoadingGlobal]  = useState(false);

  const hoje = formatDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(hoje);
  const [viewMonth, setViewMonth]       = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [showModal,    setShowModal]    = useState(false);
  const [modalType,    setModalType]    = useState("add");
  const [formData,     setFormData]     = useState(FORM_INICIAL);
  const [conflitError, setConflitError] = useState("");
  // O agendamento aberto no VER (só leitura); Editar passa para o formulário.
  const [vendo, setVendo] = useState(null);



  const fetchData = async () => {
    try {
      setLoadingInitial(true);
      const [resAg, resUn, resMo] = await Promise.all([
        listar("AGENDAMENTOS"),
        listar("UNIDADES"),
        listar("MORADORES"),
      ]);

      const lista = (Array.isArray(resAg) ? resAg : []).map(item => ({
        ...item,
        id:          item.id          || item.ID          || "",
        tipo:        item.tipo        || item.TIPO        || "Morador",
        id_unidade:  item.id_unidade  || item.ID_UNIDADE  || "",
        nome:        item.nome        || item.NOME        || "",
        telefone:    item.telefone    || item.TELEFONE    || "",
        data:        normalizarData(item.data || item.DATA),
        hora_inicio: normalizarHora(item.hora_inicio || item.HORA_INICIO),
        duracao:     item.duracao     || item.DURACAO     || "1h",
        assunto:     item.assunto     || item.ASSUNTO     || "",
        obs:         item.obs         || item.OBS         || "",
        status:      item.status      || item.STATUS      || "Agendado",
        created_by:  item.created_by  || "",
      }));

      setAgendamentos(lista);
      setUnidades(Array.isArray(resUn) ? resUn : []);
      setMoradores(Array.isArray(resMo) ? resMo : []);

      autoAtualizarRealizados(lista);
    } catch (err) {
      console.error("Erro fetchData Agendamento:", err);
    } finally {
      setLoadingInitial(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

  const autoAtualizarRealizados = async (lista) => {
    const agora = new Date();
    const paraAtualizar = lista.filter(ag => {
      if (ag.status !== "Confirmado") return false;
      const [y, m, d] = ag.data.split("-").map(Number);
      const fimStr = calcHoraFim(ag.hora_inicio, ag.duracao);
      const [fh, fm] = fimStr.split(":").map(Number);
      const horaFim = new Date(y, m - 1, d, fh, fm);
      return agora > horaFim;
    });

    // Só o status. Reenviar `{ ...ag }` inteiro devolveria ao banco os campos
    // como a tela os tem — inclusive `created_at` e os normalizados na
    // leitura — e sobrescreveria dado que ninguém pediu para mudar.
    //
    // Silencioso de propósito: roda sozinho ao abrir a tela, e um cargo sem
    // permissão de escrita veria um toast de erro que não pediu. O status
    // simplesmente continua "Confirmado" até alguém com permissão abrir.
    await Promise.all(
      paraAtualizar.map(ag => editar("AGENDAMENTOS", ag.id, { status: "Realizado" }))
    );

    if (paraAtualizar.length > 0) {
      await fetchData();
    }
  };

  const agendamentosDoDia = useMemo(
    () => agendamentos.filter(ag => ag.data === selectedDate),
    [agendamentos, selectedDate]
  );

  const diasComAgendamento = useMemo(() => {
    const set = new Set();
    agendamentos
      .filter(ag => ag.status !== "Cancelado")
      .forEach(ag => set.add(ag.data));
    return set;
  }, [agendamentos]);

  const proximosAgendamentos = useMemo(() => {
    const agora = new Date();
    return agendamentos
      .filter(ag => {
        if (ag.status === "Cancelado" || ag.status === "Realizado") return false;
        const [y, m, d] = ag.data.split("-").map(Number);
        const [h, min] = (ag.hora_inicio || "00:00").split(":").map(Number);
        return new Date(y, m - 1, d, h, min) >= agora;
      })
      .sort((a, b) => {
        const da = a.data + a.hora_inicio;
        const db = b.data + b.hora_inicio;
        return da.localeCompare(db);
      })
      .slice(0, 3);
  }, [agendamentos]);

  const verificarConflito = (data, hora_inicio, duracao, excludeId = null) => {
    const inicioMin = horaParaMinutos(hora_inicio);
    const fimMin    = inicioMin + duracaoParaMinutos(duracao);

    return agendamentos.some(ag => {
      if (ag.status === "Cancelado") return false;
      if (ag.data !== data) return false;
      if (excludeId && ag.id.toString() === excludeId.toString()) return false;

      const agInicio = horaParaMinutos(ag.hora_inicio);
      const agFim    = agInicio + duracaoParaMinutos(ag.duracao);

      return inicioMin < agFim && fimMin > agInicio;
    });
  };



  const moradoresDaUnidade = useMemo(() =>
    moradores.filter(m => m.id_unidade?.toString() === formData.id_unidade?.toString()),
  [moradores, formData.id_unidade]);

  const handleUnidadeSelect = (unidadeId) => {
    const moradoresDaUnidadeFiltrados = moradores.filter(
      m => m.id_unidade?.toString() === unidadeId?.toString()
    );
    if (moradoresDaUnidadeFiltrados.length === 1) {
      const m = moradoresDaUnidadeFiltrados[0];
      setFormData(prev => ({
        ...prev,
        id_unidade: unidadeId,
        id_morador: m.id,
        nome: m.nome || "",
        telefone: maskTelefone(m.telefone || m.celular || ""),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        id_unidade: unidadeId,
        id_morador: "",
        nome: "",
        telefone: "",
      }));
    }
  };

  const handleMoradorSelect = (id) => {
    if (!id) {
      setFormData(prev => ({ ...prev, id_morador: "", nome: "", telefone: "" }));
      return;
    }
    const m = moradores.find(m => m.id?.toString() === id.toString());
    if (m) {
      setFormData(prev => ({
        ...prev,
        id_morador: id,
        nome: m.nome || "",
        telefone: maskTelefone(m.telefone || m.celular || ""),
      }));
    }
  };

  const abrirModalNovo = (hora = "") => {
    setModalType("add");
    setFormData({ ...FORM_INICIAL, data: selectedDate, hora_inicio: hora });
    setConflitError("");
    setShowModal(true);
  };

  const abrirModalEditar = (ag) => {
    setModalType("edit");
    setFormData({ ...ag });
    setConflitError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.nome || !formData.hora_inicio || !formData.data) {
      toast.error("Preencha o nome, a data e a hora de início.");
      return;
    }
    if (formData.tipo === "Morador" && !formData.id_unidade) {
      toast.error("Selecione a unidade.");
      return;
    }

    const conflito = verificarConflito(
      formData.data,
      formData.hora_inicio,
      formData.duracao,
      modalType === "edit" ? formData.id : null
    );

    if (conflito) {
      setConflitError("Conflito: já existe um agendamento neste horário.");
      return;
    }

    setLoadingGlobal(true);
    // `id_morador` saiu: a coluna não existe em `agendamentos`. O Apps Script
    // descartava campo desconhecido em silêncio; o Postgres recusa a gravação
    // inteira com "column does not exist".
    //
    // `created_at` também não vai: o DEFAULT now() da coluna resolve, e mandar
    // do cliente deixaria a data à mercê do relógio de quem agenda.
    const dados = {
      tipo:        formData.tipo,
      // A coluna é bigint com FK para unidades.id — "" quebraria. Agendamento
      // que não é de morador simplesmente não tem unidade.
      id_unidade:  formData.tipo === "Morador" && formData.id_unidade
        ? Number(formData.id_unidade)
        : null,
      nome:        nomeProprio(formData.nome),
      telefone:    formData.telefone || null,
      // `data` é date e `hora_inicio` é time: os valores do formulário já vêm
      // em "AAAA-MM-DD" e "HH:MM", que é o que os dois tipos aceitam.
      data:        formData.data || null,
      hora_inicio: formData.hora_inicio || null,
      duracao:     formData.duracao,
      assunto:     formData.assunto || null,
      obs:         formData.obs || null,
      status:      formData.status,
    };

    const r = modalType === "add"
      ? await criar("AGENDAMENTOS", { ...dados, created_by: user?.nome || "Sistema" })
      : await editar("AGENDAMENTOS", formData.id, dados);

    if (!r.success) {
      toast.error(mensagemErro(r.message));
      setLoadingGlobal(false);
      return;
    }

    // A espera de 2s existia porque o Apps Script respondia por redirect antes
    // de a escrita chegar na planilha. O Postgres já respondeu com a linha
    // gravada — reler na hora traz o estado certo.
    setShowModal(false);
    await fetchData();
    setLoadingGlobal(false);
  };

  const handleDelete = async (id) => {
    const okExcluir = await confirmar({
      title: "Excluir este agendamento?",
      description: "Não dá para desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!okExcluir) return;
    setLoadingGlobal(true);
    const r = await remover("AGENDAMENTOS", id);
    if (!r.success) {
      toast.error(mensagemErro(r.message));
      setLoadingGlobal(false);
      return;
    }
    setShowModal(false);
    await fetchData();
    setLoadingGlobal(false);
  };

  const nomesDias  = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  const nomesMeses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                      "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  const diasDoMes = useMemo(() => {
    const ano = viewMonth.getFullYear();
    const mes = viewMonth.getMonth();
    const primeiro = new Date(ano, mes, 1).getDay();
    const total    = new Date(ano, mes + 1, 0).getDate();
    const cells = Array(primeiro).fill(null);
    for (let i = 1; i <= total; i++) cells.push(i);
    return cells;
  }, [viewMonth]);

  // Linhas da agenda do dia: mescla agendamentos reais (em qualquer horário,
  // inclusive quebrado) com os slots fixos de hora livres, ordenados por horário.
  const linhasDoDia = useMemo(() => {
    const ocupaSlot = (hora) => {
      const inicioMin = horaParaMinutos(hora);
      return agendamentosDoDia.some(ag => {
        if (ag.status === "Cancelado") return false;
        const ai = horaParaMinutos(ag.hora_inicio);
        const af = ai + duracaoParaMinutos(ag.duracao);
        return inicioMin >= ai && inicioMin < af;
      });
    };

    const linhas = agendamentosDoDia.map(ag => ({
      tipo: "ag", hora: ag.hora_inicio, ag,
    }));

    HORARIOS.forEach(h => {
      const jaTemAgNaHora = agendamentosDoDia.some(
        ag => ag.status !== "Cancelado" && ag.hora_inicio === h
      );
      if (!ocupaSlot(h) && !jaTemAgNaHora) {
        linhas.push({ tipo: "livre", hora: h });
      }
    });

    return linhas.sort((a, b) => horaParaMinutos(a.hora) - horaParaMinutos(b.hora));
  }, [agendamentosDoDia]);

  const totalDisponiveis = linhasDoDia.filter(l => l.tipo === "livre").length;

  // ---- A tela ----
  // Agenda do dia (não lista): o mini calendário escolhe o dia, e o dia mostra
  // os agendamentos e os horários livres em ordem. Tocar num agendamento abre
  // o VER (só leitura); tocar num horário livre abre o NOVO já com a hora.
  const unidadePorId = new Map(unidades.map((u) => [String(u.id), u]));
  const rotuloUnidade = (id) => {
    const u = unidadePorId.get(String(id));
    return u ? `B${u.bloco}-${u.unidade}` : "";
  };
  const resumoDe = (ag) => [
    ag.tipo,
    ag.tipo === "Morador" && ag.id_unidade ? rotuloUnidade(ag.id_unidade) : "",
    ag.assunto,
  ].filter(Boolean).join(" · ");
  const ver = (ag) => setVendo(ag);
  const editarVendo = () => { const ag = vendo; setVendo(null); abrirModalEditar(ag); };
  const mudar = (campo) => (valor) => setFormData((f) => ({ ...f, [campo]: valor }));
  const marcarHorario = (campo) => (valor) => { setFormData((f) => ({ ...f, [campo]: valor })); setConflitError(""); };
  const doDia = agendamentosDoDia.filter((a) => a.status !== "Cancelado").length;
  // Os números do cabeçalho: hoje e a semana que vem (sem os cancelados).
  const vivos = agendamentos.filter((a) => a.status !== "Cancelado");
  const deHoje = vivos.filter((a) => a.data === hoje).length;
  const daquiASete = formatDateKey(new Date(Date.now() + 7 * 86400000));
  const naSemana = vivos.filter((a) => a.data > hoje && a.data <= daquiASete).length;
  const irPara = (dateStr) => {
    const [y, m] = dateStr.split("-").map(Number);
    setSelectedDate(dateStr);
    setViewMonth(new Date(y, m - 1, 1));
  };

  return (
    <div>
      <PageHeader
        title="Agendamento"
        meta={loadingInitial ? "Carregando a agenda" : `${deHoje} hoje · ${naSemana} nos próximos 7 dias`}
        actions={<Button variant="primary" iconLeft={<Plus size={16} />} onClick={() => abrirModalNovo()}>Novo agendamento</Button>}
      />

      <div className="agd-grade">
        <aside className="agd-lado">
          <section className="agd-cartao" aria-label="Calendário">
            <header className="agd-mes">
              <Button variant="ghost" size="sm" aria-label="Mês anterior"
                onClick={() => setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}><ChevronLeft size={16} /></Button>
              <b>{nomesMeses[viewMonth.getMonth()]} {viewMonth.getFullYear()}</b>
              <Button variant="ghost" size="sm" aria-label="Próximo mês"
                onClick={() => setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}><ChevronRight size={16} /></Button>
            </header>
            <div className="agd-cal">
              {nomesDias.map((d) => <span key={d} className="agd-cal__semana">{d}</span>)}
              {diasDoMes.map((dia, idx) => {
                if (!dia) return <span key={`e-${idx}`} />;
                const dateStr = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
                const temAg = diasComAgendamento.has(dateStr);
                return (
                  <button key={dateStr} type="button"
                    className={`agd-cal__dia${dateStr === hoje ? " agd-cal__dia--hoje" : ""}${dateStr === selectedDate ? " agd-cal__dia--sel" : ""}`}
                    aria-pressed={dateStr === selectedDate}
                    aria-label={`${dia} de ${nomesMeses[viewMonth.getMonth()]}${temAg ? ", tem agendamento" : ""}`}
                    onClick={() => setSelectedDate(dateStr)}>
                    {dia}
                    {temAg && <i aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            {selectedDate !== hoje && (
              <Button variant="ghost" size="sm" className="agd-hoje" onClick={() => irPara(hoje)}>Voltar para hoje</Button>
            )}
          </section>

          {proximosAgendamentos.length > 0 && (
            <section className="agd-cartao agd-cartao--proximos">
              <h3 className="app-ficha__titulo">Próximos</h3>
              <ul className="agd-proximos">
                {proximosAgendamentos.map((ag) => {
                  const [, m, d] = ag.data.split("-").map(Number);
                  return (
                    <li key={ag.id}>
                      <button type="button" className={`agd-proximo agd-tom--${tomDe(ag.status)}`}
                        onClick={() => { irPara(ag.data); ver(ag); }}>
                        <small>{ag.data === hoje ? "Hoje" : `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`} · {ag.hora_inicio}</small>
                        <b>{nomeProprio(ag.nome)}</b>
                        {resumoDe(ag) && <small>{resumoDe(ag)}</small>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </aside>

        <section className="agd-cartao agd-dia" aria-label="Agenda do dia">
          <header className="agd-dia__topo">
            <h2>{formatDataExtenso(selectedDate)}</h2>
            <p>
              {loadingInitial ? "Carregando…" : `${doDia} ${doDia === 1 ? "agendamento" : "agendamentos"} · ${totalDisponiveis} ${totalDisponiveis === 1 ? "horário livre" : "horários livres"}`}
            </p>
          </header>

          {!loadingInitial && linhasDoDia.length === 0 ? (
            <EmptyState icon={<CalendarDays size={22} />} title="Dia sem horários" description="Use Novo agendamento para marcar fora dos horários de sempre." />
          ) : (
            <ol className="agd-linhas">
              {linhasDoDia.map((linha) => (
                <li key={linha.tipo === "ag" ? `ag-${linha.ag.id}` : `livre-${linha.hora}`} className="agd-linha">
                  <span className="agd-hora">{linha.hora}</span>
                  {linha.tipo === "ag" ? (
                    <button type="button" className={`agd-ag agd-tom--${tomDe(linha.ag.status)}`}
                      aria-label={`Ver o agendamento de ${nomeProprio(linha.ag.nome)} às ${linha.ag.hora_inicio}`}
                      onClick={() => ver(linha.ag)}>
                      <span className="agd-ag__texto">
                        <b>{nomeProprio(linha.ag.nome)}</b>
                        {resumoDe(linha.ag) && <small>{resumoDe(linha.ag)}</small>}
                        <small className="agd-ag__horario"><Clock size={12} aria-hidden="true" />{linha.ag.hora_inicio} – {calcHoraFim(linha.ag.hora_inicio, linha.ag.duracao)} · {linha.ag.duracao}</small>
                      </span>
                      <Badge tone={tomDe(linha.ag.status)}>{linha.ag.status}</Badge>
                    </button>
                  ) : (
                    <button type="button" className="agd-livre" aria-label={`Agendar às ${linha.hora}`} onClick={() => abrirModalNovo(linha.hora)}>
                      <Plus size={15} aria-hidden="true" />Livre · agendar
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* ---- Ver: o desenho do detalhe de Encomendas ---- */}
      <Modal
        open={Boolean(vendo)}
        onClose={() => setVendo(null)}
        title="Detalhes do agendamento"
        size="lg"
        footer={vendo && (
          <div className="app-modal__acoes">
            <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => { const id = vendo.id; setVendo(null); handleDelete(id); }}>Excluir</Button>
            <Button variant="primary" iconLeft={<Pencil size={15} />} onClick={editarVendo}>Editar</Button>
          </div>
        )}
      >
        {vendo && (
          <div className="app-modal">
            <div className="app-modal__topo">
              <Iniciais nome={vendo.nome} grande />
              <div className="app-modal__quem">
                <strong>{nomeProprio(vendo.nome)}</strong>
                <small>{formatDataExtenso(vendo.data)} · {vendo.hora_inicio} – {calcHoraFim(vendo.hora_inicio, vendo.duracao)}</small>
                <span className="app-modal__selos">
                  <Badge tone={tomDe(vendo.status)}>{vendo.status}</Badge>
                  <Badge tone="neutral">{vendo.tipo}</Badge>
                </span>
              </div>
            </div>

            <div className="app-detalhe">
              {/* O horário em letra grande: é o que se confere antes de receber a pessoa. */}
              <div className="app-detalhe__visual">
                <p className="app-detalhe__legenda">Quando</p>
                <div className="app-cartao">
                  <p className="app-cartao__rotulo">{formatDataExtenso(vendo.data)}</p>
                  <p className="app-cartao__grande">{vendo.hora_inicio} – {calcHoraFim(vendo.hora_inicio, vendo.duracao)}</p>
                  <p className="app-cartao__sub">{vendo.duracao}{vendo.tipo === "Morador" && rotuloUnidade(vendo.id_unidade) ? ` · ${rotuloUnidade(vendo.id_unidade)}` : ""}</p>
                </div>
              </div>

              <div className="app-detalhe__dados">
                <Ficha titulo="Quando" itens={[
                  ["Data", dataBR(vendo.data) || "—"],
                  ["Horário", `${vendo.hora_inicio} – ${calcHoraFim(vendo.hora_inicio, vendo.duracao)}`],
                  ["Duração", vendo.duracao],
                ]} />
                <Ficha titulo="Quem" itens={[
                  ["Tipo", vendo.tipo],
                  vendo.tipo === "Morador" && ["Unidade", rotuloUnidade(vendo.id_unidade) || "Não informada", true],
                  ["Telefone", vendo.telefone ? maskPhone(vendo.telefone) : "Não informado"],
                ]} />
                {(vendo.assunto || vendo.obs) && (
                  <section className="app-ficha">
                    <h3 className="app-ficha__titulo">Assunto</h3>
                    {vendo.assunto && <p className="mud-obs">{vendo.assunto}</p>}
                    {vendo.obs && <p className="mud-obs">{vendo.obs}</p>}
                  </section>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Criar e editar ---- */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={modalType === "add" ? "Novo agendamento" : "Editar agendamento"}
        size="md"
        footer={
          <div className="app-modal__acoes">
            {modalType === "edit"
              ? <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => handleDelete(formData.id)}>Excluir</Button>
              : <span />}
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="form-agendamento" loading={loadingGlobal}>Salvar</Button>
          </div>
        }
      >
        <form id="form-agendamento" className="mud-form" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <Field label="Tipo de reunião">
            <Opcoes rotulo="Tipo de reunião" valor={formData.tipo}
              onMudar={(tipo) => setFormData((f) => ({ ...f, tipo, id_unidade: "", id_morador: "", nome: "", telefone: "" }))}
              opcoes={[["Morador", "Morador"], ["Prestador de Serviço", "Prestador"], ["Administradora", "Administradora"], ["Funcionário", "Funcionário"]]} />
          </Field>

          {formData.tipo === "Morador" && (
            <Field label="Unidade" required>
              <BuscaUnidade unidades={unidades} valor={unidadePorId.get(String(formData.id_unidade)) ?? null}
                onEscolher={(u) => handleUnidadeSelect(u?.id ?? "")} />
            </Field>
          )}
          {formData.tipo === "Morador" && formData.id_unidade && moradoresDaUnidade.length > 1 && (
            <Field label="Morador">
              <Select value={formData.id_morador || ""} onChange={(e) => handleMoradorSelect(e.target.value)}>
                <option value="">Avulso / outro</option>
                {moradoresDaUnidade.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </Select>
            </Field>
          )}

          <div className="mud-form__par">
            <Field label="Nome" required>
              <Input value={formData.nome} readOnly={formData.tipo === "Morador" && Boolean(formData.id_morador)}
                onChange={(e) => mudar("nome")(e.target.value)}
                onBlur={(e) => mudar("nome")(nomeProprio(e.target.value))} />
            </Field>
            <Field label="Telefone">
              <Input value={formData.telefone} inputMode="tel" placeholder="(21) 99999-0000"
                onChange={(e) => mudar("telefone")(maskTelefone(e.target.value))} />
            </Field>
          </div>

          <div className="mud-form__par">
            <Field label="Data" required>
              <Input type="date" value={formData.data} onChange={(e) => marcarHorario("data")(e.target.value)} />
            </Field>
            <Field label="Hora de início" required help="Das 10h às 17h">
              <Input type="time" value={formData.hora_inicio} min="10:00" max="17:00" step="300"
                onChange={(e) => marcarHorario("hora_inicio")(e.target.value)} />
            </Field>
          </div>
          <Field label="Duração">
            <Opcoes rotulo="Duração" valor={formData.duracao} onMudar={marcarHorario("duracao")} opcoes={DURACOES} />
          </Field>

          <Field label="Assunto">
            <Input value={formData.assunto} placeholder="Ex.: cobrança, problema na unidade"
              onChange={(e) => mudar("assunto")(e.target.value)} />
          </Field>
          <Field label="Observações">
            <Textarea rows={2} value={formData.obs} onChange={(e) => mudar("obs")(e.target.value)} />
          </Field>
          <Field label="Situação">
            <Opcoes rotulo="Situação" valor={formData.status} onMudar={mudar("status")} opcoes={STATUS_OPTIONS} />
          </Field>

          {conflitError && (
            <p className="conf-alerta" role="alert"><AlertCircle size={16} aria-hidden="true" />{conflitError}</p>
          )}
        </form>
      </Modal>
    </div>
  );
}
