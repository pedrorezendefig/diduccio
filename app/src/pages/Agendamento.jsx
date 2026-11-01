/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, X,
  Edit2, Trash2, Loader2, Clock, User, Phone,
  ChevronDown, AlertCircle, CheckCircle2
} from "lucide-react";
import { useTheme } from "../theme/useTheme";
import { listar, criar, editar, remover } from "../api/db";
import { useToast, useConfirm } from "../ui";

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

const STATUS_COLORS = {
  Agendado:   { bg: "#E35A3A20", border: "#E35A3A", text: "#F7A48E", badge: "#E35A3A30" },
  Confirmado: { bg: "#E35A3A20", border: "#E35A3A", text: "#EF7A5C", badge: "#E35A3A30" },
  Realizado:  { bg: "#B3332020", border: "#B33320", text: "#FCC8B9", badge: "#B3332030" },
  Cancelado:  { bg: "#B8203F15", border: "#B8203F", text: "#D9607A", badge: "#B8203F30" },
};

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

// Máscara de telefone no formato (dd)nnnnn-nnnn.
function maskPhone(v) {
  let d = (v || "").toString().replace(/\D/g, "");
  if (d.length > 11) d = d.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)})${d.slice(2)}`;
  return `(${d.slice(0, 2)})${d.slice(2, 7)}-${d.slice(7)}`;
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
  const { theme } = useTheme();
  const dropdownRef = useRef(null);

  const [agendamentos, setAgendamentos] = useState([]);
  const [unidades, setUnidades]         = useState([]);
  const [moradores, setMoradores]       = useState([]);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingGlobal,  setLoadingGlobal]  = useState(false);
  const [isMobile, setIsMobile]             = useState(window.innerWidth < 768);

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
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const [unitSearch,       setUnitSearch]       = useState("");

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setShowUnitDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  const getUnitLabel = (id) => {
    const u = unidades.find(u => u.id?.toString() === id?.toString());
    return u ? `BLOCO ${u.bloco} - UNIDADE ${u.unidade}` : "Selecione a unidade...";
  };

  const unidadesFiltradas = useMemo(() =>
    unidades
      .filter(u =>
        u.bloco?.toString().toLowerCase().includes(unitSearch.toLowerCase()) ||
        u.unidade?.toString().toLowerCase().includes(unitSearch.toLowerCase())
      )
      .sort((a, b) => {
        const cb = a.bloco?.toString().localeCompare(b.bloco?.toString(), undefined, { numeric: true });
        if (cb !== 0) return cb;
        return a.unidade?.toString().localeCompare(b.unidade?.toString(), undefined, { numeric: true });
      }),
  [unidades, unitSearch]);

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
        telefone: maskPhone(m.telefone || m.celular || ""),
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
    setShowUnitDropdown(false);
    setUnitSearch("");
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
        telefone: maskPhone(m.telefone || m.celular || ""),
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
      nome:        formData.nome,
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

  return (
    <div style={{ padding: isMobile ? "20px 14px" : "20px", paddingTop: isMobile ? 60 : 20, maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
        .slot-livre:hover { background: ${theme.isDark ? "#B3332020" : "#e0f2fe"} !important; border-color: #B33320 !important; cursor: pointer; }
        .slot-livre:hover .slot-plus { color: ${theme.isDark ? "#EF7A5C" : "#B33320"} !important; }
        .cal-day:hover { background: ${theme.isDark ? "var(--border-strong)" : "var(--surface-3)"} !important; cursor: pointer; }
        .ag-card:hover { opacity: 0.85; cursor: pointer; }
      `}</style>

      {(loadingInitial || loadingGlobal) && (
        <div style={{ position:"fixed", inset:0, background:"rgba(40,22,18,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 }}>
          <Loader2 className="animate-spin" color="#E35A3A" size={50} />
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: theme.text, margin: 0 }}>Agendamento</h1>
        <p style={{ fontSize: 14, color: theme.textSecondary, margin: "4px 0 0" }}>Gerencie as reuniões com moradores, prestadores e colaboradores.</p>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>

        {/* SIDEBAR ESQUERDA */}
        <div style={{ width: isMobile ? "100%" : 220, flexShrink: 0, background: theme.mainBg, borderRadius: 16, padding: 16, border: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Mini Calendário */}
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 10 }}>
              <button
                onClick={() => setViewMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                style={{ background: theme.bg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: 6, width: 26, height: 26, cursor: "pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
              ><ChevronLeft size={14} /></button>
              <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>
                {nomesMeses[viewMonth.getMonth()]} {viewMonth.getFullYear()}
              </span>
              <button
                onClick={() => setViewMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                style={{ background: theme.bg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: 6, width: 26, height: 26, cursor: "pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
              ><ChevronRight size={14} /></button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap: 2, textAlign:"center" }}>
              {nomesDias.map(d => (
                <span key={d} style={{ fontSize: 10, fontWeight: 600, color: theme.textSecondary, padding: "2px 0" }}>{d}</span>
              ))}
              {diasDoMes.map((dia, idx) => {
                if (!dia) return <span key={`e-${idx}`} />;
                const dateStr = `${viewMonth.getFullYear()}-${(viewMonth.getMonth()+1).toString().padStart(2,"0")}-${dia.toString().padStart(2,"0")}`;
                const isToday    = dateStr === hoje;
                const isSelected = dateStr === selectedDate;
                const temAg      = diasComAgendamento.has(dateStr);
                return (
                  <div
                    key={dateStr}
                    className="cal-day"
                    onClick={() => setSelectedDate(dateStr)}
                    style={{
                      padding: "4px 2px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: isToday ? 700 : 400,
                      color: isSelected ? (theme.isDark ? "#EF7A5C" : "#B33320") : isToday ? "#E35A3A" : theme.text,
                      background: isSelected ? (theme.isDark ? "#B3332030" : "#e0f2fe") : "transparent",
                      border: isToday && !isSelected ? `1px solid #E35A3A` : "1px solid transparent",
                      textAlign: "center",
                    }}
                  >
                    {dia}
                    {temAg && (
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#E35A3A", margin: "1px auto 0" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Próximos */}
          {proximosAgendamentos.length > 0 && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Próximos</p>
              {proximosAgendamentos.map(ag => {
                const c = STATUS_COLORS[ag.status] || STATUS_COLORS.Agendado;
                const isHoje = ag.data === hoje;
                const [, m, d] = ag.data.split("-").map(Number);
                const labelData = isHoje ? "Hoje" : `${d}/${m}`;
                return (
                  // role e teclado: a div clicável não recebia foco, e o
                  // script de prints do Manual não tinha como abrir o
                  // Atendimento.
                  <div
                    key={ag.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => { setSelectedDate(ag.data); abrirModalEditar(ag); }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      setSelectedDate(ag.data);
                      abrirModalEditar(ag);
                    }}
                    style={{ background: theme.bg, borderRadius: 8, padding: 8, borderLeft: `3px solid ${c.border}`, marginBottom: 6, cursor: "pointer" }}
                  >
                    <div style={{ fontSize: 10, color: theme.textSecondary }}>{labelData} · {ag.hora_inicio}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{ag.nome}</div>
                    <div style={{ fontSize: 10, color: theme.textSecondary }}>{ag.tipo === "Morador" && ag.id_unidade ? `Unid. ${ag.id_unidade} · ` : ""}{ag.assunto}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ÁREA PRINCIPAL */}
        <div style={{ flex: 1, background: theme.mainBg, borderRadius: 16, padding: 20, border: `1px solid ${theme.border}` }}>

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: theme.text, margin: 0, textTransform: "capitalize" }}>
                {formatDataExtenso(selectedDate)}
              </h2>
              <p style={{ fontSize: 13, color: theme.textSecondary, margin: "4px 0 0" }}>
                {agendamentosDoDia.filter(a => a.status !== "Cancelado").length} agendamento(s) · {totalDisponiveis} horário(s) disponível(is)
              </p>
            </div>
            <button
              onClick={() => abrirModalNovo()}
              style={{ background: "#E35A3A", color: "white", border: "none", padding: "9px 16px", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer", display:"flex", alignItems:"center", gap: 6 }}
            >
              <Plus size={16} /> Novo Agendamento
            </button>
          </div>

          <div style={{ display:"flex", gap: 12, flexWrap:"wrap", marginBottom: 16 }}>
            {STATUS_OPTIONS.map(s => {
              const c = STATUS_COLORS[s];
              return (
                <div key={s} style={{ display:"flex", alignItems:"center", gap: 5, fontSize: 11, color: theme.textSecondary }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: c.border }} />
                  {s}
                </div>
              );
            })}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap: 4 }}>
            {linhasDoDia.map((linha, idx) => {
              if (linha.tipo === "ag") {
                const ag = linha.ag;
                const c = STATUS_COLORS[ag.status] || STATUS_COLORS.Agendado;
                return (
                  <div key={ag.id} style={{ display:"flex", gap: 12, alignItems:"flex-start" }}>
                    <div style={{ width: 44, fontSize: 11, color: theme.textSecondary, textAlign:"right", paddingTop: 12, flexShrink: 0, fontWeight: 600 }}>{ag.hora_inicio}</div>
                    <div
                      className="ag-card"
                      onClick={() => abrirModalEditar(ag)}
                      style={{ flex: 1, background: c.bg, borderLeft: `3px solid ${c.border}`, borderRadius: 10, padding: "10px 14px", minHeight: 44 }}
                    >
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{ag.nome}</div>
                          <div style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                            {ag.tipo}
                            {ag.tipo === "Morador" && ag.id_unidade ? ` · Unid. ${ag.id_unidade}` : ""}
                            {ag.telefone ? ` · ${ag.telefone}` : ""}
                            {ag.assunto ? ` · ${ag.assunto}` : ""}
                          </div>
                          <div style={{ fontSize: 10, marginTop: 2, color: theme.textSecondary }}>
                            {ag.hora_inicio} – {calcHoraFim(ag.hora_inicio, ag.duracao)} ({ag.duracao})
                          </div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: c.badge, color: c.border, whiteSpace:"nowrap", marginLeft: 8 }}>
                          {ag.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={`livre-${linha.hora}`} style={{ display:"flex", gap: 12, alignItems:"center" }}>
                  <div style={{ width: 44, fontSize: 11, color: theme.textSecondary, textAlign:"right", flexShrink: 0, fontWeight: 600 }}>{linha.hora}</div>
                  <div
                    className="slot-livre"
                    onClick={() => abrirModalNovo(linha.hora)}
                    style={{ flex: 1, minHeight: 44, borderRadius: 10, border: `1px dashed ${theme.border}`, background: "transparent", display:"flex", alignItems:"center", padding: "0 14px", gap: 6 }}
                  >
                    <span className="slot-plus" style={{ fontSize: 18, color: theme.border }}>+</span>
                    <span style={{ fontSize: 12, color: theme.border }}>Clique para agendar</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(40,22,18,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
          <div style={{ background: theme.mainBg, borderRadius: 20, padding: isMobile ? 18 : 24, width: "90%", maxWidth: 480, border: `1px solid ${theme.border}`, maxHeight: "90vh", overflowY: "auto" }}>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: 16, fontWeight: 700 }}>
                {modalType === "add" ? "Novo Agendamento" : "Editar Agendamento"}
                {formData.hora_inicio ? ` · ${formData.hora_inicio}` : ""}
              </h3>
              <X size={20} color={theme.textSecondary} style={{ cursor:"pointer" }} onClick={() => setShowModal(false)} />
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap: 14 }}>

              {/* Tipo */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform:"uppercase", color: "var(--fg-muted)", display:"block", marginBottom: 5 }}>Tipo de Reunião</label>
                <select
                  value={formData.tipo}
                  onChange={e => setFormData(prev => ({ ...prev, tipo: e.target.value, id_unidade: "", id_morador: "", nome: "", telefone: "" }))}
                  style={{ width:"100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13, outline:"none" }}
                >
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Unidade (somente Morador) */}
              {formData.tipo === "Morador" && (
                <div ref={dropdownRef} style={{ position:"relative" }}>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform:"uppercase", color: "var(--fg-muted)", display:"block", marginBottom: 5 }}>Unidade</label>
                  <div
                    onClick={() => setShowUnitDropdown(!showUnitDropdown)}
                    style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}
                  >
                    <span>{formData.id_unidade ? getUnitLabel(formData.id_unidade) : "Selecione a unidade..."}</span>
                    <ChevronDown size={16} color={theme.textSecondary} />
                  </div>
                  {showUnitDropdown && (
                    <div style={{ position:"absolute", top:"100%", left:0, width:"100%", background: theme.mainBg, border: `1px solid ${theme.border}`, borderRadius: 8, zIndex:1200, boxShadow:"0 8px 16px rgba(0,0,0,0.2)", marginTop: 4, overflow:"hidden" }}>
                      <div style={{ padding: 8 }}>
                        <input
                          autoFocus
                          value={unitSearch}
                          onChange={e => setUnitSearch(e.target.value)}
                          placeholder="Bloco ou unidade..."
                          style={{ width:"100%", padding: 8, borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, boxSizing:"border-box", outline:"none", fontSize: 13 }}
                        />
                      </div>
                      <div style={{ maxHeight: 180, overflowY:"auto" }}>
                        {unidadesFiltradas.map(u => (
                          <div
                            key={u.id}
                            onClick={() => handleUnidadeSelect(u.id)}
                            style={{ padding: "9px 14px", cursor:"pointer", fontSize: 13, color: theme.text, borderBottom: `1px solid ${theme.border}` }}
                            onMouseEnter={e => e.currentTarget.style.background = theme.bg}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            BLOCO {u.bloco} - UNIDADE {u.unidade}
                          </div>
                        ))}
                        {unidadesFiltradas.length === 0 && (
                          <div style={{ padding: 12, textAlign:"center", fontSize: 12, color: theme.textSecondary }}>Nenhuma unidade encontrada</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Dropdown morador (quando há 2+) */}
              {formData.tipo === "Morador" && formData.id_unidade && moradoresDaUnidade.length > 1 && (
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform:"uppercase", color: "var(--fg-muted)", display:"block", marginBottom: 5 }}>Morador</label>
                  <select
                    value={formData.id_morador || ""}
                    onChange={e => handleMoradorSelect(e.target.value)}
                    style={{ width:"100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13, outline:"none" }}
                  >
                    <option value="">Avulso / Outro</option>
                    {moradoresDaUnidade.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </div>
              )}

              {/* Nome + Telefone */}
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform:"uppercase", color: "var(--fg-muted)", display:"block", marginBottom: 5 }}>Nome</label>
                  <input
                    value={formData.nome}
                    readOnly={formData.tipo === "Morador" && !!formData.id_morador}
                    onChange={e => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                    style={{ width:"100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: formData.tipo === "Morador" && formData.id_morador ? theme.mainBg : theme.bg, color: theme.text, fontSize: 13, outline:"none", opacity: formData.tipo === "Morador" && formData.id_morador ? 0.7 : 1 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform:"uppercase", color: "var(--fg-muted)", display:"block", marginBottom: 5 }}>Telefone</label>
                  <input
                    value={formData.telefone}
                    onChange={e => setFormData(prev => ({ ...prev, telefone: maskPhone(e.target.value) }))}
                    placeholder="(11)99999-0000"
                    style={{ width:"100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13, outline:"none" }}
                  />
                </div>
              </div>

              {/* Data + Hora + Duração */}
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform:"uppercase", color: "var(--fg-muted)", display:"block", marginBottom: 5 }}>Data</label>
                  <input
                    type="date"
                    value={formData.data}
                    onChange={e => { setFormData(prev => ({ ...prev, data: e.target.value })); setConflitError(""); }}
                    style={{ width:"100%", padding: "9px 8px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13, outline:"none" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform:"uppercase", color: "var(--fg-muted)", display:"block", marginBottom: 5 }}>Hora Início</label>
                  <input
                    type="time"
                    value={formData.hora_inicio}
                    min="10:00"
                    max="17:00"
                    step="300"
                    onChange={e => { setFormData(prev => ({ ...prev, hora_inicio: e.target.value })); setConflitError(""); }}
                    style={{ width:"100%", padding: "9px 8px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13, outline:"none" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform:"uppercase", color: "var(--fg-muted)", display:"block", marginBottom: 5 }}>Duração</label>
                  <select
                    value={formData.duracao}
                    onChange={e => { setFormData(prev => ({ ...prev, duracao: e.target.value })); setConflitError(""); }}
                    style={{ width:"100%", padding: "9px 8px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13, outline:"none" }}
                  >
                    {DURACOES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              {/* Assunto */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform:"uppercase", color: "var(--fg-muted)", display:"block", marginBottom: 5 }}>Assunto / Motivo</label>
                <input
                  value={formData.assunto}
                  onChange={e => setFormData(prev => ({ ...prev, assunto: e.target.value }))}
                  placeholder="Ex: Cobrança, problema na unidade..."
                  style={{ width:"100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13, outline:"none" }}
                />
              </div>

              {/* Observações */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform:"uppercase", color: "var(--fg-muted)", display:"block", marginBottom: 5 }}>Observações</label>
                <textarea
                  value={formData.obs}
                  onChange={e => setFormData(prev => ({ ...prev, obs: e.target.value }))}
                  rows={2}
                  style={{ width:"100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13, outline:"none", resize:"vertical" }}
                />
              </div>

              {/* Status */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform:"uppercase", color: "var(--fg-muted)", display:"block", marginBottom: 5 }}>Status</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                  style={{ width:"100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13, outline:"none" }}
                >
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Aviso de conflito */}
              {conflitError && (
                <div style={{ background: "#B8203F20", border: "1px solid #B8203F", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#D9607A", display:"flex", alignItems:"center", gap: 6 }}>
                  <AlertCircle size={14} color="#B8203F" /> {conflitError}
                </div>
              )}

              {/* Botões */}
              <div style={{ display:"flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                {modalType === "edit" && (
                  <button
                    onClick={() => handleDelete(formData.id)}
                    style={{ background: "#B8203F20", color: "#B8203F", border: "1px solid #B8203F", padding: "10px 14px", borderRadius: 10, fontSize: 13, cursor:"pointer", display:"flex", alignItems:"center", gap: 6 }}
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                )}
                <button
                  onClick={() => setShowModal(false)}
                  style={{ background: theme.bg, color: theme.textSecondary, border: `1px solid ${theme.border}`, padding: "10px 14px", borderRadius: 10, fontSize: 13, cursor:"pointer" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  style={{ flex: 1, background: "#E35A3A", color: "white", border: "none", padding: 10, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor:"pointer" }}
                >
                  {modalType === "add" ? "Salvar Agendamento" : "Salvar Alterações"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
