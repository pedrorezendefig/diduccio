/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom"; // Se ainda não tiver
import { CheckCircle2, Circle, Download, FileText } from "lucide-react";

// Bibliotecas para exportação
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { listar, criar, editar, remover } from "../api/db";
import { enviarAnexo, urlsDosAnexos, removerAnexo, removerAnexosDoRegistro, arquivoDoApp } from "../api/anexos";
import { maskCPFPrivacy, maskRGPrivacy, formatCurrency, dataParaMs, dataBR, nomeProprio } from "../lib/format";
import { sanitizarCelula, validarAnexo } from "../lib/drive";
import { useToast, useConfirm, Button, Modal } from "../ui";
import TelaDeReservas from "../components/reservas/TelaDeReservas";

// `festas` é administrativo pelas políticas do 0015: porteiro e conselheiro não
// gravam. A mensagem crua do Postgres fala de row-level security, que não diz
// nada a quem está na tela.
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para alterar reservas do salão.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Sem conexão com o servidor. Tente de novo.";
  }
  return msg;
};

// --- ESTILOS ---




/** Status provisorio de tela; morre com o lancamento do app do morador. */
const FALTA_PAGAMENTO = "Falta Pagamento";

export default function Festas() {
  const toast = useToast();
  const confirmar = useConfirm();


  const [festas, setFestas] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [moradores, setMoradores] = useState([]);
  const [uploads, setUploads] = useState([]); // Guardar os uploads brutos
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const location = useLocation();
  
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedFesta, setSelectedFesta] = useState(null);
  const [modalType, setModalType] = useState("add");
  // Guarda o timer que solta a tela depois do carregamento, para cancelá-lo se
  // a pessoa sair antes dele disparar.
  const timerCarregando = useRef(null);
  useEffect(() => () => clearTimeout(timerCarregando.current), []);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterDivergencia, setFilterDivergencia] = useState("Todos");
  const [isMoradorCadastrado, setIsMoradorCadastrado] = useState(false);
  
  const [formData, setFormData] = useState({
    unidade_id: "", morador: "", contato: "", data_reserva: "",
    valor_taxa: "", pago: "Não", status: "Pendente", cpf: "", rg: "", convidados: "",
    foto: "", divergencia_local: false, // Novo campo checkbox
  obs: ""                   // Novo campo texto
  });




  const [filterPeriodo, setFilterPeriodo] = useState({ inicio: "", fim: "" });
  const [filterPago, setFilterPago] = useState("Todos");
  const [filterBloco, setFilterBloco] = useState("Todos");


  
const [sortConfig, setSortConfig] = useState([{ key: 'data_reserva', direction: 'desc' }]);
  // Funções de Máscara

