 
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  Plus, Pencil, Trash2, Eye, FileText, Download, CheckCircle2, Circle,
  MessageSquareText, Truck,
} from "lucide-react";

// Bibliotecas para exportação
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { maskCPF, maskRG, maskPhone, maskCPFPrivacy, maskRGPrivacy, dataParaMs, dataBR, dataHoraBR, dataHoraInput, nomeProprio } from "../lib/format";
import { sanitizarCelula } from "../lib/drive";
import {
  useToast, useConfirm, Input, Button, PageHeader, Modal, Field, Select, Textarea, Badge, EmptyState,
} from "../ui";
import { listar, criar, editar, remover } from "../api/db";
import ListaQueAbre from "../components/confirmacoes/ListaQueAbre";
import BuscaUnidade from "../components/BuscaUnidade";
import { Chave, Ficha, Filtros, Iniciais, MaisFiltros, Opcoes, PainelDeFiltros } from "../components/app/pecas";

// `mudancas` é administrativo pelas políticas do 0015: porteiro e conselheiro
// não alcançam — a linha carrega cpf, rg e contato de quem está se mudando. A
// mensagem crua do Postgres fala de row-level security, que não diz nada a quem
// está na tela.
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para alterar mudanças.";
  }
  // A coluna `monitor` nasce no 0085. Sem ele aplicado, o PostgREST recusa a
  // linha inteira por uma coluna que não conhece.
  if (/monitor/i.test(msg) && /column|schema cache/i.test(msg)) {
    return "O banco ainda não tem a coluna de monitor. Aplique a migration 0085 no Supabase.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Sem conexão com o servidor. Tente de novo.";
  }
  return msg;
};

const SITUACOES = ["Pendente", "Agendado", "Realizado", "Cancelado"];
/**
 * Quem da equipe pode monitorar uma mudança. A lista é daqui, e não do banco
 * (0085): quando a equipe mudar, troca-se só esta linha.
 */
const MONITORES = ["Bira", "Elias", "Nayra"];
const SEM_MONITOR = "—";
const TOM_SITUACAO = { Pendente: "neutral", Agendado: "brand", Realizado: "positive", Cancelado: "danger" };
const FORM_VAZIO = {
  id_unidade: "", morador: "", contato: "", data_mudanca: "", data_fim: "",
  status: "Pendente", cpf: "", rg: "", tipo: "Entrada", periodo: "Manhã", obs: "", monitor: "",
};
/** Quantas linhas a lista mostra de cada vez; "Mostrar mais" soma outras tantas. */
const LOTE = 30;

export default function Mudancas({ user }) {
  const toast = useToast();
  const confirmar = useConfirm();
  
  const [festas, setFestas] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [moradores, setMoradores] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const location = useLocation();
  
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedFesta, setSelectedFesta] = useState(null);
  const [modalType, setModalType] = useState("add"); // "add" ou "edit"
  // Guarda o timer que solta a tela depois do carregamento, para cancelá-lo se
  // a pessoa sair antes dele disparar.
  const timerCarregando = useRef(null);
  useEffect(() => () => clearTimeout(timerCarregando.current), []);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [limite, setLimite] = useState(LOTE);
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [isMoradorCadastrado, setIsMoradorCadastrado] = useState(false);
  
  const [formData, setFormData] = useState({
  id_unidade: "", morador: "", contato: "", data_mudanca: "",
  status: "Pendente", cpf: "", rg: "", 
  tipo: "Entrada", periodo: "Manhã", obs: "", data_fim: "" // Novos campos
});


const [filterTipo, setFilterTipo] = useState("Todos");
// Sem atalho de período na tela por enquanto: fica "Todos".
const filterPeriodoRapido = "Todos";

const unidadePorId = useMemo(() => new Map(unidades.map((u) => [String(u.id), u])), [unidades]);
/** "B5-206", o rótulo da unidade em toda a tela. */
const rotuloUnidade = (id) => {
  const u = unidadePorId.get(String(id));
  return u ? `B${u.bloco}-${u.unidade}` : String(id ?? "");
};

  const [filterPeriodo, setFilterPeriodo] = useState({ inicio: "", fim: "" });
  const [filterTurno, setFilterTurno] = useState("Todos"); // Novo (Manhã/Tarde)
  const [filterMonitor, setFilterMonitor] = useState("Todos");
  const [filterBloco, setFilterBloco] = useState("Todos");


  
