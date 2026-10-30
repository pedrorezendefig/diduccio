 
/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { 
  Calendar, Search, Plus, Edit2, Trash2, X, Loader2, 
  ChevronLeft, ChevronRight, MoreVertical, Eye, DollarSign,
  FileText, Download, RotateCcw, CheckCircle2, AlertCircle, User, Paperclip, UploadCloud, ChevronDown
} from "lucide-react";
import { useTheme } from "../theme/useTheme";

// Bibliotecas para exportação
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { maskCPF, maskRG, maskPhone, maskCPFPrivacy, maskRGPrivacy, formatCurrency, dataParaMs } from "../lib/format";
import { converterUrlDrive, extrairIdDrive, sanitizarCelula, validarAnexo } from "../lib/drive";
import { useToast, useConfirm, Ocupado, Input, Button, PageHeader, Modal } from "../ui";
import { listar, criar, editar, remover } from "../api/db";

// `mudancas` é administrativo pelas políticas do 0015: porteiro e conselheiro
// não alcançam — a linha carrega cpf, rg e contato de quem está se mudando. A
// mensagem crua do Postgres fala de row-level security, que não diz nada a quem
// está na tela.
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para alterar mudanças.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Sem conexão com o servidor. Tente de novo.";
  }
  return msg;
};

