 
 
import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Package, Search, Plus, Edit2, Trash2, X, Loader2,
  MoreVertical, Eye, Box, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight,
  User, Paperclip, Truck, History, Calendar, LayoutDashboard,
  ChevronDown, UploadCloud, Camera, MapPin, Archive, ZoomIn, ZoomOut,
  Phone, RotateCcw
} from "lucide-react";
import { useTheme } from "../theme/useTheme";

import { listar, criar, editar, remover } from "../api/db";
import RetiradaDialog from "../components/RetiradaDialog";
import { can } from "../auth/permissions";
import { pendentesDoCadastro, saidaVisivel, rotuloVia } from "../lib/retirada";
import { ehTelaDeToque } from "../lib/dispositivo";
import { maskCPF } from "../lib/format";
import { enviarAnexo, urlDoAnexo, removerAnexo } from "../api/anexos";
import {
  Button, Badge, Table, Tabs, Input, Select,
  PageHeader, EmptyState, useToast,
} from "../ui";

// --- ESTILOS ---
const pageContainer = { padding: 0 };

const badgeStyle = { padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' };

const modalOverlay = { 
  position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
  backgroundColor: 'rgba(0, 0, 0, 0.7)', // Mais escuro para destacar no Dark Mode
  display: 'flex', justifyContent: 'center', alignItems: 'center',
  zIndex: 1000,
  padding: '16px', boxSizing: 'border-box',
  backdropFilter: 'blur(4px)' // Efeito de desfoque igual ao da Piscina
};
const modalContent = { padding: '24px', borderRadius: '20px', width: '90%', position: 'relative' };
const modalHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' };
const labelStyle = { fontSize: '11px', fontWeight: '700', marginBottom: '5px', display: 'block', textTransform: 'uppercase', color: 'var(--fg-secondary)' };
const selectStyle = { 
  padding: '12px 15px', // Mais espaçoso igual Piscina
  borderRadius: '12px', 
  border: '1px solid', 
  outline: 'none', 
  fontSize: '14px',
  transition: 'all 0.2s'
};

const spinnerKeyframeName = 'encomendas-spin';
const spinnerAnimation = { animation: `${spinnerKeyframeName} 0.85s linear infinite` };
const buttonSpinnerStyle = { ...spinnerAnimation, marginRight: '8px', display: 'inline-block' };

// Gera duas versões da foto: `src` (~1400px, vai pro upload) e `thumb` (~240px,
// usada SÓ no preview da tela). Mostrar a miniatura evita o navegador decodificar a
// imagem grande em memória para cada preview — principal causa do estouro de memória
// (mobile e desktop). Em caso de erro, cai para o arquivo original (sem miniatura).
function gerarFotoOtimizada(file) {
  return new Promise((resolve) => {
    const fallback = () => {
      const r = new FileReader();
      r.onloadend = () => resolve({ src: r.result, thumb: r.result, name: file.name });
      r.readAsDataURL(file);
    };
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        try {
          const desenhar = (maxLado, q) => {
            const ratio = Math.min(1, maxLado / Math.max(img.width, img.height));
            const w = Math.round(img.width * ratio);
            const h = Math.round(img.height * ratio);
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            canvas.getContext("2d").drawImage(img, 0, 0, w, h);
            return canvas.toDataURL("image/jpeg", q);
          };
          resolve({ src: desenhar(1400, 0.75), thumb: desenhar(240, 0.6), name: file.name });
        } catch { fallback(); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); fallback(); };
      img.src = url;
    } catch { fallback(); }
  });
}

// Lightbox de foto em tela cheia: zoom por pinça (touch), duplo-toque/duplo-clique,
// roda do mouse e botões +/−; arrasto quando ampliada; navegação entre fotos;
// fecha pelo X ou clicando fora da imagem.
function PhotoLightbox({ src, loading, onClose, onPrev, onNext, count, index }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const gesto = useRef({ mode: null, startDist: 0, startScale: 1, startX: 0, startY: 0, origX: 0, origY: 0, lastTap: 0 });

  /**
   * Dedo (ou mouse) encostado agora.
   *
   * Isto é ESTADO, e não mais `gesto.current.mode`, porque decide o que a tela
   * desenha: com gesto em curso a imagem não pode ter transição, senão ela
   * persegue o dedo com atraso. Ref mudada não provoca render, então o valor
   * lido durante o desenho era o do gesto ANTERIOR — soltar o dedo deixava a
   * transição desligada até algo mais causar um render.
   *
   * O resto do gesto continua em ref: posição inicial e escala inicial mudam a
   * cada pixel e não são desenhadas, então virariam render à toa.
   */
  const [arrastando, setArrastando] = useState(false);

  const aplicar = (s) => {
    const v = Math.min(5, Math.max(1, s));
    setScale(v);
    if (v <= 1) setPos({ x: 0, y: 0 });
  };
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onTouchStart = (e) => {
    const g = gesto.current;
    setArrastando(true);
    if (e.touches.length === 2) {
      g.mode = "pinch";
      g.startDist = dist(e.touches);
      g.startScale = scale;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      const agora = Date.now();
      if (agora - g.lastTap < 300) { // duplo-toque alterna 1x ↔ 2.5x
        aplicar(scale > 1 ? 1 : 2.5);
        g.lastTap = 0; g.mode = null;
        setArrastando(false);
        return;
      }
      g.lastTap = agora;
      g.mode = "pan";
      g.startX = t.clientX; g.startY = t.clientY;
      g.origX = pos.x; g.origY = pos.y;
    }
  };
  const onTouchMove = (e) => {
    const g = gesto.current;
    if (g.mode === "pinch" && e.touches.length === 2) {
      aplicar(g.startScale * (dist(e.touches) / g.startDist));
    } else if (g.mode === "pan" && e.touches.length === 1 && scale > 1) {
      const t = e.touches[0];
      setPos({ x: g.origX + (t.clientX - g.startX), y: g.origY + (t.clientY - g.startY) });
    }
  };
  const onTouchEnd = () => { gesto.current.mode = null; setArrastando(false); };

  // Desktop: roda do mouse dá zoom; arrastar move quando ampliada
  const onWheel = (e) => { aplicar(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); };
  const onMouseDown = (e) => {
    if (scale <= 1) return;
    const g = gesto.current;
    g.mode = "drag"; g.startX = e.clientX; g.startY = e.clientY; g.origX = pos.x; g.origY = pos.y;
    setArrastando(true);
  };
  const onMouseMove = (e) => {
    const g = gesto.current;
    if (g.mode !== "drag") return;
    setPos({ x: g.origX + (e.clientX - g.startX), y: g.origY + (e.clientY - g.startY) });
  };
  const onMouseUp = () => { gesto.current.mode = null; setArrastando(false); };

  const btn = { width: 42, height: 42, borderRadius: '50%', border: 'none', backgroundColor: 'rgba(40,22,18,0.75)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', fontSize: 22 };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ position: 'fixed', top: 14, right: 14, display: 'flex', gap: 10, zIndex: 3002 }}>
        <button type="button" style={btn} onClick={() => aplicar(scale / 1.4)} title="Diminuir zoom"><ZoomOut size={20} /></button>
        <button type="button" style={btn} onClick={() => aplicar(scale * 1.4)} title="Aumentar zoom"><ZoomIn size={20} /></button>
        <button type="button" style={{ ...btn, backgroundColor: 'rgba(180,71,42,0.85)' }} onClick={onClose} title="Fechar"><X size={20} /></button>
      </div>

      {count > 1 && (
        <>
          <button type="button" style={{ ...btn, position: 'fixed', left: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 3002 }} onClick={onPrev}>‹</button>
          <button type="button" style={{ ...btn, position: 'fixed', right: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 3002 }} onClick={onNext}>›</button>
          <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', color: 'white', fontSize: 13, backgroundColor: 'rgba(40,22,18,0.7)', padding: '4px 12px', borderRadius: 14, zIndex: 3002 }}>{index + 1} / {count}</div>
        </>
      )}

      {/* Palco da imagem — touchAction:none entrega os gestos para os handlers */}
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onDoubleClick={() => aplicar(scale > 1 ? 1 : 2.5)}
        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', overflow: 'hidden', cursor: scale > 1 ? 'grab' : 'default' }}
      >
        {loading ? (
          <Loader2 style={spinnerAnimation} size={34} color="white" />
        ) : src ? (
          <img
            src={src}
            alt="Foto da encomenda"
            draggable={false}
            style={{ maxWidth: '92vw', maxHeight: '86vh', transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transition: arrastando ? 'none' : 'transform 0.15s ease', userSelect: 'none' }}
          />
        ) : (
          <span style={{ color: 'white' }}>Não foi possível carregar a foto</span>
        )}
      </div>
    </div>
  );
}

// `entregas` é do porteiro e da administração (0015). A mensagem crua do
// Postgres fala de row-level security, que não diz nada a quem está na portaria.
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para alterar encomendas.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Sem conexão com o servidor. Tente de novo.";
  }
  return msg;
};