const verificarEAtualizarStatus = async (listaFestas) => {
  const agora = new Date();

  // Filtra apenas festas que precisam ser atualizadas
  const festasParaAtualizar = listaFestas.filter(f => {
    if (f.status !== "Agendado") return false;
    if (!f.data_reserva) return false;

    // `data_reserva` é `date` no Postgres e chega "AAAA-MM-DD". A versão
    // anterior partia de "DD/MM/YYYY HH:mm", da planilha: com ISO ela montava
    // `new Date("undefined-undefined-...")`, que é Invalid Date, e a comparação
    // dava sempre falso. O status automático estava desligado sem avisar.
    // A data por si já venceu quando o dia seguinte começa.
    const dataFesta = new Date(`${String(f.data_reserva).split("T")[0]}T23:59:59`);
    if (Number.isNaN(dataFesta.getTime())) return false;

    return agora > dataFesta;
  });

  for (const festa of festasParaAtualizar) {
    // Só o campo que muda: mandar a linha inteira de volta reenviaria colunas
    // geradas pelo banco (`created_at`, `updated_at`) e campos que só existem
    // na tela, e o insert/update recusaria a linha por coluna desconhecida.
    const r = await editar("FESTAS", festa.id, { status: "Realizado" });
    // Silencioso de propósito: isto roda sozinho ao abrir a tela. Um auxiliar
    // sem permissão de escrita veria um erro que não pediu e não pode resolver.
    if (!r.success) console.warn("Status automático não atualizado:", festa.id, r.message);
  }

  // Se houve atualizações, recarrega os dados (opcional, dependendo da sua necessidade de refresh)
  if (festasParaAtualizar.length > 0) {
    // Evite chamar fetchData() aqui para não criar loop infinito; 
    // em vez disso, atualize o estado local ou controle com uma flag.
  }
};


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
      listar("FESTAS"),
      listar("UNIDADES"),
      listar("MORADORES"),
      listar("UPLOADS_FESTAS"),
    ]);

    const listaFestas = Array.isArray(resFestas) ? resFestas : [];

    // Anexo novo vive no bucket; os antigos continuam no Drive. Resolver aqui,
    // uma vez, deixa os seis pontos que exibem arquivo nesta tela lendo sempre
    // `url_drive` — como sempre leram — sem nenhum deles saber a diferença.
    // Em lote (urlsDosAnexos): um link por arquivo, todos juntos, esgotava
    // as conexões do banco no plano grátis (544 DatabaseTimeout, 23/11).
    const brutos = Array.isArray(resUploads) ? resUploads : [];
    const links = await urlsDosAnexos(brutos.map((up) => up.caminho_storage));
    const listaUploads = brutos.map((up) => ({
      ...up,
      url_drive: (up.caminho_storage && links.get(up.caminho_storage)) || up.url_drive,
    }));

    setUploads(listaUploads);

    // Mapeia as festas vinculando a foto na carga inicial para facilitar a listagem
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
    console.error("Erro no carregamento (CORS/Redirect):", error); 
  } finally { 
    // Delay de 300ms para evitar o "salto" visual na tabela
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
  /**
   * O contrato so sai com o comprovante de pagamento anexado.
   *
   * Por enquanto a trava e da tela, e o comprovante e qualquer anexo ligado a
   * reserva: e assim que a administracao trabalha hoje, antes do app do
   * morador. A trava fica aqui dentro, e nao so no botao, para valer em todo
   * lugar que gera o contrato (o menu da tabela e o do cartao no celular).
   */
  const temComprovante = (reservaId) =>
    uploads.some((up) => String(up.id_festa ?? up.ID_FESTA ?? up.Id_Festa ?? "") === String(reservaId));

  /**
   * "Falta Pagamento": Pendente ou Agendado ainda sem comprovante anexado.
   *
   * PROVISORIO, ate o app do morador ser lancado — la o pagamento tem fluxo
   * proprio (0056) e este status morre. Por isso ele e so de TELA: calculado
   * aqui, nunca gravado no banco. Para tirar, basta esta funcao devolver
   * `f.status` e sair a pilula do filtro; nao sobra dado para limpar.
   */
  const statusNaTela = (f) =>
    (f.status === "Pendente" || f.status === "Agendado") && !temComprovante(f.id)
      ? FALTA_PAGAMENTO
      : f.status;

  /**
   * `documento`: "rg" ou "cpf", escolhido por quem gera o contrato. Por enquanto
   * a administração escolhe na hora; com o app do morador, o dado vem de lá.
   */
  const gerarContratoPDF = (f, documento = "rg") => {
    if (!temComprovante(f.id)) {
      toast.error("Anexe o comprovante de pagamento para gerar o contrato.");
      return;
    }
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

    // 1. LOGO
    try {
        doc.addImage('/logo.png', 'PNG', pageWidth / 2 - 25, currentY, 50, 25);
        currentY += 35;
    } catch { currentY += 10; }

    // 2. CABEÇALHO
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("CONTRATO DE LOCAÇÃO E TERMO DE RESPONSABILIDADE", pageWidth / 2, currentY, { align: "center" });
    currentY += 8;
    doc.setFontSize(12);
    doc.text("SALÃO DE FESTAS - CONDOMÍNIO DIDUCCIO", pageWidth / 2, currentY, { align: "center" });
    currentY += 15;

    // 3. TEXTO DE ABERTURA
    setNormal();
    const intro = "A reserva do Salão de Festas, está autorizada para aniversários, chá de bebê, chá de cozinha. É expressamente proibido, para atividades políticas ou partidárias, religiosas, mercantis e jogos considerados de azar pela legislação pertinente.";
    const linesIntro = doc.splitTextToSize(intro, contentWidth);
    doc.text(linesIntro, margin, currentY, { align: 'justify', maxWidth: contentWidth });
    currentY += (linesIntro.length * 6) + 10;

    // 4. CORPO COM DADOS
    const uniStr = f.unidade_id.toString();
    const bloco = uniStr.charAt(0);
    const unidadeNum = uniStr.substring(1);
    const dataReserva = dataBR(f.data_reserva) || "___/___/___";

    escreverFluxoMisto([
        { t: "Eu ", b: false },
        { t: f.morador.toUpperCase(), b: true },
        { t: documento === "cpf" ? ", portador do CPF " : ", portador do RG ", b: false },
        { t: (documento === "cpf" ? f.cpf : f.rg) || "__________", b: true },
        { t: " morador do bloco ", b: false },
        { t: bloco, b: true },
        { t: " apartamento ", b: false },
        { t: unidadeNum, b: true },
        { t: " telefone ", b: false },
        { t: f.contato || "__________", b: true },
        { t: " venho por intermédio deste solicitar a locação do Salão de Festas para o dia ", b: false },
        { t: dataReserva, b: true },
        { t: " mediante o pagamento no valor de ", b: false },
        { t: `R$ ${f.valor_taxa || "50,00"}`, b: true },
        { t: ", no ato da assinatura (via pix) deste que se refere a taxa de locação, manutenção, conservação e limpeza. Como responsável estou ciente dos meus deveres e obrigações conforme consta:", b: false }
    ], "left");

    currentY += 2;

    // 5. REGRAS
    const regras = [
        "1. Retirar e devolver as chaves do salão de festas devidamente trancadas, na portaria no mesmo dia do término da cessão.",
        "2. Respeitar o horário para utilização do salão de festas (das 9:00 horas às 22:00 horas). Tolerância até as 23:00 horas;",
        "3. O uso dos aparelhos sonoros devem ser utilizados com moderação nesse período, em observância ao regulamento interno e na lei do silêncio (50 dB permitido);",
        "4. Limpar o salão de festas, recolhendo todos os objetos que estiverem no chão, tais como copos plásticos, guardanapos, pratinhos e bexigas, entre outros, incluindo também a parte externa ao redor da mesma;",
        "5. Zelar por todos os materiais e acessórios para uso que estão à disposição nos banheiros;",
        "6. Fazer uso apenas do salão de festas ciente de que a quadra e a piscina não estão inclusos na reserva (para visitantes);",
        "7. Retirar barbantes, fios e etc..., que forem amarrados nos caibros;",
        "8. Não danificar as paredes usando pregos, colas e afins;",
        "9. Respeitar o limite máximo de convidados 60 pessoas no salão de festas;",
        "10. Guardar mesas e cadeiras no lugar determinado, ou seja, onde foram encontrados;",
        "11. Convidados não poderão circular pelo condomínio, somente ao redor do salão de festas;",
        "12. Carros de visitantes não podem entrar no condomínio;",
        "13. Deixar a lista de convidados um dia antes na portaria para não haver transtornos.",
        "14. Zelar pelas mesas e cadeiras disponibilizadas para uso no salão de festas, devendo ser devolvidas em perfeito estado de conservação e no local de origem. Em caso de dano, quebra ou extravio de qualquer item, o responsável pela reserva deverá arcar integralmente com o custo de reparo ou reposição do material."
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
    const termo = "Estou ciente que, após a utilização será feita a vistoria e caso haja alguma irregularidade, serei responsabilizado pelos danos, inclusive os causados por familiares, convidados, prepostos, pessoal contratado e empregados, podendo sofrer sanções impostas pelo Condomínio através do Síndico e pelo Conselho Administrativo, pelos problemas detectados ou rompimento das regras posso sofrer punição (multa) ou até mesmo suspensão do uso do salão de festas de 3(três) meses a 1(um)ano. Caso haja algum reparo a ser feito o condomínio irá providenciar, onde o condômino acima assumirá o ônus que será cobrado junto com a cota condominial";
    const linesTermo = doc.splitTextToSize(termo, contentWidth);
    doc.text(linesTermo, margin, currentY, { align: 'justify', maxWidth: contentWidth });
    currentY += (linesTermo.length * 6) + 12;

    // RECEBIMENTO DAS CHAVES - PADRONIZADO (IGUAL AO ITEM 6)
currentY += 5;
checkPageBreak(30); // Verifica se cabe o bloco

// 1. Definimos o texto completo em uma única variável
const textoChaves = `Após vistoria, declaro estar recebendo a chave do salão de festas, bem como 10 (dez) mesas e 40 (quarenta) cadeiras, em perfeito estado de conservação e uso, comprometendo-me a devolvê-los nas mesmas condições ao término da utilização.`;

// 2. O doc.splitTextToSize faz o trabalho de "quebrar" o texto para não sair da folha
const linesChaves = doc.splitTextToSize(textoChaves, contentWidth);

// 3. Imprime o texto justificado
doc.text(linesChaves, margin, currentY, { align: 'justify', maxWidth: contentWidth });

// 4. Atualiza o Y para o próximo elemento
currentY += (linesChaves.length * 6) + 12;

    // 7. DATA
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
    const obsText = `Ao receber as chaves para uso do Salão de festas , verificar se está tudo correto, sem danos e em perfeito estado. Caso haja alguma irregularidade, por favor, anotar abaixo neste termo.`;
    const linesObs = doc.splitTextToSize(obsText, contentWidth - 15);
    doc.text(linesObs, margin + 12, currentY);
    
    currentY += (linesObs.length * 6) + 5;
    doc.setDrawColor(200);
    doc.line(margin, currentY, pageWidth - margin, currentY);

    doc.save(`Contrato_Salao_${bloco}${unidadeNum}_${f.morador}.pdf`);
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

    // 1. LOGO
    try {
        doc.addImage('/logo.png', 'PNG', pageWidth / 2 - 25, currentY, 50, 25);
        currentY += 35;
    } catch { currentY += 10; }

    // 2. CABEÇALHO
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("CONTRATO DE LOCAÇÃO E TERMO DE RESPONSABILIDADE", pageWidth / 2, currentY, { align: "center" });
    currentY += 8;
    doc.setFontSize(12);
    doc.text("SALÃO DE FESTAS - CONDOMÍNIO DIDUCCIO", pageWidth / 2, currentY, { align: "center" });
    currentY += 15;

    // 3. TEXTO DE ABERTURA
    setNormal();
    const intro = "A reserva do Salão de Festas, está autorizada para aniversários, chá de bebê, chá de cozinha. É expressamente proibido, para atividades políticas ou partidárias, religiosas, mercantis e jogos considerados de azar pela legislação pertinente.";
    const linesIntro = doc.splitTextToSize(intro, contentWidth);
    doc.text(linesIntro, margin, currentY, { align: 'justify', maxWidth: contentWidth });
    currentY += (linesIntro.length * 6) + 10;

    // 4. CORPO COM CAMPOS VAZIOS (FLUXO MISTO)
    escreverFluxoMisto([
        { t: "Eu ", b: false },
        { t: "___________________________________________", b: true },
        { t: ", portador do RG/CPF ", b: false },
        { t: "_________________", b: true },
        { t: " morador do bloco ", b: false },
        { t: "____", b: true },
        { t: " apartamento ", b: false },
        { t: "____", b: true },
        { t: " telefone ", b: false },
        { t: "_________________", b: true },
        { t: " venho por intermédio deste solicitar a locação do Salão de Festas para o dia ", b: false },
        { t: "____/____/_______", b: true },
        { t: " mediante o pagamento no valor de ", b: false },
        { t: "R$ _________", b: true },
        { t: ", no ato da assinatura (via pix) deste que se refere a taxa de locação, manutenção, conservação e limpeza. Como responsável estou ciente dos meus deveres e obrigações conforme consta:", b: false }
    ], "left");

    currentY += 2;

    // 5. REGRAS
    const regras = [
        "1. Retirar e devolver as chaves do salão de festas devidamente trancadas, na portaria no mesmo dia do término da cessão.",
        "2. Respeitar o horário para utilização do salão de festas (das 9:00 horas às 22:00 horas). Tolerância até as 23:00 horas;",
        "3. O uso dos aparelhos sonoros devem ser utilizados com moderação nesse período, em observância ao regulamento interno e na lei do silêncio (50 dB permitido);",
        "4. Limpar o salão de festas, recolhendo todos os objetos que estiverem no chão, tais como copos plásticos, guardanapos, pratinhos e bexigas, entre outros, incluindo também a parte externa ao redor da mesma;",
        "5. Zelar por todos os materiais e acessórios para uso que estão à disposição nos banheiros;",
        "6. Fazer uso apenas do salão de festas ciente de que a quadra e a piscina não estão inclusos na reserva (para visitantes);",
        "7. Retirar barbantes, fios e etc..., que forem amarrados nos caibros;",
        "8. Não danificar as paredes usando pregos, colas e afins;",
        "9. Respeitar o limite máximo de convidados 60 pessoas no salão de festas;",
        "10. Guardar mesas e cadeiras no lugar determinado, ou seja, onde foram encontrados;",
        "11. Convidados não poderão circular pelo condomínio, somente ao redor do salão de festas;",
        "12. Carros de visitantes não podem entrar no condomínio;",
        "13. Deixar a lista de convidados um dia antes na portaria para não haver transtornos.",
        "14. Zelar pelas mesas e cadeiras disponibilizadas para uso no salão de festas, devendo ser devolvidas em perfeito estado de conservação e no local de origem. Em caso de dano, quebra ou extravio de qualquer item, o responsável pela reserva deverá arcar integralmente com o custo de reparo ou reposição do material."
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
    const termo = "Estou ciente que, após a utilização será feita a vistoria e caso haja alguma irregularidade, serei responsabilizado pelos danos, inclusive os causados por familiares, convidados, prepostos, pessoal contratado e empregados, podendo sofrer sanções impostas pelo Condomínio através do Síndico e pelo Conselho Administrativo, pelos problemas detectados ou rompimento das regras posso sofrer punição (multa) ou até mesmo suspensão do uso do salão de festas de 3(três) meses a 1(um)ano. Caso haja algum reparo a ser feito o condomínio irá providenciar, onde o condômino acima assumirá o ônus que será cobrado junto com a cota condominial";
    const linesTermo = doc.splitTextToSize(termo, contentWidth);
    doc.text(linesTermo, margin, currentY, { align: 'justify', maxWidth: contentWidth });
    currentY += (linesTermo.length * 6) + 12;

    // RECEBIMENTO DAS CHAVES - PADRONIZADO (IGUAL AO ITEM 6)
currentY += 5;
checkPageBreak(30); // Verifica se cabe o bloco

// 1. Definimos o texto completo em uma única variável
const textoChaves = `Após vistoria, declaro estar recebendo a chave do salão de festas, bem como 10 (dez) mesas e 40 (quarenta) cadeiras, em perfeito estado de conservação e uso, comprometendo-me a devolvê-los nas mesmas condições ao término da utilização.`;

// 2. O doc.splitTextToSize faz o trabalho de "quebrar" o texto para não sair da folha
const linesChaves = doc.splitTextToSize(textoChaves, contentWidth);

// 3. Imprime o texto justificado
doc.text(linesChaves, margin, currentY, { align: 'justify', maxWidth: contentWidth });

// 4. Atualiza o Y para o próximo elemento
currentY += (linesChaves.length * 6) + 12;

    // 7. DATA
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
    const obsText = `Ao receber as chaves para uso do Salão de festas , verificar se está tudo correto, sem danos e em perfeito estado. Caso haja alguma irregularidade, por favor, anotar abaixo neste termo.`;
    const linesObs = doc.splitTextToSize(obsText, contentWidth - 15);
    doc.text(linesObs, margin + 12, currentY);
    
    currentY += (linesObs.length * 6) + 5;
    doc.setDrawColor(200);
    doc.line(margin, currentY, pageWidth - margin, currentY);

    doc.save(`Contrato_Salao_Vazio.pdf`);
};

const [showExportModal, setShowExportModal] = useState(false);
const [selectedColumns, setSelectedColumns] = useState([
  { id: 'data_reserva', label: 'Data', selected: true },
  { id: 'unidade_id', label: 'Unidade', selected: true },
  { id: 'morador', label: 'Morador', selected: true },
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
        linha[col.label] = sanitizarCelula((col.id === "status" ? statusNaTela(f) : f[col.id]) || "");
      }
    });

    return linha;
  });

  // 3. Gera a planilha
  const ws = XLSX.utils.json_to_sheet(dadosParaExportar);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reservas");
  XLSX.writeFile(wb, "Relatorio_Festas.xlsx");
  
  setShowExportModal(false); // Fecha o modal após baixar
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
    doc.text("Relatório de Reservas - Salão de Festas", 148, incluirLogo ? 45 : 25, { align: "center" });

    autoTable(doc, {
      startY: incluirLogo ? 55 : 35,
      head: [headers],
      body: body,
      headStyles: { fillColor: [34, 197, 94], halign: 'center', textColor: [255, 255, 255] },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      margin: { left: 10, right: 10 }
    });

    doc.save("Relatorio_Festas.pdf");
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

    const res = await remover("UPLOADS_FESTAS", uploadId);
    if (!res.success) { toast.error(mensagemErro(res.message)); setLoadingGlobal(false); return; }

    // A linha primeiro, o arquivo depois: se a ordem fosse a inversa e a
    // exclusão da linha falhasse, sobraria um anexo listado apontando para um
    // arquivo que já não existe.
    // Comprovante enviado pelo app: sai da reserva, mas o arquivo fica (é o
    // recibo do morador, o mesmo que o app e Confirmações mostram).
    if (anexo?.caminho_storage && !arquivoDoApp(anexo.caminho_storage)) {
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
    toast.error("Preencha o campo data.");
    return;
  }
  if (!formData.valor_taxa || formData.valor_taxa.toString().trim() === "") {
    toast.error("Preencha o campo taxa.");
    return;
  }

  // 2. LÓGICA DE VALIDAÇÃO DE CONFLITO (Existente no seu código)
  const dataNova = formData.data_reserva.split("T")[0]; 
  
  const conflito = festas.find(f => {
      const dataExistente = formatDateTimeForInput(f.data_reserva).split("T")[0];
      return dataExistente === dataNova && f.id !== formData.id && f.status !== "Cancelado";
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
  // inteira por causa de uma coluna que não conhece. Numéricos em branco viram
  // null — string vazia não entra em coluna numeric.
  const dados = {
    data_reserva: formData.data_reserva ? String(formData.data_reserva).split("T")[0] : null,
    unidade_id: formData.unidade_id ? Number(formData.unidade_id) : null,
    morador: nomeProprio(formData.morador) || null,
    status: formData.status || "Pendente",
    cpf: formData.cpf || null,
    rg: formData.rg || null,
    contato: formData.contato || null,
    convidados: formData.convidados ? Number(formData.convidados) : null,
    valor_taxa: formData.valor_taxa ? Number(String(formData.valor_taxa).replace(",", ".")) : null,
    pago: formData.pago || null,
    divergencia_local: formData.divergencia_local || null,
    obs: formData.obs || null,
  };

  try {
    const r = modalType === "add"
      ? await criar("FESTAS", dados)
      : await editar("FESTAS", formData.id, dados);

    if (!r.success) { toast.error(mensagemErro(r.message)); setLoadingGlobal(false); return; }

    // O id só existe depois do insert e faz parte do caminho do arquivo no
    // bucket — por isso o anexo sobe depois de a reserva estar gravada.
    const idReserva = r.data?.id ?? formData.id;
    const novos = formData.fotosNovas || [];
    let falhas = 0;

    for (let i = 0; i < novos.length; i++) {
      const envio = await enviarAnexo("festas", idReserva, novos[i]);
      if (!envio.success) { falhas++; continue; }

      // `uploads_festas.id` é texto e não tem identity: precisa vir daqui. O
      // formato "UP-<ms>-<i>" é o mesmo que a planilha usava, para as linhas
      // novas e as antigas continuarem convivendo na mesma lista.
      const linha = await criar("UPLOADS_FESTAS", {
        id: `UP-${Date.now()}-${i}`,
        id_festa: Number(idReserva),
        nome_arquivo: envio.nome,
        caminho_storage: envio.caminho,
      });
      if (!linha.success) {
        // Arquivo no bucket sem linha que o referencie é órfão invisível.
        // Desfaz o upload em vez de deixá-lo lá para sempre.
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
        // nenhum documento, que é a perda irreversível. Na ordem daqui o pior
        // caso é arquivo sobrando, que é visível e reparável.
        const res = await remover("FESTAS", id);
        if (!res.success) { toast.error(mensagemErro(res.message)); setLoadingGlobal(false); return; }

        for (const anexo of anexosDaReserva) {
          const rl = await remover("UPLOADS_FESTAS", anexo.id);
          if (!rl.success) console.warn("Linha de anexo não removida:", anexo.id, rl.message);
        }

        // Varre a pasta inteira em vez dos caminhos que as linhas guardam: o que
        // ficou para trás de um envio interrompido sumiria da tela e continuaria
        // no bucket, alcançável por URL assinada.
        const rm = await removerAnexosDoRegistro("festas", id);
        if (!rm.success) {
          console.warn("Arquivos não removidos do bucket:", rm.message);
          toast.error("Reserva excluída, mas algum arquivo continuou no sistema. Avise o suporte.");
        }

        await fetchData();
        setLoadingGlobal(false);
        setShowViewModal(false);

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
            rg: moradorObj.rg || ""
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
    
    const matchesStatus = filterStatus === "Todos" || statusNaTela(f) === filterStatus;
    const matchesPago = filterPago === "Todos" || f.pago === filterPago;

    // Normaliza o valor de divergencia_local para comparar com Sim/Não
    const valorDivergencia = (f.divergencia_local === true || f.divergencia_local === "Sim") ? "Sim" : "Não";
    const matchesDivergencia = filterDivergencia === "Todos" || valorDivergencia === filterDivergencia;

    const matchesBloco = filterBloco === "Todos"
      || String(unidades.find((u) => String(u.id) === String(f.unidade_id))?.bloco) === filterBloco;

    let matchesData = true;
    if (filterPeriodo.inicio || filterPeriodo.fim) {
        // Os três lados pela mesma função: comparar ms de origens diferentes
        // é como o filtro de período errava sem dar erro nenhum.
        const dataFesta = dataParaMs(f.data_reserva);
        if (filterPeriodo.inicio && dataFesta < dataParaMs(filterPeriodo.inicio)) matchesData = false;
        if (filterPeriodo.fim && dataFesta > dataParaMs(`${filterPeriodo.fim} 23:59`)) matchesData = false;
    }
    return matchesSearch && matchesStatus && matchesPago && matchesData && matchesDivergencia && matchesBloco;
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
        } else if (key === 'unidade_id') {
          // Pela ordem do prédio (bloco, depois apartamento), e não pelo id.
          const pesoDe = (id) => { const u = unidades.find((x) => String(x.id) === String(id)); return u ? Number(u.bloco) * 100000 + Number(u.unidade) : 0; };
          valA = pesoDe(valA);
          valB = pesoDe(valB);
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
}, [festas, uploads, searchTerm, filterStatus, filterPago, filterDivergencia, filterPeriodo, sortConfig, unidades, filterBloco]);



const handleSort = (key) => {
  // Clicar na coluna: a primeira vez ordena crescente; de novo, inverte.
  setSortConfig(([atual]) => [{ key, direction: atual?.key === key && atual.direction === "asc" ? "desc" : "asc" }]);
};


  // ---- A tela ----
  // O desenho é o mesmo de Festas e Churrasqueira (TelaDeReservas, no padrão
  // do guia de marca). Aqui ficam só os dados e as ações desta tabela.
  const FORM_VAZIO = {
    unidade_id: "", morador: "", contato: "", data_reserva: "", valor_taxa: "", pago: "Não",
    status: "Pendente", cpf: "", rg: "", convidados: "", foto: "", divergencia_local: false, obs: "",
  };
  const abrirNova = () => {
    setModalType("add");
    setIsMoradorCadastrado(false);
    setFormData({ ...FORM_VAZIO });
    setShowViewModal(false);
    setShowModal(true);
  };
  const abrirEdicao = (f) => {
    setModalType("edit");
    setIsMoradorCadastrado(false);
    setFormData({ ...f, foto: getFotoFesta(f.id), data_reserva: formatDateTimeForInput(f.data_reserva) });
    setShowViewModal(false);
    setShowModal(true);
  };

  return (
    <TelaDeReservas
      titulo="Salão de festas"
      espaco={null}
      falta={FALTA_PAGAMENTO}
      reservas={festas}
      lista={dadosFiltrados}
      unidades={unidades}
      moradores={moradores}
      uploads={uploads}
      carregando={loadingInitial}
      salvando={loadingGlobal}
      filtros={{
        busca: searchTerm, setBusca: setSearchTerm, status: filterStatus, setStatus: setFilterStatus,
        pago: filterPago, setPago: setFilterPago, divergencia: filterDivergencia, setDivergencia: setFilterDivergencia,
        bloco: filterBloco, setBloco: setFilterBloco,
        periodo: filterPeriodo, setPeriodo: setFilterPeriodo,
      }}
      ordenacao={sortConfig[0] && { chave: sortConfig[0].key, direcao: sortConfig[0].direction }}
      onOrdenar={handleSort}
      statusNaTela={statusNaTela}
      temComprovante={temComprovante}
      ver={{
        aberto: showViewModal, reserva: selectedFesta,
        abrir: (f) => { setSelectedFesta(f); setShowViewModal(true); },
        fechar: () => setShowViewModal(false),
      }}
      form={{
        aberto: showModal, fechar: () => setShowModal(false), modo: modalType,
        dados: formData, setDados: setFormData, moradorCadastrado: isMoradorCadastrado,
      }}
      acoes={{
        nova: abrirNova, editar: abrirEdicao, salvar: handleSave, excluir: handleDelete,
        excluirAnexo: handleDeleteImage, escolherArquivos: handleFileChange,
        escolherMorador: handleMoradorSelect, alternarMoradorCadastrado: toggleMoradorCadastrado,
        gerarContrato: gerarContratoPDF, contratoVazio: gerarContratoVazio,
        exportar: () => setShowExportModal(true),
      }}
    >
      {/* ---- Exportação: a mesma de antes ---- */}
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
        <p className="vit-modal__desc mud-exporta">
          {dadosFiltrados.length === festas.length
            ? `Serão exportados os ${dadosFiltrados.length} reservas.`
            : `Serão exportados os ${dadosFiltrados.length} reservas que passam nos filtros atuais, de ${festas.length} no total.`}
        </p>

        <p className="vit-field__label mud-exporta">
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
    </TelaDeReservas>
  );
}
