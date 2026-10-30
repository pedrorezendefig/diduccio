/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom"; // Se ainda não tiver
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
import { DriveImage, MiniaturaAnexo, abrirArquivoDrive } from "../components/DriveImage";
import { listar, criar, editar, remover } from "../api/db";
import { enviarAnexo, urlDoAnexo, removerAnexo, removerAnexosDoRegistro } from "../api/anexos";
import { maskCPF, maskRG, maskPhone, maskCPFPrivacy, maskRGPrivacy, formatCurrency, dataParaMs , dataBR} from "../lib/format";
import { converterUrlDrive, extrairIdDrive, sanitizarCelula, validarAnexo } from "../lib/drive";
import { useToast, useConfirm, Ocupado, Input, Button, PageHeader, Modal, Gaveta, Badge } from "../ui";

// `churrasqueira` é administrativo pelas políticas do 0015: porteiro e
// conselheiro não gravam. A mensagem crua do Postgres fala de row-level
// security, que não diz nada a quem está na tela.
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para alterar reservas da churrasqueira.";
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
const badgeGreen = { backgroundColor: '#E5F0E7', color: '#24503A', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' };
const badgeRed = { backgroundColor: '#F7E4DD', color: '#8E3419', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' };
const paginationFooter = { padding: '15px 24px', borderTop: '1px solid', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const modalOverlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(23, 35, 27, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalContent = { padding: '24px', borderRadius: '20px', width: '90%' };
const modalHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' };
const labelStyle = { fontSize: '11px', fontWeight: '700', marginBottom: '5px', display: 'block', textTransform: 'uppercase', color: 'var(--fg-muted)' };
const selectStyle = { padding: '10px', borderRadius: '8px', border: '1px solid', outline: 'none', fontSize: '14px' };
const viewBox = { padding: '12px', borderRadius: '12px', fontSize: '13px', border: '1px solid', lineHeight: '1.6' };

/** Iniciais para o avatar da gaveta: primeiro e último nome. */
function iniciaisDe(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** A planilha grava "Sim"/"Não", mas já apareceu "S" e "sim". */
const pagoSim = (v) => String(v ?? "").trim().toLowerCase().startsWith("s");

/** Linha rótulo/valor da gaveta de detalhe, igual à de Moradores. */
function Dado({ rotulo, valor, mono }) {
  const vazio = valor === null || valor === undefined || valor === "";
  return (
    <div className="vit-dado">
      <span className="vit-dado__rotulo">{rotulo}</span>
      <p className={
        "vit-dado__valor" +
        (mono ? " vit-dado__valor--mono" : "") +
        (vazio ? " vit-dado__valor--vazio" : "")
      }>
        {vazio ? "-" : valor}
      </p>
    </div>
  );
}

export default function Festas({ user }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const { theme } = useTheme();

  const abrirUrlSegura = (url) => {
    if (!url) return;
    const s = url.toString().trim();
    if (!/^https?:\/\//i.test(s)) { toast.error("Este link não é válido nem seguro."); return; }
    window.open(s, "_blank", "noopener,noreferrer");
  };

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
  // Guarda o timer que solta a tela depois do carregamento, para cancelá-lo se
  // a pessoa sair antes dele disparar.
  const timerCarregando = useRef(null);
  useEffect(() => () => clearTimeout(timerCarregando.current), []);
  const location = useLocation();

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterDivergencia, setFilterDivergencia] = useState("Todos");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [isMoradorCadastrado, setIsMoradorCadastrado] = useState(false);
  
  const [formData, setFormData] = useState({
    unidade_id: "", morador: "", contato: "", data_reserva: "",
    valor_taxa: "", pago: "Não", status: "Pendente", cpf: "", rg: "", convidados: "",
    foto: "" , churrasqueira: "", divergencia_local: false, // Novo campo checkbox
  obs: ""                   // Novo campo texto
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

  
const [sortConfig, setSortConfig] = useState([{ key: 'data_reserva', direction: 'asc' }]);
  // Funções de Máscara

const [showUnitDropdown, setShowUnitDropdown] = useState(false);
const [unitSearch, setUnitSearch] = useState("");
const dropdownRef = useRef(null);

// Função para exibir o texto da unidade selecionada no seletor
const getUnitLabel = (id) => {
  if (id === null || id === undefined || id === "") return "Selecione a Unidade...";
  const u = unidades.find(unit => String(unit.id) === String(id));
  return u ? `BLOCO ${u.bloco} - UNIDADE ${u.unidade}` : "Selecione a Unidade...";
};

// Filtro da lista de unidades baseado no que o usuário digita
const unidadesFiltradas = unidades.filter(u =>
  String(u.bloco ?? "").toLowerCase().includes(unitSearch.toLowerCase()) ||
  String(u.unidade ?? "").toLowerCase().includes(unitSearch.toLowerCase())
);

const verificarEAtualizarStatus = async (listaFestas) => {
  const agora = new Date();

  // Filtra apenas festas que precisam ser atualizadas
  const festasParaAtualizar = listaFestas.filter(f => {
    if (f.status !== "Agendado") return false;
    if (!f.data_reserva) return false;

    // `data_reserva` é `date` e chega "AAAA-MM-DD". A versão anterior partia de
    // "DD/MM/YYYY HH:mm", da planilha: com ISO ela montava um Invalid Date e a
    // comparação dava sempre falso — o status automático estava desligado sem
    // avisar. A data vence quando o dia seguinte começa.
    const dataFesta = new Date(`${String(f.data_reserva).split("T")[0]}T23:59:59`);
    if (Number.isNaN(dataFesta.getTime())) return false;

    return agora > dataFesta;
  });

  for (const festa of festasParaAtualizar) {
    // Só o campo que muda: devolver a linha inteira reenviaria colunas geradas
    // pelo banco e campos que só existem na tela, e o update recusaria a linha.
    const r = await editar("CHURRASQUEIRA", festa.id, { status: "Realizado" });
    // Silencioso: isto roda sozinho ao abrir a tela, e quem não tem permissão
    // de escrita veria um erro que não pediu e não pode resolver.
    if (!r.success) console.warn("Status automático não atualizado:", festa.id, r.message);
  }

  // Se houve atualizações, recarrega os dados (opcional, dependendo da sua necessidade de refresh)
  if (festasParaAtualizar.length > 0) {
    // Evite chamar fetchData() aqui para não criar loop infinito; 
    // em vez disso, atualize o estado local ou controle com uma flag.
  }
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
    
    const [resFestas, resUnidades, resMoradores, resUploads] = await Promise.all([
      listar("CHURRASQUEIRA"),
      listar("UNIDADES"),
      listar("MORADORES"),
      listar("UPLOADS_CHURRASQUEIRA"),
    ]);

    const listaFestas = Array.isArray(resFestas) ? resFestas : [];

    // Anexo novo vive no bucket; os antigos ficaram no Drive. Resolver aqui,
    // uma vez, deixa todos os pontos que exibem arquivo nesta tela lendo
    // `url_drive` como sempre leram, sem nenhum deles saber a diferença.
    const listaUploads = await Promise.all(
      (Array.isArray(resUploads) ? resUploads : []).map(async (up) => ({
        ...up,
        url_drive: (await urlDoAnexo(up)) ?? up.url_drive,
      }))
    );

    setUploads(listaUploads);

    // Mapeia os registros vinculando a foto/comprovante
    const festasComUpload = listaFestas.map(f => {
      const fotoUrl = getFotoFestaInterno(f.id, listaUploads);
      return { ...f, foto: fotoUrl };
    });

    setFestas(festasComUpload);
    verificarEAtualizarStatus(festasComUpload);

    const sortedUnidades = Array.isArray(resUnidades) ? [...resUnidades].sort((a, b) => {
      if (a.bloco !== b.bloco) return String(a.bloco).localeCompare(String(b.bloco), undefined, {numeric: true});
      return String(a.unidade).localeCompare(String(b.unidade), undefined, {numeric: true});
    }) : [];

    setUnidades(sortedUnidades);
    setMoradores(Array.isArray(resMoradores) ? resMoradores : []);
    
  } catch (error) { 
    console.error("Erro CORS no módulo de Churrasqueira:", error); 
  } finally { 
    // Suavização do loading
    //
    // O timer é guardado e cancelado ao desmontar. Sem isso ele dispara depois
    // da tela sair e chama `setLoadingInitial` num componente que não existe
    // mais — em produção o React engole calado; nos testes, o jsdom já foi
    // derrubado e o erro aparece como "window is not defined" numa pilha que
    // nem menciona esta tela. Era a origem de uma falha que só acontecia em
    // algumas execuções da suíte.
    clearTimeout(timerCarregando.current);
    timerCarregando.current = setTimeout(() => {
      setLoadingInitial(false);
    }, 300);
  }
};

  
  const gerarContratoPDF = (f) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let currentY = 15;

    const setNormal = () => { doc.setFont("helvetica", "normal"); doc.setFontSize(11); };
    const setBold = () => { doc.setFont("helvetica", "bold"); doc.setFontSize(11); };

    const checkPageBreak = (needed) => {
        if (currentY + needed > pageHeight - 25) {
            doc.addPage();
            currentY = 20;
        }
    };

    // Função ajustada para suportar alinhamento à ESQUERDA (natural) ou CENTRO
    const escreverFluxoMisto = (fragmentos, alinhamento = "left") => {
        let cursorX = margin;
        setNormal();

        if (alinhamento === "center") {
            const textoCompleto = fragmentos.map(p => p.t).join("");
            cursorX = (pageWidth - doc.getTextWidth(textoCompleto)) / 2;
        }

        fragmentos.forEach((p) => {
            doc.setFont("helvetica", p.b ? "bold" : "normal");
            const palavras = p.t.split(/(\s+)/);

            palavras.forEach((palavra) => {
                const largura = doc.getTextWidth(palavra);
                // Quebra de linha se ultrapassar a margem
                if (cursorX + largura > pageWidth - margin && palavra !== " ") {
                    cursorX = margin;
                    currentY += 7;
                    checkPageBreak(7);
                }
                doc.text(palavra, cursorX, currentY);
                cursorX += largura;
            });
        });
        currentY += 10;
    };

    // 1. LOGO
    try {
        doc.addImage('/logo.png', 'PNG', pageWidth / 2 - 25, currentY, 50, 25);
        currentY += 35;
    } catch (e) { currentY += 10; }

    // 2. CABEÇALHO
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("CONTRATO DE LOCAÇÃO E TERMO DE RESPONSABILIDADE", pageWidth / 2, currentY, { align: "center" });
    currentY += 8;
    doc.setFontSize(12);
    doc.text("CHURRASQUEIRA - CONDOMÍNIO DIDUCCIO", pageWidth / 2, currentY, { align: "center" });
    currentY += 15;

    // 3. TEXTO DE ABERTURA - JUSTIFICADO
    setNormal();
    const intro = "A reserva da Churrasqueira, está autorizada para churrascos, aniversários, chá de bebê, chá de cozinha. É expressamente proibido, para atividades políticas ou partidárias, religiosas, mercantis e jogos considerados de azar pela legislação pertinente.";
    const linesIntro = doc.splitTextToSize(intro, contentWidth);
    doc.text(linesIntro, margin, currentY, { align: 'justify', maxWidth: contentWidth });
    currentY += (linesIntro.length * 6) + 10;

    // 4. CORPO COM DADOS - AGORA À ESQUERDA (SEM JUSTIFICAR)
    const uniStr = f.unidade_id.toString();
    const bloco = uniStr.charAt(0);
    const unidadeNum = uniStr.substring(1);
    const dataReserva = dataBR(f.data_reserva) || "___/___/___";
    const churras = (f.churrasqueira || "___").toUpperCase();

    escreverFluxoMisto([
        { t: "Eu ", b: false },
        { t: f.morador.toUpperCase(), b: true },
        { t: ", portador do RG ", b: false },
        { t: f.rg || "__________", b: true },
        { t: " morador do bloco ", b: false },
        { t: bloco, b: true },
        { t: " apartamento ", b: false },
        { t: unidadeNum, b: true },
        { t: " telefone ", b: false },
        { t: f.contato || "__________", b: true },
        { t: " venho por intermédio deste solicitar a locação da churrasqueira ", b: false },
        { t: churras, b: true },
        { t: " para o dia ", b: false },
        { t: dataReserva, b: true },
        { t: " mediante o pagamento no valor de ", b: false },
        { t: `R$ ${f.valor_taxa || "50,00"}`, b: true },
        { t: ", no ato da assinatura (via pix) deste que se refere a taxa de locação, manutenção, conservação e limpeza. Como responsável estou ciente dos meus deveres e obrigações conforme consta:", b: false }
    ], "left"); // Forçado à esquerda para não bagunçar os espaços

    currentY += 2;

    // 5. REGRAS - JUSTIFICADAS
    const regras = [
        "1. Retirar e devolver as chaves da churrasqueira devidamente trancadas, na portaria no mesmo dia do término da cessão.",
        "2. Respeitar o horário para utilização da churrasqueira (das 9:00 horas às 22:00 horas). Tolerância até as 23:00 horas;",
        "3. O uso dos aparelhos sonoros devem ser utilizados com moderação nesse período, em observância ao regulamento interno e na lei do silêncio (50 dB permitido);",
        "4. Limpar a churrasqueira, recolhendo todos os objetos que estiverem no chão, tais como copos plásticos, guardanapos, pratinhos e bexigas, entre outros, incluindo também a parte externa ao redor da mesma;",
        "5. Zelar por todos os materiais e acessórios para uso que estão à disposição nos banheiros;",
        "6. Fazer uso apenas da churrasqueira ciente de que a quadra e a piscina não estão inclusos na reserva (para visitantes);",
        "7. Retirar barbantes, fios e etc..., que forem amarrados nos caibros;",
        "8. Não danificar as paredes usando pregos, colas e afins;",
        "9. Respeitar o limite máximo de convidados 20 pessoas na churrasqueira;",
        "10. Guardar mesas e cadeiras no lugar determinado, ou seja, onde foram encontrados;",
        "11. Convidados não poderão circular pelo condomínio, somente ao redor da churrasqueira;",
        "12. Carros de visitantes não podem entrar no condomínio;",
        "13. Deixar a lista de convidados um dia antes na portaria para não haver transtornos.",
        "14. Zelar pelas mesas e cadeiras disponibilizadas para uso na churrasqueira, devendo ser devolvidas em perfeito estado de conservação e no local de origem. Em caso de dano, quebra ou extravio de qualquer item, o responsável pela reserva deverá arcar integralmente com o custo de reparo ou reposição do material."
    ];

    regras.forEach(r => {
        setNormal();
        const lines = doc.splitTextToSize(r, contentWidth);
        checkPageBreak(lines.length * 7);
        doc.text(lines, margin, currentY, { align: 'justify', maxWidth: contentWidth });
        currentY += (lines.length * 6) + 2.5;
    });

    // 6. TERMO DE RESPONSABILIDADE - JUSTIFICADO
    currentY += 5;
    checkPageBreak(45);
    const termo = "Estou ciente que, após a utilização será feita a vistoria e caso haja alguma irregularidade, serei responsabilizado pelos danos, inclusive os causados por familiares, convidados, prepostos, pessoal contratado e empregados, podendo sofrer sanções impostas pelo Condomínio através do Síndico e pelo Conselho Administrativo, pelos problemas detectados ou rompimento das regras posso sofrer punição (multa) ou até mesmo suspensão do uso da churrasqueira de 3(três) meses a 1(um)ano. Caso haja algum reparo a ser feito o condomínio irá providenciar, onde o condômino acima assumirá o ônus que será cobrado junto com a cota condominial";
    const linesTermo = doc.splitTextToSize(termo, contentWidth);
    doc.text(linesTermo, margin, currentY, { align: 'justify', maxWidth: contentWidth });
    currentY += (linesTermo.length * 6) + 12;

// RECEBIMENTO DAS CHAVES - PADRONIZADO (IGUAL AO ITEM 6)
currentY += 5;
checkPageBreak(30); // Verifica se cabe o bloco

// 1. Definimos o texto completo em uma única variável
const textoChaves = `Após vistoria, declaro estar recebendo a chave da churrasqueira, bem como 5 (cinco) mesas e 20 (vinte) cadeiras, em perfeito estado de conservação e uso, comprometendo-me a devolvê-los nas mesmas condições ao término da utilização.`;

// 2. O doc.splitTextToSize faz o trabalho de "quebrar" o texto para não sair da folha
const linesChaves = doc.splitTextToSize(textoChaves, contentWidth);

// 3. Imprime o texto justificado
doc.text(linesChaves, margin, currentY, { align: 'justify', maxWidth: contentWidth });

// 4. Atualiza o Y para o próximo elemento
currentY += (linesChaves.length * 6) + 12;

    // 7. DATA FORMATADA
    currentY += 10;
    const data = new Date();
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const dataTxt = `Rio de Janeiro, ${data.getDate()} de ${meses[data.getMonth()]} de ${data.getFullYear()}.`;
    doc.setFontSize(11);
    doc.text(dataTxt, pageWidth / 2, currentY, { align: "center" });

    // 8. ASSINATURAS
    currentY += 30;
    checkPageBreak(30);
    doc.setLineWidth(0.5);
    doc.line(margin, currentY, 90, currentY);
    doc.line(120, currentY, pageWidth - margin, currentY);
    doc.setFontSize(9);
    doc.text("ADMINISTRAÇÃO", 55, currentY + 6, { align: "center" });
    doc.text(f.morador.toUpperCase(), 155, currentY + 6, { align: "center" });

    // 9. OBS FINAL
    currentY += 20;
    setBold();
    doc.text("OBS.:", margin, currentY);
    setNormal();
    const obsText = `Ao receber as chaves para uso da churrasqueira ${churras}, verificar se está tudo correto, sem danos e em perfeito estado. Caso haja alguma irregularidade, por favor, anotar abaixo neste termo.`;
    const linesObs = doc.splitTextToSize(obsText, contentWidth - 15);
    doc.text(linesObs, margin + 12, currentY);
    
    currentY += (linesObs.length * 6) + 5;
    doc.setDrawColor(200);
    doc.line(margin, currentY, pageWidth - margin, currentY);

    doc.save(`Contrato_${bloco}${unidadeNum}_${f.morador}.pdf`);
};
const gerarContratoVazio = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let currentY = 15;

    const setNormal = () => { doc.setFont("helvetica", "normal"); doc.setFontSize(11); };
    const setBold = () => { doc.setFont("helvetica", "bold"); doc.setFontSize(11); };

    const checkPageBreak = (needed) => {
        if (currentY + needed > pageHeight - 25) {
            doc.addPage();
            currentY = 20;
        }
    };

    const escreverFluxoMisto = (fragmentos, alinhamento = "left") => {
        let cursorX = margin;
        setNormal();

        if (alinhamento === "center") {
            const textoCompleto = fragmentos.map(p => p.t).join("");
            cursorX = (pageWidth - doc.getTextWidth(textoCompleto)) / 2;
        }

        fragmentos.forEach((p) => {
            doc.setFont("helvetica", p.b ? "bold" : "normal");
            const palavras = p.t.split(/(\s+)/);

            palavras.forEach((palavra) => {
                const largura = doc.getTextWidth(palavra);
                if (cursorX + largura > pageWidth - margin && palavra !== " ") {
                    cursorX = margin;
                    currentY += 7;
                    checkPageBreak(7);
                }
                doc.text(palavra, cursorX, currentY);
                cursorX += largura;
            });
        });
        currentY += 10;
    };

    // 1. LOGO (Mantida conforme solicitado)
    try {
        doc.addImage('/logo.png', 'PNG', pageWidth / 2 - 25, currentY, 50, 25);
        currentY += 35;
    } catch (e) { currentY += 10; }

    // 2. CABEÇALHO
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("CONTRATO DE LOCAÇÃO E TERMO DE RESPONSABILIDADE", pageWidth / 2, currentY, { align: "center" });
    currentY += 8;
    doc.setFontSize(12);
    doc.text("CHURRASQUEIRA - CONDOMÍNIO DIDUCCIO", pageWidth / 2, currentY, { align: "center" });
    currentY += 15;

    // 3. TEXTO DE ABERTURA
    setNormal();
    const intro = "A reserva da Churrasqueira, está autorizada para churrascos, aniversários, chá de bebê, chá de cozinha. É expressamente proibido, para atividades políticas ou partidárias, religiosas, mercantis e jogos considerados de azar pela legislação pertinente.";
    const linesIntro = doc.splitTextToSize(intro, contentWidth);
    doc.text(linesIntro, margin, currentY, { align: 'justify', maxWidth: contentWidth });
    currentY += (linesIntro.length * 6) + 10;

    // 4. CORPO COM CAMPOS PARA PREENCHER (LINHAS)
    escreverFluxoMisto([
        { t: "Eu ", b: false },
        { t: "___________________________________________", b: true },
        { t: ", portador do RG ", b: false },
        { t: "_________________", b: true },
        { t: " morador do bloco ", b: false },
        { t: "____", b: true },
        { t: " apartamento ", b: false },
        { t: "____", b: true },
        { t: " telefone ", b: false },
        { t: "_________________", b: true },
        { t: " venho por intermédio deste solicitar a locação da churrasqueira ", b: false },
        { t: "__________", b: true },
        { t: " para o dia ", b: false },
        { t: "____/____/_______", b: true },
        { t: " mediante o pagamento no valor de ", b: false },
        { t: "R$ _________", b: true },
        { t: ", no ato da assinatura (via pix) deste que se refere a taxa de locação, manutenção, conservação e limpeza. Como responsável estou ciente dos meus deveres e obrigações conforme consta:", b: false }
    ], "left");

    currentY += 2;

    // 5. REGRAS
    const regras = [
        "1. Retirar e devolver as chaves da churrasqueira devidamente trancadas, na portaria no mesmo dia do término da cessão.",
        "2. Respeitar o horário para utilização da churrasqueira (das 9:00 horas às 22:00 horas). Tolerância até as 23:00 horas;",
        "3. O uso dos aparelhos sonoros devem ser utilizados com moderação nesse período, em observância ao regulamento interno e na lei do silêncio (50 dB permitido);",
        "4. Limpar a churrasqueira, recolhendo todos os objetos que estiverem no chão, tais como copos plásticos, guardanapos, pratinhos e bexigas, entre outros, incluindo também a parte externa ao redor da mesma;",
        "5. Zelar por todos os materiais e acessórios para uso que estão à disposição nos banheiros;",
        "6. Fazer uso apenas da churrasqueira ciente de que a quadra e a piscina não estão inclusos na reserva (para visitantes);",
        "7. Retirar barbantes, fios e etc..., que forem amarrados nos caibros;",
        "8. Não danificar as paredes usando pregos, colas e afins;",
        "9. Respeitar o limite máximo de convidados 20 pessoas na churrasqueira;",
        "10. Guardar mesas e cadeiras no lugar determinado, ou seja, onde foram encontrados;",
        "11. Convidados não poderão circular pelo condomínio, somente ao redor da churrasqueira;",
        "12. Carros de visitantes não podem entrar no condomínio;",
        "13. Deixar a lista de convidados um dia antes na portaria para não haver transtornos.",
        "14. Zelar pelas mesas e cadeiras disponibilizadas para uso na churrasqueira, devendo ser devolvidas em perfeito estado de conservação e no local de origem. Em caso de dano, quebra ou extravio de qualquer item, o responsável pela reserva deverá arcar integralmente com o custo de reparo ou reposição do material."
    ];

    regras.forEach(r => {
        setNormal();
        const lines = doc.splitTextToSize(r, contentWidth);
        checkPageBreak(lines.length * 7);
        doc.text(lines, margin, currentY, { align: 'justify', maxWidth: contentWidth });
        currentY += (lines.length * 6) + 2.5;
    });

    // 6. TERMO DE RESPONSABILIDADE
    currentY += 5;
    checkPageBreak(45);
    const termo = "Estou ciente que, após a utilização será feita a vistoria e caso haja alguma irregularidade, serei responsabilizado pelos danos, inclusive os causados por familiares, convidados, prepostos, pessoal contratado e empregados, podendo sofrer sanções impostas pelo Condomínio através do Síndico e pelo Conselho Administrativo, pelos problemas detectados ou rompimento das regras posso sofrer punição (multa) ou até mesmo suspensão do uso da churrasqueira de 3(três) meses a 1(um)ano. Caso haja algum reparo a ser feito o condomínio irá providenciar, onde o condômino acima assumirá o ônus que será cobrado junto com a cota condominial";
    const linesTermo = doc.splitTextToSize(termo, contentWidth);
    doc.text(linesTermo, margin, currentY, { align: 'justify', maxWidth: contentWidth });
    currentY += (linesTermo.length * 6) + 12;

    // RECEBIMENTO DAS CHAVES - PADRONIZADO (IGUAL AO ITEM 6)
currentY += 5;
checkPageBreak(30); // Verifica se cabe o bloco

// 1. Definimos o texto completo em uma única variável
const textoChaves = `Após vistoria, declaro estar recebendo a chave da churrasqueira, bem como 5 (cinco) mesas e 20 (vinte) cadeiras, em perfeito estado de conservação e uso, comprometendo-me a devolvê-los nas mesmas condições ao término da utilização.`;

// 2. O doc.splitTextToSize faz o trabalho de "quebrar" o texto para não sair da folha
const linesChaves = doc.splitTextToSize(textoChaves, contentWidth);

// 3. Imprime o texto justificado
doc.text(linesChaves, margin, currentY, { align: 'justify', maxWidth: contentWidth });

// 4. Atualiza o Y para o próximo elemento
currentY += (linesChaves.length * 6) + 12;

    // 7. DATA (Apenas Cidade e Ano fixos, dia/mês vazios para preencher)
    currentY += 10;
    const anoAtual = new Date().getFullYear();
    const dataTxt = `Rio de Janeiro, _____ de ____________________ de ${anoAtual}.`;
    doc.setFontSize(11);
    doc.text(dataTxt, pageWidth / 2, currentY, { align: "center" });

    // 8. ASSINATURAS
    currentY += 30;
    checkPageBreak(30);
    doc.setLineWidth(0.5);
    doc.line(margin, currentY, 90, currentY);
    doc.line(120, currentY, pageWidth - margin, currentY);
    doc.setFontSize(9);
    doc.text("ADMINISTRAÇÃO", 55, currentY + 6, { align: "center" });
    doc.text("ASSINATURA DO MORADOR", 155, currentY + 6, { align: "center" });

    // 9. OBS FINAL
    currentY += 20;
    setBold();
    doc.text("OBS.:", margin, currentY);
    setNormal();
    const obsText = `Ao receber as chaves para uso da churrasqueira ______, verificar se está tudo correto, sem danos e em perfeito estado. Caso haja alguma irregularidade, por favor, anotar abaixo neste termo.`;
    const linesObs = doc.splitTextToSize(obsText, contentWidth - 15);
    doc.text(linesObs, margin + 12, currentY);
    
    currentY += (linesObs.length * 6) + 5;
    doc.setDrawColor(200);
    doc.line(margin, currentY, pageWidth - margin, currentY); // Linha final para anotações manuais

    doc.save(`Contrato_Modelo_Vazio.pdf`);
};

const getChurrasqueiraBadge = (valor) => {
    // Transforma em texto, limpa espaços e coloca em maiúsculo (Ex: "ch-a " vira "CH-A")
    const v = String(valor || "").trim().toUpperCase();

    const estiloBase = {
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: '800',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '60px',
      border: '1px solid'
    };

    if (v === "CH-A") {
      return {
        ...estiloBase,
        backgroundColor: 'var(--brand-100)',
        color: 'var(--brand-700)',
        borderColor: 'var(--brand-200)'
      };
    } 
    
    if (v === "CH-B") {
      return {
        ...estiloBase,
        backgroundColor: 'var(--alert-50)',
        color: 'var(--alert-700)',
        borderColor: 'var(--alert-400)'
      };
    }

    // Cor padrão caso venha outro valor
    return { 
      ...estiloBase, 
      backgroundColor: theme?.isDark ? 'var(--border-strong)' : 'var(--surface-3)', 
      color: theme?.text || '#000',
      borderColor: theme?.border || '#ccc' 
    };
  };

const [showExportModal, setShowExportModal] = useState(false);
const [selectedColumns, setSelectedColumns] = useState([
  { id: 'data_reserva', label: 'Data', selected: true },
  { id: 'unidade_id', label: 'Unidade', selected: true },
  { id: 'morador', label: 'Morador', selected: true },
  { id: 'churrasqueira', label: 'Churrasqueira', selected: true },
  { id: 'cpf', label: 'CPF', selected: true }, // Nova coluna adicionada
  { id: 'rg', label: 'RG', selected: true },
  { id: 'contato', label: 'Telefone', selected: true },
  { id: 'valor_taxa', label: 'Taxa', selected: true },
  { id: 'pago', label: 'Pago', selected: true },
  { id: 'status', label: 'Status', selected: true }
]);

const exportToExcel = () => {
  // 1. Filtra apenas as colunas que estão marcadas como 'selected: true' no modal
  const colsAtivas = selectedColumns.filter(c => c.selected);

  const dadosParaExportar = dadosFiltrados.map(f => {
    const linha = {};

    

    // 2. Monta o objeto dinamicamente baseado nas colunas selecionadas
    colsAtivas.forEach(col => {
      if (col.id === 'unidade_id') {
        const unit = unidades.find(u => u.id?.toString() === f.unidade_id?.toString());
        linha["Unidade"] = sanitizarCelula(unit ? `B${unit.bloco} - ${unit.unidade}` : f.unidade_id);
      }
      else if (col.id === 'cpf') {
        linha["CPF"] = maskCPFPrivacy(f.cpf);
      }
      else if (col.id === 'rg') {
  linha["RG"] = maskRGPrivacy(f.rg);
}

else if (col.id === 'churrasqueira') {
        linha["Churrasqueira"] = sanitizarCelula(f.churrasqueira || "");
      }

      else if (col.id === 'morador') {
        linha["Responsável"] = sanitizarCelula(f.morador);
      }
      else if (col.id === 'data_reserva') {
        linha["Data da Reserva"] = dataBR(f.data_reserva);
      }
      else if (col.id === 'valor_taxa') {
        linha["Valor da Taxa"] = Number(f.valor_taxa || 0);
      }
      else {
        // Para as demais colunas (contato, pago, status, etc)
        // Usa o label que você definiu no estado selectedColumns
        linha[col.label] = sanitizarCelula(f[col.id] || "");
      }
    });

    return linha;
  });

  // 3. Gera a planilha
  const ws = XLSX.utils.json_to_sheet(dadosParaExportar);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reservas");
  XLSX.writeFile(wb, "Relatorio_Churrasqueira.xlsx");
  
  setShowExportModal(false); // Fecha o modal após baixar
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
    if (cpf === null || cpf === undefined || cpf === "") return "";
    const cpfStr = String(cpf);
    const clean = cpfStr.replace(/\D/g, "");
    if (clean.length < 11) return cpfStr;
    return `${clean.substring(0, 3)}.***.***-${clean.substring(9)}`;
  };
  

  const colsParaExportar = selectedColumns.filter(c => c.selected);
  const headers = colsParaExportar.map(c => c.label);
  
  const body = dadosFiltrados.map(f => colsParaExportar.map(c => {
    // 1. Tratamento específico para VALOR
    if(c.id === 'valor_taxa') return formatCurrency(f[c.id]);

    // 2. Tratamento específico para CPF (Máscara de Privacidade)
    if(c.id === 'cpf') return maskCPFPrivacy(f[c.id]);

    if(c.id === 'rg') return maskRGPrivacy(f[c.id]);

    // 3. Tratamento para UNIDADE (Para mostrar B1 - 101 em vez do ID)
    if(c.id === 'unidade_id') {
      const unit = unidades.find(u => u.id?.toString() === f.unidade_id?.toString());
      return sanitizarCelula(unit ? `B${unit.bloco} - ${unit.unidade}` : f.unidade_id);
    }

    // 4. Tratamento para DATA
    if(c.id === 'data_reserva') return dataBR(f[c.id]);

    return sanitizarCelula(f[c.id] || "");
    
  }));

  const gerarPDF = (incluirLogo = false) => {
    doc.setDrawColor(34, 197, 94); 
    doc.setLineWidth(1.5); 
    doc.rect(5, 5, 287, 200);
    if (incluirLogo) doc.addImage(img, 'PNG', 113, 12, 70, 25);
    
    doc.setFontSize(18); 
    doc.setTextColor(30, 41, 59);
    doc.text("Relatório de Reservas - Churrasqueira", 148, incluirLogo ? 45 : 25, { align: "center" });

    autoTable(doc, {
      startY: incluirLogo ? 55 : 35,
      head: [headers],
      body: body,
      headStyles: { fillColor: [34, 197, 94], halign: 'center', textColor: [255, 255, 255] },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      margin: { left: 10, right: 10 }
    });

    doc.save("Relatorio_Churrasqueira.pdf");
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

const handleDeleteImage = async (uploadId) => {
  const okRemover = await confirmar({
    title: "Remover este anexo?",
    description: "O arquivo é apagado do sistema. Não dá para desfazer.",
    confirmLabel: "Remover",
    danger: true,
  });
  if (!okRemover) return;

  setLoadingGlobal(true);

  try {
    // O caminho tem de ser lido ANTES: depois de a linha sair, não há mais como
    // descobrir qual arquivo do bucket era dela.
    const anexo = uploads.find(up => String(up.id) === String(uploadId));

    const res = await remover("UPLOADS_CHURRASQUEIRA", uploadId);
    if (!res.success) { toast.error(mensagemErro(res.message)); setLoadingGlobal(false); return; }

    // A linha primeiro, o arquivo depois: na ordem inversa, uma falha ao apagar
    // a linha deixaria um anexo listado apontando para arquivo inexistente.
    if (anexo?.caminho_storage) {
      const rm = await removerAnexo(anexo.caminho_storage);
      if (!rm.success) {
        console.warn("Anexo removido da lista, mas não do bucket:", anexo.caminho_storage, rm.message);
        toast.error("Anexo removido da lista, mas o arquivo continuou no sistema. Avise o suporte.");
      }
    }

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
  // 1. VALIDAÇÃO DE CAMPOS OBRIGATÓRIOS
  // Verifica se os campos essenciais estão preenchidos antes de qualquer processamento
  if (!formData.unidade_id) {
    toast.error("Preencha o campo unidade.");
    return;
  }
  if (!formData.morador || formData.morador.trim() === "") {
    toast.error("Preencha o campo nome do responsável.");
    return;
  }
  if (!formData.cpf || formData.cpf.toString().trim() === "") {
    toast.error("Preencha o campo cpf.");
    return;
  }
  if (!formData.contato || formData.contato.toString().trim() === "") {
    toast.error("Preencha o campo telefone contato.");
    return;
  }
  if (!formData.data_reserva) {
    toast.error("Preencha o campo data e hora início.");
    return;
  }
  if (!formData.valor_taxa || formData.valor_taxa.toString().trim() === "") {
    toast.error("Preencha o campo taxa.");
    return;
  }
  if (!formData.rg || formData.rg.toString().trim() === "") {
    toast.error("Preencha o campo rg.");
    return;
  }

  // 2. LÓGICA DE VALIDAÇÃO DE CONFLITO (Existente no seu código)
  const dataNova = formData.data_reserva.split("T")[0]; 
  
  const conflito = festas.find(f => {
  const dataExistente = formatDateTimeForInput(f.data_reserva).split("T")[0];
  return (
    dataExistente === dataNova && 
    f.churrasqueira === formData.churrasqueira && // <--- Adicione esta linha
    f.id !== formData.id && 
    f.status !== "Cancelado"
  );
});

  if (conflito) {
      if (conflito.status === "Agendado") {
          toast.error(`BLOQUEADO: Já existe um agendamento CONFIRMADO para o dia ${dataBR(conflito.data_reserva)}.`);
          return; 
      }

      if (conflito.status === "Pendente") {
          const seguir = await confirmar({
            title: "Já existe uma reserva pendente neste dia",
            description: "Duas reservas para a mesma data podem gerar conflito na portaria. Cadastrar mesmo assim?",
            confirmLabel: "Cadastrar assim mesmo",
          });
          if (!seguir) return;
      }
  }

  // 3. PROCESSO DE ENVIO
  setLoadingGlobal(true); // ATIVA O LOADING
  
  // Campo a campo, e não `...formData`: o estado do formulário carrega coisas
  // que só existem na tela (`fotosNovas`, `foto`) e o Postgres recusa a linha
  // inteira por causa de uma coluna que não conhece. Numérico em branco vira
  // null — string vazia não entra em coluna numeric.
  const dados = {
    data_reserva: formData.data_reserva ? String(formData.data_reserva).split("T")[0] : null,
    unidade_id: formData.unidade_id ? Number(formData.unidade_id) : null,
    morador: formData.morador || null,
    status: formData.status || "Pendente",
    cpf: formData.cpf || null,
    rg: formData.rg || null,
    contato: formData.contato || null,
    convidados: formData.convidados ? Number(formData.convidados) : null,
    valor_taxa: formData.valor_taxa ? Number(String(formData.valor_taxa).replace(",", ".")) : null,
    pago: formData.pago || null,
    churrasqueira: formData.churrasqueira || null,
    divergencia_local: formData.divergencia_local || null,
    obs: formData.obs || null,
  };

  try {
    const r = modalType === "add"
      ? await criar("CHURRASQUEIRA", dados)
      : await editar("CHURRASQUEIRA", formData.id, dados);

    if (!r.success) { toast.error(mensagemErro(r.message)); setLoadingGlobal(false); return; }

    // O id só existe depois do insert e faz parte do caminho do arquivo no
    // bucket — por isso o anexo sobe depois de a reserva estar gravada.
    const idReserva = r.data?.id ?? formData.id;
    const novos = formData.fotosNovas || [];
    let falhas = 0;

    for (let i = 0; i < novos.length; i++) {
      const envio = await enviarAnexo("churrasqueira", idReserva, novos[i]);
      if (!envio.success) { falhas++; continue; }

      // Aqui `id` é identity e NÃO deve ser mandado — ao contrário de
      // `uploads_festas`, onde é texto e precisa vir da tela. E `id_festa` é
      // TEXTO nesta tabela, também ao contrário da outra. As duas telas são
      // gêmeas, as duas tabelas não: trocar isso grava sem erro e quebra o
      // vínculo do anexo com a reserva.
      const linha = await criar("UPLOADS_CHURRASQUEIRA", {
        id_festa: String(idReserva),
        nome_arquivo: envio.nome,
        caminho_storage: envio.caminho,
      });
      if (!linha.success) {
        // Arquivo no bucket sem linha que o referencie é órfão invisível.
        falhas++;
        await removerAnexo(envio.caminho);
      }
    }

    if (falhas) toast.error(`Reserva salva, mas ${falhas} anexo(s) não foram enviados.`);

    setFormData(prev => ({ ...prev, fotosNovas: [] }));
    setShowModal(false);
    await fetchData();
  } catch (error) {
    console.error(error);
    toast.error("Não foi possível salvar. Seus dados continuam no formulário.");
  } finally {
    // Desliga o loader sempre, independente de sucesso ou erro
    setLoadingGlobal(false);
  }
};

  const handleDelete = async (id) => {
    const okExcluir = await confirmar({
      title: "Excluir esta reserva?",
      description: "Todos os anexos dela são apagados do sistema. Não dá para desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (okExcluir) {
      setLoadingGlobal(true);

      try {
        const anexosDaReserva = uploads.filter(up =>
          String(up.id_festa ?? up.ID_FESTA ?? "") === String(id)
        );

        // A reserva PRIMEIRO. Apagar os anexos antes e a exclusão da reserva
        // falhar — por permissão, por conexão — deixaria a reserva viva e sem
        // nenhum documento, que é a perda irreversível. Nesta ordem o pior caso
        // é arquivo sobrando, que é visível e reparável.
        const res = await remover("CHURRASQUEIRA", id);
        if (!res.success) { toast.error(mensagemErro(res.message)); setLoadingGlobal(false); return; }

        for (const anexo of anexosDaReserva) {
          const rl = await remover("UPLOADS_CHURRASQUEIRA", anexo.id);
          if (!rl.success) console.warn("Linha de anexo não removida:", anexo.id, rl.message);
        }

        // Varre a pasta inteira em vez dos caminhos que as linhas guardam: o
        // que ficou de um envio interrompido sumiria da tela e continuaria no
        // bucket, alcançável por URL assinada.
        const rm = await removerAnexosDoRegistro("churrasqueira", id);
        if (!rm.success) {
          console.warn("Arquivos não removidos do bucket:", rm.message);
          toast.error("Reserva excluída, mas algum arquivo continuou no sistema. Avise o suporte.");
        }

        await fetchData();
        setLoadingGlobal(false);
        if (typeof setShowMenuId === "function") setShowMenuId(null);

      } catch (error) {
        console.error("Erro ao excluir:", error);
        toast.error("Não foi possível excluir a reserva.");
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
            rg: moradorObj.rg || "" // Adicionado para trazer o RG
        });
    }
  };

  const toggleMoradorCadastrado = (checked) => {
    setIsMoradorCadastrado(checked);
    setFormData({ ...formData, morador: "", contato: "", cpf: "", rg: "" });
  };

  const dadosFiltrados = React.useMemo(() => {
  // --- MANTÉM SEUS FILTROS ORIGINAIS ---
  let resultado = festas.filter(f => {
    const matchesSearch = 
        f.morador?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.unidade_id?.toString().includes(searchTerm);
    
    const matchesStatus = filterStatus === "Todos" || f.status === filterStatus;
    const matchesPago = filterPago === "Todos" || f.pago === filterPago;

    const matchesChurrasqueira = filterChurrasqueira === "Todos" || f.churrasqueira === filterChurrasqueira;

    // Normaliza o valor de divergencia_local para comparar com Sim/Não
    const valorDivergencia = (f.divergencia_local === true || f.divergencia_local === "Sim") ? "Sim" : "Não";
    const matchesDivergencia = filterDivergencia === "Todos" || valorDivergencia === filterDivergencia;

    let matchesData = true;
    if (filterPeriodo.inicio || filterPeriodo.fim) {
        // Os três lados pela mesma função: comparar ms de origens diferentes
        // é como o filtro de período errava sem dar erro nenhum.
        const dataFesta = dataParaMs(f.data_reserva);
        if (filterPeriodo.inicio && dataFesta < dataParaMs(filterPeriodo.inicio)) matchesData = false;
        if (filterPeriodo.fim && dataFesta > dataParaMs(`${filterPeriodo.fim} 23:59`)) matchesData = false;
    }
    return matchesSearch && matchesStatus && matchesPago && matchesData && matchesDivergencia && matchesChurrasqueira;
  });

  // --- APLICA A NOVA ORDENAÇÃO ---
  if (sortConfig.length > 0) {
    resultado.sort((a, b) => {
      for (const { key, direction } of sortConfig) {
        let valA = a[key];
        let valB = b[key];

        if (key === 'data_reserva') {
          valA = dataParaMs(valA);
          valB = dataParaMs(valB);
        } else if (key === 'valor_taxa' || key === 'unidade_id') {
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

  
}, [festas, searchTerm, filterStatus, filterPago, filterPeriodo, sortConfig, filterDivergencia, filterChurrasqueira]);

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

  return (
    
    <div style={{...pageContainer, padding: isMobile ? "20px 12px" : "20px", paddingTop: isMobile ? "60px" : "20px"}}>
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
    max-width: calc(100vw - 24px);
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
        title="Exportar reservas"
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
            ? `Serão exportados os ${dadosFiltrados.length} reservas.`
            : `Serão exportados os ${dadosFiltrados.length} reservas que passam nos filtros atuais, de ${festas.length} no total.`}
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
        mensagem={loadingInitial ? "Carregando reservas..." : "Salvando..."}
      />

      <PageHeader
        title="Churrasqueira"
        meta={
          loadingInitial
            ? "Carregando reservas"
            : `${dadosFiltrados.length} de ${festas.length} reservas`
        }
        actions={
          <>
            <Button onClick={gerarContratoVazio} iconLeft={<FileText size={15} />}>
              Contrato
            </Button>
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
              Nova reserva
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
                {["Todos", "Pendente", "Agendado", "Realizado", "Cancelado"].map(s => (
                    <button key={s} className={`filter-pill ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>{s}</button>
                ))}
            </div>
        </div>

        {/* LINHA 2: PAGO E PERÍODO */}
        <div className="res-filtros__linha">
            
            {/* Filtro Pago (Estilo Pill) */}
            <div className="res-filtros__rolagem">
                {["Todos", "Sim", "Não"].map(p => (
                    <button 
                        key={p} 
                        className={`filter-pill ${filterPago === p ? 'active' : ''}`} 
                        onClick={() => setFilterPago(p)}
                    >
                        {p === "Todos" ? "Pagamento: Todos" : p === "Sim" ? "Pago" : "Não Pago"}
                    </button>
                ))}
            </div>

            {/* Filtro Churrasqueira (Estilo Pill - Igual ao solicitado) */}
<div style={{ display: 'flex', gap: '8px' }}>
  {["Todos", "CH-A", "CH-B"].map(c => (
    <button 
      key={c} 
      className={`filter-pill ${filterChurrasqueira === c ? 'active' : ''}`} 
      onClick={() => setFilterChurrasqueira(c)}
    >
      {c === "Todos" ? "Churrasqueira: Todas" : c}
    </button>
  ))}
</div>

  {/* Grupo Divergência */}
  <div className="res-filtros__rolagem">
    {["Todos", "Sim", "Não"].map(d => (
      <button 
        key={d} 
        className={`filter-pill ${d !== 'Todos' ? 'filter-pill--alerta' : ''} ${filterDivergencia === d ? 'active' : ''}`} 
        onClick={() => setFilterDivergencia(d)}
      >
        {d === "Todos" ? "Divergência: Todas" : d}
      </button>
    ))}
  </div>

        {/* Filtro Período */}
<div style={{
    display: 'flex', 
    alignItems: 'center', // Centraliza verticalmente (o "até" fica no meio da altura das caixas)
    gap: '10px', 
    flex: 1,
    justifyContent: isMobile ? 'center' : 'flex-end',
    flexWrap: 'wrap' // Permite quebrar de linha no mobile para não estourar
}}>
    {/* Caixa 1 */}
    <div style={{
        ...searchContainer, 
        backgroundColor: theme.bg, 
        borderColor: theme.border, 
        padding: '5px 10px', 
        minWidth: isMobile ? '120px' : '150px', 
        display: 'flex',
        alignItems: 'center',
        gap: '5px'
    }}>
        <Calendar size={14} color={theme.textSecondary} />
        <input 
            type="date" 
            style={{
                background:'none', 
                border:'none', 
                color: theme.text, 
                fontSize:'12px', 
                outline:'none',
                width: '100%'
            }} 
            value={filterPeriodo.inicio} 
            onChange={e => setFilterPeriodo({...filterPeriodo, inicio: e.target.value})}
        />
    </div>

    {/* Texto "até" Centralizado */}
    <span style={{
        color: theme.textSecondary, 
        fontSize: '12px', 
        whiteSpace: 'nowrap',
        alignSelf: 'center' // Garante o alinhamento no meio
    }}>
        até
    </span>

    {/* Caixa 2 */}
    <div style={{
        ...searchContainer, 
        backgroundColor: theme.bg, 
        borderColor: theme.border, 
        padding: '5px 10px', 
        minWidth: isMobile ? '120px' : '150px',
        display: 'flex',
        alignItems: 'center',
        gap: '5px'
    }}>
        <Calendar size={14} color={theme.textSecondary} />
        <input 
            type="date" 
            style={{
                background:'none', 
                border:'none', 
                color: theme.text, 
                fontSize:'12px', 
                outline:'none',
                width: '100%'
            }} 
            value={filterPeriodo.fim} 
            onChange={e => setFilterPeriodo({...filterPeriodo, fim: e.target.value})}
        />
    </div>

    {/* Botão Reset */}
    {(filterPeriodo.inicio || filterPeriodo.fim) && (
        <RotateCcw 
            size={16} 
            cursor="pointer" 
            color={theme.textSecondary} 
            onClick={() => setFilterPeriodo({inicio: "", fim: ""})} 
        />
    )}
</div>
        </div>
    </div>
</div>

      <div style={{...tableCard, backgroundColor: theme.mainBg, borderColor: theme.border}}>
        {!isMobile && (
        <div style={{ overflowX: 'auto' }}>
            <table style={{...tableStyle, minWidth: '800px'}}>
                <thead>
                    <tr style={{...thRow, borderBottomColor: theme.border, backgroundColor: theme.isDark ? 'var(--fg-default)' : 'var(--surface-2)'}}>
    {[
      { label: "Unidade", key: "unidade_id" },
      { label: "Churrasqueira", key: "churrasqueira" },
      { label: "Morador", key: "morador" },
      { label: "Data", key: "data_reserva" },
      { label: "Valor", key: "valor_taxa" },
      { label: "Pago", key: "pago" },
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
    const unit = unidades.find(u => u.id?.toString() === f.unidade_id?.toString());
    return (
      <tr key={f.id} style={{ ...trStyle, borderBottom: `1px solid ${theme.border}` }}>
        {/* Coluna Unidade */}
        <td style={{ ...tdStyle, color: theme.text, textAlign: 'left' }}>
          <strong>{unit ? `B${unit.bloco} - ${unit.unidade}` : f.unidade_id}</strong>
        </td>

        {/* Coluna Churrasqueira */}
        <td style={{ ...tdStyle, textAlign: 'left' }}>
          <span style={getChurrasqueiraBadge(f.churrasqueira)}>
            {f.churrasqueira}
          </span>
        </td>

        {/* Coluna Morador */}
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

        {/* Coluna Data */}
        <td style={tdStyle}>
          {dataBR(f.data_reserva)}
        </td>

        {/* Coluna Valor */}
        <td style={{ ...tdStyle, color: theme.text }}>
          {formatCurrency(f.valor_taxa)}
        </td>

        {/* Coluna Pago */}
        <td style={tdStyle}>
          <span style={f.pago === "Sim" ? badgeGreen : badgeRed}>
            {f.pago === "Sim" ? "Sim" : "Não"}
          </span>
        </td>

        {/* Coluna Status */}
        <td style={tdStyle}>
          <span style={{
            ...badgeGreen, 
            backgroundColor: f.status === 'Cancelado' ? '#F7E4DD' : f.status === 'Realizado' ? '#E5F0E7' : f.status === 'Pendente' ? 'var(--surface-3)' : '#E5F0E7',
            color: f.status === 'Cancelado' ? '#8E3419' : f.status === 'Realizado' ? '#24503A' : f.status === 'Pendente' ? 'var(--fg-secondary)' : '#24503A'
          }}>
            {f.status}
          </span>
        </td>

        {/* --- COLUNA AÇÕES --- */}
        <td style={{ ...tdStyle, textAlign: 'right', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
            
            {/* Container do Olho + Asterisco */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <button
                type="button"
                aria-label={`Ver reserva de ${f.morador || "sem responsável"}`}
                onClick={() => { setSelectedFesta(f); setShowViewModal(true); }}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
              >
                {/* Era um <Eye> com onClick: um SVG não recebe foco nem abre pelo
                    teclado, e para um leitor de tela não existia. */}
                <Eye size={18} color={theme.brand} />
              </button>
              
              {/* Asterisco */}
              {((f.divergencia_local === "Sim" || f.divergencia_local === true) || (f.obs && f.obs.trim() !== "")) && (
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
              aria-label={`Ações da reserva de ${f.morador || "sem responsável"}`} onClick={() => setShowMenuId(showMenuId === f.id ? null : f.id)} 
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <MoreVertical size={20} color={theme.textSecondary} />
            </button>
          </div>
                                    {showMenuId === f.id && (
    <div ref={menuRef} className="action-menu" style={{ right: '10px', top: '40px' }}>
        {/* BOTÃO GERAR CONTRATO */}
        <div className="menu-item" onClick={() => { 
            gerarContratoPDF(f); 
            setShowMenuId(null); 
        }}>
            <FileText size={14} color={theme.brand} /> Gerar Contrato
        </div>

        <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />

        <div className="menu-item" onClick={() => { 
            setModalType("edit"); 
            
            // Formatando a data antes de enviar para o formulário
            setFormData({
                ...f, 
                foto: getFotoFesta(f.id),
                data_reserva: formatDateTimeForInput(f.data_reserva) 
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
        )}

        {isMobile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
            {itensExibidos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 0', color: theme.textSecondary }}>Nenhuma reserva encontrada.</div>
            ) : itensExibidos.map((f) => {
              const unit = unidades.find(u => u.id?.toString() === f.unidade_id?.toString());
              const temAlerta = (f.divergencia_local === "Sim" || f.divergencia_local === true) || (f.obs && f.obs.trim() !== "");
              return (
                <div key={f.id} style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '14px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: theme.text }}>{unit ? `B${unit.bloco} - ${unit.unidade}` : f.unidade_id}</div>
                      <div style={{ marginTop: '4px' }}><span style={getChurrasqueiraBadge(f.churrasqueira)}>{f.churrasqueira}</span></div>
                    </div>
                    <span style={{ ...badgeGreen, flexShrink: 0, backgroundColor: f.status === 'Cancelado' ? '#F7E4DD' : f.status === 'Realizado' ? '#E5F0E7' : f.status === 'Pendente' ? 'var(--surface-3)' : '#E5F0E7', color: f.status === 'Cancelado' ? '#8E3419' : f.status === 'Realizado' ? '#24503A' : f.status === 'Pendente' ? 'var(--fg-secondary)' : '#24503A' }}>{f.status}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderTop: `1px solid ${theme.border}`, paddingTop: '8px' }}>
                    <span style={{ fontWeight: 600, color: theme.text, display: 'flex', alignItems: 'center', gap: '6px' }}>{f.morador}{temAlerta && <span style={{ color: '#B4472A', fontWeight: 'bold' }}>*</span>}</span>
                    {f.cpf && <span style={{ fontSize: '12px', color: theme.textSecondary }}>{maskCPFPrivacy(f.cpf)}</span>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '13px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: theme.textSecondary, textTransform: 'uppercase', fontWeight: 600 }}>Data</div>
                      <div style={{ color: theme.text }}>{dataBR(f.data_reserva) || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: theme.textSecondary, textTransform: 'uppercase', fontWeight: 600 }}>Valor</div>
                      <div style={{ color: theme.text }}>{formatCurrency(f.valor_taxa)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: theme.textSecondary, textTransform: 'uppercase', fontWeight: 600 }}>Pago</div>
                      <span style={f.pago === "Sim" ? badgeGreen : badgeRed}>{f.pago === "Sim" ? "Sim" : "Não"}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', borderTop: `1px solid ${theme.border}`, paddingTop: '10px' }}>
                    <button onClick={() => { setSelectedFesta(f); setShowViewModal(true); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '10px', border: `1px solid ${theme.border}`, background: 'none', color: 'var(--fg-brand)', fontWeight: 700, cursor: 'pointer' }}><Eye size={16} /> Ver</button>
                    <div style={{ position: 'relative' }}>
                      <button aria-label={`Ações da reserva de ${f.morador || "sem responsável"}`} onClick={() => setShowMenuId(showMenuId === f.id ? null : f.id)} style={{ padding: '10px 14px', borderRadius: '10px', border: `1px solid ${theme.border}`, background: 'none', color: theme.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><MoreVertical size={18} /></button>
                      {showMenuId === f.id && (
                        <div ref={menuRef} className="action-menu" style={{ right: 0, top: '46px' }}>
                          <div className="menu-item" onClick={() => { gerarContratoPDF(f); setShowMenuId(null); }}><FileText size={14} color={theme.brand} /> Gerar Contrato</div>
                          <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                          <div className="menu-item" onClick={() => { setModalType("edit"); setFormData({ ...f, foto: getFotoFesta(f.id), data_reserva: formatDateTimeForInput(f.data_reserva) }); setShowModal(true); setShowMenuId(null); }}><Edit2 size={14} /> Editar</div>
                          <div className="menu-item" style={{ color: '#B4472A' }} onClick={() => { handleDelete(f.id); setShowMenuId(null); }}><Trash2 size={14} /> Excluir</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{
  ...paginationFooter,
  borderTopColor: theme.border,
  backgroundColor: theme.mainBg,
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  justifyContent: "space-between",
  alignItems: "center"
}}>

  {/* ESQUERDA: Exibir + Contador */}
  <div style={{
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px 20px"
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
          <h3 style={{ margin: 0 }}>{modalType === "add" ? "Nova Reserva" : "Editar Mudança"}</h3>
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
              <span>{formData.unidade_id ? getUnitLabel(formData.unidade_id) : "Selecione a unidade..."}</span>
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
                          setFormData({ ...formData, unidade_id: u.id });
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
            <select style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
                    onChange={e => handleMoradorSelect(e.target.value)}>
              <option value="">Escolha...</option>
              {moradores.filter(m => m.id_unidade?.toString() === formData.unidade_id?.toString())
                        .map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
        )}

        {/* Nome e CPF */}
        <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px'}}>
          <div>
            <label style={labelStyle}>Nome do Responsável</label>
            <input 
              style={{...selectStyle, width:'100%', backgroundColor: isMoradorCadastrado ? theme.mainBg : theme.bg, color: theme.text, borderColor: theme.border, opacity: isMoradorCadastrado ? 0.7 : 1}} 
              value={formData.morador} 
              readOnly={isMoradorCadastrado}
              onChange={e => setFormData({...formData, morador: e.target.value})} 
            />
          </div>
          <div>
            <label style={labelStyle}>CPF</label>
            <input 
              style={{...selectStyle, width:'100%', backgroundColor: isMoradorCadastrado ? theme.mainBg : theme.bg, color: theme.text, borderColor: theme.border, opacity: isMoradorCadastrado ? 0.7 : 1}} 
              value={formData.cpf} 
              readOnly={isMoradorCadastrado}
              /* APLICANDO MÁSCARA CPF */
              onChange={e => setFormData({...formData, cpf: maskCPF(e.target.value)})} 
            />
          </div>
        </div>

        <div style={{ flex: 1 }}>
  <label style={labelStyle}>RG</label>
 <input 
  style={{
    ...selectStyle,
    width: '100%', 
    backgroundColor: isMoradorCadastrado ? theme.mainBg : theme.bg, 
    color: theme.text, 
    borderColor: theme.border, 
    opacity: isMoradorCadastrado ? 0.7 : 1,
    cursor: isMoradorCadastrado ? 'not-allowed' : 'text'
  }} 
  value={formData.rg || ""} 
  readOnly={isMoradorCadastrado}
  placeholder="00.000.000-00"
  // CORREÇÃO AQUI: Aplica a máscara ao digitar
  onChange={e => setFormData({...formData, rg: maskRG(e.target.value)})} 
/>
</div>

       {/* Data e Telefone */}
        <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px'}}>
          <div>
            <label style={labelStyle}>Data</label>
            <input
  type="date"
  style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}}
  value={formData.data_reserva ? formData.data_reserva.split('T')[0] : ""}
  onChange={(e) => setFormData({...formData, data_reserva: e.target.value})}
/>
          </div>
          <div>
            <label style={labelStyle}>Telefone Contato</label>
            <input 
              style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
              value={formData.contato} 
              /* APLICANDO MÁSCARA TELEFONE */
              onChange={e => setFormData({...formData, contato: maskPhone(e.target.value)})} 
            />
          </div>
        </div>

        {/* Taxa e Convidados */}
        <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px'}}>
          <div>
            <label style={labelStyle}>Taxa (R$)</label>
            <input type="number" style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} value={formData.valor_taxa} onChange={e => setFormData({...formData, valor_taxa: e.target.value})} />
          </div>
          <div>
            <label style={labelStyle}>Convidados (Qtd)</label>
            <input type="number" style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} value={formData.convidados} onChange={e => setFormData({...formData, convidados: e.target.value})} />
          </div>
        </div>

        {/* Pago e Status */}
        <div style={{display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px'}}>
          <div>
            <label style={labelStyle}>Pago?</label>
            <select style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} value={formData.pago} onChange={e => setFormData({...formData, pago: e.target.value})}>
              <option value="Não">Não</option>
              <option value="Sim">Sim</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
              <option value="Pendente">Pendente</option>
              <option value="Agendado">Agendado</option>
              <option value="Realizado">Realizado</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </div>
        </div>

        {/* NOVA SEÇÃO: CHURRASQUEIRA (ABAIXO DE PAGO) */}
<div style={{marginTop: '5px'}}>
  <label style={labelStyle}>Churrasqueira</label>
  <select 
    style={{...selectStyle, width:'100%', backgroundColor: theme.bg, color: theme.text, borderColor: theme.border}} 
    value={formData.churrasqueira} 
    onChange={e => setFormData({...formData, churrasqueira: e.target.value})}
  >
    <option value="">Selecione a Churrasqueira...</option>
    <option value="CH-A">CH-A</option>
    <option value="CH-B">CH-B</option>
  </select>
</div>

        {/* SEÇÃO DE ANEXOS / IMAGENS */}
        <div style={{ marginTop: '10px' }}>
          <label style={labelStyle}>Arquivos / Comprovantes</label>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '10px', marginBottom: '10px' }}>
            
            {/* Fotos Salvas */}
            {uploads
              .filter(up => (up.id_festa || up.ID_FESTA)?.toString() === formData.id?.toString())
              .map((f, idx) => (
                <div key={`saved-${idx}`} style={{ position: 'relative' }}>
                  <MiniaturaAnexo
                    source={f.url_drive || f.url}
                    nome={f.nome_arquivo}
                    style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '10px', border: `1px solid ${theme.border}` }}
                    alt="Comprovante"
                  />
                  <button 
                    onClick={() => handleDeleteImage(f.id || f.ID)}
                    style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#B4472A', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                  >
                    <X size={12} />
                  </button>
                  <div style={{ position: 'absolute', bottom: 0, width: '100%', fontSize: '10px', background: 'rgba(0,0,0,0.6)', color: 'white', textAlign: 'center', borderRadius: '0 0 10px 10px' }}>Salvo</div>
                </div>
              ))}

            {/* Fotos Novas (Preview antes de salvar) */}
            {formData.fotosNovas?.map((base64, idx) => (
              <div key={`new-${idx}`} style={{ position: 'relative' }}>
                <MiniaturaAnexo
                  localSrc={base64}
                  alt="Anexo a enviar"
                  style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '10px', border: '2px solid var(--brand-500)' }}
                />
                <button 
                  onClick={() => setFormData(prev => ({ ...prev, fotosNovas: prev.fotosNovas.filter((_, i) => i !== idx) }))}
                  style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#B4472A', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ border: `2px dashed ${theme.border}`, padding: '15px', borderRadius: '12px', textAlign: 'center', backgroundColor: theme.bg }}>
            <label htmlFor="file-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
  <UploadCloud size={24} color={theme.textSecondary} />
  <span style={{ fontSize: '12px', color: theme.textSecondary, fontWeight: '600' }}>
    Adicionar arquivos
  </span>
    <input
    type="file"
    multiple
    accept="image/*,application/pdf"
    onChange={handleFileChange}
    style={{ display: 'none' }}
    id="file-upload"  /* O id deve ser exatamente igual ao htmlFor do label */
  />
</label>
          </div>
        </div>

{/* Renderiza apenas se estiver editando uma reserva existente */}
{modalType === 'edit' && (
  <>
    {/* Divergência */}
    <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
      <input 
        type="checkbox" 
        id="divergencia_local"
        checked={formData.divergencia_local || false}
        onChange={(e) => setFormData({ ...formData, divergencia_local: e.target.checked })}
        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
      />
      <label htmlFor="divergencia_local" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
        Divergência
      </label>
    </div>

    {/* Observação */}
    <div style={{ marginBottom: '15px' }}>
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
          padding: '10px',
          borderRadius: '8px',
          resize: 'vertical'
        }} 
        placeholder="Alguma observação importante sobre a festa..."
        value={formData.obs || ""} 
        onChange={e => setFormData({...formData, obs: e.target.value})}
      />
    </div>
  </>
)}

        <button 
          style={{
            backgroundColor: 'var(--btn-primary-bg)', color: 'white', border: 'none', padding: '12px', 
            borderRadius: '10px', fontWeight: '700', cursor: 'pointer', marginTop: '10px'
          }} 
          onClick={handleSave}
        >
          {loadingGlobal ? <Loader2 className="animate-spin" size={18}/> : "Salvar Mudanças"}
        </button>
      </div>
    </div>
  </div>
)}
      {/* MODAL VER MAIS - CORRIGIDO E ESTRUTURADO */}
      {/* Detalhe: mesma gaveta do Moradores. A lista continua visivel atras,
          entao da para conferir uma reserva e abrir a seguinte sem se perder. */}
      <Gaveta
        open={showViewModal && Boolean(selectedFesta)}
        onClose={() => setShowViewModal(false)}
        sigla={iniciaisDe(selectedFesta?.morador)}
        titulo={selectedFesta?.morador || "Reserva"}
        meta={selectedFesta?.data_reserva
          ? `Reserva para ${dataBR(selectedFesta.data_reserva)}`
          : undefined}
        fitas={selectedFesta && (
          <>
            <Badge tone="brand">{getUnitLabel(selectedFesta.unidade_id)}</Badge>
            <Badge tone={String(selectedFesta.status) === "Cancelado" ? "danger" : "positive"}>
              {selectedFesta.status || "Sem status"}
            </Badge>
            <Badge tone={pagoSim(selectedFesta.pago) ? "positive" : "neutral"}>
              {pagoSim(selectedFesta.pago) ? "Pago" : "Não pago"}
            </Badge>
            {selectedFesta.divergencia_local === "Sim" && (
              <Badge tone="danger">Divergência</Badge>
            )}
          </>
        )}
        footer={
          <Button variant="ghost" onClick={() => setShowViewModal(false)}>Fechar</Button>
        }
      >
        {selectedFesta && (
          <>
            <section className="vit-grupo">
              <p className="vit-grupo__titulo">Responsável</p>
              <Dado rotulo="Nome" valor={selectedFesta.morador} />
              <Dado rotulo="CPF" valor={selectedFesta.cpf ? maskCPFPrivacy(selectedFesta.cpf) : ""} mono />
              <Dado rotulo="RG" valor={selectedFesta.rg ? maskRGPrivacy(selectedFesta.rg) : ""} mono />
              <Dado rotulo="Contato" valor={selectedFesta.contato} mono />
            </section>

            <section className="vit-grupo">
              <p className="vit-grupo__titulo">Reserva</p>
              <Dado
                rotulo="Data"
                valor={dataBR(selectedFesta.data_reserva)}
              />
              <Dado rotulo="Churrasqueira" valor={selectedFesta.churrasqueira} mono />
              <Dado rotulo="Convidados" valor={selectedFesta.convidados} mono />
              <Dado rotulo="Valor da taxa" valor={formatCurrency(selectedFesta.valor_taxa)} mono />
            </section>

            {selectedFesta.obs && (
              <section className="vit-grupo">
                <p className="vit-grupo__titulo">Observações</p>
                <p className="vit-dado__valor" style={{ textAlign: "left", paddingTop: "var(--space-5)" }}>
                  {selectedFesta.obs}
                </p>
              </section>
            )}

            <section className="vit-grupo">
              <p className="vit-grupo__titulo">Comprovantes</p>
{/* SEÇÃO DE ANEXOS / COMPROVANTES */}
              <div style={{...viewBox, backgroundColor: theme.bg, borderColor: theme.border}}>
                <p style={{fontSize:'11px', fontWeight:'700', marginBottom:'10px', textTransform: 'uppercase'}}>
                  Anexos / Comprovantes:
                </p>

                {uploads.filter(up => (up.id_festa || up.ID_FESTA)?.toString() === selectedFesta.id?.toString()).length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
                    {uploads
                      .filter(up => (up.id_festa || up.ID_FESTA)?.toString() === selectedFesta.id?.toString())
                      .map((file, idx) => {
  const urlOriginal = file.url_drive || file.url || "";

  return (
    <div key={idx} style={{ textAlign: 'center' }}>
      <div
        onClick={() => abrirArquivoDrive(urlOriginal)}
        style={{
          width: '100%', 
          height: '100px', 
          borderRadius: '8px', 
          border: `1px solid ${theme.border}`,
          backgroundColor: theme.bgSecondary || 'var(--surface-3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* ÍCONE DE FUNDO: Aparece se for PDF ou enquanto a imagem carrega */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          color: theme.textSecondary 
        }}>
          <FileText size={24} />
          <span style={{ fontSize: '10px', marginTop: '4px', fontWeight: 'bold' }}>
            VER ARQUIVO
          </span>
        </div>

        {/* IMAGEM (via getFoto autenticado): fica por cima do ícone quando carregar.
            PDFs ficam no placeholder transparente — o ícone VER ARQUIVO permanece. */}
        <DriveImage
          source={urlOriginal}
          alt="Anexo"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
      </div>
    </div>
  );
})
                    }
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '10px', opacity: 0.6 }}>
                    <Paperclip size={18} style={{marginBottom: '5px'}} />
                    <p style={{fontSize: '11px', margin: 0}}>Nenhum comprovante anexado</p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </Gaveta>
    </div>
  );
}