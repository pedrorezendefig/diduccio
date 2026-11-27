 
 
import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle, Archive, Camera, CheckCircle2, Eye, Loader2, Package, Pencil,
  Plus, ScanLine, Search, Signature, Trash2, X, ZoomIn, ZoomOut,
} from "lucide-react";

import { listar, criar, editar, remover } from "../api/db";
import { supabase } from "../api/supabase";
import RetiradaDialog from "../components/RetiradaDialog";
import LeitorQR from "../components/LeitorQR";
import { can } from "../auth/permissions";
import { pendentesDaRetirada as pendentesParaRetirar, saidaVisivel, rotuloVia } from "../lib/retirada";
import { ehTelaDeToque } from "../lib/dispositivo";
import { maskCPF, maskPhone, nomeProprio } from "../lib/format";
import { urlDoAnexo, urlsDosAnexos, removerAnexo, enviarFotoDaEncomenda, removerFotoDaEncomenda } from "../api/anexos";
import {
  Button, Badge, Tabs, Input, Select, Field, Modal,
  PageHeader, EmptyState, useToast,
} from "../ui";
import ListaQueAbre from "../components/confirmacoes/ListaQueAbre";
import BuscaUnidade from "../components/BuscaUnidade";
import { Ficha, Filtros, Iniciais, Opcoes, Paginador } from "../components/app/pecas";

/** Encomendas por página (decisão do usuário, 23/11/2026). */
const POR_PAGINA = 20;


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

  // Trocou de foto → zoom e posição recomeçam: quem usa passa `key={src}`, e
  // o visualizador nasce de novo (sem efeito acertando estado depois do desenho).

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

  // No <body> e acima do modal: dentro da página, o véu do modal (que também
  // vai para o <body>) cobria o zoom.
  return createPortal(
    <div className="enc-luz" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="enc-luz__botoes">
        <button type="button" className="enc-redondo enc-luz__botao" onClick={() => aplicar(scale / 1.4)} aria-label="Diminuir zoom"><ZoomOut size={20} /></button>
        <button type="button" className="enc-redondo enc-luz__botao" onClick={() => aplicar(scale * 1.4)} aria-label="Aumentar zoom"><ZoomIn size={20} /></button>
        <button type="button" className="enc-redondo enc-luz__botao enc-luz__botao--fechar" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
      </div>

      {count > 1 && (
        <>
          <button type="button" className="enc-redondo enc-luz__botao enc-luz__botao--antes" onClick={onPrev} aria-label="Foto anterior">‹</button>
          <button type="button" className="enc-redondo enc-luz__botao enc-luz__botao--depois" onClick={onNext} aria-label="Próxima foto">›</button>
          <div className="enc-luz__contador">{index + 1} / {count}</div>
        </>
      )}

      {/* Palco da imagem — touch-action: none entrega os gestos para os handlers */}
      <div
        className={`enc-luz__palco${scale > 1 ? " enc-luz__palco--ampliada" : ""}`}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onDoubleClick={() => aplicar(scale > 1 ? 1 : 2.5)}
      >
        {loading ? (
          <Loader2 className="enc-gira" size={34} color="white" />
        ) : src ? (
          <img
            src={src}
            alt="Foto da encomenda"
            draggable={false}
            className={`enc-luz__foto${arrastando ? " enc-luz__foto--arrastando" : ""}`}
            // O único estilo que fica: a posição e o zoom mudam a cada pixel do gesto.
            style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
          />
        ) : (
          <span className="enc-luz__aviso">Não foi possível carregar a foto</span>
        )}
      </div>
    </div>,
    document.body,
  );
}