export default function Encomendas({ user }) {
  const { theme } = useTheme();
  const toast = useToast();

  // Cache local (stale-while-revalidate): mostra os últimos dados na hora e
  // atualiza em segundo plano (o Apps Script leva ~1,5s por requisição).
  const CACHE_ENCOMENDAS = "cache_encomendas_v1";
  const lerCacheEnc = () => {
    try { return JSON.parse(localStorage.getItem(CACHE_ENCOMENDAS)) || {}; } catch { return {}; }
  };

  // Estados de Dados
  const [encomendas, setEncomendas] = useState(() => lerCacheEnc().encomendas || []);
  const [unidades, setUnidades] = useState(() => lerCacheEnc().unidades || []);
  const [moradores, setMoradores] = useState(() => lerCacheEnc().moradores || []);
  const [confirmacoes, setConfirmacoes] = useState(() => lerCacheEnc().confirmacoes || []);
  const [entregasNF, setEntregasNF] = useState(() => lerCacheEnc().entregasNF || []);
  const [loadingInitial, setLoadingInitial] = useState(() => !((lerCacheEnc().encomendas || []).length));
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  
  // Interface Modal e Busca
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState("add");
  // Qual encomenda o formulário está editando. `null` é cadastro novo.
  const [editandoId, setEditandoId] = useState(null);
  const [retiradaItens, setRetiradaItens] = useState(() => lerCacheEnc().retiradaItens || []);
  const [retiradas, setRetiradas] = useState(() => lerCacheEnc().retiradas || []);
  const [assinaturaAberta, setAssinaturaAberta] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [excluindoOcupado, setExcluindoOcupado] = useState(false);
  const [showViewDetails, setShowViewDetails] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [photoSrc, setPhotoSrc] = useState(null);
  const [photoZoomOpen, setPhotoZoomOpen] = useState(false); // lightbox da foto
  const [photoLoading, setPhotoLoading] = useState(false);
  const [retiradaAberta, setRetiradaAberta] = useState(false);
  const [retiradaUnidade, setRetiradaUnidade] = useState(null);
  const [retiradaCadastro, setRetiradaCadastro] = useState(null);
  const [entregaFotos, setEntregaFotos] = useState(() => lerCacheEnc().entregaFotos || []);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("Pendente");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showWhatsappPrompt, setShowWhatsappPrompt] = useState(false);
  const [pendingWhatsapp, setPendingWhatsapp] = useState(null);
  // Lembrete de escrever o número NA ENCOMENDA — não em livro nenhum.
  // Aparece quando não há telefone confirmado, porque aí não sai WhatsApp e o
  // número escrito na caixa é o único jeito de casar pacote e cadastro.
  const [anotarInfo, setAnotarInfo] = useState(null);
  // Medido uma vez: o aparelho não ganha nem perde tela de toque no meio da sessão.
  const [temToque] = useState(ehTelaDeToque);
  const [whatsappCodLoading, setWhatsappCodLoading] = useState(false);
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const [unitSearch, setUnitSearch] = useState("");
  const dropdownRef = useRef(null);

  // Estados para confirmação de entrega com foto (várias fotos obrigatórias)

  // Estados para o fluxo de Armazenamento
  const [showArmazenarModal, setShowArmazenarModal] = useState(false);
  const [armazenarItem, setArmazenarItem] = useState(null);
  const [armazenarLocal, setArmazenarLocal] = useState("");
  const [armazenarPor, setArmazenarPor] = useState("");
  const [armazenarLoading, setArmazenarLoading] = useState(false);

  const [formErrors, setFormErrors] = useState({});

  // Form Data
  const novoItem = () => ({ numero_fiscal: "", transportadora: "", foto: null });

  const [formData, setFormData] = useState({
    id_unidade: "",
    id_morador: "",
    nome: "",
    telefone: "",
    data_recebimento: new Date().toISOString().split('T')[0],
    status: "Pendente",
    quantidade: 1,
    itens: [novoItem()]
  });

  const resetForm = () => {
    setFormData({
      id_unidade: "",
      id_morador: "",
      nome: "",
      telefone: "",
        data_recebimento: new Date().toISOString().split('T')[0],
      status: "Pendente",
      quantidade: 1,
      itens: [novoItem()]
    });
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.id_unidade) errors.id_unidade = "Selecione a unidade destinária.";
    if (!formData.nome.trim()) errors.nome = "Nome do destinatário é obrigatório.";
    const q = Number(formData.quantidade);
    if (!q || q < 1 || q > 10) errors.quantidade = "Quantidade deve ser de 1 a 10.";
    // Na edição a foto não é exigida: as que existem já estão no bucket e não
    // voltam para o formulário. Exigi-la aqui impediria corrigir um nome sem
    // fotografar a etiqueta de novo — e a foto nova, quando houver, é somada
    // às antigas na gravação.
    const editando = modalType === "edit";
    const itensErr = formData.itens.map((it) => ({
      numero_fiscal: !it.numero_fiscal.trim() ? "Nº fiscal obrigatório." : "",
      foto: (!it.foto && !editando) ? "Foto obrigatória." : ""
    }));
    if (itensErr.some((e) => e.numero_fiscal || e.foto)) errors.itens = itensErr;
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  useEffect(() => { fetchData(); }, []);

  // Carrega a foto selecionada via backend (getFoto -> base64), sem depender de
  // compartilhamento/links públicos do Drive (que falham ao exibir em <img>).
  useEffect(() => {
    if (!showViewDetails || !selectedDetails) {
      setPhotoSrc(null);
      setPhotoLoading(false);
      return;
    }
    const fileIds = getEntregaPhotoFileIds(selectedDetails);
    const fileId = fileIds[selectedPhotoIndex];
    if (!fileId) {
      setPhotoSrc(null);
      setPhotoLoading(false);
      return;
    }
    // Nada a baixar nem a adiantar: `fileId` já é o link assinado, resolvido no
    // carregamento. O pré-carregamento da foto seguinte e o cache de 8 imagens
    // existiam por causa do download em base64 pelo Drive, que saiu de cena.
    setPhotoSrc(fileId);
    setPhotoLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showViewDetails, selectedDetails, selectedPhotoIndex, entregaFotos]);

  const fetchData = async () => {
    try {
      // `ENTREGAS_RECEBIMENTO` saiu daqui junto com a tabela (0027). Ela nasceu
      // para a foto de recebimento, nunca foi usada, e o lugar dela é hoje o
      // registro de retirada com assinatura.
      //
      // A remoção da tabela sem a remoção desta linha derrubou o grid inteiro:
      // `listar` estoura, o `Promise.all` rejeita, e `setEncomendas` nunca roda
      // — a tela seguia mostrando o cache antigo, então uma encomenda recém
      // cadastrada simplesmente não aparecia. Nada na tela dizia que algo tinha
      // falhado.
      const [resEnc, resUni, resMor, resFotos, resNF, resConf, resItens, resRet] = await Promise.all([
        listar("ENTREGAS"),
        listar("UNIDADES"),
        listar("MORADORES"),
        listar("ENTREGAS_FOTO"),
        listar("ENTREGAS_NF"),
        listar("CONFIRMACAO"),
        // O que já saiu em retirada parcial (0028). É o que impede excluir uma
        // encomenda cujo comprovante assinado já existe.
        listar("RETIRADA_ITENS"),
        // As retiradas em si: é delas que sai "quem retirou e quando" de cada
        // item, no Ver Detalhes.
        listar("RETIRADAS"),
      ]);
      const arr = (x) => Array.isArray(x) ? x : [];
      const encomendasLoaded = arr(resEnc);
      const uni = arr(resUni), mor = arr(resMor), conf = arr(resConf), nf = arr(resNF);
      const itensRet = arr(resItens);
      const rets = arr(resRet);

      // Foto no bucket vira link assinado aqui, uma vez só. Assim todo ponto
      // que exibe imagem continua recebendo "um endereço", sem precisar saber
      // se ele veio do Storage ou do Drive.
      const comFonte = async (linhas) => Promise.all(linhas.map(async (row) => ({
        ...row,
        fonte_foto: row.caminho_storage
          ? await urlDoAnexo({ caminho_storage: row.caminho_storage })
          : (row.file_id || row.FILE_ID || null),
      })));
      const fotos = await comFonte(arr(resFotos));
      setEncomendas(encomendasLoaded);
      setUnidades(uni);
      setMoradores(mor);
      setConfirmacoes(conf);
      setEntregaFotos(fotos);
      setEntregasNF(nf);
      setRetiradaItens(itensRet);
      setRetiradas(rets);

      // Atualiza o cache para a próxima abertura ser instantânea.
      try {
        localStorage.setItem(CACHE_ENCOMENDAS, JSON.stringify({
          encomendas: encomendasLoaded, unidades: uni, moradores: mor, confirmacoes: conf,
          entregaFotos: fotos, entregasNF: nf, retiradaItens: itensRet, retiradas: rets
        }));
      } catch { /* localStorage cheio/indisponível — segue sem cache */ }
      return encomendasLoaded;
    } catch (e) {
      console.error(e);
      return [];
    } finally {
      setLoadingInitial(false);
    }
  };

  // --- LÓGICA DE ASSOCIAÇÃO ---

  const getUnitLabel = (id) => {
    const u = unidades.find(unit => unit.id.toString() === id.toString());
    return u ? `BLOCO ${u.bloco} - UNIDADE ${u.unidade}` : "Selecione a unidade...";
  };

  const getCell = (item, key) => {
    if (!item) return "";
    const normalizedKey = key.toString().toLowerCase();
    const foundKey = Object.keys(item).find((k) => k.toLowerCase() === normalizedKey);
    return foundKey ? item[foundKey] : "";
  };

  const formatBlockUnit = (value) => {
    const raw = `${value || ""}`.trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 4) {
      const bloco = digits.slice(0, -3);
      const unidade = digits.slice(-3);
      return `BLOCO ${bloco} - UNIDADE ${unidade}`;
    }
    return raw;
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  };

  const normalizeWhatsappPhone = (phone) => {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, "");
    if (!digits) return null;
    if (digits.startsWith("55")) return digits;
    return digits.length >= 10 ? `55${digits}` : digits;
  };

  const formatPhoneBR = (value) => {
    if (!value) return "";
    const digits = value.toString().replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    const ddd = digits.slice(0,2);
    const rest = digits.slice(2);
    if (rest.length <= 5) return `(${ddd})${rest}`;
    return `(${ddd})${rest.slice(0,5)}-${rest.slice(5,9)}`;
  };

  const getWhatsappUrl = ({ phone, referencia, cod }) => {
    const number = normalizeWhatsappPhone(phone);
    if (!number) return null;
    const message = encodeURIComponent(
      `Olá! Sua encomenda chegou ao condomínio. Referência: ${referencia || 'sem referência'}. Por favor, apresente o código ${cod} para efetuar a retirada.`
    );
    return `https://api.whatsapp.com/send?phone=${number}&text=${message}`;
  };

  function getEntregaPhotoRows(item) {
    // As fotos (etiqueta do cadastro E comprovação da baixa) são gravadas na ENTREGAS_FOTO
    // com ID_ENTREGA = id numérico da entrega. Casamos por esse id; mantemos o cod_entrega
    // como fallback apenas para registros antigos que possam ter sido salvos pelo código.
    const itemId = (getCell(item, "id") || getCell(item, "ID") || "").toString();
    const itemCodEntrega = (getCell(item, "COD_ENTREGA") || getCell(item, "cod_entrega") || "").toString();
    const chaves = [itemId, itemCodEntrega].filter(Boolean);
    const rows = entregaFotos.filter((row) => {
      const rowId = (getCell(row, "ID_ENTREGA") || getCell(row, "id_entrega") || getCell(row, "id") || "").toString();
      return chaves.indexOf(rowId) !== -1;
    });
    return rows;
  }

  // Pega os FILE_ID das fotos (na mesma ordem das URLs), p/ buscar a imagem via backend.
  function getEntregaPhotoFileIds(item) {
    return getEntregaPhotoRows(item).map((row) => {
      if (row.fonte_foto) return row.fonte_foto;   // link do bucket, resolvido no carregamento
      const fileId = getCell(row, "FILE_ID") || getCell(row, "file_id");
      if (fileId) return fileId.toString();
      const driveUrl = getCell(row, "URL_DRIVE") || getCell(row, "url_drive");
      const m = driveUrl ? driveUrl.toString().match(/[-\w]{25,}/) : null;
      return m ? m[0] : null;
    }).filter(Boolean);
  }

  // Itens (NF/transportadora) de uma encomenda — casados por ID_ENCOMENDA = ENTREGAS.ID.
  function getNFsDaEncomenda(item) {
    const itemId = (getCell(item, "id") || getCell(item, "ID") || "").toString();
    return entregasNF.filter((row) => {
      const rid = (getCell(row, "ID_ENCOMENDA") || getCell(row, "id_encomenda") || "").toString();
      return rid === itemId;
    });
  }

  /**
   * O que o diálogo de retirada mostra: só o cadastro aberto — nunca as outras
   * encomendas da mesma unidade. O porquê está em `src/lib/retirada.js`.
   */
  const pendentesDaRetirada = useMemo(
    () => pendentesDoCadastro(encomendas, retiradaCadastro),
    [encomendas, retiradaCadastro]
  );

  /**
   * As notas fiscais do cadastro aberto — uma por item, de ENTREGAS_NF.
   *
   * É delas que sai o rótulo de cada caixa na conferência: o número fiscal está
   * impresso na etiqueta, então é por ele que o porteiro acha o pacote na
   * prateleira. "Volume 2 de 3" não diz qual pacote é.
   */
  /**
   * O que já saiu deste cadastro em retirada anterior.
   *
   * O diálogo usa isto para NÃO oferecer de novo um item já entregue — sem
   * isso, a segunda retirada mostrava as duas caixas e deixava o porteiro
   * decidir de memória qual já tinha ido.
   */
  const jaRetiradosDoCadastro = useMemo(() => {
    if (retiradaCadastro === null || retiradaCadastro === undefined) return [];
    return retiradaItens.filter(
      (row) => String(getCell(row, "id_entrega")) === String(retiradaCadastro)
    );
  }, [retiradaItens, retiradaCadastro]);

  const notasDaRetirada = useMemo(() => {
    if (retiradaCadastro === null || retiradaCadastro === undefined) return [];
    return entregasNF.filter(
      (row) => String(getCell(row, "id_encomenda")) === String(retiradaCadastro)
    );
  }, [entregasNF, retiradaCadastro]);

  const foiNotificada = (item) => {
    if (!item) return false;
    const notif = (getCell(item, "NOTIFICADO") || getCell(item, "notificado") || "").toString().toUpperCase();
    return notif === "SIM";
  };

  /**
   * Endereço exibível de uma foto de encomenda.
   *
   * Aqui havia um download pelo `getFoto` do Apps Script, com cache em memória
   * e limite de 8 imagens: as fotos viviam privadas no Drive e só o backend
   * autenticado as alcançava, então cada uma virava base64 antes de aparecer.
   *
   * Esse caminho não existe mais, e a conta é simples: as quatro tabelas de
   * encomenda estão VAZIAS — nunca houve foto de encomenda no Drive. Manter um
   * ramo que hoje só pode falhar (o `getFoto` exige uma sessão que ninguém mais
   * emite) daria um spinner que gira e não resolve nada. Foto de encomenda
   * agora nasce no bucket, e link assinado vai direto para o `<img>`.
   *
   * A função continua async porque quem chama espera uma Promise.
   */
  const fetchFotoCached = async (fonte) => {
    if (!fonte) return null;
    const texto = String(fonte);
    return /^https?:/i.test(texto) ? texto : null;
  };

  // Pré-carrega SÓ a 1ª foto da encomenda (ao passar o mouse/tocar em "Ver detalhes").
  // Antes carregava todas — com até 10 fotos por encomenda isso pesava demais.
  const prefetchItemPhotos = (item) => {
    if (!item) return;
    const ids = getEntregaPhotoFileIds(item);
    if (ids[0]) fetchFotoCached(ids[0]);
  };

  // Fotos da aba ativa (só usamos .length e o índice). Recebimento = etiqueta; Entrega = comprovante.
  const selectedPhotoUrls = selectedDetails ? getEntregaPhotoFileIds(selectedDetails) : [];

  /**
   * O item que a foto na tela retrata, e o que aconteceu com ele.
   *
   * A ligação é `entregas_foto.id_nota` (0029). Sem ela, "entregue por Fulano
   * às 14h" ficava solto sobre a encomenda inteira, valendo igualmente para a
   * caixa que saiu e para a que continua na prateleira — e numa encomenda
   * parcialmente entregue isso é simplesmente falso para metade dos volumes.
   *
   * Foto antiga tem `id_nota` nulo: nesse caso não se inventa vínculo nenhum e
   * a tela cai no resumo da encomenda, como antes.
   */
  const itemDaFoto = useMemo(() => {
    if (!selectedDetails) return null;
    const linha = getEntregaPhotoRows(selectedDetails)[selectedPhotoIndex];
    const idNota = linha ? getCell(linha, "id_nota") : "";
    if (!idNota) return null;

    const nota = entregasNF.find((n) => String(getCell(n, "id")) === String(idNota)) ?? null;
    const saida = retiradaItens.find((r) => String(getCell(r, "id_nota")) === String(idNota)) ?? null;
    const retirada = saida
      ? retiradas.find((r) => String(getCell(r, "id")) === String(getCell(saida, "id_retirada"))) ?? null
      : null;

    return { nota, retirada };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDetails, selectedPhotoIndex, entregaFotos, entregasNF, retiradaItens, retiradas]);

  const unidadesFiltradas = unidades.filter(u => {
    const termo = unitSearch.toLowerCase().trim();
    if (!termo) return true;
    const bloco = (u.bloco ?? "").toString().toLowerCase();
    const unidade = (u.unidade ?? "").toString().toLowerCase();
    const idUnidade = `${bloco}${unidade}`;            // ex.: bloco 5 + apto 206 = "5206"
    const digitos = termo.replace(/\D/g, "");          // "bloco 5" -> "5"
    if (digitos) {
      // busca por id completo (5206), por apartamento (206) ou por bloco (5)
      return idUnidade.includes(digitos) || unidade.includes(digitos) || bloco.includes(digitos);
    }
    return bloco.includes(termo) || unidade.includes(termo);
  }).sort((a, b) => {
    // Ordena por bloco e depois por unidade (numérico quando possível).
    const num = (v) => { const n = parseInt(`${v}`.replace(/\D/g, ""), 10); return Number.isNaN(n) ? null : n; };
    const ba = num(a.bloco), bb = num(b.bloco);
    if (ba !== null && bb !== null && ba !== bb) return ba - bb;
    if (ba === null || bb === null) { const c = `${a.bloco}`.localeCompare(`${b.bloco}`); if (c) return c; }
    const ua = num(a.unidade), ub = num(b.unidade);
    if (ua !== null && ub !== null) return ua - ub;
    return `${a.unidade}`.localeCompare(`${b.unidade}`);
  });

  // Morador só "existe" para encomendas se o número dele foi CONFIRMADO na aba CONFIRMACAO.
  const confirmadoIds = React.useMemo(
    () => new Set(
      confirmacoes
        .filter(c => (c.status || "").toString().trim() === "Confirmado")
        .map(c => String(c.id_morador))
    ),
    [confirmacoes]
  );
  const isConfirmado = (moradorId) => confirmadoIds.has(String(moradorId));

  const moradoresDaUnidade = moradores.filter(m =>
    m.id_unidade?.toString() === formData.id_unidade?.toString() &&
    (m.status || "").toString() === "Ativo" &&
    (m.tipo_morador || "Titular").toString() === "Titular"
  );

  const handleUnitSelect = (uId) => {
    const mFiltrados = moradores.filter(m =>
      m.id_unidade?.toString() === uId.toString() &&
      (m.status || "").toString() === "Ativo" &&
      (m.tipo_morador || "Titular").toString() === "Titular"
    );

    let novoNome = "";
    let novoTelefone = "";
    let novoMoradorId = "";

    // 1 morador: traz o NOME sempre; o TELEFONE só se o número foi CONFIRMADO.
    if (mFiltrados.length === 1) {
      novoNome = mFiltrados[0].nome;
      novoTelefone = isConfirmado(mFiltrados[0].id) ? mFiltrados[0].telefone : "";
      novoMoradorId = mFiltrados[0].id;
    }

    setFormData({
      ...formData,
      id_unidade: uId,
      id_morador: novoMoradorId,
      nome: novoNome,
      telefone: novoTelefone
    });
    setShowUnitDropdown(false);
    setUnitSearch("");
  };

  const handleMoradorSelect = (mId) => {
    const m = moradores.find(mor => mor.id.toString() === mId.toString());
    if (m) {
      // Nome sempre; telefone só quando o número estiver CONFIRMADO.
      setFormData({ ...formData, id_morador: m.id, nome: m.nome, telefone: isConfirmado(m.id) ? m.telefone : "" });
    }
  };

  const setQuantidade = (qtdRaw) => {
    let q = Number(qtdRaw);
    if (!q || q < 1) q = 1;
    if (q > 10) q = 10;
    setFormData((prev) => {
      const itens = prev.itens.slice(0, q);
      while (itens.length < q) itens.push(novoItem());
      return { ...prev, quantidade: q, itens };
    });
  };

  const setItemCampo = (idx, campo, valor) => {
    setFormData((prev) => {
      const itens = prev.itens.map((it, i) => i === idx ? { ...it, [campo]: valor } : it);
      return { ...prev, itens };
    });
  };

  const handleRemoveItemPhoto = (idx) => {
    setFormData((prev) => {
      const itens = prev.itens.map((it, i) => i === idx ? { ...it, foto: null } : it);
      return { ...prev, itens };
    });
  };

  const arquivoValido = (file) => {
    if (!file) return false;
    const MAX = 10 * 1024 * 1024;
    if (!(file.type || "").toLowerCase().startsWith("image/")) { toast.error("Só é possível anexar imagem. Tente uma foto em JPG ou PNG."); return false; }
    if (file.size > MAX) { toast.error("A imagem passa de 10 MB. Tire a foto com resolução menor."); return false; }
    return true;
  };

  // 1 foto por item: pega só o primeiro arquivo (câmera ou galeria).
  const handleItemFile = (idx, e) => {
    const file = (e.target.files || [])[0];
    if (!file || !arquivoValido(file)) { e.target.value = ""; return; }

    gerarFotoOtimizada(file).then((foto) => {
      setFormData((prev) => {
        const itens = prev.itens.map((it, i) => i === idx ? { ...it, foto } : it);
        return { ...prev, itens };
      });
      e.target.value = "";
    });
  };

  const handleSave = async () => {
    if (!validateForm()) {
      setLoadingGlobal(false);
      return;
    }

    setLoadingGlobal(true);

    const quantidade = formData.quantidade != null && formData.quantidade !== ""
      ? Number(formData.quantidade)
      : (formData.itens.length || 1);

    // Campo a campo, com os mesmos padrões que o Apps Script gravava — quem
    // trabalha na portaria lê estes valores todo dia. `cod` e `numero_encomenda`
    // ficam de fora de propósito: quem preenche é o gatilho do 0020.
    const dados = {
      id_unidade: formData.id_unidade ? Number(formData.id_unidade) : null,
      id_morador: formData.id_morador || "",
      nome: formData.nome.trim(),
      telefone: formData.telefone.trim(),
      quantidade_encomenda: String(quantidade),
      data_entrada: new Date().toISOString(),
      status: formData.status || "Pendente",
      notificado: "NAO",                 // vira SIM só quando o WhatsApp sai
      status_notificacao: "NAO ENVIADO",
      created_by: user?.nome || "Sistema",
    };

    // Editar não mexe em `data_entrada`, `notificado`, `status_notificacao`,
    // `created_by`, `cod` nem `numero_encomenda`: são o registro de quando e
    // como a encomenda entrou, e o código já está com o morador. Corrigir o
    // nome do destinatário não pode reescrever a chegada dela.
    if (modalType === "edit" && editandoId != null) {
      const troca = await editar("ENTREGAS", editandoId, {
        id_unidade: dados.id_unidade,
        id_morador: dados.id_morador,
        nome: dados.nome,
        telefone: dados.telefone,
        quantidade_encomenda: dados.quantidade_encomenda,
        status: dados.status,
      });
      if (!troca.success) {
        toast.error(mensagemErro(troca.message));
        setLoadingGlobal(false);
        return;
      }

      // Notas: as que existem são reescritas na ordem, o excedente é apagado e
      // o que falta é criado. Apagar todas e recriar seria mais curto e trocaria
      // os ids — e id de nota é o que liga a foto ao volume.
      const notasAtuais = getNFsDaEncomenda({ id: editandoId });
      const desejadas = formData.itens.filter((it) => it.numero_fiscal.trim() || it.transportadora.trim());
      let falhas = 0;

      for (let i = 0; i < Math.max(notasAtuais.length, desejadas.length); i++) {
        const atual = notasAtuais[i];
        const nova = desejadas[i];
        let idNota = atual ? getCell(atual, "id") : null;

        if (atual && nova) {
          await editar("ENTREGAS_NF", idNota, {
            numero_fiscal: nova.numero_fiscal.trim(),
            transportadora: nova.transportadora.trim(),
          });
        } else if (atual && !nova) {
          await remover("ENTREGAS_NF", idNota);
          idNota = null;
        } else if (!atual && nova) {
          const linha = await criar("ENTREGAS_NF", {
            id_encomenda: String(editandoId),
            numero_fiscal: nova.numero_fiscal.trim(),
            transportadora: nova.transportadora.trim(),
            created_by: user?.nome || "Sistema",
          });
          idNota = linha.success ? (linha.data?.id ?? null) : null;
        }

        // Foto acrescentada durante a edição entra como mais uma etiqueta, e já
        // nasce ligada à nota daquele item. As que já estavam continuam onde
        // estão: o formulário não as carrega, então não há como removê-las por
        // engano daqui.
        const foto = nova?.foto;
        if (!foto) continue;
        const envio = await enviarAnexo("encomendas", editandoId, foto.src);
        if (!envio.success) { falhas++; continue; }
        const linhaFoto = await criar("ENTREGAS_FOTO", {
          id_entrega: String(editandoId),
          id_nota: idNota,
          nome_arquivo: envio.nome,
          caminho_storage: envio.caminho,
          created_by: user?.nome || "Sistema",
        });
        if (!linhaFoto.success) { falhas++; await removerAnexo(envio.caminho); }
      }
      if (falhas) toast.error(`Encomenda atualizada, mas ${falhas} foto(s) não subiram.`);

      toast.success("Encomenda atualizada");
      setShowModal(false);
      setModalType("add");
      setEditandoId(null);
      resetForm();
      await fetchData();
      setLoadingGlobal(false);
      return;
    }

    let r = null;
    // O gatilho sorteia um código livre, mas dois porteiros cadastrando no
    // mesmo instante ainda podem sortear o mesmo — e aí quem recusa é o índice
    // único, que é a garantia de verdade. Tentar de novo sorteia outro.
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      r = await criar("ENTREGAS", dados);
      if (r.success || !/23505|duplicate key|unique/i.test(r.message ?? "")) break;
    }
    if (!r?.success) {
      toast.error(mensagemErro(r?.message));
      setLoadingGlobal(false);
      return;
    }

    // A linha volta do insert já com código e número. Nada de esperar.
    const encomenda = r.data;
    const idEncomenda = encomenda.id;

    // Nota e foto do MESMO item, no mesmo passo.
    //
    // Antes eram dois laços separados e a ligação entre a foto e a nota era só
    // a ordem em que os dois rodavam — coincidência que ninguém garantia. Agora
    // a linha da foto guarda `id_nota` (0029), e é isso que permite ao Ver
    // Detalhes dizer a qual nota aquela imagem pertence e quem a retirou.
    let fotosComFalha = 0;
    for (const it of formData.itens) {
      const nf = it.numero_fiscal.trim();
      const transp = it.transportadora.trim();
      let idNota = null;

      if (nf || transp) {
        // `entregas_nf.id` é identity — não mandar. Na planilha era "NF-<id>-<n>".
        const linha = await criar("ENTREGAS_NF", {
          id_encomenda: String(idEncomenda),
          numero_fiscal: nf,
          transportadora: transp,
          created_by: user?.nome || "Sistema",
        });
        if (linha.success) idNota = linha.data?.id ?? null;
        else console.warn("Item não registrado:", nf, linha.message);
      }

      if (!it.foto) continue;
      const envio = await enviarAnexo("encomendas", idEncomenda, it.foto.src);
      if (!envio.success) { fotosComFalha++; continue; }
      const linhaFoto = await criar("ENTREGAS_FOTO", {
        id_entrega: String(idEncomenda),
        id_nota: idNota,
        nome_arquivo: envio.nome,
        caminho_storage: envio.caminho,
        created_by: user?.nome || "Sistema",
      });
      // Arquivo no bucket sem linha que o referencie é órfão invisível.
      if (!linhaFoto.success) { fotosComFalha++; await removerAnexo(envio.caminho); }
    }
    if (fotosComFalha) toast.error(`Encomenda registrada, mas ${fotosComFalha} foto(s) não subiram.`);

    setShowModal(false);

    // Só notifica por WhatsApp quem tem número (preenchido só quando CONFIRMADO).
    // Sem número confirmado, o número escrito na caixa é o que resta.
    const phoneExists = formData.telefone && formData.telefone.toString().trim();
    const unitLabelAtual = getUnitLabel(formData.id_unidade);

    if (phoneExists) {
      setPendingWhatsapp({
        id: idEncomenda,
        phone: formData.telefone,
        referencia: formData.itens.map((it) => it.numero_fiscal.trim()).filter(Boolean).join(", ") || "sem referência",
        cod: encomenda.cod,
        numero: encomenda.numero_encomenda || "—",
      });
      setWhatsappCodLoading(false);
      setShowWhatsappPrompt(true);
    } else {
      setAnotarInfo({ numero: encomenda.numero_encomenda || "—", unitLabel: unitLabelAtual });
    }

    resetForm();
    await fetchData();
    setLoadingGlobal(false);
  };

  const handleResendWhatsapp = async (item) => {
    const phone = getCell(item, 'TELEFONE') || getCell(item, 'telefone');
    if (!phone) {
      toast.error("Este destinatário não tem telefone cadastrado. Cadastre em Moradores para notificar.");
      return;
    }

    const idItem = getCell(item, 'id') || getCell(item, 'ID');
    const nfs = getNFsDaEncomenda(item);
    const referencia = nfs.map((nf) => getCell(nf, 'NUMERO_FISCAL') || getCell(nf, 'numero_fiscal'))
      .filter(Boolean).join(", ") || 'sem referência';
    const existingCod = getCell(item, 'COD') || getCell(item, 'cod') || getCell(item, 'COD_ENTREGA') || getCell(item, 'cod_entrega');
    const numeroItem = getCell(item, 'NUMERO_ENCOMENDA') || getCell(item, 'numero_encomenda') || '—';

    if (existingCod) {
      setPendingWhatsapp({ id: idItem, phone, referencia, cod: existingCod, numero: numeroItem });
      setWhatsappCodLoading(false);
      setShowWhatsappPrompt(true);
      return;
    }

    // Sem código: a encomenda foi cadastrada sem telefone, e o gatilho do 0020
    // só sorteia código quando há número. Isso não se conserta daqui — o
    // caminho é recadastrar com o telefone. Dizer isso é melhor que ficar
    // consultando o servidor por um minuto, que era o que acontecia antes.
    setWhatsappCodLoading(false);
    setPendingWhatsapp({ id: idItem, phone, referencia, cod: null, numero: numeroItem });
    setShowWhatsappPrompt(true);
    toast.error("Esta encomenda não tem código de retirada: ela foi cadastrada sem telefone.");
  };

  /**
   * Mostra a assinatura daquela retirada.
   *
   * O caminho vira link assinado na hora, e não no carregamento da tela: são
   * URLs temporárias, e gerar uma para cada retirada a cada `fetchData` seria
   * pedir dezenas de assinaturas ao Storage para exibir nenhuma.
   */
  const abrirAssinatura = async (retirada) => {
    if (!retirada) return;
    const caminho = getCell(retirada, "assinatura_caminho");
    setAssinaturaAberta({
      nome: getCell(retirada, "retirado_por_nome") || "—",
      quando: formatDateTime(getCell(retirada, "created_at")) || "—",
      url: null,
      carregando: true,
    });
    const url = caminho ? await urlDoAnexo({ caminho_storage: caminho }) : null;
    setAssinaturaAberta((atual) => (atual ? { ...atual, url, carregando: false } : atual));
  };

  /** O nome de quem retirou, clicável, abrindo a assinatura. */
  const NomeComAssinatura = ({ retirada, nome }) => {
    const texto = nome || getCell(retirada, "retirado_por_nome") || "—";
    if (!retirada) return <span style={{ color: theme.text, fontWeight: 700 }}>{texto}</span>;
    return (
      <button
        type="button"
        className="enc-link"
        onClick={() => abrirAssinatura(retirada)}
        title="Ver a assinatura"
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          font: 'inherit', color: '#E35A3A', fontWeight: 700,
          textDecoration: 'underline', textUnderlineOffset: '3px',
        }}
      >
        {texto}
      </button>
    );
  };

  /**
   * As saídas desta encomenda, em ordem, uma por item que já foi entregue.
   *
   * Substitui a leitura das colunas de `entregas`, que só valem para o evento
   * que FECHOU a encomenda — e portanto não descrevem nada numa parcial.
   */
  const saidasDaEncomenda = (item) => {
    const id = String(getCell(item, "id"));
    return retiradaItens
      .filter((r) => String(getCell(r, "id_entrega")) === id)
      .map((r) => {
        const idNota = getCell(r, "id_nota");
        return {
          id: getCell(r, "id"),
          nota: idNota
            ? entregasNF.find((n) => String(getCell(n, "id")) === String(idNota)) ?? null
            : null,
          retirada:
            retiradas.find((x) => String(getCell(x, "id")) === String(getCell(r, "id_retirada"))) ?? null,
        };
      })
      .sort((a, b) =>
        String(getCell(a.retirada, "created_at")).localeCompare(String(getCell(b.retirada, "created_at")))
      );
  };

  const handleView = (item) => {
    setSelectedDetails(item);
    setSelectedPhotoIndex(0);
    setShowViewDetails(true);
  };

  /**
   * Abre o formulário já preenchido com a encomenda.
   *
   * Os itens vêm de ENTREGAS_NF, uma linha por volume. A foto não volta para o
   * formulário: ela já está no bucket, e trazê-la como anexo pendente faria
   * cada gravação subir a mesma imagem outra vez.
   */
  const abrirEdicao = (item) => {
    const id = getCell(item, "id");
    const notas = getNFsDaEncomenda(item);
    const itens = notas.length
      ? notas.map((n) => ({
          numero_fiscal: (getCell(n, "numero_fiscal") || "").toString(),
          transportadora: (getCell(n, "transportadora") || "").toString(),
          foto: null,
        }))
      : [novoItem()];

    setFormData({
      id_unidade: (getCell(item, "id_unidade") || "").toString(),
      id_morador: (getCell(item, "id_morador") || "").toString(),
      nome: (getCell(item, "nome") || "").toString(),
      telefone: (getCell(item, "telefone") || "").toString(),
      data_recebimento: new Date().toISOString().split('T')[0],
      status: (getCell(item, "status") || "Pendente").toString(),
      quantidade: Math.max(Number(getCell(item, "quantidade_encomenda")) || itens.length, itens.length),
      itens,
    });
    setFormErrors({});
    setEditandoId(id === "" ? null : id);
    setModalType("edit");
    setShowModal(true);
    setShowViewDetails(false);
  };

  /**
   * Alguma retirada assinada já tocou nesta encomenda.
   *
   * São DUAS marcas, e olhar só a primeira foi um engano meu: `id_retirada` é
   * preenchido quando a encomenda FECHA, mas na retirada parcial ela continua
   * aberta e o vínculo mora em `retirada_itens`. Uma encomenda parcialmente
   * entregue passava pela guarda e batia na chave estrangeira do banco — o
   * porteiro veria uma mensagem em inglês sobre constraint.
   */
  const temRetiradaAssinada = (item) => {
    if (!item) return false;
    if (getCell(item, "id_retirada")) return true;
    const id = String(getCell(item, "id"));
    return retiradaItens.some((r) => String(getCell(r, "id_entrega")) === id);
  };

  /**
   * Apaga a encomenda e o que pende dela.
   *
   * Recusa quando já houve retirada assinada — inteira ou parcial. O
   * comprovante substituiu o livro de papel, e apagar a encomenda deixaria a
   * assinatura falando de um pacote que o sistema não conhece mais. Prova que
   * perde o objeto não prova nada.
   *
   * Os filhos saem antes: linha de foto sem arquivo (ou arquivo sem linha) é
   * lixo invisível no bucket.
   */
  const handleExcluir = async () => {
    const item = excluindo;
    if (!item) return;
    const id = getCell(item, "id");
    if (id === "" || id === null) return;
    if (temRetiradaAssinada(item)) {
      toast.error("Esta encomenda tem retirada assinada. Ela não pode ser excluída.");
      return;
    }

    setExcluindoOcupado(true);
    try {
      for (const foto of getEntregaPhotoRows(item)) {
        const caminho = getCell(foto, "caminho_storage");
        if (caminho) await removerAnexo(caminho);
        const idFoto = getCell(foto, "id");
        if (idFoto !== "") await remover("ENTREGAS_FOTO", idFoto);
      }
      for (const nota of getNFsDaEncomenda(item)) {
        const idNota = getCell(nota, "id");
        if (idNota !== "") await remover("ENTREGAS_NF", idNota);
      }

      const r = await remover("ENTREGAS", id);
      if (!r.success) {
        toast.error(mensagemErro(r.message));
        return;
      }

      toast.success("Encomenda excluída");
      setExcluindo(null);
      setShowViewDetails(false);
      setSelectedDetails(null);
      await fetchData();
    } finally {
      setExcluindoOcupado(false);
    }
  };

  // A baixa é do cadastro aberto, e só dele.
  //
  // O botão fica dentro do "Ver Detalhes" de uma encomenda, e o diálogo herda
  // esse recorte: outra encomenda da mesma unidade não aparece ali para marcar.
  // A unidade continua indo junto porque é ela que a retirada grava — o que ela
  // não faz é escolher o que pode receber baixa.
  const abrirRetirada = (item) => {
    const unidade = getCell(item, "id_unidade");
    const idCadastro = getCell(item, "id");
    setRetiradaUnidade(unidade === "" || unidade === null ? null : unidade);
    setRetiradaCadastro(idCadastro === "" || idCadastro === null ? null : idCadastro);
    setRetiradaAberta(true);
  };

  const handleAbrirArmazenar = (item) => {
    setArmazenarItem(item);
    setArmazenarLocal("");
    setArmazenarPor("");
    setShowArmazenarModal(true);
  };

  const handleConfirmArmazenar = async () => {
    if (!armazenarItem) return;
    const local = armazenarLocal.trim();
    const por = armazenarPor.trim();
    if (!local || !por) return;

    setArmazenarLoading(true);
    const novoStatus = "Armazenado";
    const dataArmazenado = new Date().toISOString();
    const serverId = getCell(armazenarItem, "id") || getCell(armazenarItem, "ID");

    const updated = encomendas.map((entry) => {
      const entryId = (getCell(entry, "id") || getCell(entry, "ID") || "").toString();
      if (entryId === serverId.toString()) {
        return {
          ...entry,
          STATUS: novoStatus, status: novoStatus,
          ARMAZENADO_LOCAL: local, armazenado_local: local,
          ARMAZENADO_POR: por, armazenado_por: por,
          ARMAZENADO_DATA: dataArmazenado, armazenado_data: dataArmazenado,
        };
      }
      return entry;
    });
    setEncomendas(updated);

    try {
      const res = await editar("ENTREGAS", serverId, {
        status: novoStatus,
        armazenado_local: local,
        armazenado_por: por,
        armazenado_data: dataArmazenado,
      });
      // A tela já pintou o armazenamento antes da resposta; falhando, ela
      // estaria mentindo sobre onde o pacote está.
      if (!res.success) { toast.error(mensagemErro(res.message)); await fetchData(); return; }

      setShowArmazenarModal(false);
      setArmazenarItem(null);
      setArmazenarLocal("");
      setArmazenarPor("");
      setShowViewDetails(false);
      setSelectedDetails(null);
      await fetchData();
    } catch (error) {
      console.error("Erro ao armazenar:", error);
      toast.error("Não foi possível registrar o armazenamento. Tente de novo.");
    } finally {
      setArmazenarLoading(false);
    }
  };

  // Marca a encomenda como notificada (K=SIM) no backend e no state local.
  const marcarNotificado = async (id) => {
    if (id == null || id === "") return;
    const sid = id.toString();
    setEncomendas((prev) => prev.map((entry) => {
      const eid = (getCell(entry, "id") || getCell(entry, "ID") || "").toString();
      return eid === sid
        ? { ...entry, NOTIFICADO: "SIM", notificado: "SIM", STATUS_NOTIFICACAO: "ENVIADO", status_notificacao: "ENVIADO" }
        : entry;
    }));
    try {
      const r = await editar("ENTREGAS", sid, { notificado: "SIM", status_notificacao: "ENVIADO" });
      if (!r.success) {
        console.warn("Falha ao marcar notificado:", r.message);
        await fetchData();   // desfaz o otimismo do state local
      }
    } catch (e) {
      console.warn("Falha ao marcar notificado:", e);
    }
  };

  const handleSendWhatsapp = () => {
    if (!pendingWhatsapp) return;
    const url = getWhatsappUrl(pendingWhatsapp);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    marcarNotificado(pendingWhatsapp.id);
    setShowWhatsappPrompt(false);
    setPendingWhatsapp(null);
  };

  const handleCancelWhatsapp = () => {
    setShowWhatsappPrompt(false);
    setPendingWhatsapp(null);
  };

  // Verdadeiro se a encomenda está Pendente há mais de 7 dias corridos (deve ir ao Armazém).
  // O backend devolve datas como "DD/MM/YYYY HH:mm" (formato BR). new Date() do JS
  // interpretaria isso como MM/DD (americano) e trocaria dia/mês. Este parser trata
  // DD/MM/YYYY [HH:mm] corretamente e cai para new Date() em outros formatos (ISO).
  const parseDataBR = (raw) => {
    if (!raw) return null;
    const s = raw.toString().trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) {
      const [, d, mo, y, h, mi] = m;
      return new Date(Number(y), Number(mo) - 1, Number(d), Number(h || 0), Number(mi || 0));
    }
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? null : dt;
  };

  const isAtrasadoArmazenar = (item) => {
    const status = (getCell(item, "STATUS") || getCell(item, "status") || "").toString();
    if (status !== "Pendente") return false;
    const dataRaw = getCell(item, "DATA_ENTRADA") || getCell(item, "data_entrada");
    const dataEntrada = parseDataBR(dataRaw);
    if (!dataEntrada) return false;
    // Compara só a data (zera horas): entrada + 7 dias. Ex: entrou 02/06 → alerta a partir de 09/06.
    const d0 = new Date(dataEntrada.getFullYear(), dataEntrada.getMonth(), dataEntrada.getDate());
    const hoje = new Date();
    const h0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const diffDias = Math.floor((h0.getTime() - d0.getTime()) / (1000 * 60 * 60 * 24));
    return diffDias >= 7;
  };

  const isMesmoDiaQueHoje = (raw) => {
    const d = parseDataBR(raw);
    if (!d) return false;
    const hoje = new Date();
    return d.getFullYear() === hoje.getFullYear()
      && d.getMonth() === hoje.getMonth()
      && d.getDate() === hoje.getDate();
  };

  const isEntregue = (item) => {
    const s = (getCell(item, "STATUS") || getCell(item, "status") || "").toString().toUpperCase();
    return s === "ENTREGUE" || s === "RETIRADO";
  };

  // Dashboard Stats
  /**
   * Ainda tem volume na prateleira.
   *
   * "Parcialmente entregue" conta como aguardando: a encomenda saiu pela
   * metade e o resto continua na portaria. Tratá-la como resolvida a tiraria
   * da lista de pendentes e ninguém iria atrás do que ficou.
   */
  const AGUARDANDO_RETIRADA = ["PENDENTE", "PARCIALMENTE ENTREGUE"];
  const aguardaRetirada = (e) =>
    AGUARDANDO_RETIRADA.includes(
      String(getCell(e, "STATUS") || getCell(e, "status") || "").trim().toUpperCase()
    );

  const stats = {
    pendentes: encomendas.filter(aguardaRetirada).length,
    entreguesHoje: encomendas.filter(e =>
      isEntregue(e) && isMesmoDiaQueHoje(getCell(e, "DATA_SAIDA") || getCell(e, "data_saida"))
    ).length,
    armazenados: encomendas.filter(e => getCell(e, "STATUS") === "Armazenado").length,
    volumes: encomendas.length
  };

  const filteredData = encomendas.filter(e => {
    const nome = getCell(e, "NOME");
    const idUnidade = getCell(e, "ID_UNIDADE");
    const status = getCell(e, "STATUS");
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      nome.toLowerCase().includes(searchLower) ||
      idUnidade.toString().toLowerCase().includes(searchLower);
    let matchesStatus;
    if (filterStatus === "Todos") {
      matchesStatus = true;
    } else if (filterStatus === "EntregueHoje") {
      matchesStatus = isEntregue(e) && isMesmoDiaQueHoje(getCell(e, "DATA_SAIDA") || getCell(e, "data_saida"));
    } else if (filterStatus === "Pendente") {
      matchesStatus = aguardaRetirada(e);
    } else {
      matchesStatus = status === filterStatus;
    }
    return matchesSearch && matchesStatus;
  });

  const totalPages = itemsPerPage === "Todos" ? 1 : Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const currentPageSafe = Math.min(Math.max(currentPage, 1), totalPages);
  const pageData = itemsPerPage === "Todos"
    ? filteredData
    : filteredData.slice((currentPageSafe - 1) * itemsPerPage, currentPageSafe * itemsPerPage);

  const getItemDisplay = (item) => {
    const unidade = formatBlockUnit(getCell(item, "ID_UNIDADE") || getCell(item, "id_unidade"));
    const nome = getCell(item, "NOME") || getCell(item, "nome");
    const dataEntrada = formatDateTime(getCell(item, "DATA_ENTRADA") || getCell(item, "data_entrada"));
    // `created_by` é a coluna do Postgres. Aqui estava `CREATE_USER`, o
    // cabeçalho da planilha do Apps Script, que ficou para trás na migração:
    // como `getCell` devolve "" para coluna que não existe, "Recebido por"
    // mostrava "—" em TODA encomenda, sem erro nenhum. Não há fallback para o
    // nome antigo porque não há linha que o tenha: as chaves vêm do Postgres.
    const recebidoPor = getCell(item, "created_by") || "—";
    // Número(s) fiscal(is) vêm da ENTREGAS_NF (uma linha por item).
    const numeroFiscal = getNFsDaEncomenda(item)
      .map((nf) => getCell(nf, "NUMERO_FISCAL") || getCell(nf, "numero_fiscal"))
      .filter(Boolean).join(", ") || "—";
    const numeroEncomenda = getCell(item, "NUMERO_ENCOMENDA") || getCell(item, "numero_encomenda") || "—";
    const volumes = getCell(item, "QUANTIDADE_ENCOMENDA") || getCell(item, "quantidade_encomenda") || "—";
    const status = (getCell(item, "STATUS") || getCell(item, "status") || "").toString().trim();
    const statusLabel = status ? status.toUpperCase() : "—";
    const statusColor = statusLabel === 'PENDENTE' ? 'var(--fg-secondary)' : (statusLabel === 'ENTREGUE' || statusLabel === 'RETIRADO') ? '#B33320' : statusLabel === 'ARMAZENADO' ? '#D4432A' : theme.text;
    const statusBg = statusLabel === 'PENDENTE' ? 'var(--surface-3)' : (statusLabel === 'ENTREGUE' || statusLabel === 'RETIRADO') ? '#FEE4DC' : statusLabel === 'ARMAZENADO' ? '#FEE4DC' : 'var(--surface-3)';
    const itemId = getCell(item, "COD_ENTREGA") || getCell(item, "cod_entrega") || getCell(item, "id") || `${item.unidade_id}-${item.nome}`;
    return { unidade, nome, dataEntrada, recebidoPor, numeroFiscal, numeroEncomenda, volumes, statusLabel, statusColor, statusBg, itemId };
  };

  const tomStatus = (label) => {
    if (label === "PENDENTE") return "neutral";
    if (label === "ENTREGUE" || label === "RETIRADO") return "positive";
    if (label === "ARMAZENADO") return "brand";
    // Parcialmente entregue NÃO é positivo: ainda tem volume na prateleira, e
    // pintar de verde faria a portaria ler como resolvido.
    if (label === "PARCIALMENTE ENTREGUE") return "brand";
    return "muted";
  };

  const colunasEncomenda = [
    {
      key: "unidade", label: "Unidade", tipo: "id", width: 116,
      render: (item) => {
        const { unidade } = getItemDisplay(item);
        const atrasada = isAtrasadoArmazenar(item);
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)" }}>
            {unidade}
            {atrasada && (
              <AlertCircle
                size={14}
                style={{ color: "var(--fg-danger)" }}
                aria-label="Há mais de 7 dias na portaria"
              />
            )}
          </span>
        );
      },
    },
    {
      key: "nome", label: "Destinatário",
      render: (item) => {
        const { nome } = getItemDisplay(item);
        return <span style={{ fontWeight: 600 }}>{nome}</span>;
      },
    },
    {
      key: "dataEntrada", label: "Entrada",
      render: (item) => {
        const { dataEntrada, recebidoPor } = getItemDisplay(item);
        return (
          <span>
            <span style={{ display: "block" }}>{dataEntrada}</span>
            <span className="enc-sub">Recebido por {recebidoPor}</span>
          </span>
        );
      },
    },
    {
      key: "numeroEncomenda", label: "Nº encomenda", tipo: "id", width: 130,
      render: (item) => getItemDisplay(item).numeroEncomenda,
    },
    {
      key: "volumes", label: "Volumes", tipo: "num", width: 84,
      render: (item) => getItemDisplay(item).volumes,
    },
    {
      key: "numeroFiscal", label: "Nota fiscal",
      render: (item) => {
        const { numeroFiscal } = getItemDisplay(item);
        return numeroFiscal === "—" ? null : <span className="enc-nf">{numeroFiscal}</span>;
      },
    },
    {
      key: "status", label: "Status", width: 128,
      render: (item) => {
        const { statusLabel } = getItemDisplay(item);
        if (statusLabel === "—") return null;
        return (
          <Badge tone={tomStatus(statusLabel)}>
            {statusLabel.charAt(0) + statusLabel.slice(1).toLowerCase()}
          </Badge>
        );
      },
    },
  ];

  return (
    <div style={{ ...pageContainer, paddingTop: pageContainer.padding, backgroundColor: theme.bgBody, color: theme.text }}>
      <style>{`
        @keyframes ${spinnerKeyframeName} { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes encomendas-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .encomendas-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 16px; }
        .enc-new-btn { transition: transform .15s ease, box-shadow .2s ease, filter .2s ease; }
        .enc-new-btn:hover { filter: brightness(1.05); transform: translateY(-1px); box-shadow: 0 8px 18px rgba(227,90,58,0.35); }
        .encomendas-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .enc-stat-card { transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
        .enc-stat-card:hover { transform: translateY(-3px); box-shadow: 0 14px 28px rgba(40,22,18,0.10); }
        .encomendas-filters { display: flex; gap: 15px; margin-bottom: 20px; }
        .encomendas-modal-content { width: min(100%, 520px); }
        .encomendas-form-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 10px; }
        .encomendas-photo-actions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
        .encomendas-table-card { border-radius: 16px; border: 1px solid; overflow: hidden; margin-top: 20px; }
        .encomendas-table-wrapper { width: 100%; overflow-x: auto; }
        .encomendas-table { width: 100%; min-width: 900px; border-collapse: collapse; table-layout: auto; }
        .encomendas-table tbody tr { transition: background .15s ease; }
        .encomendas-table tbody tr:hover { background: ${theme.isDark ? 'rgba(139,143,137,0.07)' : 'rgba(227,90,58,0.04)'}; }
        .enc-details-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 22px; padding: 22px 24px; overflow-y: auto; flex: 1; min-height: 0; }
        .enc-mobile-list { display: none; }
        @keyframes enc-modal-in { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .enc-modal { display: flex; flex-direction: column; max-height: 92vh; border-radius: 20px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.35); animation: enc-modal-in .22s cubic-bezier(.16,1,.3,1); }
        .enc-modal-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 22px; border-bottom: 1px solid; flex-shrink: 0; }
        .enc-modal-body { padding: 20px 22px; overflow-y: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 16px; }
        .enc-modal-footer { padding: 14px 22px; border-top: 1px solid; flex-shrink: 0; }
        .enc-close-btn { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 1px solid; background: none; transition: background .2s ease, color .2s ease; flex-shrink: 0; }
        .enc-close-btn:hover { background: rgba(180,71,42,0.12); color: #B8203F !important; }
        .enc-section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; display: flex; align-items: center; gap: 8px; }
        .enc-modal-body input:focus, .enc-modal-body select:focus, .enc-details-grid input:focus { border-color: #E35A3A !important; box-shadow: 0 0 0 3px rgba(227,90,58,0.15) !important; }
        .enc-field-card { border-radius: 14px; border: 1px solid; padding: 16px; }
        .enc-card { animation: encomendas-fade .25s ease; transition: transform .15s ease, box-shadow .2s ease; }
        .enc-card:active { transform: scale(0.99); }
        .enc-ver-btn { transition: background .2s ease, border-color .2s ease, color .2s ease; }
        .enc-ver-btn:hover { background: ${theme.isDark ? 'rgba(139,143,137,0.10)' : 'rgba(227,90,58,0.06)'} !important; border-color: #E35A3A !important; color: #E35A3A !important; }
        .encomendas-error { color: #8F1530; font-size: 12px; margin-top: 4px; }
        .enc-foto-tile {
          position: relative; overflow: hidden; flex-shrink: 0;
          width: 72px; height: 72px; border-radius: 10px; border: 2px dashed;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 2px; cursor: pointer;
        }
        .enc-foto-link {
          position: relative; overflow: hidden; cursor: pointer;
          font-size: 10px; text-decoration: underline; padding: 4px 2px;
        }
        .enc-foto-input {
          position: absolute; inset: 0; width: 100%; height: 100%;
          opacity: 0; cursor: pointer; font-size: 0;
        }
        .enc-redondo { flex-shrink: 0; }
        .enc-foto-x {
          position: absolute; top: 2px; right: 2px; z-index: 1;
          width: 22px; height: 22px; padding: 0; border: none; border-radius: 50%;
          background: #B8203F; color: #fff; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .enc-ponto {
          width: 32px; height: 32px; padding: 11px; border: none; cursor: pointer;
          border-radius: 50%; box-sizing: border-box; background-clip: content-box;
        }
        .pagination-btn { background: none; border: 1px solid ${theme.border}; color: ${theme.text}; padding: 6px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .pagination-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        @media (max-width: 768px) {
          .encomendas-header { flex-direction: column; align-items: stretch; }
          .enc-new-btn { width: 100%; justify-content: center; }
          .encomendas-stats { grid-template-columns: minmax(0, 1fr); gap: 12px; margin-bottom: 20px; }
          .encomendas-filters { flex-direction: column; align-items: stretch; gap: 10px; }
          .encomendas-form-grid { grid-template-columns: minmax(0, 1fr); }
          .encomendas-modal-content { width: 100%; }
          .enc-modal { width: 100%; max-width: 100% !important; max-height: 94vh; border-radius: 18px; }
          .enc-modal-header { padding: 16px 18px; }
          .enc-modal-body { padding: 16px 18px; }
          .enc-modal-footer { padding: 14px 18px; }
          .enc-desktop-table { display: none; }
          .enc-mobile-list { display: flex; flex-direction: column; gap: 12px; padding: 14px; }
          .enc-details-grid { grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 16px 18px; }
          /* Mobile: box da foto com altura FIXA (o flex:1 + height:100% colapsava e a
             imagem invadia o card Destinatário) e etiqueta inteira sem corte. */
          /* A foto ocupava 260px fixos. Somados rótulo, bolinhas e o recuo da
             grade, sobrava quase nada de tela para o card Destinatário, que é
             o que a pessoa abriu o detalhe para ler. Aqui ela acompanha a
             altura do aparelho, com piso e teto — e continua abrindo inteira
             no visualizador com um toque. */
          .enc-photo-box { flex: none !important; min-height: 0 !important; height: clamp(150px, 26dvh, 240px) !important; }
          .enc-photo-img { object-fit: contain !important; }
          .encomendas-photo-actions { flex-direction: column; }
          .encomendas-photo-actions > * { width: 100%; }
          .encomendas-footer-buttons { flex-direction: column; }
          .encomendas-footer-buttons > * { width: 100%; }

          /* O modal encosta no rodapé e sobe de baixo, como no design system.
             Caixa centralizada no celular desperdiça altura útil. */
          .enc-modal { max-height: 92dvh; border-radius: 18px 18px 0 0; }

          /* Todo campo do modal precisa poder encolher: item de grid e de
             flex nasce com min-width auto e vaza para fora. */
          .enc-modal-body, .enc-details-grid, .encomendas-form-grid { min-width: 0; }
          .enc-modal-body > *, .enc-details-grid > *, .encomendas-form-grid > * {
            min-width: 0;
            max-width: 100%;
          }
          .enc-modal-body input, .enc-modal-body select, .enc-modal-body textarea {
            width: 100%;
            min-width: 0;
            /* 16px impede o iOS Safari de dar zoom automático ao focar. */
            font-size: 16px;
          }
          /* Alvo de toque confortável em tudo que é botão dentro do modal. */
          /* Alvo de toque em botão de texto — MENOS os redondos. A regra
             antiga pegava a bolinha de 10px do carrossel e a seta de 40px do
             visualizador: com min-height 44 e border-radius 50%, a bolinha
             virava uma pílula alta e a seta, um oval. Um alvo de toque não se
             consegue esticando o desenho; nos redondos ele vem do padding
             abaixo, que aumenta a área sem aumentar o que se vê. */
          .enc-modal button:not(.enc-redondo):not(.enc-link),
          .enc-details-grid button:not(.enc-redondo):not(.enc-link) { min-height: 44px; }

          /* Alvo de toque do X sem engordar o desenho: a área cresce pelo
             padding e a cor fica só no conteúdo. Mesma saída da bolinha do
             carrossel — e o motivo de o X precisar de enc-redondo: sem ela a
             regra de 44px acima o transformava numa pílula vermelha alta e
             estreita em cima da miniatura. */
          .enc-foto-x {
            width: 34px; height: 34px; padding: 6px;
            background-clip: content-box; box-sizing: border-box;
          }
        }

        /* Tablet: a grade de duas colunas do detalhe já fica apertada antes
           do breakpoint de celular. */
        @media (max-width: 1024px) and (min-width: 769px) {
          .enc-details-grid { grid-template-columns: minmax(0, 1fr); }
        }
      `}</style>
      <PageHeader
        title="Encomendas"
        meta={
          loadingInitial
            ? "Carregando encomendas"
            : [
                `${stats.pendentes} aguardando retirada`,
                `${stats.entreguesHoje} entregues hoje`,
                stats.armazenados ? `${stats.armazenados} armazenadas` : null,
                `${stats.volumes} volumes`,
              ].filter(Boolean).join(" · ")
        }
        actions={
          <Button
            variant="primary"
            iconLeft={<Plus size={16} />}
            onClick={() => { resetForm(); setEditandoId(null); setModalType("add"); setShowModal(true); }}
          >
            Novo recebimento
          </Button>
        }
      />

      {/* Abas de status no lugar dos cards clicáveis: mesma função de filtro,
          mas o estado ativo fica óbvio e ocupa uma fração da altura. */}
      <Tabs
        items={[
          { value: "Pendente", label: "Aguardando retirada", count: stats.pendentes },
          { value: "EntregueHoje", label: "Entregues hoje", count: stats.entreguesHoje },
          { value: "Armazenado", label: "Armazenadas", count: stats.armazenados },
          { value: "Todos", label: "Todas" },
        ]}
        value={filterStatus}
        onChange={(v) => { setFilterStatus(v); setCurrentPage(1); }}
      />

      <div className="cad-filtros">
        <div className="cad-filtros__busca">
          <Search size={16} className="cad-filtros__lupa" aria-hidden="true" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por unidade, morador ou nº da encomenda"
            aria-label="Buscar encomenda"
          />
        </div>
        {searchTerm && (
          <Button variant="ghost" onClick={() => setSearchTerm("")} iconLeft={<RotateCcw size={14} />}>
            Limpar
          </Button>
        )}
      </div>

      <Table
        columns={colunasEncomenda}
        rows={pageData}
        loading={loadingInitial}
        getRowKey={(item) => getItemDisplay(item).itemId}
        rowActions={(item) => (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleView(item)}
            onMouseEnter={() => prefetchItemPhotos(item)}
            onTouchStart={() => prefetchItemPhotos(item)}
          >
            Ver detalhes
          </Button>
        )}
        empty={
          searchTerm ? (
            <EmptyState
              icon={<Search size={20} />}
              title="Nenhuma encomenda encontrada"
              description="Tente outro nome, unidade ou número de encomenda."
              action={<Button onClick={() => setSearchTerm("")}>Limpar busca</Button>}
            />
          ) : (
            <EmptyState
              icon={<Package size={20} />}
              title={
                filterStatus === "Pendente"
                  ? "Nenhuma encomenda aguardando retirada"
                  : "Nenhuma encomenda nesta situação"
              }
              description={
                filterStatus === "Pendente"
                  ? "Quando chegar uma encomenda na portaria, registre o recebimento para ela aparecer aqui."
                  : "Troque de aba para ver as encomendas em outra situação."
              }
              action={
                filterStatus === "Pendente" ? (
                  <Button
                    variant="primary"
                    iconLeft={<Plus size={16} />}
                    onClick={() => { resetForm(); setEditandoId(null); setModalType("add"); setShowModal(true); }}
                  >
                    Novo recebimento
                  </Button>
                ) : null
              }
            />
          )
        }
      />

      {!loadingInitial && filteredData.length > 0 && (
        <div className="cad-paginacao">
          <span className="cad-paginacao__info">
            {itemsPerPage === "Todos"
              ? `${filteredData.length} encomenda(s)`
              : `${pageData.length} de ${filteredData.length} encomendas`}
          </span>
          <div className="cad-paginacao__controles">
            <Select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(e.target.value === "Todos" ? "Todos" : Number(e.target.value));
                setCurrentPage(1);
              }}
              aria-label="Encomendas por página"
              className="cad-paginacao__tamanho"
            >
              <option value={10}>10 por página</option>
              <option value={20}>20 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
              <option value="Todos">Mostrar todas</option>
            </Select>
            {itemsPerPage !== "Todos" && totalPages > 1 && (
              <>
                <Button size="sm" aria-label="Página anterior" disabled={currentPageSafe === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        iconLeft={<ChevronLeft size={15} />} />
                <span className="cad-paginacao__pagina">{currentPageSafe} de {totalPages}</span>
                <Button size="sm" aria-label="Próxima página" disabled={currentPageSafe === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        iconLeft={<ChevronRight size={15} />} />
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE CADASTRO ESTILO PISCINA */}
      {showModal && (
        <div style={modalOverlay}>
          <div className="encomendas-modal-content enc-modal" style={{ backgroundColor: theme.bgCard, color: theme.text, maxWidth: '540px', width: '95%' }}>
            <div className="enc-modal-header" style={{ borderColor: theme.border }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#D4432A', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(227,90,58,0.3)' }}>
                  <Package size={22} color="white" />
                </div>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 700 }}>{modalType === "add" ? "Novo Recebimento" : "Editar Encomenda"}</div>
                  <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px' }}>Registre a entrada de um volume</div>
                </div>
              </div>
              <button type="button" className="enc-close-btn" style={{ borderColor: theme.border, color: theme.textSecondary }} onClick={() => { setShowModal(false); setModalType("add"); setEditandoId(null); }}>
                <X size={18} />
              </button>
            </div>

            <div className="enc-modal-body">

              {/* CAMPO UNIDADE COM BUSCA FLUTUANTE */}
              <div style={{ position: 'relative' }} ref={dropdownRef}>
                <label style={labelStyle}>Unidade Destinatária</label>
                <div
                  style={{ ...selectStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', backgroundColor: theme.bgBody, color: theme.text, borderColor: theme.border }}
                  onClick={() => setShowUnitDropdown(!showUnitDropdown)}
                >
                  <span>{formData.id_unidade ? getUnitLabel(formData.id_unidade) : "Selecione a unidade..."}</span>
                  <ChevronDown size={16} />
                </div>
                {formErrors.id_unidade && <div className="encomendas-error">{formErrors.id_unidade}</div>}

                {showUnitDropdown && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', zIndex: 1200, boxShadow: '0 8px 16px rgba(0,0,0,0.2)', marginTop: '4px', overflow: 'hidden' }}>
                    <div style={{ padding: '8px' }}>
                      <input
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgBody, color: theme.text, boxSizing: 'border-box', outline: 'none' }}
                        placeholder="Digite o bloco ou apto..." autoFocus value={unitSearch} onChange={(e) => setUnitSearch(e.target.value)}
                      />
                    </div>
                    <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                      {unidadesFiltradas.length > 0 ? (
                        unidadesFiltradas.map(u => (
                          <div key={u.id} style={{ padding: '10px 15px', cursor: 'pointer', fontSize: '14px', borderBottom: `1px solid ${theme.border}` }} onClick={() => handleUnitSelect(u.id)}>
                            BLOCO {u.bloco} - UNIDADE {u.unidade}
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: '15px', textAlign: 'center', fontSize: '12px', opacity: 0.7 }}>Nenhuma unidade encontrada</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* SELEÇÃO DE MORADOR (SE TIVER MAIS DE 1) */}
              {formData.id_unidade && moradoresDaUnidade.length > 1 && (
                <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: '#E35A3A15', border: '1px solid #E35A3A30' }}>
                  <label style={{ ...labelStyle, color: '#E35A3A' }}>Múltiplos moradores. Selecione o destinatário:</label>
                  <select 
                    style={{ ...selectStyle, width: '100%', backgroundColor: theme.bgBody, color: theme.text, borderColor: '#E35A3A' }}
                    value={formData.id_morador}
                    onChange={e => handleMoradorSelect(e.target.value)}
                  >
                    <option value="">Escolha o morador...</option>
                    {moradoresDaUnidade.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </div>
              )}

              {/* NOME E TELEFONE */}
              <div className="encomendas-form-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Nome</label>
                  {/* Editável mesmo com o morador escolhido e o número confirmado.
                      A encomenda chega no nome que está na etiqueta, e nem sempre
                      é o do titular do cadastro: vem para o cônjuge, para o filho,
                      ou com o nome escrito errado pela transportadora. O que se
                      grava aqui é o destinatário DESTA encomenda — o cadastro do
                      morador não é tocado —, então corrigir o nome não estraga
                      nada e evita a encomenda entrar com um nome que ninguém
                      reconhece na hora de retirar.

                      O TELEFONE continua travado logo ao lado, e por outro motivo:
                      ele só aparece preenchido quando o número foi CONFIRMADO na
                      aba Confirmação, e é dele que sai o WhatsApp. Deixar digitar
                      por cima abriria caminho para a mensagem com o código de
                      retirada ir para o número errado. */}
                  <input 
                    style={{ ...selectStyle, width: '100%', backgroundColor: theme.bgBody, color: theme.text, borderColor: theme.border }} 
                    value={formData.nome} 
                    onChange={e => setFormData({ ...formData, nome: e.target.value })} 
                  />
                  {formErrors.nome && <div className="encomendas-error">{formErrors.nome}</div>}
                </div>
                <div>
                  <label style={labelStyle}>Telefone</label>
                  <input 
                    style={{ 
                      ...selectStyle, width: '100%', 
                      backgroundColor: formData.id_morador ? theme.bgCard : theme.bgBody, 
                      color: theme.text, borderColor: theme.border, 
                      opacity: formData.id_morador ? 0.6 : 1 
                    }} 
                    value={formData.telefone} 
                    disabled={!!formData.id_morador}
                    placeholder="(DD)nnnnn-nnnn"
                    onChange={e => setFormData({ ...formData, telefone: formatPhoneBR(e.target.value) })}
                  />
                  {formErrors.telefone && <div className="encomendas-error">{formErrors.telefone}</div>}
                  {formData.id_morador && !formData.telefone && (
                    <div style={{ fontSize: '11px', color: 'var(--fg-secondary)', marginTop: '4px' }}>
                      Número não confirmado — não sai WhatsApp; escreva o nº na encomenda.
                    </div>
                  )}
                </div>
              </div>

              {/* QUANTIDADE DE ENCOMENDAS */}
              <div>
                <label style={labelStyle}>Quantidade de Encomendas (1 a 10)</label>
                <select
                  style={{ ...selectStyle, width: '100%', backgroundColor: theme.bgBody, color: theme.text, borderColor: theme.border }}
                  value={formData.quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                {formErrors.quantidade && <div className="encomendas-error">{formErrors.quantidade}</div>}
              </div>

              {/* BLOCOS POR ITEM */}
              {formData.itens.map((item, idx) => {
                const itemErr = Array.isArray(formErrors.itens) ? formErrors.itens[idx] : null;
                return (
                  <div key={idx} style={{ border: `1px solid ${theme.border}`, borderRadius: '14px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#E35A3A', textTransform: 'uppercase' }}>
                      Encomenda {idx + 1} de {formData.itens.length}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={labelStyle}>Nº Fiscal / Referência</label>
                        <input
                          style={{ ...selectStyle, width: '100%', backgroundColor: theme.bgBody, color: theme.text, borderColor: theme.border }}
                          value={item.numero_fiscal}
                          placeholder="Número Fiscal"
                          onChange={(e) => setItemCampo(idx, 'numero_fiscal', e.target.value)}
                        />
                        {itemErr?.numero_fiscal && <div className="encomendas-error">{itemErr.numero_fiscal}</div>}
                      </div>
                      <div>
                        <label style={labelStyle}>Transportadora (opcional)</label>
                        <input
                          style={{ ...selectStyle, width: '100%', backgroundColor: theme.bgBody, color: theme.text, borderColor: theme.border }}
                          value={item.transportadora}
                          placeholder="Ex: Amazon, ML..."
                          onChange={(e) => setItemCampo(idx, 'transportadora', e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={labelStyle}>Foto da Etiqueta (1 por item)</label>
                      {itemErr?.foto && <div className="encomendas-error">{itemErr.foto}</div>}
                      {/* Foto da etiqueta: a câmera abre DIRETO no celular.
                          Tentamos deixar o sistema perguntar (sem `capture`), e
                          no aparelho da portaria o Android abriu a galeria de
                          uma vez, sem oferecer câmera. Não é defeito daqui: o
                          Android 13+ passou a atender `accept="image/*"` com o
                          seletor de fotos do sistema, que não tem câmera. Isso
                          não se contorna por código — ou se pede a câmera, ou se
                          aceita o que o aparelho decidir.
                          O trabalho real é o porteiro com a caixa na mão: a
                          câmera é o caminho, e agora é um toque só.

                          O link embaixo existe porque a foto é OBRIGATÓRIA para
                          cadastrar. Se a câmera falhar ou a permissão estiver
                          negada, sem ele o porteiro fica sem conseguir registrar
                          a encomenda de jeito nenhum.

                          Os <input> cobrem o próprio controle em vez de
                          `display: none`: clique encaminhado por <label> para
                          campo escondido assim é ignorado por parte dos
                          navegadores de celular. */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                        {item.foto ? (
                          <div style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '10px', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
                            <img src={item.foto.thumb} alt="Etiqueta" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button
                              type="button"
                              className="enc-redondo enc-foto-x"
                              aria-label="Tirar esta foto"
                              onClick={() => handleRemoveItemPhoto(idx)}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <label
                              className="enc-foto-tile"
                              style={{ borderColor: theme.border, backgroundColor: theme.bgBody }}
                              title={temToque ? "Tirar a foto agora" : "Escolher um arquivo"}
                            >
                              <Camera size={20} color={theme.textSecondary} />
                              <span style={{ fontSize: '9px', color: theme.textSecondary }}>{temToque ? 'Câmera' : 'Foto'}</span>
                              <input
                                className="enc-foto-input"
                                type="file"
                                accept="image/*"
                                capture={temToque ? "environment" : undefined}
                                onChange={(e) => handleItemFile(idx, e)}
                              />
                            </label>
                            {temToque && (
                              <label className="enc-foto-link" style={{ color: theme.textSecondary }}>
                                da galeria
                                <input className="enc-foto-input" type="file" accept="image/*" onChange={(e) => handleItemFile(idx, e)} />
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

            </div>

            <div className="enc-modal-footer" style={{ borderColor: theme.border, backgroundColor: theme.bgCard }}>
              <button
                className="enc-new-btn"
                style={{ width: '100%', background: loadingGlobal ? 'var(--fg-muted)' : '#D4432A', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '700', cursor: loadingGlobal ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(227,90,58,0.3)' }}
                onClick={handleSave}
                disabled={loadingGlobal}
              >
                {loadingGlobal ? <Loader2 style={buttonSpinnerStyle} size={20}/> : <><CheckCircle2 size={20}/> Registrar Entrada</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {showViewDetails && selectedDetails && (
        <div style={modalOverlay}>
          {photoZoomOpen && (
            <PhotoLightbox
              key={photoSrc}
              src={photoSrc}
              loading={photoLoading}
              count={selectedPhotoUrls.length}
              index={selectedPhotoIndex}
              onClose={() => setPhotoZoomOpen(false)}
              onPrev={() => setSelectedPhotoIndex((prev) => (prev === 0 ? selectedPhotoUrls.length - 1 : prev - 1))}
              onNext={() => setSelectedPhotoIndex((prev) => (prev === selectedPhotoUrls.length - 1 ? 0 : prev + 1))}
            />
          )}
          <div className="enc-modal" style={{ backgroundColor: theme.bgCard, color: theme.text, maxWidth: '920px', width: '95%' }}>
            <div className="enc-modal-header" style={{ borderColor: theme.border }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#D4432A', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(227,90,58,0.3)', flexShrink: 0 }}>
                  <Package size={22} color="white" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>Detalhes da Encomenda</div>
                  <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getCell(selectedDetails, 'NOME') || 'Informações completas da entrega'}</div>
                </div>
              </div>
              <button type="button" className="enc-close-btn" style={{ borderColor: theme.border, color: theme.textSecondary }} onClick={() => { setShowViewDetails(false); setSelectedDetails(null); setPhotoZoomOpen(false); }}>
                <X size={18} />
              </button>
            </div>

            <div className="enc-details-grid">
              {/* COLUNA ESQUERDA: FOTO */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📸 {itemDaFoto?.nota
                    ? `NF ${getCell(itemDaFoto.nota, 'numero_fiscal') || '—'}`
                    : 'Foto do Recebimento'}
                  {selectedPhotoUrls.length > 1 && (
                    <span style={{ fontWeight: 500, textTransform: 'none', marginLeft: '8px' }}>
                      ({selectedPhotoIndex + 1} de {selectedPhotoUrls.length})
                    </span>
                  )}
                </div>

                <div className="enc-photo-box" style={{ position: 'relative', flex: 1, minHeight: '380px', borderRadius: '16px', overflow: 'hidden', border: `2px solid ${theme.border}`, backgroundColor: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selectedPhotoUrls.length > 0 ? (
                    <>
                      {photoLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: theme.textSecondary }}>
                          <Loader2 style={spinnerAnimation} size={28} />
                          <span style={{ fontSize: '13px' }}>Carregando foto...</span>
                        </div>
                      ) : photoSrc ? (
                        <img
                          className="enc-photo-img"
                          src={photoSrc}
                          alt="Encomenda"
                          title="Toque para ampliar"
                          onClick={() => setPhotoZoomOpen(true)}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: theme.textSecondary }}>
                          <Package size={48} style={{ opacity: 0.25 }} />
                          <span style={{ fontSize: '13px' }}>Não foi possível carregar a foto</span>
                        </div>
                      )}
                      {selectedPhotoUrls.length > 1 && (
                        <>
                          <button
                            type="button"
                            className="enc-redondo"
                            onClick={() => setSelectedPhotoIndex((prev) => (prev === 0 ? selectedPhotoUrls.length - 1 : prev - 1))}
                            style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', width: '40px', height: '40px', borderRadius: '50%', border: 'none', backgroundColor: 'rgba(15, 23, 42, 0.8)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', transition: 'all 0.2s' }}
                            onMouseEnter={(e) => { e.target.style.backgroundColor = 'rgba(15, 23, 42, 0.95)'; }}
                            onMouseLeave={(e) => { e.target.style.backgroundColor = 'rgba(15, 23, 42, 0.8)'; }}
                          >‹</button>
                          <button
                            type="button"
                            className="enc-redondo"
                            onClick={() => setSelectedPhotoIndex((prev) => (prev === selectedPhotoUrls.length - 1 ? 0 : prev + 1))}
                            style={{ position: 'absolute', top: '50%', right: '16px', transform: 'translateY(-50%)', width: '40px', height: '40px', borderRadius: '50%', border: 'none', backgroundColor: 'rgba(15, 23, 42, 0.8)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', transition: 'all 0.2s' }}
                            onMouseEnter={(e) => { e.target.style.backgroundColor = 'rgba(15, 23, 42, 0.95)'; }}
                            onMouseLeave={(e) => { e.target.style.backgroundColor = 'rgba(15, 23, 42, 0.8)'; }}
                          >›</button>
                        </>
                      )}
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                      <Package size={64} color={theme.textSecondary} style={{ opacity: 0.2 }} />
                      <span style={{ color: theme.textSecondary, fontSize: '14px' }}>Sem foto disponível</span>
                    </div>
                  )}
                </div>
                {selectedPhotoUrls.length > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 0 }}>
                    {selectedPhotoUrls.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="enc-redondo enc-ponto"
                        aria-label={`Foto ${idx + 1}`}
                        onClick={() => setSelectedPhotoIndex(idx)}
                        style={{ backgroundColor: idx === selectedPhotoIndex ? '#E35A3A' : theme.border, transition: 'all 0.2s' }}
                      />
                    ))}
                  </div>
                )}

              </div>

              {/* COLUNA DIREITA: DETALHES */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 0 }}>
                {/* Card Destinatário */}
                <div style={{ padding: '16px', borderRadius: '14px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, transition: 'all 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <User size={18} color="#E35A3A" />
                    <span style={{ fontSize: '12px', fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase' }}>Destinatário</span>
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text, marginBottom: '8px' }}>{getCell(selectedDetails, 'NOME') || '—'}</div>
                  <div style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '12px' }}>{formatBlockUnit(getCell(selectedDetails, 'ID_UNIDADE') || getCell(selectedDetails, 'id_unidade')) || '—'}</div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textSecondary }}>
                      <Phone size={14} color={theme.textSecondary} />
                      {getCell(selectedDetails, 'TELEFONE') || getCell(selectedDetails, 'telefone') || '—'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textSecondary }}>
                      <LayoutDashboard size={14} color={theme.textSecondary} />
                      <span>Nº Encomenda: <strong style={{ color: theme.text }}>{getCell(selectedDetails, 'NUMERO_ENCOMENDA') || getCell(selectedDetails, 'numero_encomenda') || '—'}</strong></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textSecondary }}>
                      <Box size={14} color={theme.textSecondary} />
                      <span>Volumes: <strong style={{ color: theme.text }}>{getCell(selectedDetails, 'QUANTIDADE_ENCOMENDA') || getCell(selectedDetails, 'quantidade_encomenda') || '—'}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Card Entrada */}
                <div style={{ padding: '16px', borderRadius: '14px', backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <Calendar size={18} color="currentColor" />
                    <span style={{ fontSize: '12px', fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase' }}>Dados de Entrada</span>
                  </div>
                  <div style={{ display: 'grid', gap: '10px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ color: theme.textSecondary, fontWeight: '600' }}>Status:</span>
                      {(() => {
                        const s = (getCell(selectedDetails, 'STATUS') || getCell(selectedDetails, 'status') || '—').toString().toUpperCase();
                        const isEntregue = s === 'ENTREGUE' || s === 'RETIRADO';
                        const sColor = s === 'PENDENTE' ? 'var(--fg-secondary)' : isEntregue ? '#B33320' : s === 'ARMAZENADO' ? '#D4432A' : theme.text;
                        const sBg = s === 'PENDENTE' ? 'var(--surface-3)' : isEntregue ? '#FEE4DC' : s === 'ARMAZENADO' ? '#FEE4DC' : 'var(--surface-3)';
                        return <span style={{ ...badgeStyle, backgroundColor: sBg, color: sColor }}>{s}</span>;
                      })()}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: theme.textSecondary, fontWeight: '600' }}>Data de Entrada:</span>
                      <span style={{ color: theme.text }}>{formatDateTime(getCell(selectedDetails, 'DATA_ENTRADA') || getCell(selectedDetails, 'data_entrada')) || '—'}</span>
                    </div>
                    {/* O código vive aqui, e não em "Dados de Saída", porque
                        nasce com a notificação e não com a retirada. Só síndico
                        e dev leem: quem dá a baixa lendo o código na própria
                        tela não confere nada. Ver `verCodigoRetirada`. */}
                    {can(user, 'verCodigoRetirada') && getCell(selectedDetails, 'cod') && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ color: theme.textSecondary, fontWeight: '600' }}>Cód. de retirada:</span>
                        <span style={{ color: theme.text, fontWeight: '700', letterSpacing: '0.08em' }}>{getCell(selectedDetails, 'cod')}</span>
                      </div>
                    )}
                    <div>
                      <span style={{ color: theme.textSecondary, fontWeight: '600' }}>Referência / Transportadora:</span>
                      <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {getNFsDaEncomenda(selectedDetails).length > 0 ? (
                          getNFsDaEncomenda(selectedDetails).map((nf, i) => (
                            <div key={i} style={{ fontSize: '12px', color: theme.text, display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                              <span style={{ fontWeight: 600 }}>{getCell(nf, 'NUMERO_FISCAL') || getCell(nf, 'numero_fiscal') || '—'}</span>
                              <span style={{ color: theme.textSecondary }}>{getCell(nf, 'TRANSPORTADORA') || getCell(nf, 'transportadora') || '—'}</span>
                            </div>
                          ))
                        ) : (
                          <span style={{ color: theme.text }}>—</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Saída */}
                <div style={{ padding: '16px', borderRadius: '14px', backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <CheckCircle2 size={18} color="#E35A3A" />
                    <span style={{ fontSize: '12px', fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase' }}>Dados de Saída</span>
                  </div>
                  {/* Quando a foto na tela pertence a uma nota, o card fala
                      DAQUELE item. Numa encomenda parcialmente entregue, o
                      resumo da encomenda seria falso para metade dos volumes. */}
                  {itemDaFoto?.nota && (
                    <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '10px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}` }}>
                      {/* Só a descrição: quem retirou, quando e por quem já está
                          logo abaixo, e repetir aqui era ler a mesma coisa duas
                          vezes em três linhas.
                          A NF continua clicando para abrir a assinatura DAQUELE
                          item — sem ela, a prova de uma retirada parcial ficaria
                          inalcançável, porque os campos de baixo só são
                          preenchidos quando a encomenda FECHA. */}
                      <div style={{ fontSize: '12px', color: theme.textSecondary, fontWeight: 600 }}>
                        Item na tela:{' '}
                        <NomeComAssinatura
                          retirada={itemDaFoto.retirada}
                          nome={`NF ${getCell(itemDaFoto.nota, 'numero_fiscal') || '—'}${getCell(itemDaFoto.nota, 'transportadora') ? ` · ${getCell(itemDaFoto.nota, 'transportadora')}` : ''}`}
                        />
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gap: '10px', fontSize: '13px' }}>
                    {(() => {
                      const saidas = saidasDaEncomenda(selectedDetails);

                      // O CARD SEGUE A FOTO.
                      //
                      // Quando a imagem na tela pertence a uma nota, é a saída
                      // DAQUELE item que preenche os campos — e se ele ainda
                      // está na prateleira, os campos ficam vazios mesmo que
                      // outro item da mesma encomenda já tenha saído. Foi esse
                      // o defeito: trocar para a foto do item que não saiu
                      // continuava mostrando quem levou o outro.
                      //
                      // Sem foto ligada a nota (encomenda antiga, ou nenhuma
                      // foto), não há item na tela: aí vale a última saída da
                      // encomenda, e a coluna dela como reserva — linha migrada
                      // da planilha tem `entregue_por` e `data_saida`
                      // preenchidos e nenhuma saída registrada.
                      const { retirada: ultima, nome, cpf, entreguePor, quando, via } = saidaVisivel({
                        notaNaTela: itemDaFoto?.nota,
                        retiradaDaNota: itemDaFoto?.retirada,
                        ultimaSaida: saidas.length ? saidas[saidas.length - 1].retirada : null,
                        encomenda: selectedDetails,
                      });

                      const parcial = (getCell(selectedDetails, 'status') || '').toString().toUpperCase() === 'PARCIALMENTE ENTREGUE';
                      const listar = saidas.length > 1 || parcial;

                      return (
                        <>
                          {/* Era "Cód. Entrega", lendo `entregas.cod`. Aquele
                              código nasce quando a NOTIFICAÇÃO sai (gatilho do
                              0020), não quando o pacote sai: encomenda pendente,
                              parada na prateleira, exibia código preenchido num
                              card chamado "Dados de Saída".
                              `via` vem da retirada assinada e responde o que
                              este card existe para responder — se o morador
                              provou com o código ou se foi liberado pela
                              identificação. Vazio até alguém assinar. */}
                          <div><span style={{ color: theme.textSecondary, fontWeight: '600' }}>Conferido por:</span> <span style={{ color: theme.text, fontWeight: '700' }}>{rotuloVia(via) || '—'}</span></div>
                          <div><span style={{ color: theme.textSecondary, fontWeight: '600' }}>Entregue por:</span> <span style={{ color: theme.text, fontWeight: '700' }}>{entreguePor || '—'}</span></div>
                          <div>
                            <span style={{ color: theme.textSecondary, fontWeight: '600' }}>Retirado por:</span>{' '}
                            <NomeComAssinatura retirada={ultima} nome={nome || '—'} />
                          </div>
                          {!foiNotificada(selectedDetails) && (
                            <div><span style={{ color: theme.textSecondary, fontWeight: '600' }}>CPF de quem retirou:</span> <span style={{ color: theme.text, fontWeight: '700' }}>{cpf ? maskCPF(cpf) : '—'}</span></div>
                          )}
                          <div><span style={{ color: theme.textSecondary, fontWeight: '600' }}>Data de Saída:</span> <span style={{ color: theme.text }}>{formatDateTime(quando) || '—'}</span></div>
                          {listar && (
                            <div>
                              <span style={{ color: theme.textSecondary, fontWeight: '600' }}>Já retiradas:</span>{' '}
                              <span style={{ color: theme.text, fontWeight: '700' }}>
                                {saidas
                                  .map((x) => (x.nota ? `NF ${getCell(x.nota, 'numero_fiscal')}` : 'volume sem nota'))
                                  .join(', ') || '—'}
                              </span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <div><span style={{ color: theme.textSecondary, fontWeight: '600' }}>Notificado:</span> <span style={{ color: theme.text, fontWeight: '700' }}>{(getCell(selectedDetails, 'NOTIFICADO') || getCell(selectedDetails, 'notificado') || '—').toString().toUpperCase()}</span></div>
                  </div>
                </div>

                {(getCell(selectedDetails, 'STATUS') || getCell(selectedDetails, 'status') || '').toString().toUpperCase() === 'ARMAZENADO' && (
                  <div style={{ padding: '16px', borderRadius: '14px', backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <Archive size={18} color="#D4432A" />
                      <span style={{ fontSize: '12px', fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase' }}>Dados de Armazenamento</span>
                    </div>
                    <div style={{ display: 'grid', gap: '10px', fontSize: '13px' }}>
                      <div><span style={{ color: theme.textSecondary, fontWeight: '600' }}>Local:</span> <span style={{ color: theme.text, fontWeight: '700' }}>{getCell(selectedDetails, 'ARMAZENADO_LOCAL') || getCell(selectedDetails, 'armazenado_local') || '—'}</span></div>
                      <div><span style={{ color: theme.textSecondary, fontWeight: '600' }}>Armazenado por:</span> <span style={{ color: theme.text, fontWeight: '700' }}>{getCell(selectedDetails, 'ARMAZENADO_POR') || getCell(selectedDetails, 'armazenado_por') || '—'}</span></div>
                      <div><span style={{ color: theme.textSecondary, fontWeight: '600' }}>Data:</span> <span style={{ color: theme.text }}>{formatDateTime(getCell(selectedDetails, 'ARMAZENADO_DATA') || getCell(selectedDetails, 'armazenado_data')) || '—'}</span></div>
                    </div>
                  </div>
                )}

                {/* Card Observações */}
                {(getCell(selectedDetails, 'OBS') || getCell(selectedDetails, 'observacoes') || getCell(selectedDetails, 'obs')) && (
                  <div style={{ padding: '16px', borderRadius: '14px', backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', marginBottom: '8px' }}>📝 Observações</div>
                    <div style={{ fontSize: '13px', color: theme.textSecondary, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {getCell(selectedDetails, 'OBS') || getCell(selectedDetails, 'observacoes') || getCell(selectedDetails, 'obs')}
                    </div>
                  </div>
                )}

                {/* Botões de Ação */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto' }}>
                  {(getCell(selectedDetails, 'TELEFONE') || getCell(selectedDetails, 'telefone')) && (
                    <button
                      type="button"
                      onClick={() => handleResendWhatsapp(selectedDetails)}
                      style={{ width: '100%', padding: '12px 18px', borderRadius: '12px', border: '1px solid #E35A3A', backgroundColor: 'transparent', color: '#E35A3A', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseEnter={(e) => { e.target.style.backgroundColor = '#E35A3A15'; }}
                      onMouseLeave={(e) => { e.target.style.backgroundColor = 'transparent'; }}
                    >
                      📱 Reenviar Notificação
                    </button>
                  )}
                  {isAtrasadoArmazenar(selectedDetails) && (
                    <button
                      type="button"
                      onClick={() => handleAbrirArmazenar(selectedDetails)}
                      style={{ width: '100%', padding: '12px 18px', borderRadius: '12px', border: 'none', backgroundColor: '#D4432A', color: 'white', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                      📦 Armazenar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      abrirRetirada(selectedDetails);
                    }}
                    disabled={['RETIRADO', 'ENTREGUE'].includes((getCell(selectedDetails, 'STATUS') || getCell(selectedDetails, 'status') || '').toString().toUpperCase())}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: '12px',
                      border: 'none',
                      backgroundColor: ['RETIRADO', 'ENTREGUE'].includes((getCell(selectedDetails, 'STATUS') || getCell(selectedDetails, 'status') || '').toString().toUpperCase()) ? theme.border : '#E35A3A',
                      color: ['RETIRADO', 'ENTREGUE'].includes((getCell(selectedDetails, 'STATUS') || getCell(selectedDetails, 'status') || '').toString().toUpperCase()) ? theme.textSecondary : 'white',
                      fontWeight: '700',
                      cursor: ['RETIRADO', 'ENTREGUE'].includes((getCell(selectedDetails, 'STATUS') || getCell(selectedDetails, 'status') || '').toString().toUpperCase()) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {['RETIRADO', 'ENTREGUE'].includes((getCell(selectedDetails, 'STATUS') || getCell(selectedDetails, 'status') || '').toString().toUpperCase()) ? '✓ Já Entregue' : '✓ Confirmar Entrega'}
                  </button>
                  {/* Editar e Excluir nunca existiram nesta tela: `modalType`
                      nascia "add" e nunca mudava. No banco o acesso sempre
                      esteve lá — `eh_dev()` entra em `eh_sindico()`, que entra
                      em `eh_administrativo()`. Quem nega de verdade continua
                      sendo o RLS; isto aqui só decide o que aparece. */}
                  {can(user, 'editarEncomenda') && (
                    <button
                      type="button"
                      onClick={() => abrirEdicao(selectedDetails)}
                      style={{ width: '100%', padding: '12px 18px', borderRadius: '12px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.text, fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <Edit2 size={16} /> Editar cadastro
                    </button>
                  )}
                  {can(user, 'excluirEncomenda') && (
                    <button
                      type="button"
                      onClick={() => setExcluindo(selectedDetails)}
                      style={{ width: '100%', padding: '12px 18px', borderRadius: '12px', border: '1px solid #B8203F', backgroundColor: 'transparent', color: '#B8203F', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <Trash2 size={16} /> Excluir cadastro
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showArmazenarModal && armazenarItem && (
        <div style={modalOverlay}>
          <div style={{ ...modalContent, backgroundColor: theme.bgCard, color: theme.text, maxWidth: '480px', width: '95%' }}>
            <div style={modalHeader}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  📦 Armazenar Encomenda
                </div>
                <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px' }}>Registre o local e o responsável pelo armazenamento</div>
              </div>
              <X size={24} cursor="pointer" onClick={() => {
                setShowArmazenarModal(false);
                setArmazenarItem(null);
                setArmazenarLocal("");
                setArmazenarPor("");
              }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '8px 0' }}>
              <div>
                <label style={labelStyle}>Local Armazenado</label>
                <input
                  type="text"
                  value={armazenarLocal}
                  onChange={(e) => setArmazenarLocal(e.target.value)}
                  style={{ ...selectStyle, width: '100%', backgroundColor: theme.bgBody, color: theme.text, borderColor: theme.border }}
                  placeholder="Ex: Prateleira 3, Sala do Armazém..."
                />
              </div>

              <div>
                <label style={labelStyle}>Nome de Quem Armazenou</label>
                <input
                  type="text"
                  value={armazenarPor}
                  onChange={(e) => setArmazenarPor(e.target.value)}
                  style={{ ...selectStyle, width: '100%', backgroundColor: theme.bgBody, color: theme.text, borderColor: theme.border }}
                  placeholder="Digite o nome completo"
                />
              </div>

              <div style={{ fontSize: '12px', color: theme.textSecondary, backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '10px 12px' }}>
                🕒 A data e o horário do armazenamento serão registrados automaticamente agora.
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowArmazenarModal(false);
                    setArmazenarItem(null);
                    setArmazenarLocal("");
                    setArmazenarPor("");
                  }}
                  style={{ backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding: '12px 20px', borderRadius: '12px', cursor: 'pointer', fontWeight: '600' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmArmazenar}
                  disabled={!armazenarLocal.trim() || !armazenarPor.trim() || armazenarLoading}
                  style={{
                    backgroundColor: !armazenarLocal.trim() || !armazenarPor.trim() || armazenarLoading ? 'var(--fg-muted)' : '#D4432A',
                    color: 'white', border: 'none', padding: '12px 20px', borderRadius: '12px',
                    cursor: !armazenarLocal.trim() || !armazenarPor.trim() || armazenarLoading ? 'not-allowed' : 'pointer',
                    fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px'
                  }}
                >
                  {armazenarLoading ? <Loader2 style={spinnerAnimation} size={18} /> : '📦 Confirmar Armazenamento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* A retirada assinada, que substitui o livro de papel da portaria. Uma
          assinatura por CADASTRO: o morador confere o que está saindo daquele
          registro e assina, e a baixa acontece na mesma transação. */}
      {retiradaAberta && (
        <RetiradaDialog
          aberto
          pendentes={pendentesDaRetirada}
          notasFiscais={notasDaRetirada}
          jaRetirados={jaRetiradosDoCadastro}
          idUnidade={retiradaUnidade}
          usuario={user}
          aoFechar={() => { setRetiradaAberta(false); setRetiradaUnidade(null); setRetiradaCadastro(null); }}
          aoConcluir={async () => {
            setRetiradaAberta(false);
            setRetiradaUnidade(null);
            setRetiradaCadastro(null);
            setSelectedDetails(null);
            await fetchData();
          }}
        />
      )}

      {showWhatsappPrompt && pendingWhatsapp && (
        <div style={modalOverlay}>
          <div style={{ ...modalContent, backgroundColor: theme.bgCard, color: theme.text, maxWidth: '520px', width: '95%' }}>
            <div style={modalHeader}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>Enviar notificação por WhatsApp?</div>
                <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px' }}>Avise o morador que a encomenda chegou.</div>
              </div>
              <X size={20} cursor="pointer" onClick={handleCancelWhatsapp} />
            </div>
            <div style={{ padding: '10px 0' }}>
              <p style={{ margin: 0, color: theme.textSecondary, lineHeight: 1.6 }}>
                Deseja enviar uma mensagem para <strong>{pendingWhatsapp.phone}</strong> avisando que a encomenda <strong>Nº {pendingWhatsapp.numero || '—'}</strong> chegou e já está disponível para retirada?
              </p>
              {whatsappCodLoading && (
                <p style={{ margin: '10px 0 0', color: theme.textSecondary, fontSize: '13px' }}>Preparando a mensagem...</p>
              )}
              {pendingWhatsapp.cod === null && !whatsappCodLoading && (
                <p style={{ margin: '10px 0 0', color: '#B8203F', fontSize: '13px' }}>Não foi possível preparar a mensagem ainda. Aguarde alguns segundos e tente novamente.</p>
              )}
              <div style={{ marginTop: '18px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleCancelWhatsapp}
                  style={{ backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding: '12px 18px', borderRadius: '12px', cursor: 'pointer' }}
                >Não</button>
                <button
                  type="button"
                  onClick={handleSendWhatsapp}
                  disabled={whatsappCodLoading || pendingWhatsapp?.cod === null || !pendingWhatsapp?.cod}
                  style={{ backgroundColor: whatsappCodLoading || pendingWhatsapp?.cod === null || !pendingWhatsapp?.cod ? 'var(--fg-muted)' : '#25d366', color: 'white', border: 'none', padding: '12px 18px', borderRadius: '12px', cursor: whatsappCodLoading || pendingWhatsapp?.cod === null || !pendingWhatsapp?.cod ? 'not-allowed' : 'pointer' }}
                >{whatsappCodLoading ? 'Preparando...' : 'Sim, enviar WhatsApp'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LEMBRETE — escreva o número NA ENCOMENDA.
          Sem telefone confirmado não sai WhatsApp, então não há código na mão
          de ninguém: o número escrito na caixa é o único jeito de casar pacote
          e cadastro quando o morador descer. Não se pede nada de volta — a
          linha do livro que aqui se digitava sumiu junto com o livro. */}
      {/* A assinatura, que é o comprovante que substituiu o livro. Fundo branco
          fixo: a tinta é preta e o PNG tem fundo transparente, então no tema
          escuro ela sumiria dentro do próprio comprovante. */}
      {assinaturaAberta && (
        <div style={modalOverlay} onClick={() => setAssinaturaAberta(null)}>
          <div
            style={{ ...modalContent, backgroundColor: theme.bgCard, color: theme.text, maxWidth: '560px', width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalHeader}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>Assinatura de {assinaturaAberta.nome}</div>
                <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px' }}>{assinaturaAberta.quando}</div>
              </div>
              <X size={20} cursor="pointer" onClick={() => setAssinaturaAberta(null)} />
            </div>
            <div style={{ padding: '6px 0' }}>
              {assinaturaAberta.carregando ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '40px', color: theme.textSecondary }}>
                  <Loader2 style={spinnerAnimation} size={22} /> Carregando assinatura...
                </div>
              ) : assinaturaAberta.url ? (
                <img
                  src={assinaturaAberta.url}
                  alt={`Assinatura de ${assinaturaAberta.nome}`}
                  style={{ width: '100%', display: 'block', background: '#fff', borderRadius: '12px', border: `1px solid ${theme.border}` }}
                />
              ) : (
                <p style={{ margin: 0, padding: '30px 0', textAlign: 'center', color: theme.textSecondary }}>
                  Não foi possível carregar a assinatura.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Excluir é irreversível e apaga foto do bucket junto — pede confirmação
          com o número na frente, para não apagar a encomenda errada. */}
      {excluindo && (
        <div style={modalOverlay}>
          <div style={{ ...modalContent, backgroundColor: theme.bgCard, color: theme.text, maxWidth: '460px', width: '95%' }}>
            <div style={modalHeader}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>Excluir esta encomenda?</div>
                <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px' }}>
                  Nº <strong>{getCell(excluindo, 'numero_encomenda') || '—'}</strong> — {getCell(excluindo, 'nome') || '—'}
                </div>
              </div>
              <X size={20} cursor="pointer" onClick={() => setExcluindo(null)} />
            </div>
            <div style={{ padding: '6px 0' }}>
              {temRetiradaAssinada(excluindo) ? (
                <p style={{ margin: '0 0 16px', color: '#B8203F', lineHeight: 1.6 }}>
                  Esta encomenda já tem retirada assinada — inteira ou parcial.
                  Ela não pode ser excluída: o comprovante ficaria falando de um
                  pacote que o sistema não conhece mais.
                </p>
              ) : (
                <p style={{ margin: '0 0 16px', color: theme.textSecondary, lineHeight: 1.6 }}>
                  Apaga o cadastro, as notas fiscais e as fotos da etiqueta. Não
                  tem como desfazer.
                </p>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setExcluindo(null)}
                  disabled={excluindoOcupado}
                  style={{ backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding: '12px 18px', borderRadius: '12px', cursor: 'pointer' }}
                >Cancelar</button>
                <button
                  type="button"
                  onClick={handleExcluir}
                  disabled={excluindoOcupado || temRetiradaAssinada(excluindo)}
                  style={{ backgroundColor: (excluindoOcupado || temRetiradaAssinada(excluindo)) ? 'var(--fg-muted)' : '#B8203F', color: 'white', border: 'none', padding: '12px 18px', borderRadius: '12px', cursor: (excluindoOcupado || temRetiradaAssinada(excluindo)) ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
                >{excluindoOcupado ? <><Loader2 style={buttonSpinnerStyle} size={18} /> Excluindo...</> : 'Excluir'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {anotarInfo && (
        <div style={modalOverlay}>
          <div style={{ ...modalContent, backgroundColor: theme.bgCard, color: theme.text, maxWidth: '460px', width: '95%' }}>
            <div style={modalHeader}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>Escreva o número na encomenda</div>
                <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px' }}>
                  <strong>{anotarInfo.unitLabel}</strong> — sem número confirmado para notificação.
                </div>
              </div>
              <X size={20} cursor="pointer" onClick={() => setAnotarInfo(null)} />
            </div>
            <div style={{ padding: '6px 0' }}>
              <p style={{ margin: '0 0 16px', color: theme.textSecondary, lineHeight: 1.6 }}>
                Escreva este número <strong>na própria encomenda</strong>. É por ele
                que o pacote será achado na prateleira quando o morador descer.
              </p>
              <div style={{
                textAlign: 'center', padding: '16px', borderRadius: '14px',
                // `--fg-heading` é cor de TEXTO, e no escuro vale #FFFFFF. Usada aqui
                // como fundo, dava quadrado branco com o número em #EAEFEA por
                // cima — branco no branco, justo no único dado que esta janela
                // existe para mostrar. `--surface-2` já vira com o tema sozinha.
                backgroundColor: 'var(--surface-2)', border: `1px solid ${theme.border}`
              }}>
                <div style={{ fontSize: '12px', color: theme.textSecondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nº Encomenda</div>
                <div style={{ fontSize: '34px', fontWeight: 800, letterSpacing: '2px', color: theme.text, marginTop: '4px' }}>{anotarInfo.numero}</div>
              </div>
              <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setAnotarInfo(null)}
                  style={{ backgroundColor: '#E35A3A', color: 'white', border: 'none', padding: '12px 22px', borderRadius: '12px', cursor: 'pointer', fontWeight: 600 }}
                >Anotei</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}