const [sortConfig, setSortConfig] = useState([{ key: 'data_mudanca', direction: 'desc' }]);
/** Clicar na coluna: a primeira vez ordena crescente; de novo, inverte. */
const ordenar = (key) => setSortConfig(([atual]) => [
  { key, direction: atual?.key === key && atual.direction === "asc" ? "desc" : "asc" },
]);
  // Funções de Máscara


  useEffect(() => {
    
  fetchData();
  
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // Certifique-se de que não há nada sobrando aqui

useEffect(() => {
  // 1. Verifica se existe um ID no estado da navegação
  // 2. Verifica se a lista de festas (mudanças) já foi carregada pelo fetchData
  if (location.state?.openId && festas.length > 0) {
    
    // Procura a mudança específica pelo ID
    const itemEncontrado = festas.find(
      (m) => String(m.id) === String(location.state.openId)
    );

    if (itemEncontrado) {
      // Seta o item selecionado para o modal de visualização
      setSelectedFesta(itemEncontrado);
      // Abre o modal de "Ver Mais" (o Eye do Lucide)
      setShowViewModal(true);
      
      // Limpa o estado para evitar que o modal reabra ao dar F5
      window.history.replaceState({}, document.title);
    }
  }
}, [location.state, festas]); // Executa quando a rota muda ou a lista carrega
  const fetchData = async () => {
  try {
    setLoadingInitial(true);
    
    // 1. Busca inicial dos dados
    const [resMudancas, resUnidades, resMoradores] = await Promise.all([
      listar("MUDANCAS"),
      listar("UNIDADES"),
      listar("MORADORES"),
    ]);

    let dadosTratados = Array.isArray(resMudancas) ? resMudancas : [];

    // 2. Chama a verificação e recebe os IDs que foram enviados para "Realizado"
    // O await aqui garante que o loading espere os POSTs terminarem
    const idsParaMudar = await verificarEAtualizarStatus(dadosTratados);

    // 3. ATUALIZAÇÃO LOCAL (O segredo contra o F5)
    // Se a função encontrou itens de ontem, nós forçamos o status aqui na memória
    if (idsParaMudar && idsParaMudar.length > 0) {
      dadosTratados = dadosTratados.map(item => 
        idsParaMudar.includes(item.id) 
          ? { ...item, status: "Realizado" } 
          : item
      );
    }

    // 4. Alimenta o estado com os dados já corrigidos (CHAMAR APENAS UMA VEZ)
    setFestas(dadosTratados);
    
    // 5. Ordenação das unidades para o dropdown
    const sortedUnidades = Array.isArray(resUnidades) ? [...resUnidades].sort((a, b) => {
      if (a.bloco !== b.bloco) return String(a.bloco).localeCompare(String(b.bloco), undefined, {numeric: true});
      return String(a.unidade).localeCompare(String(b.unidade), undefined, {numeric: true});
    }) : [];

    setUnidades(sortedUnidades);
    setMoradores(Array.isArray(resMoradores) ? resMoradores : []);

  } catch (error) { 
    console.error("Erro ao carregar dados:", error); 
  } finally { 
    // Delay de 300ms para suavizar a transição.
    //
    // O timer é guardado e cancelado ao desmontar. Sem isso ele dispara depois
    // da tela sair e chama `setLoadingInitial` num componente que não existe
    // mais — em produção o React engole calado; nos testes, o jsdom já foi
    // derrubado e o erro aparece como "window is not defined" numa pilha que
    // não menciona esta tela. Era a origem de uma falha que só acontecia em
    // algumas execuções da suíte.
    clearTimeout(timerCarregando.current);
    timerCarregando.current = setTimeout(() => {
      setLoadingInitial(false);
    }, 300);
  }
};

const [showExportModal, setShowExportModal] = useState(false);
const [selectedColumns, setSelectedColumns] = useState([
  { id: 'id_unidade', label: 'Unidade', selected: true },
  { id: 'morador', label: 'Morador', selected: true },
  { id: 'monitor', label: 'Monitor', selected: true },
  { id: 'cpf', label: 'CPF', selected: true },
  { id: 'rg', label: 'RG', selected: true },
  { id: 'contato', label: 'Telefone', selected: true },
  { id: 'data_mudanca', label: 'Inicio', selected: true },
  { id: 'data_fim', label: 'Fim', selected: true },
  { id: 'periodo', label: 'Período', selected: true }, // Antes era "Taxa"
  { id: 'tipo', label: 'Tipo', selected: true },       // Antes era "Pago"
  { id: 'status', label: 'Status', selected: true }
]);

const exportToExcel = () => {
  const colsAtivas = selectedColumns.filter(c => c.selected);

  const dadosParaExportar = dadosFiltrados.map(f => {
    const linha = {};
    const unit = unidades.find(u => u.id?.toString() === f.id_unidade?.toString());

    colsAtivas.forEach(col => {
      if (col.id === 'id_unidade') {
        linha["Unidade"] = sanitizarCelula(unit ? `B${unit.bloco} - ${unit.unidade}` : f.id_unidade);
      }
      else if (col.id === 'morador') {
        linha[col.label] = sanitizarCelula(nomeProprio(f.morador));
      }
      else if (col.id === 'cpf') {
        linha["CPF"] = maskCPFPrivacy(f.cpf);
      } 
      else if (col.id === 'rg') {
        linha["RG"] = maskRGPrivacy(f.rg); // Aplica a máscara solicitada
      }
      else if (col.id === 'data_mudanca' || col.id === 'data_fim') {
        linha[col.label] = dataHoraBR(f[col.id], { comSegundos: false });
      }
      else {
        linha[col.label] = sanitizarCelula(f[col.id] || "");
      }
    });
    return linha;
  });

  const ws = XLSX.utils.json_to_sheet(dadosParaExportar);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Mudanças");
  XLSX.writeFile(wb, "Relatorio_Mudancas.xlsx");
  setShowExportModal(false);
};

const handleToggleColumn = (id) => {
  setSelectedColumns(prev => prev.map(col => col.id === id ? { ...col, selected: !col.selected } : col));
};

const exportToPDF = () => {
  const doc = new jsPDF('l', 'mm', 'a4'); 
  const img = new Image(); 
  img.src = "/logo.png"; 


  const colsParaExportar = selectedColumns.filter(c => c.selected);
  const headers = colsParaExportar.map(c => c.label);
  
  const body = dadosFiltrados.map(f => colsParaExportar.map(c => {

    // 2. Tratamento específico para CPF (Máscara de Privacidade)
    if(c.id === 'morador') return nomeProprio(f.morador);
    if(c.id === 'cpf') return maskCPFPrivacy(f[c.id]);

    if(c.id === 'rg') return maskRGPrivacy(f[c.id]);

    // 3. Tratamento para UNIDADE (Para mostrar B1 - 101 em vez do ID)
    if(c.id === 'id_unidade') {
      const unit = unidades.find(u => u.id?.toString() === f.id_unidade?.toString());
      return sanitizarCelula(unit ? `B${unit.bloco} - ${unit.unidade}` : f.id_unidade);
    }

    // 4. Tratamento para DATA
    if(c.id === 'data_mudanca' || c.id === 'data_fim') return dataHoraBR(f[c.id], { comSegundos: false });

    return sanitizarCelula(f[c.id] || "");
  }));

  const gerarPDF = (incluirLogo = false) => {
    doc.setDrawColor(34, 197, 94); 
    doc.setLineWidth(1.5); 
    doc.rect(5, 5, 287, 200);
    if (incluirLogo) doc.addImage(img, 'PNG', 113, 12, 70, 25);
    
    doc.setFontSize(18); 
    doc.setTextColor(30, 41, 59);
    doc.text("Relatório de Mudanças", 148, incluirLogo ? 45 : 25, { align: "center" });

    autoTable(doc, {
      startY: incluirLogo ? 55 : 35,
      head: [headers],
      body: body,
      headStyles: { fillColor: [34, 197, 94], halign: 'center', textColor: [255, 255, 255] },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      margin: { left: 10, right: 10 }
    });

    doc.save("Relatorio_Mudancas.pdf");
    setShowExportModal(false);
  };

  img.onload = () => gerarPDF(true); 
  img.onerror = () => gerarPDF(false);
};
// O recorte da string que morava aqui punha no input a hora UTC que a API
// devolve, e o `comFuso` do salvar somava três horas a cada edição.
const formatToInputDateTime = dataHoraInput;

  const handleSave = async () => {
  // 1. VALIDAÇÃO DE CAMPOS OBRIGATÓRIOS
  if (!formData.id_unidade) { toast.error("Preencha o campo unidade."); return; }
  if (!formData.morador?.trim()) { toast.error("Preencha o campo nome do responsável."); return; }
  if (!formData.data_mudanca) { toast.error("Preencha o campo data início."); return; }
  if (!formData.data_fim) { toast.error("Preencha o campo data fim."); return; } // Validando o fim
  if (!formData.contato?.trim()) { toast.error("Preencha o campo telefone contato."); return; }

  const idMoradorFinal = isMoradorCadastrado 
    ? moradores.find(m => m.nome === formData.morador)?.id 
    : "";

  // 2. LÓGICA DE VALIDAÇÃO DE CONFLITO (POR BLOCO NO DIA)
  const dataNovaISO = formData.data_mudanca.split("T")[0]; 
  const blocoNovo = formData.id_unidade.toString().charAt(0); 

  const conflito = festas.find(f => {
      if (!f.data_mudanca || f.status === "Cancelado") return false;

      const blocoExistente = f.id_unidade?.toString().charAt(0);
      // O dia em Brasília. Com o `split(' ')` de antes, o ISO da API passava
      // inteiro, nunca era igual ao dia novo, e o conflito nunca aparecia.
      const dataExistenteISO = dataHoraInput(f.data_mudanca).slice(0, 10);

      return (
        dataExistenteISO === dataNovaISO && 
        blocoExistente === blocoNovo && 
        f.id?.toString() !== formData.id?.toString()
      );
  });

  if (conflito) {
      if (conflito.status === "Pendente") {
          const seguir = await confirmar({
            title: `O bloco ${blocoNovo} já tem mudança pendente neste dia`,
            description: `A unidade ${conflito.id_unidade} já está agendada. Duas mudanças no mesmo bloco e dia costumam travar o elevador. Continuar?`,
            confirmLabel: "Continuar",
          });
          if (!seguir) return;
      } else {
          toast.error(`BLOQUEADO: O Bloco ${blocoNovo} já possui uma mudança com status ${conflito.status} neste dia.`);
          return;
      }
  }

  // 3. PROCESSO DE ENVIO
  setLoadingGlobal(true);
  
  // Campo a campo, e não `...formData`: o estado carrega campos que só existem
  // na tela e o Postgres recusa a linha inteira por uma coluna que não conhece.
  //
  // `data_mudanca` e `data_fim` são timestamptz: o valor do input chega
  // "AAAA-MM-DDTHH:mm", sem fuso, e o Postgres o leria como UTC — três horas de
  // diferença numa tela cujo assunto É o horário da mudança. O `-03:00`
  // explícito é o que impede a mudança das 8h virar mudança das 5h.
  const comFuso = (valor) => {
    if (!valor) return null;
    const t = String(valor).replace(" ", "T");
    return /(Z|[+-]\d{2}:\d{2})$/.test(t) ? t : `${t}-03:00`;
  };

  const dados = {
    id_unidade: formData.id_unidade ? Number(formData.id_unidade) : null,
    id_morador: idMoradorFinal || null,
    morador: nomeProprio(formData.morador) || null,
    cpf: formData.cpf || null,
    rg: formData.rg || null,
    contato: formData.contato || null,
    periodo: formData.periodo || "Manhã",
    data_mudanca: comFuso(formData.data_mudanca),
    data_fim: comFuso(formData.data_fim),
    status: formData.status || "Pendente",
    tipo: formData.tipo || "Entrada",
    obs: formData.obs || null,
    monitor: formData.monitor || null,
  };

  try {
    const r = modalType === "add"
      ? await criar("MUDANCAS", { ...dados, created_by: user?.nome || "Sistema" })
      : await editar("MUDANCAS", formData.id, dados);

    if (!r.success) { toast.error(mensagemErro(r.message)); setLoadingGlobal(false); return; }

    setShowModal(false);
    await fetchData();

    setFormData(FORM_VAZIO);
  } catch (error) {
    console.error(error);
    toast.error("Não foi possível salvar. Seus dados continuam no formulário.");
  } finally {
    setLoadingGlobal(false);
  }
};
 const handleDelete = async (id) => {
  const okExcluir = await confirmar({
      title: "Excluir esta mudança?",
      description: "Não dá para desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (okExcluir) {
    setLoadingGlobal(true);

    try {
      // Antes isto não conferia resposta nenhuma: a tela esperava um segundo e
      // recarregava, então uma exclusão negada por permissão sumia de vista e a
      // mudança reaparecia sozinha, sem explicação nenhuma na tela.
      const res = await remover("MUDANCAS", id);
      if (!res.success) { toast.error(mensagemErro(res.message)); setLoadingGlobal(false); return; }

      await fetchData();
      setLoadingGlobal(false);
      setShowViewModal(false);

    } catch (error) {
      console.error("Erro ao excluir:", error);
      toast.error("Não foi possível excluir o registro.");
      setLoadingGlobal(false);
    }
  }
};

  const handleMoradorSelect = (moradorId) => {
    const moradorObj = moradores.find(m => m.id.toString() === moradorId);
    if (moradorObj) {
        setFormData({ 
            ...formData, 
            morador: moradorObj.nome, 
            contato: moradorObj.telefone || "",
            cpf: moradorObj.cpf || "",
            rg: moradorObj.rg || ""
        });
    }
  };

  const toggleMoradorCadastrado = (checked) => {
    setIsMoradorCadastrado(checked);
    setFormData({ ...formData, morador: "", contato: "", cpf: "", rg: "" });
  };

  const handleEdit = (mudanca) => {
  setModalType("edit");
  
  // Verifica se o morador já tem ID para marcar o toggle corretamente
  setIsMoradorCadastrado(!!mudanca.id_morador);

  setFormData({
    ...mudanca,
    // Aplica a formatação nas duas datas para elas aparecerem nos inputs
    data_mudanca: formatToInputDateTime(mudanca.data_mudanca),
    data_fim: formatToInputDateTime(mudanca.data_fim),
    // Garante que campos opcionais não venham como undefined
    obs: mudanca.obs || "",
    monitor: mudanca.monitor || "",
    cpf: mudanca.cpf || "",
    rg: mudanca.rg || ""
  });

  setShowViewModal(false);
  setShowModal(true);
};

  const dadosFiltrados = React.useMemo(() => {
  // 1. FILTRAGEM
  let resultado = festas.filter(f => {
    // Filtro de Busca (Nome ou Unidade)
    const matchesSearch = 
        f.morador?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.id_unidade?.toString().includes(searchTerm);
    
    // Filtro de Status
    const matchesStatus = filterStatus === "Todos" || f.status === filterStatus;

    // Filtro de Tipo (Entrada / Saída)
    const matchesTipo = !filterTipo || filterTipo === "Todos" || f.tipo === filterTipo;

    // Filtro de Turno (Manhã / Tarde) - CORRIGIDO
    const matchesTurno = !filterTurno || filterTurno === "Todos" || f.periodo === filterTurno;

    const matchesBloco = filterBloco === "Todos"
      || String(unidadePorId.get(String(f.id_unidade))?.bloco) === filterBloco;

    const matchesMonitor = filterMonitor === "Todos"
      || (filterMonitor === SEM_MONITOR ? !f.monitor : f.monitor === filterMonitor);

    // Sem guarda, `"2026-05-16".split("/")` devolvia um pedaço só e o mês vinha
    // `undefined`: Invalid Date, e o filtro de período parava de filtrar sem
    // dar erro nenhum.
    const dataFesta = f.data_mudanca ? new Date(dataParaMs(f.data_mudanca)) : null;

    // Filtro de Período Customizado (Calendário)
    let matchesData = true;
    if (dataFesta && (filterPeriodo.inicio || filterPeriodo.fim)) {
        if (filterPeriodo.inicio) {
            const dataInic = new Date(filterPeriodo.inicio + "T00:00:00");
            if (dataFesta < dataInic) matchesData = false;
        }
        if (filterPeriodo.fim) {
            const dataFim = new Date(filterPeriodo.fim + "T23:59:59");
            if (dataFesta > dataFim) matchesData = false;
        }
    }

    // Filtro de Período Rápido
    let matchesRapido = true;
    if (filterPeriodoRapido && filterPeriodoRapido !== "Todos") {
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        
        if (filterPeriodoRapido === "Hoje") {
            matchesRapido = dataFesta?.getTime() === hoje.getTime();
        } else if (filterPeriodoRapido === "Semana") {
            const seteDias = new Date();
            seteDias.setDate(hoje.getDate() + 7);
            matchesRapido = dataFesta >= hoje && dataFesta <= seteDias;
        } else if (filterPeriodoRapido === "Mes") {
            matchesRapido = dataFesta?.getMonth() === hoje.getMonth() && dataFesta?.getFullYear() === hoje.getFullYear();
        }
    }

    // ADICIONADO matchesTurno NO RETURN ABAIXO
    return matchesSearch && matchesStatus && matchesTipo && matchesData && matchesRapido && matchesTurno && matchesMonitor && matchesBloco;
  });

  // 2. ORDENAÇÃO
  if (sortConfig.length === 0) {
    resultado.sort((a, b) => {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      // O `try/catch` aqui era pior que o defeito: com ISO ele engolia a
      // exceção e devolvia 0 para TODAS as linhas, então a ordenação por data
      // simplesmente parava de ordenar — e parecia funcionar.
      const timeA = dataParaMs(a.data_mudanca);
      const timeB = dataParaMs(b.data_mudanca);
      const estaNoPassadoA = timeA < hoje.getTime();
      const estaNoPassadoB = timeB < hoje.getTime();

      if (estaNoPassadoA !== estaNoPassadoB) return estaNoPassadoA ? 1 : -1;
      if (!estaNoPassadoA) return timeA - timeB;
      return timeB - timeA;
    });
  } else {
    resultado.sort((a, b) => {
      for (const { key, direction } of sortConfig) {
        let valA = a[key];
        let valB = b[key];

        if (key === 'data_mudanca') {
          valA = dataParaMs(valA);
          valB = dataParaMs(valB);
        } else if (key === 'id_unidade') {
          // Pela ordem do prédio (bloco, depois apartamento), e não pelo id.
          const peso = (id) => { const u = unidadePorId.get(String(id)); return u ? Number(u.bloco) * 100000 + Number(u.unidade) : 0; };
          valA = peso(valA);
          valB = peso(valB);
        } else if (key === 'valor_taxa') {
          valA = Number(valA) || 0;
          valB = Number(valB) || 0;
        } else {
          valA = valA?.toString().toLowerCase() || "";
          valB = valB?.toString().toLowerCase() || "";
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  return resultado;
  // ADICIONADO filterTurno NAS DEPENDÊNCIAS ABAIXO
}, [festas, searchTerm, filterStatus, filterTipo, filterPeriodo, filterPeriodoRapido, filterTurno, filterMonitor, filterBloco, sortConfig, unidadePorId]);



const itensExibidos = dadosFiltrados.slice(0, limite);

const verificarEAtualizarStatus = async (listaMudancas) => {
  const agora = new Date();
  const inicioDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);

  const mudancasParaAtualizar = listaMudancas.filter(m => {
    if (m.status !== "Agendado" || !m.data_mudanca) return false;
    // `data_mudanca` é timestamptz e chega ISO. A versão anterior partia de
    // "DD/MM/AAAA HH:mm", da planilha, e montava um Invalid Date: a comparação
    // dava sempre falso e nenhuma mudança virava "Realizado" sozinha.
    const ms = dataParaMs(m.data_mudanca);
    return ms > 0 && ms < inicioDeHoje.getTime();
  });

  if (mudancasParaAtualizar.length === 0) return [];

  // Só o campo que muda: devolver a linha inteira reenviaria colunas geradas
  // pelo banco e campos que só existem na tela, e o update recusaria a linha.
  for (const mudanca of mudancasParaAtualizar) {
    const r = await editar("MUDANCAS", mudanca.id, { status: "Realizado" });
    // Silencioso: isto roda sozinho ao abrir a tela, e quem não tem permissão
    // de escrita veria um erro que não pediu e não pode resolver.
    if (!r.success) console.warn("Status automático não atualizado:", mudanca.id, r.message);
  }
  return mudancasParaAtualizar.map(m => m.id);
};

  // ---- O que a tela mostra ----
  const contagem = SITUACOES.reduce((n, st) => ({ ...n, [st]: festas.filter((f) => f.status === st).length }), {});
  const filtrosDoPainel = [filterBloco !== "Todos", filterTipo !== "Todos", filterTurno !== "Todos", filterMonitor !== "Todos", Boolean(filterPeriodo.inicio || filterPeriodo.fim)].filter(Boolean).length;
  const limparFiltros = () => {
    setFilterTipo("Todos");
    setFilterTurno("Todos");
    setFilterMonitor("Todos");
    setFilterBloco("Todos");
    setFilterPeriodo({ inicio: "", fim: "" });
  };
  const abrirNova = () => {
    setModalType("add");
    setIsMoradorCadastrado(false);
    setFormData(FORM_VAZIO);
    setShowModal(true);
  };
  const ver = (m) => { setSelectedFesta(m); setShowViewModal(true); };
  const mudar = (campo) => (valor) => setFormData((f) => ({ ...f, [campo]: valor }));
  const moradoresDaUnidade = moradores.filter((m) => String(m.id_unidade) === String(formData.id_unidade));
  const proximas = festas.filter((f) => {
    if (f.status === "Cancelado" || !f.data_mudanca) return false;
    const ms = dataParaMs(f.data_mudanca);
    return ms >= Date.now() - 86400000 && ms <= Date.now() + 7 * 86400000;
  }).length;
  const v = selectedFesta;
  // Os blocos que existem, em ordem.
  const blocos = [...new Set(unidades.map((u) => String(u.bloco)))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return (
    <div>
      <PageHeader
        title="Mudanças"
        meta={loadingInitial ? "Carregando mudanças" : `${festas.length} mudanças · ${proximas} nos próximos 7 dias`}
        actions={
          <>
            <Button onClick={() => setShowExportModal(true)} iconLeft={<FileText size={15} />}>Exportar</Button>
            <Button variant="primary" onClick={abrirNova} iconLeft={<Plus size={16} />}>Nova mudança</Button>
          </>
        }
      />

      <Filtros
        busca={searchTerm}
        onBusca={(t) => { setSearchTerm(t); setLimite(LOTE); }}
        placeholder="Morador ou unidade"
        filtro={filterStatus}
        onFiltro={(st) => { setFilterStatus(st); setLimite(LOTE); }}
        filtros={[["Todos", "Todas", festas.length], ...SITUACOES.map((st) => [st, st, contagem[st]])]}
        painel={
        <PainelDeFiltros aberto={maisFiltros}>
          {blocos.length > 1 && (
            <Field label="Bloco">
              <Opcoes rotulo="Bloco" valor={filterBloco} onMudar={(b) => { setFilterBloco(b); setLimite(LOTE); }}
                opcoes={[["Todos", "Todos"], ...blocos.map((b) => [b, `B${b}`])]} />
            </Field>
          )}
          <Field label="Tipo">
            <Opcoes rotulo="Tipo" valor={filterTipo} onMudar={setFilterTipo} opcoes={["Todos", "Entrada", "Saída"]} />
          </Field>
          <Field label="Turno">
            <Opcoes rotulo="Turno" valor={filterTurno} onMudar={setFilterTurno} opcoes={["Todos", "Manhã", "Tarde"]} />
          </Field>
          <Field label="Monitor">
            <Opcoes rotulo="Monitor" valor={filterMonitor} onMudar={setFilterMonitor}
              opcoes={["Todos", ...MONITORES, [SEM_MONITOR, "Sem"]]} />
          </Field>
          <Field label="Data de">
            <Input type="date" value={filterPeriodo.inicio} onChange={(e) => setFilterPeriodo({ ...filterPeriodo, inicio: e.target.value })} />
          </Field>
          <Field label="até">
            <Input type="date" value={filterPeriodo.fim} onChange={(e) => setFilterPeriodo({ ...filterPeriodo, fim: e.target.value })} />
          </Field>
        </PainelDeFiltros>
        }
      >
        <MaisFiltros aberto={maisFiltros} onAlternar={() => setMaisFiltros((a) => !a)} ativos={filtrosDoPainel} onLimpar={limparFiltros} />
      </Filtros>

      {!loadingInitial && dadosFiltrados.length === 0 ? (
        <EmptyState
          icon={<Truck size={22} />}
          title={festas.length ? "Nenhuma mudança neste filtro" : "Nenhuma mudança cadastrada"}
          description={festas.length ? "Troque a situação, a busca ou os filtros." : "Cadastre a primeira em Nova mudança."}
        />
      ) : (
        <ListaQueAbre
          colunas={[
            { rotulo: "Unidade", largura: "100px", ordem: "id_unidade" },
            { rotulo: "Responsável", largura: "minmax(0, 1.6fr)", ordem: "morador" },
            { rotulo: "Monitor", largura: "100px", ordem: "monitor" },
            { rotulo: "Data", largura: "130px", ordem: "data_mudanca" },
            { rotulo: "Tipo", largura: "100px", ordem: "tipo" },
            { rotulo: "Situação", largura: "110px", ordem: "status" },
          ]}
          ordenacao={sortConfig[0] && { chave: sortConfig[0].key, direcao: sortConfig[0].direction }}
          onOrdenar={ordenar}
          larguraAcoes="96px"
          itens={itensExibidos}
          carregando={loadingInitial}
          chave={(m) => m.id}
          onAbrir={ver}
          rotuloDaLinha={(m) => `Ver a mudança de ${nomeProprio(m.morador)} (${rotuloUnidade(m.id_unidade)})`}
          celulas={(m) => [
            <b key="u" className="conf-dado__mono">{rotuloUnidade(m.id_unidade)}</b>,
            <span key="r" className="mud-quem">
              <b>{nomeProprio(m.morador)}{m.obs?.trim() ? <MessageSquareText size={13} aria-label="Tem observação" /> : null}</b>
              {m.cpf ? <small>{maskCPFPrivacy(m.cpf)}</small> : null}
            </span>,
            m.monitor
              ? <span key="mo" className="mud-monitor">{m.monitor}</span>
              : <span key="mo" className="mud-monitor mud-monitor--vazio">Ninguém</span>,
            <span key="d" className="mud-quem">
              <b>{m.data_mudanca ? dataBR(dataHoraInput(m.data_mudanca).slice(0, 10)) : "—"}</b>
              <small>{m.periodo || "Manhã"}</small>
            </span>,
            <Badge key="t" tone={m.tipo === "Saída" ? "neutral" : "brand"}>{m.tipo || "Entrada"}</Badge>,
            <Badge key="s" tone={TOM_SITUACAO[m.status] ?? "neutral"}>{m.status}</Badge>,
          ]}
          acoes={(m) => (
            <>
              <Button variant="ghost" size="sm" aria-label={`Ver a mudança de ${nomeProprio(m.morador)}`} onClick={() => ver(m)}><Eye size={16} /></Button>
              <Button variant="ghost" size="sm" aria-label={`Editar a mudança de ${nomeProprio(m.morador)}`} onClick={() => handleEdit(m)}><Pencil size={16} /></Button>
            </>
          )}
        />
      )}
      {dadosFiltrados.length > limite && (
        <div className="mud-mais">
          <Button variant="ghost" onClick={() => setLimite((n) => n + LOTE)}>
            Mostrar mais ({dadosFiltrados.length - limite} restantes)
          </Button>
        </div>
      )}

      {/* ---- Ver: o desenho do detalhe de Encomendas ---- */}
      <Modal
        open={showViewModal && Boolean(v)}
        onClose={() => setShowViewModal(false)}
        title="Detalhes da mudança"
        size="lg"
        footer={v && (
          <div className="app-modal__acoes">
            <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => handleDelete(v.id)}>Excluir</Button>
            <Button variant="primary" iconLeft={<Pencil size={15} />} onClick={() => handleEdit(v)}>Editar</Button>
          </div>
        )}
      >
        {v && (
          <div className="app-modal">
            <div className="app-modal__topo">
              <Iniciais nome={v.morador} grande />
              <div className="app-modal__quem">
                <strong>{nomeProprio(v.morador)}</strong>
                <small>{rotuloUnidade(v.id_unidade)} · {v.tipo === "Saída" ? "Saindo do apartamento" : "Chegando ao apartamento"}</small>
                <span className="app-modal__selos">
                  <Badge tone={TOM_SITUACAO[v.status] ?? "neutral"}>{v.status}</Badge>
                  <Badge tone={v.tipo === "Saída" ? "neutral" : "brand"}>{v.tipo || "Entrada"}</Badge>
                </span>
              </div>
            </div>

            <div className="app-detalhe">
              {/* O dia em letra grande: é o que a portaria confere primeiro. */}
              <div className="app-detalhe__visual">
                <p className="app-detalhe__legenda">Quando</p>
                <div className="app-cartao">
                  <p className="app-cartao__rotulo">{v.periodo || "Manhã"} · {rotuloUnidade(v.id_unidade)}</p>
                  <p className="app-cartao__grande">{dataBR(v.data_mudanca) || "Sem data"}</p>
                  <p className="app-cartao__sub">
                    {dataHoraBR(v.data_mudanca, { comSegundos: false }) || "—"}
                    {v.data_fim ? ` até ${dataHoraBR(v.data_fim, { comSegundos: false })}` : ""}
                  </p>
                </div>
              </div>

              <div className="app-detalhe__dados">
                <Ficha titulo="Quando" itens={[
                  ["Início", dataHoraBR(v.data_mudanca, { comSegundos: false }) || "—"],
                  ["Previsão de término", dataHoraBR(v.data_fim, { comSegundos: false }) || "Não informada"],
                  ["Turno", v.periodo || "Manhã"],
                  ["Monitor", v.monitor || "Ninguém marcado"],
                ]} />
                <Ficha titulo="Responsável" itens={[
                  // Como nas reservas: documento mascarado no detalhe (o inteiro
                  // fica no editar e no contrato), telefone com a máscara.
                  ["CPF", v.cpf ? maskCPFPrivacy(v.cpf) : "Não informado", true],
                  ["RG", v.rg ? maskRGPrivacy(v.rg) : "Não informado", true],
                  ["Telefone", v.contato ? maskPhone(String(v.contato)) : "Não informado"],
                ]} />
                {v.obs?.trim() && (
                  <section className="app-ficha">
                    <h3 className="app-ficha__titulo">Observações</h3>
                    <p className="mud-obs">{v.obs}</p>
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
        title={modalType === "add" ? "Nova mudança" : "Editar mudança"}
        size="md"
        footer={
          <div className="app-modal__acoes">
            {modalType === "edit"
              ? <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => { setShowModal(false); handleDelete(formData.id); }}>Excluir</Button>
              : <span />}
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="form-mudanca" loading={loadingGlobal}>Salvar</Button>
          </div>
        }
      >
        <form id="form-mudanca" className="mud-form" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <Field label="Unidade" required>
            <BuscaUnidade
              unidades={unidades}
              valor={unidadePorId.get(String(formData.id_unidade)) ?? null}
              onEscolher={(u) => setFormData((f) => ({ ...f, id_unidade: u?.id ?? "" }))}
            />
          </Field>

          <Chave
            ligada={isMoradorCadastrado}
            onChange={toggleMoradorCadastrado}
            titulo="É morador cadastrado"
            sub="Puxa nome, CPF, RG e telefone do cadastro da unidade"
          />
          {isMoradorCadastrado && (
            <Field label="Morador" help={formData.id_unidade ? undefined : "Escolha a unidade primeiro"}>
              <Select
                value={moradores.find((m) => m.nome === formData.morador)?.id ?? ""}
                onChange={(e) => handleMoradorSelect(e.target.value)}
                disabled={!formData.id_unidade}
              >
                <option value="">Escolha…</option>
                {moradoresDaUnidade.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </Select>
            </Field>
          )}

          <Field label="Nome do responsável" required>
            <Input value={formData.morador} readOnly={isMoradorCadastrado} onChange={(e) => mudar("morador")(e.target.value)}
              onBlur={(e) => mudar("morador")(nomeProprio(e.target.value))} />
          </Field>
          <div className="mud-form__par">
            <Field label="CPF">
              <Input value={formData.cpf} readOnly={isMoradorCadastrado} inputMode="numeric" placeholder="000.000.000-00"
                onChange={(e) => mudar("cpf")(maskCPF(e.target.value))} />
            </Field>
            <Field label="RG">
              <Input value={formData.rg || ""} readOnly={isMoradorCadastrado} placeholder="00.000.000-0"
                onChange={(e) => mudar("rg")(maskRG(e.target.value))} />
            </Field>
          </div>
          <Field label="Telefone" required>
            <Input value={formData.contato} inputMode="tel" placeholder="(00) 00000-0000"
              onChange={(e) => mudar("contato")(maskPhone(e.target.value))} />
          </Field>

          <div className="mud-form__par">
            <Field label="Tipo">
              <Opcoes rotulo="Tipo" valor={formData.tipo || "Entrada"} onMudar={mudar("tipo")} opcoes={["Entrada", "Saída"]} />
            </Field>
            <Field label="Turno">
              <Opcoes rotulo="Turno" valor={formData.periodo || "Manhã"} onMudar={mudar("periodo")} opcoes={["Manhã", "Tarde"]} />
            </Field>
          </div>
          <div className="mud-form__par">
            <Field label="Início" required>
              <Input type="datetime-local" value={formData.data_mudanca} onChange={(e) => mudar("data_mudanca")(e.target.value)} />
            </Field>
            <Field label="Previsão de término" required>
              <Input type="datetime-local" value={formData.data_fim} onChange={(e) => mudar("data_fim")(e.target.value)} />
            </Field>
          </div>

          <Field label="Quem monitora" help="Quem da equipe acompanha a mudança no dia">
            <Opcoes rotulo="Quem monitora" valor={formData.monitor || ""} onMudar={mudar("monitor")}
              opcoes={[["", "Ninguém"], ...MONITORES]} />
          </Field>

          <Field label="Situação">
            <Opcoes rotulo="Situação" valor={formData.status} onMudar={mudar("status")} opcoes={SITUACOES} />
          </Field>
          <Field label="Observações">
            <Textarea rows={3} value={formData.obs || ""} placeholder="Algo importante sobre a mudança"
              onChange={(e) => mudar("obs")(e.target.value)} />
          </Field>
        </form>
      </Modal>

      {/* ---- Exportação ---- */}
      <Modal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Exportar mudanças"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowExportModal(false)}>Cancelar</Button>
            <Button onClick={exportToExcel} iconLeft={<Download size={15} />}>Excel</Button>
            <Button variant="primary" onClick={exportToPDF} iconLeft={<FileText size={15} />}>PDF</Button>
          </>
        }
      >
        <p className="vit-modal__desc mud-exporta">
          {dadosFiltrados.length === festas.length
            ? `Serão exportadas as ${dadosFiltrados.length} mudanças.`
            : `Serão exportadas as ${dadosFiltrados.length} mudanças que passam nos filtros atuais, de ${festas.length} no total.`}
        </p>
        <p className="vit-field__label mud-exporta">Colunas do PDF</p>
        <div className="exp-colunas">
          {selectedColumns.map((col) => (
            <button
              key={col.id}
              type="button"
              className={`exp-coluna${col.selected ? " exp-coluna--marcada" : ""}`}
              onClick={() => handleToggleColumn(col.id)}
              aria-pressed={col.selected}
            >
              {col.selected ? <CheckCircle2 size={18} /> : <Circle size={18} />}
              <span>{col.label}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