// As transportadoras que mais chegam na portaria: um toque no recebimento.
const TRANSPORTADORAS = ["Mercado Livre", "Amazon", "Shopee", "Correios"];

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
  // O QR que o morador mostra no app: o leitor aberto e o código que ele leu.
  const [lendoQR, setLendoQR] = useState(false);
  const [codigoDoQR, setCodigoDoQR] = useState("");
  // Quem do app mostrou o QR (titular ou dependente): o QR diz, o código não.
  const [appDoQR, setAppDoQR] = useState(null);
  // Quem recebe o aviso no app, por apartamento (só o primeiro nome, 0064).
  const [comApp, setComApp] = useState({});
  // O recebimento em 3 passos: "apto", "volumes" e "pronto" (com a etiqueta).
  const [passoRec, setPassoRec] = useState("apto");
  const [recebido, setRecebido] = useState(null);
  const [entregaFotos, setEntregaFotos] = useState(() => lerCacheEnc().entregaFotos || []);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("Pendente");
  const [pagina, setPagina] = useState(1);
  // Medido uma vez: o aparelho não ganha nem perde tela de toque no meio da sessão.
  const [temToque] = useState(ehTelaDeToque);

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

  // O recebimento sempre começa pelo apartamento.
  const abrirNovoRecebimento = () => {
    resetForm();
    setEditandoId(null);
    setModalType("add");
    setPassoRec("apto");
    setRecebido(null);
    setShowModal(true);
  };

  const fecharRecebimento = () => {
    setShowModal(false);
    setModalType("add");
    setEditandoId(null);
    setPassoRec("apto");
    setRecebido(null);
  };

  // Passo 1 → 2: só o apartamento e o destinatário. Os volumes são conferidos
  // no registro, pelo `validateForm` de sempre.
  const continuarParaVolumes = () => {
    const errors = {};
    if (!formData.id_unidade) errors.id_unidade = "Selecione a unidade destinatária.";
    if (!formData.nome.trim()) errors.nome = "Nome do destinatário é obrigatório.";
    setFormErrors(errors);
    if (!Object.keys(errors).length) setPassoRec("volumes");
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

  useEffect(() => { fetchData(); carregarComApp(); }, []);

  // Sem o 0064 aplicado (ou sem permissão), a tela segue como antes: a coluna
  // de aviso só não sabe dizer quem tem o app.
  // 0119: só quem recebe a encomenda no app (o proprietário com inquilino não
  // recebe). Sem o 0119 aplicado, volta para a lista de antes.
  async function carregarComApp() {
    let { data, error } = await supabase.rpc("quem_recebe_encomenda_no_app");
    if (error) ({ data, error } = await supabase.rpc("moradores_com_app"));
    if (error || !Array.isArray(data)) return;
    setComApp(Object.fromEntries(data.map((l) => [String(l.unidade_id), l.nomes ?? []])));
  }
  const nomesNoApp = (idUnidade) => comApp[String(idUnidade ?? "")] ?? [];

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
      // Em lote (urlsDosAnexos): um pedido por foto, todos juntos, esgotava
      // as conexões do banco no plano grátis (544 DatabaseTimeout, 23/11).
      const fotosBrutas = arr(resFotos);
      const links = await urlsDosAnexos(fotosBrutas.map((row) => row.caminho_storage));
      const fotos = fotosBrutas.map((row) => ({
        ...row,
        fonte_foto: row.caminho_storage
          ? (links.get(row.caminho_storage) ?? null)
          : (row.file_id || row.FILE_ID || null),
      }));
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
      // O formato curto do sistema (guia de marca): "B1-604".
      return `B${bloco}-${unidade}`;
    }
    return raw;
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
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
   * O que o diálogo de retirada mostra: o cadastro aberto e as outras
   * encomendas da mesma unidade ainda na portaria, para uma assinatura só.
   * O porquê está em `src/lib/retirada.js`.
   */
  const pendentesDaRetirada = useMemo(
    () => pendentesParaRetirar(encomendas, retiradaCadastro),
    [encomendas, retiradaCadastro]
  );
  const idsDaRetirada = useMemo(
    () => new Set(pendentesDaRetirada.map((e) => String(getCell(e, "id")))),
    [pendentesDaRetirada]
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
  const jaRetiradosDoCadastro = useMemo(
    () => retiradaItens.filter((row) => idsDaRetirada.has(String(getCell(row, "id_entrega")))),
    [retiradaItens, idsDaRetirada]
  );

  const notasDaRetirada = useMemo(
    () => entregasNF.filter((row) => idsDaRetirada.has(String(getCell(row, "id_encomenda")))),
    [entregasNF, idsDaRetirada]
  );

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

  // O NOME do destinatário vem só de quem tem cadastro aprovado no app
  // (moradores_com_app, 0097: nome completo). A tabela `moradores` da
  // administração não dá mais nome (2026-11-07): quem não está no app, o
  // porteiro digita como está na etiqueta. O telefone segue vindo do cadastro,
  // e só quando o número foi CONFIRMADO: é dele que sai o WhatsApp.
  const nomesDoAppNaUnidade = nomesNoApp(formData.id_unidade);

  const handleUnitSelect = (uId) => {
    const mFiltrados = moradores.filter(m =>
      m.id_unidade?.toString() === uId.toString() &&
      (m.status || "").toString() === "Ativo" &&
      (m.tipo_morador || "Titular").toString() === "Titular"
    );

    let novoNome = "";
    let novoTelefone = "";
    let novoMoradorId = "";

    // 1 titular no cadastro: o TELEFONE, só se o número foi CONFIRMADO.
    if (mFiltrados.length === 1) {
      novoTelefone = isConfirmado(mFiltrados[0].id) ? mFiltrados[0].telefone : "";
      novoMoradorId = mFiltrados[0].id;
    }
    // O nome: só do app. Uma pessoa no app, vem sozinho; mais de uma, o
    // porteiro escolhe em "Destinatário"; ninguém, ele digita.
    const noApp = nomesNoApp(uId);
    if (noApp.length === 1) novoNome = noApp[0];

    setFormData({
      ...formData,
      id_unidade: uId,
      id_morador: novoMoradorId,
      nome: novoNome,
      telefone: novoTelefone
    });
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
      notificado: "NAO",                 // o aviso é pelo app (0063); a coluna fica pelo histórico
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
        const envio = await enviarFotoDaEncomenda(editandoId, foto);
        if (!envio.success) { falhas++; continue; }
        const linhaFoto = await criar("ENTREGAS_FOTO", {
          id_entrega: String(editandoId),
          id_nota: idNota,
          nome_arquivo: envio.nome,
          caminho_storage: envio.caminho,
          caminho_miniatura: envio.miniatura,
          created_by: user?.nome || "Sistema",
        });
        if (!linhaFoto.success) { falhas++; await removerFotoDaEncomenda(envio); }
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
      const envio = await enviarFotoDaEncomenda(idEncomenda, it.foto);
      if (!envio.success) { fotosComFalha++; continue; }
      const linhaFoto = await criar("ENTREGAS_FOTO", {
        id_entrega: String(idEncomenda),
        id_nota: idNota,
        nome_arquivo: envio.nome,
        caminho_storage: envio.caminho,
        caminho_miniatura: envio.miniatura,
        created_by: user?.nome || "Sistema",
      });
      // Arquivo no bucket sem linha que o referencie é órfão invisível.
      if (!linhaFoto.success) { fotosComFalha++; await removerFotoDaEncomenda(envio); }
    }
    if (fotosComFalha) toast.error(`Encomenda registrada, mas ${fotosComFalha} foto(s) não subiram.`);

    // O passo "pronto": a etiqueta grande para escrever no pacote e quem foi
    // avisado. O aviso é só pelo app, que o banco manda sozinho (0063).
    setRecebido({
      numero: encomenda.numero_encomenda || "—",
      unidade: getUnitLabel(formData.id_unidade),
      volumes: quantidade,
      noApp: nomesNoApp(formData.id_unidade),
    });
    setPassoRec("pronto");

    resetForm();
    await fetchData();
    setLoadingGlobal(false);
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
    if (!retirada) return <b>{texto}</b>;
    return (
      <button
        type="button"
        className="enc-link"
        onClick={() => abrirAssinatura(retirada)}
        title="Ver a assinatura"
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
        // A miniatura (0084) é outro arquivo; reduzida, ela já é o `caminho_storage`.
        const miniatura = getCell(foto, "caminho_miniatura");
        if (miniatura && miniatura !== caminho) await removerAnexo(miniatura);
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
  const abrirRetirada = (item, codigo = "", idApp = null) => {
    const unidade = getCell(item, "id_unidade");
    const idCadastro = getCell(item, "id");
    setRetiradaUnidade(unidade === "" || unidade === null ? null : unidade);
    setRetiradaCadastro(idCadastro === "" || idCadastro === null ? null : idCadastro);
    setCodigoDoQR(codigo);
    setAppDoQR(idApp);
    setRetiradaAberta(true);
  };

  // O porteiro leu o QR (ou digitou o código) que o morador mostrou no app: o
  // código diz qual encomenda é, e a retirada abre nela, já conferida. A
  // assinatura continua obrigatória, no aparelho da portaria.
  const aoLerQR = (codigo, idApp = null) => {
    setLendoQR(false);
    const achada = encomendas.find(
      (e) => String(getCell(e, "cod") ?? "").toUpperCase() === codigo && getCell(e, "status") !== "Entregue"
    );
    if (!achada) {
      toast.error(`Nenhuma encomenda esperando retirada com o código ${codigo}. Confira com o morador ou atualize a lista.`);
      return;
    }
    abrirRetirada(achada, codigo, idApp);
  };

  // "Levar ao depósito": uma encomenda (pelo Ver detalhes) ou várias de uma vez
  // (a faixa das que completaram 5 dias). Quem levou já vem com o nome de quem
  // está logado, e dá para corrigir.
  const handleAbrirArmazenar = (itemOuLista) => {
    setArmazenarItem(itemOuLista);
    setArmazenarLocal("");
    setArmazenarPor(user?.nome || "");
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
    const alvos = Array.isArray(armazenarItem) ? armazenarItem : [armazenarItem];
    const ids = new Set(alvos.map((a) => String(getCell(a, "id") || getCell(a, "ID"))));

    setEncomendas(encomendas.map((entry) => {
      const entryId = (getCell(entry, "id") || getCell(entry, "ID") || "").toString();
      if (!ids.has(entryId)) return entry;
      return {
        ...entry,
        STATUS: novoStatus, status: novoStatus,
        ARMAZENADO_LOCAL: local, armazenado_local: local,
        ARMAZENADO_POR: por, armazenado_por: por,
        ARMAZENADO_DATA: dataArmazenado, armazenado_data: dataArmazenado,
      };
    }));

    try {
      // Uma por uma: o gatilho do 0064 avisa no app os moradores de cada uma.
      let falhas = 0;
      for (const id of ids) {
        const res = await editar("ENTREGAS", id, {
          status: novoStatus,
          armazenado_local: local,
          armazenado_por: por,
          armazenado_data: dataArmazenado,
        });
        if (!res.success) falhas++;
      }
      // A tela já pintou o depósito antes da resposta; falhando, ela estaria
      // mentindo sobre onde o pacote está.
      if (falhas) { toast.error(`${falhas} encomenda(s) não foram marcadas. Tente de novo.`); await fetchData(); return; }
      if (ids.size > 1) toast.success(`${ids.size} encomendas levadas ao depósito. Os moradores foram avisados no app.`);

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

  // Verdadeiro se a encomenda está Pendente há 5 dias corridos ou mais (vai para o depósito).
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
    // Compara só a data (zera horas): entrada + 5 dias, o mesmo prazo do app do
    // morador (0063/0064). Ex: entrou 02/06 → vai para o depósito a partir de 07/06.
    const d0 = new Date(dataEntrada.getFullYear(), dataEntrada.getMonth(), dataEntrada.getDate());
    const hoje = new Date();
    const h0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const diffDias = Math.floor((h0.getTime() - d0.getTime()) / (1000 * 60 * 60 * 24));
    return diffDias >= 5;
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
    paraDeposito: encomendas.filter(isAtrasadoArmazenar).length,
    volumes: encomendas.length
  };
  const paraDeposito = encomendas.filter(isAtrasadoArmazenar);

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
    } else if (filterStatus === "ParaDeposito") {
      matchesStatus = isAtrasadoArmazenar(e);
    } else {
      matchesStatus = status === filterStatus;
    }
    return matchesSearch && matchesStatus;
  });


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
    const itemId = getCell(item, "COD_ENTREGA") || getCell(item, "cod_entrega") || getCell(item, "id") || `${item.unidade_id}-${item.nome}`;
    return { unidade, nome, dataEntrada, recebidoPor, numeroFiscal, numeroEncomenda, volumes, statusLabel, itemId };
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
      key: "unidade", label: "Unidade", tipo: "id", largura: "84px",
      render: (item) => {
        const { unidade } = getItemDisplay(item);
        const atrasada = isAtrasadoArmazenar(item);
        return (
          <span className="mud-quem"><b className="conf-dado__mono">
            {unidade}
            {atrasada && (
              <AlertCircle size={14} className="enc-atrasada" aria-label="5 dias ou mais na portaria: levar ao depósito" />
            )}
          </b></span>
        );
      },
    },
    {
      key: "nome", label: "Destinatário", largura: "minmax(140px, 1.4fr)",
      render: (item) => {
        const { nome } = getItemDisplay(item);
        return <b>{nome}</b>;
      },
    },
    {
      key: "dataEntrada", label: "Entrada", largura: "minmax(130px, 1fr)",
      render: (item) => {
        const { dataEntrada, recebidoPor } = getItemDisplay(item);
        return (
          <span className="mud-quem">
            <b>{dataEntrada}</b>
            <small>Recebido por {recebidoPor}</small>
          </span>
        );
      },
    },
    {
      key: "numeroEncomenda", label: "Nº", tipo: "id", largura: "72px",
      render: (item) => getItemDisplay(item).numeroEncomenda,
    },
    {
      key: "volumes", label: "Volumes", tipo: "num", largura: "72px",
      render: (item) => getItemDisplay(item).volumes,
    },
    {
      key: "numeroFiscal", label: "Nota fiscal", largura: "minmax(96px, .8fr)",
      render: (item) => {
        const { numeroFiscal } = getItemDisplay(item);
        return numeroFiscal === "—" ? null : <span className="enc-nf">{numeroFiscal}</span>;
      },
    },
    {
      // O aviso é só pelo app, automático (0063). Sem ninguém no app, a
      // portaria vê que o morador não foi avisado.
      key: "aviso", label: "Aviso", largura: "150px",
      render: (item) => {
        if (isEntregue(item)) return null;
        const noApp = nomesNoApp(getCell(item, "id_unidade")).length;
        if (noApp) return <Badge tone="positive">{noApp === 1 ? "No app" : `No app · ${noApp} moradores`}</Badge>;
        return <Badge tone="neutral">Sem app</Badge>;
      },
    },
    {
      key: "status", label: "Situação", largura: "130px",
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
  ].map((c) => ({ ...c, rotulo: c.label }));

  // ---- A tela ----
  // Abas por onde a encomenda está, busca, e a lista no padrão do guia: a
  // linha (ou o olho) abre o detalhe. O cadastro e as janelas pequenas são o
  // <Modal> do sistema; o que é desta tela está em styles/encomendas.css.
  // Filtro que encolhe a lista não deixa a tela numa página que não existe mais.
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(filteredData.length / POR_PAGINA)));
  const visiveis = filteredData.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);
  const statusDe = (item) => (getCell(item, 'STATUS') || getCell(item, 'status') || '').toString().toUpperCase();
  const jaSaiu = (item) => ['RETIRADO', 'ENTREGUE'].includes(statusDe(item));
  const fecharDetalhe = () => { setShowViewDetails(false); setSelectedDetails(null); setPhotoZoomOpen(false); };
  const fecharArmazenar = () => { setShowArmazenarModal(false); setArmazenarItem(null); setArmazenarLocal(""); setArmazenarPor(""); };
  const d = selectedDetails;
  const obsDe = (item) => getCell(item, 'OBS') || getCell(item, 'observacoes') || getCell(item, 'obs');

  return (
    <div className="enc">
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
          <>
            <Button variant="secondary" iconLeft={<Plus size={16} />} onClick={abrirNovoRecebimento}>
              Novo recebimento
            </Button>
            <Button variant="primary" iconLeft={<ScanLine size={16} />} onClick={() => setLendoQR(true)}>
              Ler QR do morador
            </Button>
          </>
        }
      />

      {/* Abas de status no lugar dos cards clicáveis: mesma função de filtro,
          mas o estado ativo fica óbvio e ocupa uma fração da altura. */}
      <Tabs
        items={[
          { value: "Pendente", label: "Na portaria", count: stats.pendentes },
          { value: "ParaDeposito", label: "Para o depósito", count: stats.paraDeposito },
          { value: "Armazenado", label: "No depósito", count: stats.armazenados },
          { value: "EntregueHoje", label: "Entregues hoje", count: stats.entreguesHoje },
          { value: "Todos", label: "Todas" },
        ]}
        value={filterStatus}
        onChange={(v) => { setFilterStatus(v); setPagina(1); }}
      />

      {/* A faixa do depósito: o que completou 5 dias vai de uma vez, e o app
          avisa os moradores de cada encomenda. */}
      {paraDeposito.length > 0 && (filterStatus === "Pendente" || filterStatus === "ParaDeposito") && (
        <div className="enc-faixa-deposito" role="status">
          <Archive size={18} aria-hidden="true" />
          <span>
            <b>{paraDeposito.length === 1 ? "1 encomenda está" : `${paraDeposito.length} encomendas estão`} há 5 dias ou mais na portaria.</b>{" "}
            Leve ao depósito e o app avisa os moradores.
          </span>
          <Button variant="secondary" onClick={() => handleAbrirArmazenar(paraDeposito)}>Levar ao depósito</Button>
        </div>
      )}

      <Filtros
        busca={searchTerm}
        onBusca={(t) => { setSearchTerm(t); setPagina(1); }}
        placeholder="Buscar por unidade, morador ou nº da encomenda"
      />

      {!loadingInitial && filteredData.length === 0 ? (
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
            title={filterStatus === "Pendente" ? "Nenhuma encomenda aguardando retirada" : "Nenhuma encomenda nesta situação"}
            description={filterStatus === "Pendente"
              ? "Quando chegar uma encomenda na portaria, registre o recebimento para ela aparecer aqui."
              : "Troque de aba para ver as encomendas em outra situação."}
            action={filterStatus === "Pendente"
              ? <Button variant="primary" iconLeft={<Plus size={16} />} onClick={abrirNovoRecebimento}>Novo recebimento</Button>
              : null}
          />
        )
      ) : (
        <ListaQueAbre
          colunas={colunasEncomenda}
          larguraAcoes="104px"
          itens={visiveis}
          carregando={loadingInitial}
          chave={(item) => getItemDisplay(item).itemId}
          onAbrir={handleView}
          rotuloDaLinha={(item) => `Abrir a encomenda de ${getItemDisplay(item).nome || "sem nome"} (${getItemDisplay(item).unidade})`}
          celulas={(item) => colunasEncomenda.map((c) => <React.Fragment key={c.key}>{c.render(item)}</React.Fragment>)}
          acoes={(item) => {
            const nomeDaLinha = getItemDisplay(item).nome || "sem nome";
            // A assinatura da última saída: entregue (ou parcial) mostra a
            // prova sem abrir a encomenda.
            const saidas = saidasDaEncomenda(item);
            const ultimaSaida = saidas.length ? saidas[saidas.length - 1].retirada : null;
            return (
              <>
                {ultimaSaida && (
                  <Button variant="ghost" size="sm" className="enc-acao-icone" title="Ver a assinatura"
                    aria-label={`Ver a assinatura da encomenda de ${nomeDaLinha}`}
                    onClick={() => abrirAssinatura(ultimaSaida)}>
                    <Signature size={16} />
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="enc-acao-icone" title="Ver a encomenda" aria-label={`Ver a encomenda de ${nomeDaLinha}`}
                  onClick={() => handleView(item)}
                  onMouseEnter={() => prefetchItemPhotos(item)}
                  onTouchStart={() => prefetchItemPhotos(item)}>
                  <Eye size={16} />
                </Button>
                {/* No celular, entregar direto do cartão, sem abrir a encomenda: fecha a
                    fila de ações, à direita, com a mesma altura dos ícones. */}
                {!jaSaiu(item) && (
                  <Button variant="primary" size="sm" className="enc-entregar-celular"
                    iconLeft={<CheckCircle2 size={15} />}
                    aria-label={`Confirmar entrega da encomenda de ${nomeDaLinha}`}
                    onClick={() => abrirRetirada(item)}>
                    Confirmar entrega
                  </Button>
                )}
              </>
            );
          }}
        />
      )}
      <Paginador total={filteredData.length} pagina={paginaAtual} porPagina={POR_PAGINA} onPagina={setPagina} rotulo="Páginas das encomendas" />

      {/* ---- Recebimento (3 passos) e edição ---- */}
      <Modal
        open={showModal}
        onClose={fecharRecebimento}
        title={modalType === "add" ? "Novo recebimento" : "Editar encomenda"}
        size="md"
        className="enc-modal"
        footer={
          <div className="app-modal__acoes">
            {modalType === "add" && passoRec === "apto" && (
              <>
                <Button variant="ghost" onClick={fecharRecebimento}>Cancelar</Button>
                <Button variant="primary" onClick={continuarParaVolumes}>Continuar: volumes</Button>
              </>
            )}
            {modalType === "add" && passoRec === "pronto" && (
              <>
                <Button variant="ghost" onClick={fecharRecebimento}>Voltar para a lista</Button>
                <Button variant="primary" onClick={abrirNovoRecebimento}>Registrar outro</Button>
              </>
            )}
            {(modalType === "edit" || passoRec === "volumes") && (
              <>
                {modalType === "add"
                  ? <Button variant="ghost" onClick={() => setPassoRec("apto")} disabled={loadingGlobal}>Voltar</Button>
                  : <Button variant="ghost" onClick={fecharRecebimento}>Cancelar</Button>}
                <Button variant="primary" iconLeft={<CheckCircle2 size={16} />} loading={loadingGlobal} onClick={handleSave}>
                  {modalType === "add" ? "Registrar recebimento" : "Salvar alterações"}
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className="mud-form">
          {/* Os 3 passos do recebimento (a edição continua num formulário só). */}
          {modalType === "add" && (
            <div className="enc-passos" aria-label="Passos do recebimento">
              {[["apto", "Apartamento"], ["volumes", "Volumes"], ["pronto", "Pronto"]].map(([id, rotulo], i) => {
                const ordem = ["apto", "volumes", "pronto"];
                const feito = ordem.indexOf(passoRec) > i;
                return (
                  <span key={id} className={feito ? "feito" : undefined} aria-current={passoRec === id ? "step" : undefined}>
                    {feito ? <CheckCircle2 size={14} /> : `${i + 1}.`} {rotulo}
                  </span>
                );
              })}
            </div>
          )}

          {/* PRONTO: a etiqueta para escrever no pacote e por onde o aviso foi. */}
          {modalType === "add" && passoRec === "pronto" && recebido && (
            <>
              <div className="enc-etiqueta">
                <small>Escreva no pacote</small>
                <b>{recebido.numero}</b>
                <span>{recebido.unidade} · {recebido.volumes} {recebido.volumes === 1 ? "volume" : "volumes"}</span>
              </div>
              {recebido.noApp.length > 0 ? (
                <div className="enc-quem-app" role="status">
                  <b>Aviso enviado no app</b>
                  <span>
                    Para {recebido.noApp.join(" e ")}, com o código de retirada e o QR. Têm 5 dias para retirar.
                  </span>
                </div>
              ) : (
                <div className="enc-quem-app enc-quem-app--sem" role="status">
                  <b>Ninguém deste apartamento usa o app</b>
                  <span>
                    Ninguém foi avisado. A etiqueta escrita no pacote é o que liga a encomenda ao cadastro.
                  </span>
                </div>
              )}
            </>
          )}

          {(modalType === "edit" || passoRec === "apto") && (
            <>
              <Field label="Unidade destinatária" required error={formErrors.id_unidade}>
                <BuscaUnidade unidades={unidades} valor={unidades.find((u) => String(u.id) === String(formData.id_unidade)) ?? null}
                  onEscolher={(u) => (u ? handleUnitSelect(u.id) : setFormData({ ...formData, id_unidade: "", id_morador: "", nome: "", telefone: "" }))} />
              </Field>

              {/* Mais de uma pessoa do apartamento no app: escolhe o destinatário. */}
              {formData.id_unidade && nomesDoAppNaUnidade.length > 1 && (
                <Field label="Destinatário" help="Mais de uma pessoa deste apartamento usa o app">
                  <Select
                    value={nomesDoAppNaUnidade.includes(formData.nome) ? formData.nome : ""}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  >
                    <option value="">Escolha quem recebe…</option>
                    {nomesDoAppNaUnidade.map((n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </Field>
              )}

              <div className="mud-form__par">
                {/* Editável mesmo com o morador escolhido e o número confirmado.
                    A encomenda chega no nome que está na etiqueta, e nem sempre
                    é o do titular: vem para o cônjuge, para o filho, ou com o
                    nome escrito errado pela transportadora. O que se grava aqui
                    é o destinatário DESTA encomenda — o cadastro do morador não é
                    tocado.

                    O TELEFONE continua travado logo ao lado: ele só aparece
                    preenchido quando o número foi CONFIRMADO no cadastro. */}
                <Field label="Nome" required error={formErrors.nome}>
                  <Input
                    value={formData.nome}
                    onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  />
                </Field>
                <Field label="Telefone" error={formErrors.telefone}>
                  <Input
                    value={formData.telefone}
                    disabled={!!formData.id_morador}
                    placeholder="(DD) nnnnn-nnnn"
                    onChange={e => setFormData({ ...formData, telefone: formatPhoneBR(e.target.value) })}
                  />
                </Field>
              </div>

              {/* Quem deste apartamento recebe o aviso no app (0064). */}
              {modalType === "add" && formData.id_unidade && (
                nomesNoApp(formData.id_unidade).length > 0 ? (
                  <div className="enc-quem-app">
                    <b>Recebe o aviso no app</b>
                    <span>{nomesNoApp(formData.id_unidade).join(", ")}: o código de retirada e o QR chegam sozinhos.</span>
                  </div>
                ) : (
                  <div className="enc-quem-app enc-quem-app--sem">
                    <b>Ninguém deste apartamento usa o app</b>
                    <span>Não sai aviso: escreva o nº na encomenda.</span>
                  </div>
                )
              )}
            </>
          )}

          {(modalType === "edit" || passoRec === "volumes") && (
            <>
              <Field label="Quantidade de encomendas" error={formErrors.quantidade}>
                <Opcoes rotulo="Quantidade de encomendas" valor={String(formData.quantidade)} onMudar={(n) => setQuantidade(n)}
                  opcoes={Array.from({ length: 10 }, (_, i) => String(i + 1))} />
              </Field>

              {formData.itens.map((item, idx) => {
                const itemErr = Array.isArray(formErrors.itens) ? formErrors.itens[idx] : null;
                return (
                  <section key={idx} className="enc-volume">
                    <h3 className="enc-volume__titulo">Encomenda {idx + 1} de {formData.itens.length}</h3>
                    <div className="mud-form__par">
                      <Field label="Nº fiscal / referência" required error={itemErr?.numero_fiscal}>
                        <Input value={item.numero_fiscal} placeholder="Número fiscal"
                          onChange={(e) => setItemCampo(idx, 'numero_fiscal', e.target.value)} />
                      </Field>
                      <Field label="Transportadora" help="Opcional">
                        <Input value={item.transportadora} placeholder="Ex.: Amazon, ML…"
                          onChange={(e) => setItemCampo(idx, 'transportadora', e.target.value)} />
                      </Field>
                    </div>
                    {/* As mais comuns num toque; outra, digita no campo acima. */}
                    <div className="enc-chips" role="group" aria-label={`Transportadora da encomenda ${idx + 1}`}>
                      {TRANSPORTADORAS.map((t) => (
                        <button key={t} type="button" aria-pressed={item.transportadora === t}
                          onClick={() => setItemCampo(idx, 'transportadora', item.transportadora === t ? "" : t)}>
                          {t}
                        </button>
                      ))}
                    </div>

                    <Field label="Foto da etiqueta" required error={itemErr?.foto} help="Uma por encomenda">
                      {/* A câmera abre DIRETO no celular. Tentamos deixar o
                          sistema perguntar (sem `capture`), e no aparelho da
                          portaria o Android abriu a galeria de uma vez: o
                          Android 13+ atende `accept="image/*"` com o seletor de
                          fotos, que não tem câmera. O link "da galeria" existe
                          porque a foto é OBRIGATÓRIA: se a câmera falhar, sem ele
                          não se registra a encomenda de jeito nenhum. */}
                      <div className="enc-foto">
                        {item.foto ? (
                          <div className="enc-foto__miniatura">
                            <img src={item.foto.thumb} alt="Etiqueta" />
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
                          <div className="enc-foto__escolha">
                            <label className="enc-foto-tile" title={temToque ? "Tirar a foto agora" : "Escolher um arquivo"}>
                              <Camera size={20} aria-hidden="true" />
                              <span>{temToque ? 'Câmera' : 'Foto'}</span>
                              <Input
                                className="enc-foto-input"
                                type="file"
                                accept="image/*"
                                capture={temToque ? "environment" : undefined}
                                onChange={(e) => handleItemFile(idx, e)}
                              />
                            </label>
                            {temToque && (
                              <label className="enc-foto-link">
                                da galeria
                                <Input className="enc-foto-input" type="file" accept="image/*" onChange={(e) => handleItemFile(idx, e)} />
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    </Field>
                  </section>
                );
              })}
            </>
          )}
        </div>
      </Modal>

      {/* ---- Detalhe: só leitura, com a foto e as ações da encomenda ---- */}
      {photoZoomOpen && showViewDetails && d && (
        <PhotoLightbox
          key={photoSrc ?? "sem-foto"}
          src={photoSrc}
          loading={photoLoading}
          count={selectedPhotoUrls.length}
          index={selectedPhotoIndex}
          onClose={() => setPhotoZoomOpen(false)}
          onPrev={() => setSelectedPhotoIndex((prev) => (prev === 0 ? selectedPhotoUrls.length - 1 : prev - 1))}
          onNext={() => setSelectedPhotoIndex((prev) => (prev === selectedPhotoUrls.length - 1 ? 0 : prev + 1))}
        />
      )}
      <Modal
        open={showViewDetails && Boolean(d)}
        onClose={fecharDetalhe}
        title="Detalhes da encomenda"
        size="lg"
        className="enc-modal"
        footer={d && (
          <div className="app-modal__acoes">
            {/* Editar e Excluir só para quem pode; quem nega de verdade continua
                sendo o RLS — isto aqui só decide o que aparece. */}
            {can(user, 'excluirEncomenda') && (
              <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => setExcluindo(d)}>Excluir</Button>
            )}
            {can(user, 'editarEncomenda') && (
              <Button variant="ghost" iconLeft={<Pencil size={15} />} onClick={() => abrirEdicao(d)}>Editar</Button>
            )}
            {isAtrasadoArmazenar(d) && (
              <Button variant="secondary" iconLeft={<Archive size={15} />} onClick={() => handleAbrirArmazenar(d)}>Levar ao depósito</Button>
            )}
            <Button variant="primary" iconLeft={<CheckCircle2 size={15} />} disabled={jaSaiu(d)} onClick={() => abrirRetirada(d)}>
              {jaSaiu(d) ? "Já entregue" : "Confirmar entrega"}
            </Button>
          </div>
        )}
      >
        {d && (
          <div className="app-modal">
            <div className="app-modal__topo">
              <Iniciais nome={getCell(d, 'NOME')} grande />
              <div className="app-modal__quem">
                <strong>{getCell(d, 'NOME') || '—'}</strong>
                <small>{formatBlockUnit(getCell(d, 'ID_UNIDADE') || getCell(d, 'id_unidade')) || '—'} · Nº {getCell(d, 'NUMERO_ENCOMENDA') || getCell(d, 'numero_encomenda') || '—'}</small>
                <span className="app-modal__selos">
                  {statusDe(d) && <Badge tone={tomStatus(statusDe(d))}>{statusDe(d).charAt(0) + statusDe(d).slice(1).toLowerCase()}</Badge>}
                  {isAtrasadoArmazenar(d) && <Badge tone="danger">5 dias ou mais na portaria</Badge>}
                </span>
              </div>
            </div>

            <div className="enc-detalhe">
              <div className="enc-detalhe__fotos">
                <p className="enc-detalhe__legenda">
                  {itemDaFoto?.nota ? `NF ${getCell(itemDaFoto.nota, 'numero_fiscal') || '—'}` : 'Foto do recebimento'}
                  {selectedPhotoUrls.length > 1 && <span> · {selectedPhotoIndex + 1} de {selectedPhotoUrls.length}</span>}
                  {/* Depois de 90 dias fica só a miniatura (0084): avisa por que a foto está pequena. */}
                  {getCell(getEntregaPhotoRows(d)[selectedPhotoIndex] ?? {}, "foto_reduzida_em") && <span> · foto reduzida, encomenda antiga</span>}
                </p>
                <div className="enc-photo-box">
                  {selectedPhotoUrls.length > 0 ? (
                    <>
                      {photoLoading ? (
                        <span className="enc-photo-vazio"><Loader2 className="enc-gira" size={28} aria-hidden="true" />Carregando foto…</span>
                      ) : photoSrc ? (
                        <img className="enc-photo-img" src={photoSrc} alt="Encomenda" title="Toque para ampliar" onClick={() => setPhotoZoomOpen(true)} />
                      ) : (
                        <span className="enc-photo-vazio"><Package size={40} aria-hidden="true" />Não foi possível carregar a foto</span>
                      )}
                      {selectedPhotoUrls.length > 1 && (
                        <>
                          <button type="button" className="enc-redondo enc-seta enc-seta--antes" aria-label="Foto anterior"
                            onClick={() => setSelectedPhotoIndex((prev) => (prev === 0 ? selectedPhotoUrls.length - 1 : prev - 1))}>‹</button>
                          <button type="button" className="enc-redondo enc-seta enc-seta--depois" aria-label="Próxima foto"
                            onClick={() => setSelectedPhotoIndex((prev) => (prev === selectedPhotoUrls.length - 1 ? 0 : prev + 1))}>›</button>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="enc-photo-vazio"><Package size={48} aria-hidden="true" />Sem foto disponível</span>
                  )}
                </div>
                {selectedPhotoUrls.length > 1 && (
                  <div className="enc-pontos">
                    {selectedPhotoUrls.map((_, idx) => (
                      <button key={idx} type="button" className="enc-redondo enc-ponto" aria-label={`Foto ${idx + 1}`}
                        aria-current={idx === selectedPhotoIndex} onClick={() => setSelectedPhotoIndex(idx)} />
                    ))}
                  </div>
                )}
              </div>

              <div className="enc-detalhe__dados">
                <Ficha titulo="Destinatário" itens={[
                  ["Telefone", maskPhone(getCell(d, 'TELEFONE') || getCell(d, 'telefone') || '') || 'Sem telefone'],
                  ["Nº da encomenda", getCell(d, 'NUMERO_ENCOMENDA') || getCell(d, 'numero_encomenda') || '—', true],
                  ["Volumes", getCell(d, 'QUANTIDADE_ENCOMENDA') || getCell(d, 'quantidade_encomenda') || '—'],
                ]} />

                <Ficha titulo="Entrada" itens={[
                  ["Data", formatDateTime(getCell(d, 'DATA_ENTRADA') || getCell(d, 'data_entrada')) || '—'],
                  // O código de retirada NÃO aparece aqui, para ninguém: é o
                  // morador quem o informa na retirada. Quem dá a baixa lendo o
                  // código na própria tela não confere nada.
                  ["Recebido por", nomeProprio(getCell(d, 'created_by')) || '—'],
                  ["Notas fiscais", getNFsDaEncomenda(d).length ? (
                    <ul key="nfs" className="enc-nfs">
                      {getNFsDaEncomenda(d).map((nf, i) => (
                        <li key={i}><b>{getCell(nf, 'NUMERO_FISCAL') || getCell(nf, 'numero_fiscal') || '—'}</b><span>{getCell(nf, 'TRANSPORTADORA') || getCell(nf, 'transportadora') || 'Sem transportadora'}</span></li>
                      ))}
                    </ul>
                  ) : '—'],
                ]} />

                {(() => {
                  const saidas = saidasDaEncomenda(d);
                  // O CARD SEGUE A FOTO: quando a imagem na tela pertence a uma
                  // nota, é a saída DAQUELE item que preenche os campos. Sem foto
                  // ligada a nota, vale a última saída da encomenda (e a coluna
                  // dela como reserva, para linha migrada da planilha).
                  const { retirada: ultima, nome, cpf, entreguePor, quando, via } = saidaVisivel({
                    notaNaTela: itemDaFoto?.nota,
                    retiradaDaNota: itemDaFoto?.retirada,
                    ultimaSaida: saidas.length ? saidas[saidas.length - 1].retirada : null,
                    encomenda: d,
                  });
                  const parcial = statusDe(d) === 'PARCIALMENTE ENTREGUE';
                  // O aviso é só pelo app: quem o usa é avisado pelo banco na hora (0063).
                  const notificado = nomesNoApp(getCell(d, 'id_unidade')).length ? 'Sim, pelo app' : 'Não';
                  // Ninguém retirou ainda: uma linha diz isso, em vez de seis traços.
                  if (!ultima && !nome && !quando && !saidas.length) {
                    return (
                      <Ficha titulo="Saída" itens={[
                        ["Situação", 'Aguardando retirada'],
                        ["Morador avisado", notificado],
                      ]} />
                    );
                  }
                  return (
                    <section className="app-ficha">
                      <h3 className="app-ficha__titulo">Saída</h3>
                      {/* A NF clica para abrir a assinatura DAQUELE item — sem
                          ela, a prova de uma retirada parcial ficaria
                          inalcançável. */}
                      {itemDaFoto?.nota && itemDaFoto?.retirada && (
                        <p className="enc-item-na-tela">
                          Item na tela:{' '}
                          <NomeComAssinatura
                            retirada={itemDaFoto.retirada}
                            nome={`NF ${getCell(itemDaFoto.nota, 'numero_fiscal') || '—'}${getCell(itemDaFoto.nota, 'transportadora') ? ` · ${getCell(itemDaFoto.nota, 'transportadora')}` : ''}`}
                          />
                        </p>
                      )}
                      <dl className="app-ficha__dados">
                        {[
                          ["Conferido por", rotuloVia(via) || '—'],
                          ["Entregue por", entreguePor || '—'],
                          ["Retirado por", <NomeComAssinatura key="r" retirada={ultima} nome={nome || '—'} />],
                          !foiNotificada(d) && ["CPF de quem retirou", cpf ? maskCPF(cpf) : '—'],
                          ["Data de saída", formatDateTime(quando) || '—'],
                          (saidas.length > 1 || parcial) && ["Já retiradas", saidas.map((x) => (x.nota ? `NF ${getCell(x.nota, 'numero_fiscal')}` : 'volume sem nota')).join(', ') || '—'],
                          ["Morador avisado", notificado],
                        ].filter(Boolean).map(([rotulo, valor]) => (
                          <div key={rotulo} className="app-ficha__dado"><dt>{rotulo}</dt><dd>{valor}</dd></div>
                        ))}
                      </dl>
                    </section>
                  );
                })()}

                {statusDe(d) === 'ARMAZENADO' && (
                  <Ficha titulo="Depósito" itens={[
                    ["Local", getCell(d, 'ARMAZENADO_LOCAL') || getCell(d, 'armazenado_local') || '—'],
                    ["Levado por", getCell(d, 'ARMAZENADO_POR') || getCell(d, 'armazenado_por') || '—'],
                    ["Data", formatDateTime(getCell(d, 'ARMAZENADO_DATA') || getCell(d, 'armazenado_data')) || '—'],
                  ]} />
                )}

                {obsDe(d) && (
                  <section className="app-ficha">
                    <h3 className="app-ficha__titulo">Observações</h3>
                    <p className="mud-obs">{obsDe(d)}</p>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Levar ao depósito ---- */}
      <Modal
        open={showArmazenarModal && Boolean(armazenarItem)}
        onClose={fecharArmazenar}
        title="Levar ao depósito"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={fecharArmazenar}>Cancelar</Button>
            <Button variant="primary" iconLeft={<Archive size={15} />} loading={armazenarLoading}
              disabled={!armazenarLocal.trim() || !armazenarPor.trim()} onClick={handleConfirmArmazenar}>
              Confirmar depósito
            </Button>
          </>
        }
      >
        <div className="mud-form">
          <p className="vit-modal__desc">
            {Array.isArray(armazenarItem)
              ? `${armazenarItem.length} encomendas com 5 dias ou mais na portaria. Os moradores são avisados no app.`
              : "Registre o local e quem levou. O morador é avisado no app."}
          </p>
          <Field label="Local" required>
            <Input value={armazenarLocal} onChange={(e) => setArmazenarLocal(e.target.value)} placeholder="Ex.: Prateleira 3, sala do depósito…" />
          </Field>
          <Field label="Quem levou" required help="A data e a hora entram sozinhas, agora">
            <Input value={armazenarPor} onChange={(e) => setArmazenarPor(e.target.value)} placeholder="Digite o nome completo" />
          </Field>
        </div>
      </Modal>

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
          codigoInicial={codigoDoQR}
          appInicial={appDoQR}
          idAberto={retiradaCadastro}
          temApp={nomesNoApp(retiradaUnidade).length > 0}
          aoFechar={() => { setRetiradaAberta(false); setRetiradaUnidade(null); setRetiradaCadastro(null); setCodigoDoQR(""); }}
          aoConcluir={async () => {
            setRetiradaAberta(false);
            setRetiradaUnidade(null);
            setRetiradaCadastro(null);
            setCodigoDoQR("");
            setSelectedDetails(null);
            await fetchData();
          }}
        />
      )}

      {/* O QR que o morador mostra no app: lido aqui, abre a retirada daquela encomenda. */}
      {lendoQR && <LeitorQR aberto aoFechar={() => setLendoQR(false)} aoLer={aoLerQR} />}

      {/* A assinatura, que é o comprovante que substituiu o livro. */}
      <Modal
        open={Boolean(assinaturaAberta)}
        onClose={() => setAssinaturaAberta(null)}
        title={assinaturaAberta ? `Assinatura de ${assinaturaAberta.nome}` : ""}
        size="md"
        footer={<Button variant="ghost" onClick={() => setAssinaturaAberta(null)}>Fechar</Button>}
      >
        {assinaturaAberta && (
          <div className="mud-form">
            <p className="vit-modal__desc">{assinaturaAberta.quando}</p>
            {assinaturaAberta.carregando ? (
              <p className="enc-carregando"><Loader2 className="enc-gira" size={22} aria-hidden="true" />Carregando assinatura…</p>
            ) : assinaturaAberta.url ? (
              <img className="enc-assinatura" src={assinaturaAberta.url} alt={`Assinatura de ${assinaturaAberta.nome}`} />
            ) : (
              <p className="vit-modal__desc">Não foi possível carregar a assinatura.</p>
            )}
          </div>
        )}
      </Modal>

      {/* Excluir é irreversível e apaga foto do bucket junto — pede confirmação
          com o número na frente, para não apagar a encomenda errada. */}
      <Modal
        open={Boolean(excluindo)}
        onClose={() => setExcluindo(null)}
        title="Excluir esta encomenda?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExcluindo(null)} disabled={excluindoOcupado}>Cancelar</Button>
            <Button variant="danger" loading={excluindoOcupado}
              disabled={Boolean(excluindo) && temRetiradaAssinada(excluindo)} onClick={handleExcluir}>Excluir</Button>
          </>
        }
      >
        {excluindo && (
          <div className="mud-form">
            <p className="vit-modal__desc">Nº <strong>{getCell(excluindo, 'numero_encomenda') || '—'}</strong> — {getCell(excluindo, 'nome') || '—'}</p>
            {temRetiradaAssinada(excluindo) ? (
              <p className="enc-aviso-erro">
                Esta encomenda já tem retirada assinada — inteira ou parcial. Ela não pode ser excluída: o comprovante
                ficaria falando de um pacote que o sistema não conhece mais.
              </p>
            ) : (
              <p className="vit-modal__desc">Apaga o cadastro, as notas fiscais e as fotos da etiqueta. Não tem como desfazer.</p>
            )}
          </div>
        )}
      </Modal>

    </div>
  );
}