// --- ESTILOS ---
const pageContainer = { padding: "20px", maxWidth: "1200px", margin: "0 auto" };
const btnNew = { color: 'white', border: 'none', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' };
const searchContainer = { display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px', borderRadius: '8px', border: '1px solid' };
const tableCard = { borderRadius: '16px', border: '1px solid', overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const thStyle = { textAlign: 'left', padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' };
const thRow = { borderBottom: '1px solid' };
const tdStyle = { padding: '16px 24px', fontSize: '14px' };
const trStyle = { transition: '0.2s' };
const badgeGreen = { backgroundColor: '#FEE4DC', color: '#B33320', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' };
const badgeRed = { backgroundColor: '#F9DEE3', color: '#8F1530', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' };
const paginationFooter = { padding: '15px 24px', borderTop: '1px solid', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const modalOverlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(40, 22, 18, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalContent = { padding: '24px', borderRadius: '20px', width: '90%' };
const modalHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' };
const labelStyle = { fontSize: '11px', fontWeight: '700', marginBottom: '5px', display: 'block', textTransform: 'uppercase', color: 'var(--fg-muted)' };
const selectStyle = { padding: '10px', borderRadius: '8px', border: '1px solid', outline: 'none', fontSize: '14px' };
const viewBox = { padding: '12px', borderRadius: '12px', fontSize: '13px', border: '1px solid', lineHeight: '1.6' };

export default function Festas({ user }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const { theme } = useTheme();
  
  const [festas, setFestas] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [moradores, setMoradores] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [currentUser, setCurrentUser] = useState({ nome: "Sistema" });
  const location = useLocation();
  
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedFesta, setSelectedFesta] = useState(null);
  const [modalType, setModalType] = useState("add"); // "add" ou "edit"
  const [showMenuId, setShowMenuId] = useState(null);
  const menuRef = useRef(null);
  // Guarda o timer que solta a tela depois do carregamento, para cancelá-lo se
  // a pessoa sair antes dele disparar.
  const timerCarregando = useRef(null);
  useEffect(() => () => clearTimeout(timerCarregando.current), []);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [isMoradorCadastrado, setIsMoradorCadastrado] = useState(false);
  
  const [formData, setFormData] = useState({
  id_unidade: "", morador: "", contato: "", data_mudanca: "",
  status: "Pendente", cpf: "", rg: "", 
  tipo: "Entrada", periodo: "Manhã", obs: "", data_fim: "" // Novos campos
});

const formatToInputDate = (dateStr) => {
  if (!dateStr) return "";
  
  // Se a data já estiver no formato ISO (YYYY-MM-DD...), apenas corta os primeiros 10 caracteres
  if (dateStr.includes("-") && dateStr.indexOf("-") === 4) {
    return dateStr.substring(0, 10);
  }

  // Se a data estiver no formato brasileiro (DD/MM/YYYY...)
  if (dateStr.includes("/")) {
    const parts = dateStr.split(" ")[0].split("/");
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  return dateStr;
};

const [filterTipo, setFilterTipo] = useState("Todos");
const [filterPeriodoRapido, setFilterPeriodoRapido] = useState("Todos");

const [showUnitDropdown, setShowUnitDropdown] = useState(false);
const [unitSearch, setUnitSearch] = useState("");
const dropdownRef = useRef(null);

// Função para exibir o texto da unidade selecionada no seletor
const getUnitLabel = (id) => {
  const u = unidades.find(unit => unit.id.toString() === id.toString());
  return u ? `BLOCO ${u.bloco} - UNIDADE ${u.unidade}` : "Selecione a Unidade...";
};

// Filtro da lista de unidades baseado no que o usuário digita
const unidadesFiltradas = unidades.filter(u => 
  u.bloco.toString().toLowerCase().includes(unitSearch.toLowerCase()) || 
  u.unidade.toString().toLowerCase().includes(unitSearch.toLowerCase())
);

  const [filterPeriodo, setFilterPeriodo] = useState({ inicio: "", fim: "" });
  const [filterTurno, setFilterTurno] = useState("Todos"); // Novo (Manhã/Tarde)

  const btnSaveStyles = {
    ...btnNew,
    backgroundColor: 'var(--btn-primary-bg)',
    color: '#ffffff',
    width: '100%',
    justifyContent: 'center',
    marginTop: '10px',
    border: theme.isDark ? '1px solid #EF7A5C' : 'none'
  };

  
const [sortConfig, setSortConfig] = useState([{ key: 'data_mudanca', direction: 'desc' }]);
  // Funções de Máscara

// Converte a data do banco (DD/MM/YYYY HH:mm) para o formato do input (YYYY-MM-DDTHH:mm)
const formatDateTimeForInput = (dateTimeStr) => {
  if (!dateTimeStr) return "";
  if (dateTimeStr.includes('/') && dateTimeStr.includes(' ')) {
    const [date, time] = dateTimeStr.split(' ');
    const [day, month, year] = date.split('/');
    return `${year}-${month}-${day}T${time}`;
  }
  return dateTimeStr.substring(0, 16);
};

  useEffect(() => {
    
  fetchData();
  const handleResize = () => setIsMobile(window.innerWidth < 768);
  window.addEventListener('resize', handleResize);

  const handleClickOutside = (e) => {
    // Fecha o menu de ações (três pontinhos)
    if (menuRef.current && !menuRef.current.contains(e.target)) {
      setShowMenuId(null);
    }
    // NOVO: Fecha o seletor de unidades se clicar fora dele
    if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
      setShowUnitDropdown(false);
    }
  };

  document.addEventListener("mousedown", handleClickOutside);
  return () => {
    window.removeEventListener('resize', handleResize);
    document.removeEventListener("mousedown", handleClickOutside);
  };
  
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
      else if (col.id === 'cpf') {
        linha["CPF"] = maskCPFPrivacy(f.cpf);
      } 
      else if (col.id === 'rg') {
        linha["RG"] = maskRGPrivacy(f.rg); // Aplica a máscara solicitada
      }
      else if (col.id === 'data_mudanca') {
        const data = f.data_mudanca?.split(' ')[0];
        linha["Data"] = data?.includes('-') ? data.split('-').reverse().join('/') : data;
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

  // Função interna para a máscara (pode declarar fora se preferir)
  const maskCPFPrivacy = (cpf) => {
    if (!cpf) return "";
    const clean = String(cpf).replace(/\D/g, "");
    if (clean.length < 11) return cpf;
    return `${clean.substring(0, 3)}.***.***-${clean.substring(9)}`;
  };

  const colsParaExportar = selectedColumns.filter(c => c.selected);
  const headers = colsParaExportar.map(c => c.label);
  
  const body = dadosFiltrados.map(f => colsParaExportar.map(c => {

    // 2. Tratamento específico para CPF (Máscara de Privacidade)
    if(c.id === 'cpf') return maskCPFPrivacy(f[c.id]);

    if(c.id === 'rg') return maskRGPrivacy(f[c.id]);

    // 3. Tratamento para UNIDADE (Para mostrar B1 - 101 em vez do ID)
    if(c.id === 'id_unidade') {
      const unit = unidades.find(u => u.id?.toString() === f.id_unidade?.toString());
      return sanitizarCelula(unit ? `B${unit.bloco} - ${unit.unidade}` : f.id_unidade);
    }

    // 4. Tratamento para DATA
    if(c.id === 'data_mudanca') return f[c.id]?.replace('T', ' ') || "";

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
  // arquivoValido agora delega para lib/drive.validarAnexo, que devolve o
  // motivo em vez de chamar alert(). Quem decide como mostrar é a página.
  const arquivoValido = (file) => {
    const r = validarAnexo(file);
    if (!r.ok) toast.error(r.motivo);
    return r.ok;
  };

  const handleFileChange = (e) => {
  const files = Array.from(e.target.files || []).filter(arquivoValido);
  if (files.length === 0) { e.target.value = ""; return; }
  if (files.length > 0) {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          // IMPORTANTE: O reader.result aqui já contém a informação se é PDF ou Imagem
          fotosNovas: [...(prev.fotosNovas || []), reader.result] 
        }));
      };
      reader.readAsDataURL(file);
    });
  }
};
const formatToInputDateTime = (dateStr) => {
  if (!dateStr) return "";

  try {
    const s = dateStr.toString().trim();

    // 1. Tratamento para formato brasileiro: "18/02/2026 15:15:59"
    if (s.includes('/')) {
      const [data, horaFull] = s.split(' ');
      const [d, m, y] = data.split('/');
      
      // Pega apenas os primeiros 5 caracteres da hora (HH:mm)
      const horaMinuto = horaFull ? horaFull.substring(0, 5) : "00:00";
      
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${horaMinuto}`;
    }

    // 2. Tratamento para formato ISO vindo da planilha: "2026-02-18 15:15:59"
    if (s.includes('-')) {
      const [data, horaFull] = s.replace('T', ' ').split(' ');
      const horaMinuto = horaFull ? horaFull.substring(0, 5) : "00:00";
      
      return `${data}T${horaMinuto}`;
    }

    return s;
  } catch (e) {
    console.error("Erro ao formatar data:", e);
    return "";
  }
};

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
      let dataExistenteISO = "";

      // Normalização da data para comparação YYYY-MM-DD
      if (f.data_mudanca.includes('/')) {
          const [d, m, y] = f.data_mudanca.split(' ')[0].split('/');
          dataExistenteISO = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      } else {
          dataExistenteISO = f.data_mudanca.split(' ')[0];
      }

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
    morador: formData.morador || null,
    cpf: formData.cpf || null,
    rg: formData.rg || null,
    contato: formData.contato || null,
    periodo: formData.periodo || "Manhã",
    data_mudanca: comFuso(formData.data_mudanca),
    data_fim: comFuso(formData.data_fim),
    status: formData.status || "Pendente",
    tipo: formData.tipo || "Entrada",
    obs: formData.obs || null,
  };

  try {
    const r = modalType === "add"
      ? await criar("MUDANCAS", { ...dados, created_by: user?.nome || "Sistema" })
      : await editar("MUDANCAS", formData.id, dados);

    if (!r.success) { toast.error(mensagemErro(r.message)); setLoadingGlobal(false); return; }

    setShowModal(false);
    await fetchData();

    setFormData({
      id_unidade: "", morador: "", contato: "", data_mudanca: "", data_fim: "",
      status: "Pendente", cpf: "", rg: "", tipo: "Entrada", periodo: "Manhã", obs: "",
    });
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
      setShowMenuId(null);

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
    cpf: mudanca.cpf || "",
    rg: mudanca.rg || ""
  });

  setShowModal(true);
  setShowMenuId(null); // Fecha o menu de opções (os três pontinhos)
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
    return matchesSearch && matchesStatus && matchesTipo && matchesData && matchesRapido && matchesTurno;
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
        } else if (key === 'valor_taxa' || key === 'id_unidade') {
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
}, [festas, searchTerm, filterStatus, filterTipo, filterPeriodo, filterPeriodoRapido, filterTurno, sortConfig]);

// --- 3. RE-DECLARAÇÃO DAS VARIÁVEIS DE PAGINAÇÃO (Resolve os erros de undefined) ---
const totalPages = Math.ceil(dadosFiltrados.length / (itemsPerPage === "Todos" ? dadosFiltrados.length : itemsPerPage));

const handleSort = (key, isShiftPressed) => {
  setSortConfig(prev => {
    let newConfig = [...prev];
    const index = newConfig.findIndex(c => c.key === key);

    if (index > -1) {
      if (newConfig[index].direction === 'asc') {
        newConfig[index] = { key, direction: 'desc' };
      } else {
        newConfig.splice(index, 1);
      }
    } else {
      const newItem = { key, direction: 'asc' };
      newConfig = isShiftPressed ? [...newConfig, newItem] : [newItem];
    }
    return newConfig;
  });
};

const itensExibidos = React.useMemo(() => {
  if (itemsPerPage === "Todos") return dadosFiltrados;
  const start = (currentPage - 1) * itemsPerPage;
  return dadosFiltrados.slice(start, start + itemsPerPage);
}, [dadosFiltrados, currentPage, itemsPerPage]);

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

  return (
    
    <div style={{...pageContainer, ...(isMobile ? { paddingTop: '70px' } : {})}}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
        .action-menu { 
    position: absolute; 
    right: 30px; 
    background: ${theme.mainBg}; 
    border: 1px solid ${theme.border}; 
    border-radius: 10px; 
    box-shadow: 0 4px 12px rgba(0,0,0,0.1); 
    z-index: 100; 
    width: 180px; /* <--- Aumente aqui */
    padding: 5px; 
}
    .column-select-item { 
  display: flex; 
  align-items: center; 
  gap: 10px; 
  padding: 12px; 
  border-radius: 10px; 
  border: 1px solid ${theme.border}; 
  cursor: pointer; 
  transition: 0.2s; 
}
.column-select-item:hover {
  background: ${theme.bg};
}
.column-select-item.active { 
  border-color: var(--brand-500); 
  background: var(--bg-active); 
}

/* Evita que o texto pule linha e garante alinhamento */
.menu-item { 
    display: flex; 
    align-items: center; 
    gap: 10px; 
    padding: 10px 12px; 
    font-size: 13px; 
    cursor: pointer; 
    border-radius: 6px; 
    color: ${theme.text}; 
    white-space: nowrap; /* <--- ADICIONE ISSO: impede de pular linha */
}
        .menu-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 13px; cursor: pointer; border-radius: 6px; color: ${theme.text}; }
        .menu-item:hover { background: ${theme.bg}; }
        .pagination-btn { background: none; border: 1px solid ${theme.border}; color: ${theme.text}; padding: 5px; border-radius: 5px; cursor: pointer; display: flex; align-items: center; }
        .pagination-btn:disabled { opacity: 0.3; cursor: not-allowed; }
      `}</style>

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
        <p className="vit-modal__desc" style={{ marginBottom: "var(--space-6)" }}>
          {dadosFiltrados.length === festas.length
            ? `Serão exportados os ${dadosFiltrados.length} mudanças.`
            : `Serão exportados os ${dadosFiltrados.length} mudanças que passam nos filtros atuais, de ${festas.length} no total.`}
        </p>

        <p className="vit-field__label" style={{ marginBottom: "var(--space-4)" }}>
          Colunas do PDF
        </p>
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

      <Ocupado
        open={loadingInitial || loadingGlobal}
        mensagem={loadingInitial ? "Carregando mudanças..." : "Salvando..."}
      />

      <PageHeader
        title="Mudanças"
        meta={
          loadingInitial
            ? "Carregando mudanças"
            : `${dadosFiltrados.length} de ${festas.length} mudanças`
        }
        actions={
          <>
            <Button onClick={() => setShowExportModal(true)} iconLeft={<FileText size={15} />}>
              Exportar
            </Button>
            <Button
              variant="ghost"
              iconLeft={<RotateCcw size={15} />}
              onClick={() => {
                setSearchTerm("");
                setFilterStatus("Todos");
                setCurrentPage(1);
              }}
            >
              Redefinir
            </Button>
            <Button
              variant="primary"
              iconLeft={<Plus size={16} />}
              onClick={() => {
                setModalType("add");
                setShowModal(true);
              }}
            >
              Nova mudança
            </Button>
          </>
        }
      />

      <div className="res-filtros">
    <div style={{ display: "contents" }}>
        
        {/* LINHA 1: BUSCA E STATUS */}
        <div className="res-filtros__linha">
            <div className="cad-filtros__busca">
                <Search size={16} className="cad-filtros__lupa" aria-hidden="true" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar unidade ou morador..."
                  aria-label="Buscar unidade ou morador..."
                />
            </div>
            
            <div className="res-filtros__rolagem">
                {["Todos", "Pendente", "Confirmado", "Realizado", "Cancelado"].map(s => (
                    <button key={s} className={`filter-pill ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>{s}</button>
                ))}
            </div>
        </div>

        {/* LINHA 2: TIPO, TURNO E PERÍODO */}
        <div className="res-filtros__linha">
            
            {/* Filtro Tipo (Entrada/Saída) */}
            <div className="res-filtros__rolagem">
                {["Todos", "Entrada", "Saída"].map(t => (
                    <button key={t} className={`filter-pill ${filterTipo === t ? 'active' : ''}`} onClick={() => setFilterTipo(t)}>
                        {t === "Todos" ? "Tipo: Todos" : t}
                    </button>
                ))}
            </div>

            {/* Filtro Turno (Manhã/Tarde) */}
            <div className="res-filtros__rolagem">
                {["Todos", "Manhã", "Tarde"].map(turno => (
                    <button key={turno} className={`filter-pill ${filterTurno === turno ? 'active' : ''}`} onClick={() => setFilterTurno(turno)}>
                        {turno === "Todos" ? "Turno: Todos" : turno}
                    </button>
                ))}
            </div>

            {/* Calendário */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, justifyContent: isMobile ? 'center' : 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ ...searchContainer, backgroundColor: theme.bg, borderColor: theme.border, padding: '5px 10px', minWidth: isMobile ? '100%' : '140px' }}>
                    <Calendar size={14} color={theme.textSecondary} />
                    <input type="date" style={{ background:'none', border:'none', color: theme.text, fontSize:'12px', outline:'none', width: '100%' }} value={filterPeriodo.inicio} onChange={e => setFilterPeriodo({...filterPeriodo, inicio: e.target.value})} />
                </div>

                <span style={{color: theme.textSecondary, fontSize: '12px', display: isMobile ? 'none' : 'block'}}>até</span>

                <div style={{ ...searchContainer, backgroundColor: theme.bg, borderColor: theme.border, padding: '5px 10px', minWidth: isMobile ? '100%' : '140px' }}>
                    <Calendar size={14} color={theme.textSecondary} />
                    <input type="date" style={{ background:'none', border:'none', color: theme.text, fontSize:'12px', outline:'none', width: '100%' }} value={filterPeriodo.fim} onChange={e => setFilterPeriodo({...filterPeriodo, fim: e.target.value})} />
                </div>

                {(filterPeriodo.inicio || filterPeriodo.fim) && (
                    <RotateCcw size={16} cursor="pointer" color={theme.textSecondary} onClick={() => setFilterPeriodo({inicio: "", fim: ""})} />
                )}
            </div>
        </div>
    </div>
</div>

      <div style={{...tableCard, backgroundColor: theme.mainBg, borderColor: theme.border}}>
        <div style={{ overflowX: 'auto' }}>
            <table style={{...tableStyle, minWidth: isMobile ? '700px' : 'auto'}}>
                <thead>
                    <tr style={{...thRow, borderBottomColor: theme.border, backgroundColor: theme.isDark ? 'var(--fg-default)' : 'var(--surface-2)'}}>
    {[
  { label: "Unidade", key: "id_unidade" },
  { label: "Responsável", key: "morador" },
  { label: "Data", key: "data_mudanca" },
  { label: "Tipo", key: "tipo" },       // Alterado de 'Valor' para 'Tipo'
  { label: "Período", key: "periodo" }, // Alterado de 'Pago' para 'Período'
  { label: "Status", key: "status" }
].map((col) => {
      const config = sortConfig.find(c => c.key === col.key);
      return (
        <th 
          key={col.key}
          style={{...thStyle, color: theme.textSecondary, cursor: 'pointer', userSelect: 'none'}}
          onClick={(e) => handleSort(col.key, e.shiftKey)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {col.label}
            {config && (config.direction === 'asc' ? " ↑" : " ↓")}
          </div>
        </th>
      );
    })}
    <th style={{...thStyle, textAlign: 'right', color: theme.textSecondary}}>Ações</th>
  </tr>
</thead>
                <tbody>
    {itensExibidos.map((f) => {
        const unit = unidades.find(u => u.id?.toString() === f.id_unidade?.toString());
        
        // Os tres chips abaixo saem inteiros dos tokens. Antes misturavam azul
        // e laranja do Tailwind com cinza fixo sobre var(--surface-3): no tema
        // escuro o texto cinza ficava ilegivel sobre o fundo escuro do token.
        const getPeriodoStyle = (periodo) => {
            if (periodo === "Manhã") return { backgroundColor: 'var(--brand-50)', color: 'var(--brand-700)' };
            if (periodo === "Tarde") return { backgroundColor: 'var(--alert-50)', color: 'var(--alert-700)' };
            return { backgroundColor: 'var(--surface-3)', color: 'var(--fg-secondary)' };
        };

        // Cores para Tipo de Mudança
        const getTipoStyle = (tipo) => {
            if (tipo === "Entrada") return { backgroundColor: 'var(--brand-100)', color: 'var(--brand-700)' };
            if (tipo === "Saída") return { backgroundColor: 'var(--alert-50)', color: 'var(--alert-700)' };
            return { backgroundColor: 'var(--surface-3)', color: 'var(--fg-secondary)' };
        };

        // Cores para Status
        const getStatusStyle = (status) => {
            switch (status) {
                case 'Pendente': return { backgroundColor: 'var(--surface-3)', color: 'var(--fg-secondary)' };
                case 'Agendado': return { backgroundColor: 'var(--brand-100)', color: 'var(--brand-700)' };
                case 'Realizado': return { backgroundColor: 'var(--brand-100)', color: 'var(--brand-700)' };
                case 'Cancelado': return { backgroundColor: 'var(--alert-50)', color: 'var(--alert-700)' };
                default: return { backgroundColor: 'var(--surface-3)', color: 'var(--fg-secondary)' };
            }
        };

        return (
            <tr key={f.id} style={{ ...trStyle, borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ ...tdStyle, color: theme.text }}>
                    <strong>{unit ? `B${unit.bloco} - ${unit.unidade}` : f.id_unidade}</strong>
                </td>
                
                <td style={{ ...tdStyle, color: theme.text }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: '600' }}>{f.morador}</span>
                        {f.cpf && (
                            <span style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px' }}>
                                {maskCPFPrivacy(f.cpf)}
                            </span>
                        )}
                    </div>
                </td>

               <td style={{ ...tdStyle, color: theme.text }}>
                    {(() => {
                        const dataBruta = f.data_mudanca || f.data_reserva;
                        if (!dataBruta) return "-";

                        // Remove o " 00:00" ou qualquer coisa após o espaço
                        const apenasData = dataBruta.toString().split(' ')[0];

                        // Se a data vier no formato AAAA-MM-DD (ISO), inverte
                        if (apenasData.includes('-')) {
                            return apenasData.split('-').reverse().join('/');
                        }
                        
                        return apenasData; // Retorna DD/MM/AAAA
                    })()}
                </td>

                {/* Tipo de Mudança: Entrada/Saída */}
                <td style={tdStyle}>
                    <span style={{ ...badgeGreen, ...getTipoStyle(f.tipo) }}>
                        {f.tipo || "Entrada"}
                    </span>
                </td>

                {/* Período: Manhã/Tarde */}
                <td style={tdStyle}>
                    <span style={{ ...badgeGreen, ...getPeriodoStyle(f.periodo) }}>
                        {f.periodo || "Manhã"}
                    </span>
                </td>

                {/* Status: Pendente, Confirmado, Realizado, Cancelado */}
                <td style={tdStyle}>
                    <span style={{ ...badgeGreen, ...getStatusStyle(f.status) }}>
                        {f.status}
                    </span>
                </td>

                <td style={{ ...tdStyle, textAlign: 'right', position: 'relative' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
        
        {/* Ícone do Olho com Alerta de Obs */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Eye 
                size={18} 
                color={theme.brand} 
                cursor="pointer" 
                onClick={() => { setSelectedFesta(f); setShowViewModal(true); }} 
            />
            {f.obs && f.obs.trim() !== "" && (
                <span style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-6px',
                    color: '#B8203F',
                    fontWeight: 'bold',
                    fontSize: '18px',
                    lineHeight: '1',
                    textShadow: theme.isDark ? '0 0 2px #000' : '0 0 2px #fff'
                }}>
                    *
                </span>
            )}
        </div>

        <button onClick={() => setShowMenuId(showMenuId === f.id ? null : f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <MoreVertical size={20} color={theme.textSecondary} />
        </button>
    </div>
                    
                    {showMenuId === f.id && (
                        <div ref={menuRef} className="action-menu" style={{ right: '10px', top: '40px', zIndex: 100 }}>
                            <div className="menu-item" onClick={() => { 
    setModalType("edit"); 
    
    // Importante: define se o morador é cadastrado para habilitar/desabilitar campos
    setIsMoradorCadastrado(!!f.id_morador); 

    setFormData({
        ...f, 
        // Agora a função limpa os segundos automaticamente
        data_mudanca: formatToInputDateTime(f.data_mudanca),
        data_fim: formatToInputDateTime(f.data_fim),
        obs: f.obs || "" // Evita que o campo de observação venha como undefined
    });
    
    setShowModal(true); 
    setShowMenuId(null); 
}}>
    <Edit2 size={14} /> Editar
</div>
                            
                            <div className="menu-item" style={{ color: '#B8203F' }} onClick={() => { handleDelete(f.id); setShowMenuId(null); }}>
                                <Trash2 size={14} /> Excluir
                            </div>
                        </div>
                    )}
                </td>
            </tr>
        );
    })}
</tbody>
            </table>
        </div>

        <div style={{
  ...paginationFooter,
  borderTopColor: theme.border,
  backgroundColor: theme.mainBg,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: isMobile ? "12px" : "0"
}}>

  {/* ESQUERDA: Exibir + Contador */}
  <div style={{ 
    display: "flex", 
    alignItems: "center", 
    gap: "20px" 
  }}>
    
    {/* Seletor Exibir */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '13px', color: theme.textSecondary }}>
        Exibir:
      </span>
      <select 
        value={itemsPerPage} 
        onChange={(e) => {
          const val = e.target.value;
          setItemsPerPage(val === "Todos" ? "Todos" : Number(val));
          setCurrentPage(1);
        }}
        style={{
          padding: '4px 8px',
          borderRadius: '6px',
          border: '1px solid ' + theme.border,
          backgroundColor: theme.bg,
          color: theme.text,
          fontSize: '13px',
          outline: 'none',
          cursor: 'pointer'
        }}
      >
        <option value={10}>10</option>
        <option value={20}>20</option>
        <option value={50}>50</option>
        <option value={100}>100</option>
        <option value="Todos">Todos</option>
      </select>
    </div>

    {/* Contador */}
    <div style={{ fontSize: '13px', color: theme.textSecondary }}>
      Exibindo <strong>{itensExibidos.length}</strong> de{" "}
      <strong>{dadosFiltrados.length}</strong> registros
    </div>

  </div>

  {/* DIREITA: Paginação */}
  {itemsPerPage !== "Todos" && (
    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
      <button 
        className="pagination-btn" 
        disabled={currentPage === 1} 
        onClick={() => setCurrentPage(c => c - 1)}
      >
        <ChevronLeft size={18}/>
      </button>

      <span style={{fontSize:'13px', color: theme.text}}>
        {currentPage} / {totalPages || 1}
      </span>

      <button 
        className="pagination-btn" 
        disabled={currentPage === totalPages || totalPages === 0} 
        onClick={() => setCurrentPage(c => c + 1)}
      >
        <ChevronRight size={18}/>
      </button>
    </div>
  )}

</div>

        </div>

    {showModal && (
  <div style={modalOverlay}>
    <div style={{ ...modalContent, backgroundColor: theme.mainBg, color: theme.text, maxWidth: '500px', width: isMobile ? 'calc(100% - 24px)' : '90%', maxHeight: '90vh', overflowY: 'auto', padding: isMobile ? '16px' : '24px' }}>
      <div style={modalHeader}>
        <h3 style={{ margin: 0 }}>{modalType === "add" ? "Nova Mudança" : "Editar Mudança"}</h3>
        <X size={20} cursor="pointer" onClick={() => setShowModal(false)} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxHeight: '70vh', overflowY: 'auto', padding: '5px' }}>

        {/* Campo Unidade com Busca Flutuante */}
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <label style={labelStyle}>Unidade</label>
          <div
            style={{
              ...selectStyle,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              backgroundColor: theme.bg,
              color: theme.text,
              borderColor: theme.border
            }}
            onClick={() => setShowUnitDropdown(!showUnitDropdown)}
          >
            <span>{formData.id_unidade ? getUnitLabel(formData.id_unidade) : "Selecione a unidade..."}</span>
            <ChevronDown size={16} />
          </div>

          {showUnitDropdown && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, width: '100%',
              backgroundColor: theme.mainBg, border: `1px solid ${theme.border}`,
              borderRadius: '8px', zIndex: 1200, boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
              marginTop: '4px', overflow: 'hidden'
            }}>
              <div style={{ padding: '8px' }}>
                <input
                  style={{
                    width: '100%', padding: '8px', borderRadius: '6px',
                    border: `1px solid ${theme.border}`, backgroundColor: theme.bg,
                    color: theme.text, boxSizing: 'border-box', outline: 'none'
                  }}
                  placeholder="Digite o bloco ou apto..."
                  autoFocus
                  value={unitSearch}
                  onChange={(e) => setUnitSearch(e.target.value)}
                />
              </div>
              <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                {unidadesFiltradas.length > 0 ? (
                  unidadesFiltradas.map(u => (
                    <div
                      key={u.id}
                      style={{
                        padding: '10px 15px', cursor: 'pointer', fontSize: '14px',
                        borderBottom: `1px solid ${theme.border}`
                      }}
                      onClick={() => {
                        setFormData({ ...formData, id_unidade: u.id });
                        setShowUnitDropdown(false);
                        setUnitSearch("");
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = theme.bg}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      BLOCO {u.bloco} - UNIDADE {u.unidade}
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '15px', textAlign: 'center', fontSize: '12px', opacity: 0.7 }}>
                    Nenhuma unidade encontrada
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Checkbox Morador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: '8px', backgroundColor: theme.bg }}>
          <input type="checkbox" id="checkMorador" checked={isMoradorCadastrado} onChange={e => toggleMoradorCadastrado(e.target.checked)} />
          <label htmlFor="checkMorador" style={{ fontSize: '13px', cursor: 'pointer', margin: 0 }}>Morador Cadastrado?</label>
        </div>

        {isMoradorCadastrado && (
          <div>
            <label style={labelStyle}>Selecionar Morador</label>
            <select 
              style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
              onChange={e => handleMoradorSelect(e.target.value)}
            >
              <option value="">Escolha...</option>
              {moradores
                .filter(m => m.id_unidade?.toString() === formData.id_unidade?.toString())
                .map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
        )}

        {/* Nome do Responsável */}
        <div>
          <label style={labelStyle}>Nome do Responsável</label>
          <input 
            style={{...selectStyle, width:'100%', backgroundColor: isMoradorCadastrado ? theme.mainBg : theme.bg, color: theme.text, borderColor: theme.border, opacity: isMoradorCadastrado ? 0.7 : 1}} 
            value={formData.morador} 
            readOnly={isMoradorCadastrado}
            onChange={e => setFormData({...formData, morador: e.target.value})} 
          />
        </div>

        {/* CPF e RG */}
        <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px'}}>
          <div>
            <label style={labelStyle}>CPF</label>
            <input 
              style={{...selectStyle, width:'100%', backgroundColor: isMoradorCadastrado ? theme.mainBg : theme.bg, color: theme.text, borderColor: theme.border, opacity: isMoradorCadastrado ? 0.7 : 1}} 
              value={formData.cpf} 
              readOnly={isMoradorCadastrado}
              onChange={e => setFormData({...formData, cpf: maskCPF(e.target.value)})} 
            />
          </div>
          <div>
  <label style={labelStyle}>RG</label>
  <input 
    style={{
      ...selectStyle, 
      width:'100%', 
      backgroundColor: isMoradorCadastrado ? theme.mainBg : theme.bg, 
      color: theme.text, 
      borderColor: theme.border, 
      opacity: isMoradorCadastrado ? 0.7 : 1
    }} 
    value={formData.rg || ""} 
    readOnly={isMoradorCadastrado}
    placeholder="Ex: 00.000.000-0"
    // GARANTA QUE A LINHA ABAIXO ESTEJA ASSIM:
    onChange={e => setFormData({...formData, rg: maskRG(e.target.value)})} 
  />
</div>
        </div>

        {/* Seção de Horários (Início e Fim) */}
<div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px', marginBottom: '15px'}}>
  <div>
    <label style={labelStyle}>Início da Mudança</label>
    <input 
      type="datetime-local" 
      style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
      value={formData.data_mudanca} 
      onChange={e => setFormData({...formData, data_mudanca: e.target.value})} 
    />
  </div>
  <div>
    <label style={labelStyle}>Previsão de Término</label>
    <input 
      type="datetime-local" 
      style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
      value={formData.data_fim} 
      onChange={e => setFormData({...formData, data_fim: e.target.value})} 
    />
  </div>
</div>

{/* Seção de Contato (Linha Única ou Grid com outro campo) */}
<div style={{marginBottom: '15px'}}>
  <label style={labelStyle}>Telefone Contato</label>
  <input 
    style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
    value={formData.contato} 
    onChange={e => setFormData({...formData, contato: maskPhone(e.target.value)})} 
    placeholder="(00) 00000-0000"
  />
</div>

        {/* NOVOS CAMPOS: Tipo e Período */}
        <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px'}}>
          <div>
            <label style={labelStyle}>Tipo de Mudança</label>
            <select 
              style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
              value={formData.tipo || "Entrada"} 
              onChange={e => setFormData({...formData, tipo: e.target.value})}
            >
              <option value="Entrada">Entrada</option>
              <option value="Saída">Saída</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Período</label>
            <select 
              style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
              value={formData.periodo || "Manhã"} 
              onChange={e => setFormData({...formData, periodo: e.target.value})}
            >
              <option value="Manhã">Manhã</option>
              <option value="Tarde">Tarde</option>
            </select>
          </div>
        </div>

        {/* Status */}
        <div>
          <label style={labelStyle}>Status</label>
          <select 
            style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
            value={formData.status} 
            onChange={e => setFormData({...formData, status: e.target.value})}
          >
            <option value="Pendente">Pendente</option>
            <option value="Agendado">Agendado</option>
            <option value="Realizado">Realizado</option>
            <option value="Cancelado">Cancelado</option>
          </select>
        </div>

        {/* NOVO CAMPO: Observações */}
<div>
  <label style={labelStyle}>Observações</label>
  <textarea 
    style={{
      ...selectStyle, 
      width:'100%', 
      backgroundColor: theme.bg, 
      color: theme.text, 
      borderColor: theme.border,
      minHeight: '80px',
      fontFamily: 'inherit',
      resize: 'vertical'
    }} 
    placeholder="Alguma observação importante sobre a mudança..."
    value={formData.obs || ""} 
    onChange={e => setFormData({...formData, obs: e.target.value})}
  />
</div>

        <button 
          style={{
            backgroundColor: 'var(--btn-primary-bg)', color: 'white', border: 'none', padding: '12px', 
            borderRadius: '10px', fontWeight: '700', cursor: 'pointer', marginTop: '10px',
            display: 'flex', justifyContent: 'center', alignItems: 'center'
          }} 
          onClick={handleSave}
          disabled={loadingGlobal}
        >
          {loadingGlobal ? <Loader2 className="animate-spin" size={18}/> : "Salvar Mudança"}
        </button>
      </div>
    </div>
  </div>
)}
      {/* MODAL VER MAIS - ATUALIZADO PARA MUDANÇAS */}
      {showViewModal && selectedFesta && (
        <div style={modalOverlay}>
          <div style={{...modalContent, backgroundColor: theme.mainBg, color: theme.text, maxWidth:'450px', width: isMobile ? 'calc(100% - 24px)' : '90%', maxHeight: '90vh', overflowY: 'auto', padding: isMobile ? '16px' : '24px'}}>
            <div style={modalHeader}>
              <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                <Calendar color={theme.brand}/> 
                <h3 style={{margin: 0}}>Detalhes da Mudança</h3>
              </div>
              <X onClick={() => setShowViewModal(false)} cursor="pointer"/>
            </div>

            <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
              
              {/* Identificação da Unidade e Morador */}
              <div style={{...viewBox, backgroundColor: theme.bg, borderColor: theme.border}}>
                <div style={{marginBottom: '8px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '4px'}}>
                  <strong style={{color: 'var(--fg-brand)'}}>
                    Unidade: {(() => {
                      const unit = unidades.find(u => u.id?.toString() === selectedFesta.id_unidade?.toString());
                      return unit ? `B${unit.bloco} - ${unit.unidade}` : selectedFesta.id_unidade;
                    })()}
                  </strong>
                </div>
                <strong>Responsável:</strong> {selectedFesta.morador} <br/>
                <strong>CPF:</strong> {selectedFesta.cpf || "N/D"} <br/>
                <strong>RG:</strong> {selectedFesta.rg || "N/D"} <br/>
                <strong>Contato:</strong> {selectedFesta.contato || "N/D"}
              </div>

              {/* Dados da Mudança (Horário Completo) */}
<div style={{...viewBox, backgroundColor: theme.bg, borderColor: theme.border}}>
  <strong>Tipo / Sentido:</strong> {selectedFesta.tipo === 'Entrada' ? '⬆ Entrada' : '⬇ Saída'} <br/>
  
  {/* Horários sem o box de fundo */}
  <div style={{ marginTop: '10px' }}>
    <div style={{ marginBottom: '4px' }}>
      <strong style={{ fontSize: '13px' }}>Início:</strong> 
      <span style={{ color: theme.text, marginLeft: '5px' }}>
        {selectedFesta.data_mudanca || "-"}
      </span>
    </div>
    <div style={{ marginBottom: '4px' }}>
      <strong style={{ fontSize: '13px' }}>Fim:</strong> 
      <span style={{ color: theme.text, marginLeft: '5px' }}>
        {selectedFesta.data_fim || "Não informado"}
      </span>
    </div>
  </div>

  <div style={{ marginTop: '8px' }}>
    <strong>Período / Turno:</strong> {selectedFesta.periodo || "Não informado"}
  </div>
</div>

              {/* Status e Observações */}
<div style={{
  ...viewBox, 
  backgroundColor: theme.bg, 
  borderColor: theme.border,
  wordBreak: 'break-word', // Força a quebra de palavras muito longas
  overflowWrap: 'anywhere'  // Garante que o texto não escape do limite horizontal
}}>
  <span><strong>Status:</strong> {selectedFesta.status}</span>
  
  {selectedFesta.obs && (
    <div style={{
      marginTop: '8px', 
      paddingTop: '8px', 
      borderTop: `1px solid ${theme.border}`, 
      fontSize: '13px'
    }}>
      <strong>Observações:</strong>
      <div style={{ 
        marginTop: '4px', 
        whiteSpace: 'pre-wrap', // Preserva quebras de linha manuais
        color: theme.textSecondary,
        lineHeight: '1.4'
      }}>
        {selectedFesta.obs}
      </div>
    </div>
  )}
</div>

              <button 
                onClick={() => setShowViewModal(false)}
                style={{
                  marginTop: '10px',
                  padding: '12px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'white',
                  border: 'none',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div> // FECHAMENTO DA DIV PRINCIPAL (PAGE CONTAINER)
  ); // FECHAMENTO DO RETURN
} // FECHAMENTO DA FUNCTION COMPONENTE