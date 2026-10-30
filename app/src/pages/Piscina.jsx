 
/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
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
import { toJpeg } from "html-to-image";
import * as htmlToImage from "html-to-image";

// Exibição de imagens/arquivos do Drive via backend autenticado (getFoto):
// componente compartilhado — ver src/components/DriveImage.jsx.
import { DriveImage, fetchFotoCached, prefetchFoto, extrairFileIdDrive, abrirArquivoDrive, carregarComoDataUrl } from "../components/DriveImage";
import { listar, criar, editar, remover } from "../api/db";
import { entregarArquivo, nomeDeArquivo, BAIXADO } from "../lib/baixar";

import { enviarAnexo, urlDoAnexo, removerAnexo, removerAnexosDoRegistro } from "../api/anexos";
import { maskCPF, maskRG, maskPhone, maskCPFPrivacy, maskRGPrivacy, formatCurrency } from "../lib/format";
import { converterUrlDrive, extrairIdDrive, sanitizarCelula, validarAnexo } from "../lib/drive";
import { useToast, useConfirm, Ocupado, Input, Button, PageHeader, Modal } from "../ui";

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
const badgeGreen = { backgroundColor: '#E5F0E7', color: '#24503A', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' };
const badgeRed = { backgroundColor: '#F7E4DD', color: '#8E3419', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' };
const paginationFooter = { padding: '15px 24px', borderTop: '1px solid', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const modalOverlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(23, 35, 27, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalContent = { padding: '24px', borderRadius: '20px', width: '90%' };
const modalHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' };
const labelStyle = { fontSize: '11px', fontWeight: '700', marginBottom: '5px', display: 'block', textTransform: 'uppercase', color: 'var(--fg-muted)' };
const selectStyle = { padding: '10px', borderRadius: '8px', border: '1px solid', outline: 'none', fontSize: '14px' };
const viewBox = { padding: '12px', borderRadius: '12px', fontSize: '13px', border: '1px solid', lineHeight: '1.6' };

// `piscina` é administrativo: pelas políticas do 0015, porteiro e conselheiro
// não alcançam — é aqui que está o atestado médico. A mensagem do Postgres fala
// de row-level security, que não diz nada a quem está na tela.
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para alterar cadastros da piscina.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Sem conexão com o servidor. Tente de novo.";
  }
  return msg;
};

export default function Piscina({ user }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const { theme } = useTheme();

  const [isDownloading, setIsDownloading] = useState(false); // Sugestão: estado para o loader do botão
  const [loading, setLoading] = useState(false);
  const [festas, setFestas] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [moradores, setMoradores] = useState([]);
  const [uploads, setUploads] = useState([]); // Guardar os uploads brutos
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [currentUser, setCurrentUser] = useState({ nome: "Sistema" });
  
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedFesta, setSelectedFesta] = useState(null);
  const [modalType, setModalType] = useState("add");
  const [showMenuId, setShowMenuId] = useState(null);
  const menuRef = useRef(null);

  // A arte do template tem 1011px de largura. Todo tamanho do cartão é escrito
  // nessa medida e multiplicado por `escala`, senão o texto — que estava em
  // `rem`, portanto fixo em pixels — não encolhe junto com o cartão: no celular
  // o nome descia em cima de Unidade e Validade. Também é o que faz a imagem
  // baixada sair igual em qualquer tela.
  const LARGURA_ARTE = 1011;
  const cartaoRef = useRef(null);
  // Começa na proporção em que o cartão foi desenhado (500px de largura) e
  // mede antes da pintura, senão o primeiro quadro sai com o texto no tamanho
  // da arte inteira — letra gigante piscando dentro do modal.
  const [escala, setEscala] = useState(500 / 1011);
  const d = (n) => `${(n * escala).toFixed(2)}px`;

  useLayoutEffect(() => {
    if (!showViewModal) return;
    const el = cartaoRef.current;
    if (!el) return;

    const medir = () => {
      const largura = el.offsetWidth;
      if (largura > 0) setEscala(largura / LARGURA_ARTE);
    };
    medir();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", medir);
      return () => window.removeEventListener("resize", medir);
    }
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [showViewModal, selectedFesta?.id]);

  const baixarCarteirinha = async () => {
    if (!selectedFesta || isDownloading) return;

    const node = cartaoRef.current;
    let restaurarFoto = () => {};
    setIsDownloading(true);

    try {
      if (!node) throw new Error("A carteirinha não está na tela.");

      // Os bytes da foto, em base64, venha ela de onde vier. Antes isto raspava
      // um fileId de `url_foto` e chamava o getFoto. Depois da migração,
      // `url_foto` das 204 fichas antigas é link assinado do bucket — a raspagem
      // devolvia lixo, o getFoto negava, e a carteirinha parava de baixar para
      // quem já existia. `carregarComoDataUrl` decide pelo endereço e embute o
      // base64, que é o que o html-to-image precisa para não sujar o canvas.
      const fotoBase64 = selectedFesta.url_foto
        ? await carregarComoDataUrl(selectedFesta.url_foto)
        : null;

      // Sem foto o cadastro continua valendo, e o cartão sai com o ícone. Antes
      // isto era `throw`: quem não tinha foto nunca conseguia baixar.
      const imgNode = fotoBase64 ? node.querySelector("img") : null;
      if (imgNode) {
        const srcOriginal = imgNode.src;
        restaurarFoto = () => { imgNode.src = srcOriginal; };
        imgNode.src = fotoBase64;
        await new Promise((resolve) => {
          if (imgNode.complete) return resolve();
          imgNode.onload = resolve;
          imgNode.onerror = resolve;
          setTimeout(resolve, 1500);
        });
      }

      // O cartão mede larguras diferentes em cada tela; o pixelRatio compensa
      // para o arquivo sair sempre com ~2022px de largura. Sem isto, a
      // carteirinha baixada no celular saía com menos da metade da resolução da
      // baixada no computador.
      const largura = node.offsetWidth || LARGURA_ARTE;
      const opcoes = {
        pixelRatio: Math.min(8, Math.max(1, (LARGURA_ARTE * 2) / largura)),
        skipAutoScale: true,
        backgroundColor: "#ffffff",
      };

      // Duas passadas de propósito. O html-to-image desenha num <foreignObject>
      // e o Safari — o do iPhone inclusive — devolve a primeira captura sem as
      // imagens que ainda não estavam no cache dele. A segunda sai completa.
      await htmlToImage.toBlob(node, opcoes);
      const blob = await htmlToImage.toBlob(node, opcoes);
      if (!blob) throw new Error("O navegador não conseguiu gerar a imagem.");

      const destino = await entregarArquivo(
        blob,
        nomeDeArquivo(`Carteirinha ${selectedFesta.nome}`, "png"),
      );
      if (destino === BAIXADO) toast.success("Carteirinha baixada.");
    } catch (err) {
      console.error("Erro ao gerar a carteirinha:", err);
      // A mensagem do erro vai junto: sem ela, "não foi possível" era tudo o que
      // sobrava de um defeito que só acontece no celular de outra pessoa.
      toast.error(`Não foi possível gerar a carteirinha. ${err?.message || ""}`.trim());
    } finally {
      restaurarFoto();
      setIsDownloading(false);
    }
  };

  const formatarNomeCarteirinha = (nome = "") => {
  const nomeCompleto = nome.trim();
  if (!nomeCompleto) return "-";

  const preposicoes = ["da", "de", "do", "das", "dos"];

  let partes = nomeCompleto.split(" ");

  // Se couber, retorna tudo
  if (nomeCompleto.length <= 22) return nomeCompleto;

  // Sempre remove o último sobrenome primeiro
  if (partes.length > 2) {
    partes = partes.slice(0, -1);
  }

  // LIMPEZA FINAL INTELIGENTE
  while (partes.length > 1) {
    const ultimo = partes[partes.length - 1].toLowerCase();

    // remove preposição
    if (preposicoes.includes(ultimo)) {
      partes.pop();
      continue;
    }

    // remove palavras de 1 letra (tipo "d", "a", etc)
    if (ultimo.length <= 1) {
      partes.pop();
      continue;
    }

    break;
  }

  return partes.join(" ");
};

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterDivergencia, setFilterDivergencia] = useState("Todos");
  const [filterData, setFilterData] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [isMoradorCadastrado, setIsMoradorCadastrado] = useState(false);
  
  const [formData, setFormData] = useState({
  id_unidade: "",
  id_morador: "", // Pode ser vazio para "Avulso"
  nome: "",
  cpf: "", // Inicialize aqui
  nascimento: "",
  telefone: "",
  validade: "",
  status: "Ativo",
  obs: "",
  fotoBase64: "",    // Novo
  atestadoBase64: "" // Novo
});

  const [filterPeriodo, setFilterPeriodo] = useState({ inicio: "", fim: "" });
  const [filterPago, setFilterPago] = useState("Todos");
  

  const btnSaveStyles = {
    ...btnNew,
    backgroundColor: 'var(--btn-primary-bg)',
    color: '#ffffff',
    width: '100%',
    justifyContent: 'center',
    marginTop: '10px',
    border: theme.isDark ? '1px solid #7BA482' : 'none'
  };

  
const [sortConfig, setSortConfig] = useState([]); // Inicializa como array vazio
  // Funções de Máscara

// Função para limpar o timestamp e mostrar apenas a data
const formatarDataExibicao = (dateStr) => {
  if (!dateStr) return "";
  // Pega apenas a parte antes do espaço ou do "T"
  const apenasData = dateStr.split(' ')[0].split('T')[0]; 
  
  // Se a data vier no formato YYYY-MM-DD, converte para DD/MM/YYYY
  if (apenasData.includes('-')) {
    const [year, month, day] = apenasData.split('-');
    return `${day}/${month}/${year}`;
  }
  return apenasData; // Retorna DD/MM/YYYY se já estiver correto
};

const [showUnitDropdown, setShowUnitDropdown] = useState(false);
const [unitSearch, setUnitSearch] = useState("");
const dropdownRef = useRef(null);

// Função para exibir o texto da unidade selecionada no seletor
const getUnitLabel = (id) => {
  const u = unidades.find(unit => unit.id.toString() === id.toString());
  return u ? `BLOCO ${u.bloco} - UNIDADE ${u.unidade}` : "Selecione a Unidade...";
};

// Filtro da lista de unidades baseado no que o usuário digita
// Filtro e Ordenação da lista de unidades
const unidadesFiltradas = unidades
  .filter(u => 
    u.bloco.toString().toLowerCase().includes(unitSearch.toLowerCase()) || 
    u.unidade.toString().toLowerCase().includes(unitSearch.toLowerCase())
  )
  .sort((a, b) => {
    // Primeiro ordena pelo Bloco
    const compareBloco = a.bloco.toString().localeCompare(b.bloco.toString(), undefined, { numeric: true });
    if (compareBloco !== 0) return compareBloco;
    
    // Se o bloco for igual, ordena pela Unidade
    return a.unidade.toString().localeCompare(b.unidade.toString(), undefined, { numeric: true });
  });

const converterLinkDrive = (url) => {
  if (!url) return null;

  // Extrai o ID
  const match = url.match(/[-\w]{25,}/);
  const fileId = match ? match[0] : null;

  if (fileId) {
    // Usamos o thumbnail com sz=w400 (mais estável) 
    // e adicionamos um timestamp para evitar cache travado
    const timestamp = new Date().getTime();
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400&t=${timestamp}`;
  }
  
  return url;
};

const [filterChurrasqueira, setFilterChurrasqueira] = useState("Todos");

const fileInputRef = useRef(null); // Adicione isso logo abaixo dos outros useStates

// Converte a data do banco (DD/MM/YYYY HH:mm) para o formato do input (YYYY-MM-DDTHH:mm)
const formatDateTimeForInput = (dateTimeStr) => {
  if (!dateTimeStr) return "";
  // Se vier com espaço (ex: 15/10/2023 14:00) ou com T (ISO)
  const separator = dateTimeStr.includes(' ') ? ' ' : 'T';
  const [datePart] = dateTimeStr.split(separator);
  
  if (datePart.includes('/')) {
    const [day, month, year] = datePart.split('/');
    return `${year}-${month}-${day}`;
  }
  return datePart;
};

  useEffect(() => {
    fetchData();
  
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
  
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenuId(null);
      }
  
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowUnitDropdown(false);
      }
    };
  
    document.addEventListener("mousedown", handleClickOutside);
  
    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

 const fetchData = async () => {
  try {
    setLoadingInitial(true);

    const [resPiscina, resUnidades, resMoradores, resUploads] = await Promise.all([
      listar("PISCINA"),
      listar("UNIDADES"),
      listar("MORADORES"),
      listar("UPLOADS_PISCINA"),
    ]);

    // Cadastro novo guarda o arquivo no bucket e tem `caminho_foto`; os 204
    // antigos continuam no Drive, com `url_foto`. Resolver a URL assinada aqui
    // faz os seis pontos que exibem a foto funcionarem sem saber a diferença —
    // eles só enxergam `url_foto`, como sempre enxergaram.
    const listaRaw = await Promise.all(
      (Array.isArray(resPiscina) ? resPiscina : []).map(async (item) => ({
        ...item,
        url_foto: item.caminho_foto
          ? await urlDoAnexo({ caminho_storage: item.caminho_foto })
          : item.url_foto,
        url_atestado: item.caminho_atestado
          ? await urlDoAnexo({ caminho_storage: item.caminho_atestado })
          : item.url_atestado,
      }))
    );
    
    // Normalização para evitar problemas de Maiúsculas/Minúsculas
const dadosFormatados = listaRaw.map(item => {
  // Função interna para limpar "2026-02-27 00:00:00" para "2026-02-27"
  const limparData = (valor) => {
    if (!valor) return "";
    return String(valor).split(' ')[0].split('T')[0];
  };

  return {
    ...item,
    id: item.id || item.ID,
    nome: item.nome || item.Nome,
    id_unidade: item.id_unidade || item.ID_UNIDADE,
    nascimento: limparData(item.nascimento || item.NASCIMENTO),
    // Garantindo que a validade pegue a coluna correta (Coluna G ou validade_atestado)
    validade: limparData(item.validade_atestado || item.validade || item.VALIDADE_ATESTADO),
    // Mapeando o novo campo CPF
    cpf: item.cpf || item.CPF || "", 
    status: item.status || item.Status || "Ativo",
    obs: item.obs || item.OBS || ""
  };
}).filter(item => item.nome || item.id);

    setFestas(dadosFormatados); 
    setUnidades(Array.isArray(resUnidades) ? resUnidades : []);
    setMoradores(Array.isArray(resMoradores) ? resMoradores : []);
    
  } catch (error) { 
    console.error("ERRO CRÍTICO NO FETCH:", error); 
  } finally { 
    setLoadingInitial(false);
  }
};
  

const [showExportModal, setShowExportModal] = useState(false);
const [selectedColumns, setSelectedColumns] = useState([
  { id: 'id_unidade', label: 'Unidade', selected: true },
  { id: 'nome', label: 'Nome', selected: true },
  { id: 'nascimento', label: 'Nascimento', selected: true },
  { id: 'telefone', label: 'Telefone', selected: true },
  { id: 'validade_atestado', label: 'Validade Atestado', selected: true },
  { id: 'data_cadastro', label: 'Data Cadastro', selected: true },
  { id: 'obs', label: 'Obs', selected: true },
  { id: 'cpf', label: 'CPF', selected: true },
  { id: 'status', label: 'Status', selected: true }
]);

const exportToExcel = () => {
  // 1. Filtra apenas as colunas marcadas como 'selected: true'
  const colsAtivas = selectedColumns.filter(c => c.selected);

  const dadosParaExportar = dadosFiltrados.map(f => {
    const linha = {};

    // 2. Monta o objeto dinamicamente
    colsAtivas.forEach(col => {
      if (col.id === 'id_unidade') {
        // Pega o label "BLOCO 5 - UNIDADE 206" e transforma em "B5-206"
        const labelCompleto = getUnitLabel(f.id_unidade);
        linha["Unidade"] = sanitizarCelula(labelCompleto
          .replace(/BLOCO\s*/gi, 'B')      // Troca BLOCO por B
          .replace(/UNIDADE\s*/gi, '')    // Remove a palavra UNIDADE
          .replace(/\s*-\s*/g, '-')       // Garante que o traço não tenha espaços
          .trim());
      }
      else if (col.id === 'cpf') {
        linha["CPF"] = maskCPFPrivacy(f.cpf);
      } 
      else if (['nascimento', 'validade_atestado', 'data_cadastro'].includes(col.id)) {
        let valorData = f[col.id] || "-";
        
        // Se vier com data e hora (Timestamp), pega apenas a parte da data
        if (typeof valorData === 'string' && valorData.includes(' ')) {
          valorData = valorData.split(' ')[0];
        }
        
        linha[col.label] = valorData;
      }
      else {
        linha[col.label] = sanitizarCelula(f[col.id] || "");
      }
    });

    return linha;
  });

  const ws = XLSX.utils.json_to_sheet(dadosParaExportar);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Piscina");
  XLSX.writeFile(wb, "Relatorio_Piscina.xlsx");
  if (typeof setShowExportModal === 'function') setShowExportModal(false);
};

const handleToggleColumn = (id) => {
  setSelectedColumns(prev => prev.map(col => col.id === id ? { ...col, selected: !col.selected } : col));
};

const exportToPDF = () => {
  const doc = new jsPDF('l', 'mm', 'a4'); 
  const img = new Image(); 
  img.src = "/logo.png"; 

  const maskCPFPrivacy = (cpf) => {
    if (!cpf) return "";
    const clean = String(cpf).replace(/\D/g, "");
    if (clean.length < 11) return cpf;
    return `${clean.substring(0, 3)}.***.***-${clean.substring(9)}`;
  };

  const colsParaExportar = selectedColumns.filter(c => c.selected);
  const headers = colsParaExportar.map(c => c.label);
  
  const body = dadosFiltrados.map(f => colsParaExportar.map(c => {
    // 1. Tratamento para UNIDADE (Formato B5-206)
    // Se o seu ID for 'id_unidade' ou 'unidade_id', ajuste aqui:
    if(c.id === 'id_unidade' || c.id === 'unidade_id') {
      const labelCompleto = getUnitLabel(f.id_unidade || f.unidade_id);
      return sanitizarCelula(labelCompleto
        .replace(/BLOCO\s*/gi, 'B')      // Troca BLOCO por B
        .replace(/UNIDADE\s*/gi, '')    // Remove a palavra UNIDADE
        .replace(/\s*-\s*/g, '-')       // Remove espaços no traço
        .trim());
    }

    // 2. Tratamento para CPF (Máscara)
    if(c.id === 'cpf') return maskCPFPrivacy(f[c.id]);

    // 3. Tratamento para DATAS (Remove Timestamp / Horas)
    // Verifica se é um dos campos de data da sua planilha
    if(['data_cadastro', 'validade_atestado', 'nascimento', 'data_reserva'].includes(c.id)) {
      const valorData = f[c.id];
      if (!valorData) return "-";
      // Corta no primeiro espaço para ignorar o horário
      return valorData.toString().split(' ')[0];
    }

    return sanitizarCelula(f[c.id] || "");
  }));

  const gerarPDF = (incluirLogo = false) => {
    doc.setDrawColor(34, 197, 94); 
    doc.setLineWidth(1.5); 
    doc.rect(5, 5, 287, 200);
    if (incluirLogo) doc.addImage(img, 'PNG', 113, 12, 70, 25);
    
    doc.setFontSize(18); 
    doc.setTextColor(30, 41, 59);
    doc.text("Relatório de Cadastro - Piscina", 148, incluirLogo ? 45 : 25, { align: "center" });

    autoTable(doc, {
      startY: incluirLogo ? 55 : 35,
      head: [headers],
      body: body,
      headStyles: { fillColor: [34, 197, 94], halign: 'center', textColor: [255, 255, 255] },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      margin: { left: 10, right: 10 }
    });

    doc.save("Relatorio_Piscina.pdf");
    setShowExportModal(false);
  };

  img.onload = () => gerarPDF(true); 
  img.onerror = () => gerarPDF(false);
};
  // Função Robusta para buscar a foto (usada dentro e fora do fetchData)
  const getFotoFestaInterno = (festaId, listaDeUploads) => {
  if (!festaId || !listaDeUploads || !listaDeUploads.length) return null;
  
  const upload = listaDeUploads.find(up => {
    const idVinculo = up.id_festa || up.ID_FESTA || up.Id_Festa;
    return idVinculo?.toString() === festaId?.toString(); // O erro de digitação fesaId foi corrigido no bloco anterior, use festaId
  });

  if (!upload) return null;

  const urlRaw = upload.url_drive || upload.URL_DRIVE || upload.url;
  
  // Se for link do Google Drive, tenta converter para link de visualização direta (thumbnail)
  if (urlRaw && urlRaw.includes("drive.google.com")) {
    const fileId = urlRaw.match(/[-\w]{25,}/); // Extrai o ID do arquivo da URL
    return fileId ? `https://lh3.googleusercontent.com/u/0/d/${fileId}` : urlRaw;
  }

  return urlRaw;
};

  // Atalho para usar a função com o state atual de uploads
  const getFotoFesta = (festaId) => getFotoFestaInterno(festaId, uploads);
  // arquivoValido agora delega para lib/drive.validarAnexo, que devolve o
  // motivo em vez de chamar alert(). Quem decide como mostrar é a página.
  const arquivoValido = (file) => {
    const r = validarAnexo(file);
    if (!r.ok) toast.error(r.motivo);
    return r.ok;
  };

  const handleFileChange = (e, campo) => {
  const file = e.target.files[0];
  if (!file || !arquivoValido(file)) { e.target.value = ""; return; }
  if (file) {
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({
        ...prev,
        [campo]: reader.result // Guarda o Base64 (data:image/jpeg;base64,...)
      }));
    };
    reader.readAsDataURL(file);
  }
};

const handleDeleteImage = async (uploadId) => {
  const okRemover = await confirmar({
    title: "Remover este anexo?",
    description: "O anexo sai deste cadastro. Não dá para desfazer.",
    confirmLabel: "Remover",
    danger: true,
  });
  if (!okRemover) return;

  setLoadingGlobal(true);

  try {
    // UPLOADS_PISCINA, não UPLOADS_CHURRASQUEIRA. Estava assim desde antes da
    // migração: remover anexo aqui apagava da tabela da churrasqueira. Nunca
    // removia o anexo certo, e com um id coincidente apagaria o anexo alheio.
    const res = await remover("UPLOADS_PISCINA", uploadId);
    if (!res.success) { toast.error(mensagemErro(res.message)); setLoadingGlobal(false); return; }

    await fetchData();
    setLoadingGlobal(false);

  } catch (error) {
    console.error("Erro ao excluir:", error);
    setLoadingGlobal(false);
  }
};

const getFotosFestaInterno = (festaId, listaDeUploads) => {
  if (!festaId || !listaDeUploads) return [];
  
  return listaDeUploads
    .filter(up => {
      const idVinculo = up.id_festa || up.ID_FESTA || up.Id_Festa;
      return idVinculo?.toString() === festaId?.toString();
    })
    .map(up => up.url_drive || up.URL_DRIVE || up.url);
};
const handleSave = async () => {
  // 1. Validação de campos obrigatórios
  if (!formData.id_unidade || !formData.nome || !formData.validade) {
    toast.error("Preencha a unidade, o nome e a validade.");
    return;
  }

  // --- NOVA TRAVA DE SEGURANÇA: LIMITE DE 5 ATIVOS POR UNIDADE ---
  if (modalType === "add") {
    // Filtra na lista atual quantos moradores desta unidade estão com status "Ativo"
    const ativosNaUnidade = festas.filter(f => 
      String(f.id_unidade) === String(formData.id_unidade) && 
      f.status === "Ativo"
    );

    if (ativosNaUnidade.length >= 8) {
      toast.error(
        `A unidade ${formData.id_unidade} já tem 8 moradores ativos, que é o limite. ` +
        `Para cadastrar outro, marque um morador antigo como inativo.`
      );
      return; // Interrompe o salvamento
    }
  }
  // --------------------------------------------------------------

  setLoadingGlobal(true);

  // `nascimento` e `validade_atestado` são `date`: aceitam "AAAA-MM-DD" e
  // recusam string vazia, então campo em branco vira null.
  const dados = {
    id_unidade: Number(formData.id_unidade),
    id_morador: formData.id_morador || "AVULSO",
    nome: formData.nome,
    cpf: formData.cpf || null,
    nascimento: formData.nascimento ? formData.nascimento.split("T")[0] : null,
    telefone: formData.telefone || null,
    validade_atestado: formData.validade ? formData.validade.split("T")[0] : null,
    status: formData.status || "Ativo",
    obs: formData.obs || null,
  };

  try {
    const r = modalType === "add"
      ? await criar("PISCINA", { ...dados, created_by: user?.nome || "Sistema" })
      : await editar("PISCINA", formData.id, dados);

    if (!r.success) { toast.error(mensagemErro(r.message)); setLoadingGlobal(false); return; }

    // O id só existe depois do insert, e ele faz parte do caminho do arquivo
    // no bucket — por isso o upload vem depois de gravar a linha.
    const idRegistro = r.data?.id ?? formData.id;
    const caminhos = {};
    const substituidos = [];

    // Pastas separadas de propósito: a permissão do bucket é decidida pela
    // primeira pasta do caminho. Foto e atestado juntos ficariam presos à mesma
    // regra para sempre, e atestado é dado de saúde — ele vai querer ser mais
    // fechado que a foto um dia.
    for (const [campo, base64, anterior, pasta] of [
      ["caminho_foto", formData.fotoBase64, formData.caminho_foto, "piscina"],
      ["caminho_atestado", formData.atestadoBase64, formData.caminho_atestado, "piscina-atestados"],
    ]) {
      if (!base64) continue;
      const envio = await enviarAnexo(pasta, idRegistro, base64);
      if (!envio.success) {
        toast.error(`Arquivo não enviado: ${mensagemErro(envio.message)}`);
        continue;
      }
      caminhos[campo] = envio.caminho;
      // O arquivo que saiu de cena vira lixo no bucket — e lixo alcançável:
      // quem gerar uma URL assinada para ele continua abrindo. Num cadastro de
      // piscina isso é atestado médico de alguém.
      if (anterior) substituidos.push(anterior);
    }

    // Segunda gravação só quando houve arquivo novo. Falhar aqui deixa o
    // cadastro salvo e o arquivo no bucket sem vínculo — melhor que perder o
    // cadastro inteiro por causa de uma foto.
    if (Object.keys(caminhos).length > 0) {
      const rv = await editar("PISCINA", idRegistro, caminhos);
      if (!rv.success) toast.error("Cadastro salvo, mas o arquivo não ficou vinculado.");

      // Só depois do vínculo trocar. Apagar antes e falhar a gravação deixaria
      // o cadastro apontando para um arquivo que não existe mais.
      if (rv.success) {
        for (const caminho of substituidos) {
          const rm = await removerAnexo(caminho);
          // Pelas políticas do 0017 só o síndico apaga anexo. Um auxiliar
          // trocando a foto deixa o arquivo velho para trás, e avisar não
          // adianta nada para ele — quem precisa saber é o síndico.
          if (!rm.success) console.warn("Anexo substituído não removido:", caminho, rm.message);
        }
      }
    }

    setShowModal(false);
    await fetchData();
    setLoadingGlobal(false);

  } catch (error) {
    console.error(error);
    toast.error("Não foi possível conectar ao servidor. Verifique a conexão.");
    setLoadingGlobal(false);
  }
};
 const handleDelete = async (id) => {
  const okExcluir = await confirmar({
      title: "Excluir este cadastro?",
      description: "O cadastro sai da lista e a foto e o atestado são apagados do sistema. Não dá para desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (okExcluir) {
    setLoadingGlobal(true);

    try {
      // A linha PRIMEIRO, o arquivo depois — e a ordem é o ponto todo.
      //
      // Apagar o arquivo antes e a exclusão do cadastro falhar (por permissão,
      // por conexão) deixaria uma ficha viva sem foto e sem atestado, com o
      // original só no Drive. Perda irreversível pelo lado do usuário.
      //
      // Na ordem contrária, o pior caso é o inverso: cadastro excluído e
      // arquivo sobrando no bucket. Também é ruim — arquivo órfão continua
      // alcançável por URL assinada —, mas é visível, avisável e reparável,
      // enquanto o outro não.
      const result = await remover("PISCINA", id);

      if (result.success) {
        // As duas pastas, porque foto e atestado moram separados desde o 0019.
        // A varredura pega a pasta inteira em vez dos dois caminhos gravados:
        // o que a linha não referencia mais (foto trocada antes do 0018, envio
        // que falhou no meio) sumiria do sistema e continuaria no bucket.
        //
        // Quem chegou aqui é síndico — só ele apaga cadastro de piscina —, e
        // síndico também apaga anexo de piscina. Ninguém fica com meia
        // permissão e meio registro.
        const sobras = [];
        for (const pasta of ["piscina", "piscina-atestados"]) {
          const rm = await removerAnexosDoRegistro(pasta, id);
          if (!rm.success) sobras.push(`${pasta}: ${rm.message}`);
        }
        if (sobras.length) {
          console.warn("Arquivos não removidos do bucket:", sobras);
          toast.error("Cadastro excluído, mas algum arquivo continuou no sistema. Avise o suporte.");
        }

        await fetchData();
        setLoadingGlobal(false);
        if (typeof setShowMenuId === "function") setShowMenuId(null);
      } else {
        toast.error(mensagemErro(result.message));
        setLoadingGlobal(false);
      }

    } catch (error) {
      console.error("Erro ao excluir:", error);
      toast.error("Falha na comunicação com o servidor.");
      setLoadingGlobal(false);
    }
  }
};

const handleMoradorSelect = (id) => {
  // Se o ID for vazio (opção "Escolha..."), limpa os campos incluindo o CPF
  if (!id) {
    setFormData(prev => ({ 
      ...prev, 
      id_morador: "", 
      nome: "", 
      telefone: "",
      cpf: "" // Adicionado limpeza do CPF
    }));
    return;
  }

  // Busca o morador na lista de moradores
  const moradorEncontrado = moradores.find(m => m.id?.toString() === id.toString());

  if (moradorEncontrado) {
    setFormData(prev => ({
      ...prev,
      id_morador: id,
      nome: moradorEncontrado.nome || "",
      // Tenta buscar o CPF tanto em minúsculo quanto maiúsculo
      cpf: moradorEncontrado.cpf || moradorEncontrado.CPF || "", 
      telefone: moradorEncontrado.telefone || moradorEncontrado.celular || ""
    }));
  }
};

const toggleMoradorCadastrado = (checked) => {
  setIsMoradorCadastrado(checked);

  if (!checked) {
    setFormData(prev => ({
      ...prev,
      id_morador: "",
      nome: "",
      cpf: "",      // Limpa o CPF ao desmarcar
      telefone: ""
    }));
  }
};

  const dadosFiltrados = React.useMemo(() => {
  // Criamos uma cópia para não mutar o estado original 'festas'
  let resultado = [...festas];

  resultado = resultado.filter(f => {
    // 1. Filtro de Busca
    const matchesSearch = 
        (f.nome?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (f.id_unidade?.toString().includes(searchTerm)) ||
        (f.id?.toString().includes(searchTerm));
    
    // 2. Filtro de Status
    const matchesStatus = filterStatus === "Todos" || f.status === filterStatus;

    // 3. Filtro de Validade/Atestado
    let matchesData = true;
    if (filterPeriodo?.inicio || filterPeriodo?.fim) {
        if (!f.validade_atestado) { // Verifique se o nome da chave é validade ou validade_atestado
          matchesData = false;
        } else {
          // Ajuste para datas no formato DD/MM/AAAA que vêm do Sheets
          const converterData = (dStr) => {
            if (dStr.includes('/')) {
              const [d, m, a] = dStr.split('/');
              return new Date(a, m - 1, d);
            }
            return new Date(dStr);
          };

          const dataValidade = converterData(f.validade_atestado);
          if (filterPeriodo.inicio) {
              if (dataValidade < new Date(filterPeriodo.inicio)) matchesData = false;
          }
          if (filterPeriodo.fim) {
              if (dataValidade > new Date(filterPeriodo.fim)) matchesData = false;
          }
        }
    }

    return matchesSearch && matchesStatus && matchesData;
  });

  // --- ORDENAÇÃO (Tratando sortConfig como Array) ---
  if (Array.isArray(sortConfig) && sortConfig.length > 0) {
    resultado.sort((a, b) => {
      for (const { key, direction } of sortConfig) {
        let valA = a[key] ?? "";
        let valB = b[key] ?? "";

        if (key === 'id' || key === 'id_unidade') {
          valA = Number(valA.toString().replace(/\D/g, '')) || 0;
          valB = Number(valB.toString().replace(/\D/g, '')) || 0;
        } else {
          valA = valA.toString().toLowerCase();
          valB = valB.toString().toLowerCase();
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  return resultado;
}, [festas, searchTerm, filterStatus, filterPeriodo, sortConfig]);

// --- PAGINAÇÃO (Corrigida) ---
const totalPages = Math.ceil(dadosFiltrados.length / (itemsPerPage === "Todos" ? (dadosFiltrados.length || 1) : parseInt(itemsPerPage)));

const itensExibidos = React.useMemo(() => {
  if (itemsPerPage === "Todos") return dadosFiltrados;
  const limit = parseInt(itemsPerPage);
  const start = (currentPage - 1) * limit;
  return dadosFiltrados.slice(start, start + limit);
}, [dadosFiltrados, currentPage, itemsPerPage]);

const handleSort = (key) => {
  setSortConfig(prev => {
    const existing = prev.find(s => s.key === key);
    if (existing) {
      // Se já existe, inverte a ordem ou remove se for 'desc'
      if (existing.direction === 'asc') {
        return [{ key, direction: 'desc' }]; // Troca para desc
      }
      return []; // Se clicar a 3ª vez, limpa a ordenação
    }
    return [{ key, direction: 'asc' }]; // Nova ordenação
  });
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
        title="Exportar cadastros"
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
            ? `Serão exportados os ${dadosFiltrados.length} cadastros.`
            : `Serão exportados os ${dadosFiltrados.length} cadastros que passam nos filtros atuais, de ${festas.length} no total.`}
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
        mensagem={loadingInitial ? "Carregando cadastros..." : "Salvando..."}
      />

      <PageHeader
        title="Piscina"
        meta={
          loadingInitial
            ? "Carregando cadastros"
            : `${dadosFiltrados.length} de ${festas.length} cadastros`
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
                setFilterPago("Todos");
                setFilterChurrasqueira("Todos");
                setFilterPeriodo({ inicio: "", fim: "" });
                setFilterDivergencia("Todos");
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
                setIsMoradorCadastrado(false);
                setShowModal(true);
              }}
            >
              Novo cadastro
            </Button>
          </>
        }
      />

      <div className="res-filtros">
    <div style={{ display: "contents" }}>
        
        {/* LINHA 1: BUSCA POR UNIDADE/NOME */}
        <div style={{display:'flex', width: '100%'}}>
            <div className="cad-filtros__busca">
                <Search size={16} className="cad-filtros__lupa" aria-hidden="true" />
                <Input
                    value={searchTerm}
                    placeholder="Buscar unidade, nome ou CPF"
                    aria-label="Buscar unidade, nome ou CPF"
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                    }}
                />
            </div>
        </div>

        {/* LINHA 2: STATUS E VALIDADE JUNTOS */}
        <div style={{
            display:'flex', 
            flexDirection: isMobile ? 'column' : 'row', 
            gap: '20px', 
            alignItems: isMobile ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            borderTop: `1px solid ${theme.border}`,
            paddingTop: '15px'
        }}>
            
            {/* GRUPO STATUS */}
            <div style={{display:'flex', flexDirection: 'column', gap: '8px', flexShrink: 0}}>
                <span style={{fontSize: '10px', fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', marginLeft: '5px'}}>
                    Status
                </span>
                <div style={{display:'flex', gap:'6px'}}>
                    {["Todos", "Ativo", "Inativo", "Vencido"].map(s => (
                        <button 
                            key={s} 
                            className={`filter-pill ${filterStatus === s ? 'active' : ''}`} 
                            onClick={() => {
                                setFilterStatus(s);
                                setCurrentPage(1);
                            }}
                            style={{
                                whiteSpace: 'nowrap',
                                padding: '6px 12px',
                                fontSize: '12px'
                            }}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* GRUPO VALIDADE (Rótulo na frente das boxes) */}
            <div style={{
                display: 'flex', 
                flexDirection: isMobile ? 'column' : 'row', // Empilha só o título no mobile se não couber
                gap: '10px', 
                flex: 1, 
                alignItems: 'center',
                justifyContent: isMobile ? 'flex-start' : 'flex-end'
            }}>
                <span style={{
                    fontSize: '10px', 
                    fontWeight: '700', 
                    color: theme.textSecondary, 
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap' // Garante que o texto não quebre
                }}>
                    Validade:
                </span>

                <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: isMobile ? 'wrap' : 'nowrap'}}>
                    <div style={{...searchContainer, backgroundColor: theme.bg, borderColor: theme.border, padding: '5px 8px', width: isMobile ? '120px' : '130px'}}>
                        <Calendar size={14} color={theme.textSecondary} />
                        <input 
                            type="date" 
                            style={{background:'none', border:'none', color: theme.text, fontSize:'12px', width: '100%', outline: 'none'}} 
                            value={filterPeriodo.inicio} 
                            onChange={e => {
                                setFilterPeriodo({...filterPeriodo, inicio: e.target.value});
                                setCurrentPage(1);
                            }}
                        />
                    </div>
                    
                    <span style={{color: theme.textSecondary, fontSize: '12px'}}>até</span>
                    
                    <div style={{...searchContainer, backgroundColor: theme.bg, borderColor: theme.border, padding: '5px 8px', width: isMobile ? '120px' : '130px'}}>
                        <Calendar size={14} color={theme.textSecondary} />
                        <input 
                            type="date" 
                            style={{background:'none', border:'none', color: theme.text, fontSize:'12px', width: '100%', outline: 'none'}} 
                            value={filterPeriodo.fim} 
                            onChange={e => {
                                setFilterPeriodo({...filterPeriodo, fim: e.target.value});
                                setCurrentPage(1);
                            }}
                        />
                    </div>

                    {(filterPeriodo.inicio || filterPeriodo.fim) && (
                        <RotateCcw 
                            size={16} 
                            style={{cursor: 'pointer', color: theme.textSecondary}} 
                            onClick={() => {
                                setFilterPeriodo({inicio: "", fim: ""});
                                setCurrentPage(1);
                            }} 
                        />
                    )}
                </div>
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
      { label: "ID", key: "id" },
  { label: "Unidade", key: "id_unidade" },
  { label: "Nome", key: "nome" },
  { label: "Nascimento", key: "nascimento" },
  { label: "Telefone", key: "telefone" },
  { label: "Data Validade", key: "validade" },
  { label: "Status", key: "status" },
].map((col) => {
  const config = sortConfig.find(c => c.key === col.key);
  return (
  <th 
    key={col.key}
    style={{
      ...thStyle, 
      color: theme.textSecondary, 
      cursor: col.key !== 'acoes' ? 'pointer' : 'default', 
      userSelect: 'none'
    }}
    onClick={(e) => col.key !== 'acoes' && handleSort(col.key, e.shiftKey)}
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
    // Busca os dados da unidade (Bloco e Número) para exibir amigavelmente
    const unit = unidades.find(u => u.id?.toString() === f.id_unidade?.toString());
    
    return (
      <tr key={f.id} style={{ ...trStyle, borderBottom: `1px solid ${theme.border}` }}>
        
        {/* Coluna ID */}
        <td style={{ ...tdStyle, color: theme.textSecondary, fontSize: '12px' }}>
          {f.id}
        </td>

        {/* Coluna Unidade */}
        <td style={{ ...tdStyle, color: theme.text, textAlign: 'left' }}>
          <strong>{unit ? `B${unit.bloco} - ${unit.unidade}` : f.id_unidade}</strong>
        </td>

       {/* Coluna Nome (com Foto de Perfil) */}
<td style={{ ...tdStyle, color: theme.text }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
    {f.url_foto ? (
      <DriveImage
        source={f.url_foto}
        alt="Perfil"
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          objectFit: 'cover',
          border: `1px solid ${theme.border}`
        }}
      />
    ) : (
      <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: theme.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <User size={16} color={theme.textSecondary} />
      </div>
    )}
    <span style={{ fontWeight: '600' }}>{f.nome}</span>
  </div>
</td>

        {/* Coluna Nascimento */}
        <td style={{ ...tdStyle, color: theme.text }}>
          {f.nascimento ? f.nascimento.split('-').reverse().join('/') : "-"}
        </td>

        {/* Coluna Telefone */}
        <td style={{ ...tdStyle, color: theme.text }}>
          {f.telefone}
        </td>

        {/* Coluna Data Validade (Atestado) */}
        <td style={{ ...tdStyle, color: theme.text }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {f.validade ? f.validade.split('-').reverse().join('/') : "-"}
            {/* Ícone de alerta se o atestado estiver vencido */}
            {f.validade && new Date(f.validade) < new Date() && (
              <AlertCircle size={14} color="#B4472A" title="Atestado Vencido" />
            )}
          </div>
        </td>

      {/* Coluna Status */}
<td style={tdStyle}>
  <span style={{
    ...badgeGreen, // Mantém suas propriedades de padding e border-radius
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '12px',
    // Lógica de cores baseada no texto do status
    backgroundColor: 
      f.status === 'Inativo' ? '#F7E4DD' : 
      f.status === 'Ativo' ? '#E5F0E7' : 
      'var(--surface-3)', // Amarelo para 'Vencido'
    color: 
      f.status === 'Inativo' ? '#8E3419' : 
      f.status === 'Ativo' ? '#24503A' : 
      'var(--fg-secondary)'  // Marrom/Dourado para 'Vencido'
  }}>
    {f.status}
  </span>
</td>

        {/* --- COLUNA AÇÕES --- */}
        <td style={{ ...tdStyle, textAlign: 'right', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
            
            {/* Container do Olho + Asterisco */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Eye
                size={18}
                color={theme.brand}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => { prefetchFoto(f.url_foto); }}
                onTouchStart={() => { prefetchFoto(f.url_foto); }}
                onClick={() => { setSelectedFesta(f); setShowViewModal(true); }}
              />
              
              {/* Asterisco */}
              {((f.divergencia_local === "Sim" || f.divergencia_local === true) || (f.obs && (String(f.obs || "").trim()) !== "")) && (
                <span style={{
                  position: 'absolute',
                  top: '-10px',
                  right: '-8px',
                  color: '#B4472A',
                  fontWeight: 'bold',
                  fontSize: '20px',
                  pointerEvents: 'none'
                }}>
                  *
                </span>
              )}
            </div>

            {/* Menu de Opções */}
            <button 
              onClick={() => setShowMenuId(showMenuId === f.id ? null : f.id)} 
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <MoreVertical size={20} color={theme.textSecondary} />
            </button>
          </div>
                                    {showMenuId === f.id && (
    <div ref={menuRef} className="action-menu" style={{ right: '10px', top: '40px' }}>

        <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />

        <div className="menu-item" onClick={() => {
    setModalType("edit");

    // Função interna para converter qualquer formato de data para AAAA-MM-DD
    const paraInput = (valor) => {
        if (!valor) return "";
        // Se vier do Sheets como DD/MM/YYYY
        if (valor.includes('/')) {
            const [d, m, a] = valor.split(' ')[0].split('/');
            return `${a}-${m}-${d}`;
        }
        // Se vier como YYYY-MM-DD...
        return valor.split(' ')[0].split('T')[0];
    };

    setFormData({
        ...f,
        // Usando os nomes corretos das colunas da Piscina
        nascimento: paraInput(f.nascimento),
        validade: paraInput(f.validade) 
    });

    setShowModal(true);
    setShowMenuId(null);
}}>
            <Edit2 size={14} /> Editar
        </div>
        
        <div className="menu-item" style={{ color: '#B4472A' }} onClick={() => { handleDelete(f.id); setShowMenuId(null); }}>
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
        <h3 style={{ margin: 0 }}>{modalType === "add" ? "Novo Cadastro Piscina" : "Editar Cadastro"}</h3>
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
          <label htmlFor="checkMorador" style={{ fontSize: '13px', cursor: 'pointer' }}>Morador Cadastrado?</label>
        </div>

          {isMoradorCadastrado && (
  <div>
    <label style={labelStyle}>Selecionar Morador</label>
    <select 
      style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
      value={formData.id_morador || ""} // Adicione o value para manter sincronizado
      onChange={e => handleMoradorSelect(e.target.value)}
    >
      <option value="">Escolha...</option>
      {moradores
        .filter(m => m.id_unidade?.toString() === formData.id_unidade?.toString())
        .map(m => <option key={m.id} value={m.id}>{m.nome}</option>)
      }
    </select>
  </div>
)}

       {/* Nome, CPF e Telefone (Bloqueados se for morador cadastrado) */}
<div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr 1fr', gap: '10px', marginBottom: '15px' }}>
  {/* NOME */}
  <div>
    <label style={labelStyle}>Nome</label>
    <input 
      style={{ ...selectStyle, width: '100%', backgroundColor: isMoradorCadastrado ? theme.mainBg : theme.bg, color: theme.text, borderColor: theme.border, opacity: isMoradorCadastrado ? 0.7 : 1 }} 
      value={formData.nome} 
      readOnly={isMoradorCadastrado}
      onChange={e => setFormData({ ...formData, nome: e.target.value })} 
    />
  </div>

  {/* CPF (NOVO) */}
  <div>
    <label style={labelStyle}>CPF</label>
    <input 
      style={{ ...selectStyle, width: '100%', backgroundColor: isMoradorCadastrado ? theme.mainBg : theme.bg, color: theme.text, borderColor: theme.border, opacity: isMoradorCadastrado ? 0.7 : 1 }} 
      value={formData.cpf} 
      readOnly={isMoradorCadastrado}
      placeholder="000.000.000-00"
      onChange={e => setFormData({ ...formData, cpf: maskCPF(e.target.value) })} // Se tiver função de máscara
    />
  </div>

  {/* TELEFONE */}
  <div>
    <label style={labelStyle}>Telefone</label>
    <input 
      style={{ ...selectStyle, width: '100%', backgroundColor: isMoradorCadastrado ? theme.mainBg : theme.bg, color: theme.text, borderColor: theme.border, opacity: isMoradorCadastrado ? 0.7 : 1 }} 
      value={formData.telefone} 
      readOnly={isMoradorCadastrado}
      onChange={e => setFormData({ ...formData, telefone: maskPhone(e.target.value) })} 
    />
  </div>
</div>

        {/* Nascimento e Validade */}
        <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px'}}>
          <div>
            <label style={labelStyle}>Data Nascimento</label>
            <input 
              type="date"
              style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
              value={formData.nascimento} 
              onChange={e => setFormData({...formData, nascimento: e.target.value})} 
            />
          </div>
          <div>
            <label style={labelStyle}>Validade Atestado</label>
            <input 
              type="date"
              style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
              value={formData.validade} 
              onChange={e => setFormData({...formData, validade: e.target.value})} 
            />
          </div>
        </div>

        {/* Status */}
        <div style={{marginTop: '5px'}}>
          <label style={labelStyle}>Status de Acesso</label>
          <select 
            style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
            value={formData.status} 
            onChange={e => setFormData({...formData, status: e.target.value})}
          >
            <option value="Ativo">Ativo</option>
            <option value="Inativo">Inativo</option>
            <option value="Vencido">Vencido</option>
          </select>
        </div>

        {/* SEÇÃO DE ARQUIVOS (FOTO E ATESTADO) */}
        <div style={{ marginTop: '10px' }}>
          <label style={labelStyle}>Documentação (Foto e Atestado)</label>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            
            {/* Preview Foto Perfil */}
<div style={{ textAlign: 'center' }}>
  <div style={{ position: 'relative', width: '100px', height: '100px', margin: '0 auto' }}>
    
    {/* Círculo da Foto - Renderização Condicional */}
    <div style={{
      width: '100px',
      height: '100px',
      borderRadius: '50%',
      border: `2px solid ${theme.border}`,
      boxShadow: theme.isDark ? '0 4px 8px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.1)',
      backgroundColor: theme.bg, // Fundo padrão quando vazio
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative'
    }}>
      {/* SE houver foto (Base64 ou URL), mostra a imagem */}
      {(formData.fotoBase64 || formData.url_foto) ? (
        <DriveImage
          localSrc={formData.fotoBase64}
          source={formData.url_foto}
          alt="Perfil"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        /* CASO CONTRÁRIO, mostra o círculo vazio com um ícone de usuário padrão */
        <User size={40} color={theme.textSecondary} style={{ opacity: 0.5 }} />
      )}
    </div>

    {/* Input de Arquivo Oculto */}
    <input 
      type="file" 
      id="upload-foto" 
      accept="image/*" 
      style={{display:'none'}} 
      onChange={(e) => handleFileChange(e, 'fotoBase64')} 
    />
    

    {/* Botão de Upload (Ícone de Nuvem) */}
    <label 
      htmlFor="upload-foto" 
      style={{ 
        position: 'absolute', 
        bottom: 0, 
        right: 0, 
        background: 'var(--btn-primary-bg)', 
        color: 'white', 
        borderRadius: '50%', 
        padding: '7px', 
        cursor: 'pointer',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10
      }}
    >
      <UploadCloud size={16} />
    </label>
  </div>
  <span style={{fontSize: '10px', color: theme.textSecondary, marginTop: '6px', display: 'block'}}>
    Foto Perfil
  </span>
</div>

            {/* Preview Atestado (SEU CÓDIGO JÁ ESTAVA ASSIM) */}
    <div style={{ textAlign: 'center' }}>
       <div style={{ position: 'relative', width: '100px', height: '100px', margin: '0 auto' }}>
        <div style={{ width: '100px', height: '100px', backgroundColor: theme.bg, borderRadius: '8px', border: `2px dashed ${theme.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
           {formData.atestadoBase64 ? <CheckCircle2 color={theme.brand} /> : <FileText color={theme.textSecondary} />}
           <span style={{fontSize: '9px', marginTop: '5px'}}>{formData.atestadoBase64 ? "Carregado" : "Atestado"}</span>
        </div>
        <input type="file" id="upload-atestado" accept="image/*,application/pdf" style={{display:'none'}} onChange={(e) => handleFileChange(e, 'atestadoBase64')} />
        <label htmlFor="upload-atestado" style={{ position: 'absolute', bottom: -5, right: -5, background: 'var(--btn-primary-bg)', color: 'white', borderRadius: '50%', padding: '5px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
          <Plus size={14} />
        </label>
      </div>
      <span style={{fontSize: '10px', color: theme.textSecondary, marginTop: '5px', display: 'block'}}>Médico/PDF</span>
    </div>

  </div>
</div>
        {/* Observação (Sempre visível no cadastro da piscina) */}
        <div style={{ marginBottom: '15px' }}>
          <label style={labelStyle}>Observações</label>
          <textarea 
            style={{
              ...selectStyle, 
              width:'100%', 
              backgroundColor: theme.bg, 
              color: theme.text, 
              borderColor: theme.border,
              minHeight: '60px',
              fontFamily: 'inherit',
              padding: '10px',
              borderRadius: '8px',
              resize: 'vertical'
            }} 
            placeholder=""
            value={formData.obs || ""} 
            onChange={e => setFormData({...formData, obs: e.target.value})}
          />
        </div>

        <button 
          style={{
            backgroundColor: 'var(--btn-primary-bg)', color: 'white', border: 'none', padding: '12px', 
            borderRadius: '10px', fontWeight: '700', cursor: 'pointer', marginTop: '10px'
          }} 
          onClick={handleSave}
        >
          {loadingGlobal ? <Loader2 className="animate-spin" size={18}/> : "Salvar Cadastro"}
        </button>
      </div>
    </div>
  </div>
)}
      {/* MODAL VER MAIS - CORRIGIDO E ESTRUTURADO */}
      {/* Detalhe: arquetipo documento. Carteirinha a esquerda, cadastro a
          direita. Em coluna unica o cartao empurra os dados para fora da
          dobra e ninguem confere a validade do atestado, que e o campo que
          decide se o morador entra na piscina. */}
      <Modal
        open={showViewModal && Boolean(selectedFesta)}
        onClose={() => setShowViewModal(false)}
        title={selectedFesta?.nome || "Cadastro na piscina"}
        size="lg"
        className="pis-doc"
        footer={
          <Button variant="ghost" onClick={() => setShowViewModal(false)}>Fechar</Button>
        }
      >
        {selectedFesta && (
          <div className="pis-doc__grade">
            <div className="pis-doc__cartao">
{/* Container da Carteirinha */}
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
  
  <div id="carteirinha-piscina" ref={cartaoRef} style={{
    width: '100%',
    maxWidth: '500px', 
    aspectRatio: '1011 / 639', 
    backgroundImage: `url(${window.location.origin}/template.jpg)`, 
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    position: 'relative',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
    fontFamily: '"Segoe UI", Roboto, sans-serif',
    color: '#333' 
  }}>

   {/* CONTAINER DA FOTO COM BORDA DUPLA AFASTADA */}
<div style={{ 
  position: 'absolute', 
  top: '18.1%',      // Ajustado (-0.7%)
  left: '6.4%',      // Ajustado (-0.7%)
  width: '28.3%',    
  height: '63.2%',   
  borderRadius: '50%', 
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  
  // PRIMEIRA BORDA (Colada na foto)
  border: '0.5px solid #83ab9f',
}}>
  
  {/* A SEGUNDA BORDA (Afastada) */}
  {/* Usamos um div absoluto para criar o anel externo sem interferir na foto */}
  <div style={{
    position: 'absolute',
    top: d(-8),
    left: d(-8),
    right: d(-8),
    bottom: d(-8),
    border: '0.4px solid #83ab9f',
    borderRadius: '50%',
    pointerEvents: 'none' // Garante que não atrapalhe cliques
  }} />

  {/* A FOTO EM SI */}
  <div style={{ 
    width: '100%', 
    height: '100%', 
    borderRadius: '50%', 
    overflow: 'hidden' 
  }}>
    {selectedFesta.url_foto ? (
      <DriveImage
        source={selectedFesta.url_foto}
        alt="Foto Morador"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center top'
        }}
      />
    ) : (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#EDEBE5' }}>
        {/* Cor fixa de proposito: esta area vira imagem baixada, entao nao pode
            seguir o tema. No escuro, var(--surface-3) sairia preto no arquivo. */}
        <User size={Math.max(16, Math.round(97 * escala))} color="#B0AEA6" />
      </div>
    )}
  </div>
</div>

   <div style={{ 
  position: 'absolute', 
  top: '31%', 
  left: '38%', 
  textAlign: 'left',
  width: '52%',
  overflow: 'hidden'
}}>
  <div style={{ fontSize: d(21), color: '#666', marginBottom: d(4), textTransform: 'uppercase' }}>
    Nome
  </div>

  <div style={{ 
    fontSize: (selectedFesta.nome || "").length > 16 ? d(27) : d(32), 
    fontWeight: '700', 
    color: '#1a1a1a', 
    textTransform: 'uppercase', 
    lineHeight: '1.1',
    whiteSpace: 'nowrap',
    letterSpacing: (selectedFesta.nome || "").length > 16 ? '-0.03em' : '-0.01em',
  }}>
    {formatarNomeCarteirinha(selectedFesta.nome)}
  </div>
</div>

    {/* BLOCO DE UNIDADE */}
    <div style={{ position: 'absolute', top: '53%', left: '38%', textAlign: 'left' }}>
      <div style={{ fontSize: d(21), color: '#666', marginBottom: d(4), textTransform: 'uppercase' }}>Unidade</div>
      <div style={{ fontSize: d(32), fontWeight: '700', color: '#1a1a1a' }}>
        {selectedFesta.id_unidade ? (
          getUnitLabel(selectedFesta.id_unidade)
            .replace(/BLOCO\s*|UNIDADE\s*/gi, '')
            .replace(/\s*-\s*/g, '-')
            .trim()
        ) : "-"}
      </div>
    </div>

    {/* BLOCO DE VALIDADE */}
    <div style={{ position: 'absolute', top: '53%', left: '68%', textAlign: 'left' }}>
      <div style={{ fontSize: d(21), color: '#666', marginBottom: d(4), textTransform: 'uppercase' }}>Validade</div>
      <div style={{ fontSize: d(32), fontWeight: '700', color: '#1a1a1a' }}>
        {selectedFesta.validade ? formatarDataExibicao(selectedFesta.validade) : "-"}
      </div>
    </div>

  </div>
</div>
<button
  onClick={baixarCarteirinha}
  disabled={isDownloading}
  style={{
    marginTop: "10px",
    padding: "10px 16px",
    minHeight: "44px",
    borderRadius: "8px",
    border: "none",
    background: "var(--btn-primary-bg)",
    color: "#fff",
    fontWeight: "700",
    cursor: isDownloading ? "wait" : "pointer",
    opacity: isDownloading ? 0.7 : 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px"
  }}
>
  {isDownloading
    ? <><Loader2 size={16} className="animate-spin" /> Gerando…</>
    : <><Download size={16} /> Baixar Carteirinha</>}
</button>
            </div>

            <div className="pis-doc__dados">

        {/* Cabeçalho com foto e identificação */}
<div style={{display:'flex', gap:'12px', alignItems:'center'}}>
  <div style={{width:72, height:72, borderRadius:10, overflow:'hidden', border:`1px solid ${theme.border}`, display:'flex', alignItems:'center', justifyContent:'center', background: theme.bg}}>
    {selectedFesta.fotoBase64 || selectedFesta.url_foto ? (
      <DriveImage
        localSrc={selectedFesta.fotoBase64}
        source={selectedFesta.url_foto}
        alt="Foto"
        style={{width:'100%', height:'100%', objectFit:'cover'}}
      />
    ) : (
      <User size={34} color={theme.textSecondary} />
    )}
  </div>
  <div>
    <div style={{fontSize:14, fontWeight:700, color: theme.text}}>{selectedFesta.nome || "-"}</div>
    <div style={{fontSize:12, color: theme.textSecondary}}>ID: {selectedFesta.id || "-"}</div>
    <div style={{fontSize:12, color: theme.textSecondary}}>{selectedFesta.id_unidade ? getUnitLabel(selectedFesta.id_unidade) : "-"}</div>
  </div>
</div>

        {/* Dados pessoais / cadastro */}
<div style={{...viewBox, backgroundColor: theme.bg, borderColor: theme.border}}>
  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
    {/* NOME (Movido para dentro do grid se preferir, ou mantido no cabeçalho) */}
    <div><strong>Nascimento:</strong><br/>{selectedFesta.nascimento ? formatarDataExibicao(selectedFesta.nascimento) : "-"}</div>
    
    {/* CPF ADICIONADO AQUI */}
    <div>
  <strong>CPF:</strong><br/>
  {/* Chamando a nova função maskCPFPrivacy */}
  {selectedFesta?.cpf ? maskCPFPrivacy(selectedFesta.cpf) : "-"}
</div>
    <div><strong>Telefone:</strong><br/>{selectedFesta.telefone || "-"}</div>
    
    <div><strong>Validade Atestado:</strong><br/>{selectedFesta.validade ? formatarDataExibicao(selectedFesta.validade) : "-"}</div>
    
    <div><strong>Status:</strong><br/>
      <span style={{
        display:'inline-block', padding:'4px 8px', borderRadius:8, fontWeight:700,
        backgroundColor: selectedFesta.status === 'Ativo' ? '#E5F0E7' : selectedFesta.status === 'Inativo' ? '#F7E4DD' : 'var(--surface-3)',
        color: selectedFesta.status === 'Ativo' ? '#24503A' : selectedFesta.status === 'Inativo' ? '#8E3419' : 'var(--fg-secondary)'
      }}>{selectedFesta.status || '-'}</span>
    </div>
  </div>

  {/* Sinaliza atestado vencido */}
  {selectedFesta.validade && new Date(selectedFesta.validade) < new Date() && (
    <div style={{marginTop:10, color:'#B4472A', fontWeight:700, display:'flex', alignItems:'center', gap:8}}>
      <AlertCircle size={16} /> Atestado vencido
    </div>
  )}
</div>

        {/* Observações */}
        <div style={{ ...viewBox, backgroundColor: theme.bg, borderColor: theme.border }}>
  <strong style={{ color: theme.text }}>Observações</strong>
  <div 
    style={{ 
      marginTop: 6, 
      color: theme.textSecondary, 
      whiteSpace: 'pre-wrap', 
      // --- Adicione estas linhas para evitar que o texto vaze ---
      wordBreak: 'break-word', 
      overflowWrap: 'break-word',
      fontSize: '0.9rem',
      lineHeight: '1.4'
    }}
  >
    {selectedFesta.obs || "-"}
  </div>
</div>

        {/* Atestado / Documento */}
<div style={{...viewBox, backgroundColor: theme.bg, borderColor: theme.border}}>
  <strong>Atestado / Documento</strong>
  <div style={{marginTop:8, display:'flex', gap:10, alignItems:'center'}}>
    {selectedFesta.atestadoBase64 ? (
      <div style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
        <CheckCircle2 color={theme.brand} />
        <small style={{color: theme.textSecondary}}>Atestado carregado (não salvo)</small>
      </div>
    ) : (selectedFesta.url_atestado || selectedFesta.id_atestado_drive) ? (
      <div style={{display:'flex', flexDirection:'column', gap: 5}}>
        {/* Segurança (N7/LGPD): atestado é privado dos dois lados — no bucket
            abre por URL assinada; no Drive, via getFoto autenticado.
            A ordem importa: linha migrada tem `caminho_atestado` E
            `id_atestado_drive` (a origem é preservada, nunca apagada).
            Perguntando pelo id primeiro, todo atestado migrado voltaria a bater
            no Drive — que não responde mais desde que o login saiu do Apps
            Script. `url_atestado` já chega como link assinado quando há
            caminho; quem resolve isso é o mapeamento do carregamento da lista. */}
        <button
          type="button"
          onClick={() => abrirArquivoDrive(
            selectedFesta.caminho_atestado
              ? selectedFesta.url_atestado
              : selectedFesta.id_atestado_drive || selectedFesta.url_atestado
          )}
          style={{background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--fg-brand)', fontWeight: 600, fontSize: 'inherit', display: 'flex', alignItems: 'center', gap: 4}}
        >
          <FileText size={16}/> Abrir Atestado
        </button>
      </div>
    ) : (
      <div style={{color: theme.textSecondary}}>Nenhum atestado anexado</div>
    )}
  </div>
</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}