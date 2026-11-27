import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, Circle, Crop, Download, Eye, FileText, MessageSquareText, Paperclip, Pencil, Plus,
  Trash2, Upload, User, Waves,
} from "lucide-react";

// Bibliotecas para exportação
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import { DriveImage, prefetchFoto, abrirArquivoDrive, carregarComoDataUrl } from "../components/DriveImage";
import { listar, criar, editar, remover } from "../api/db";
import { entregarArquivo, nomeDeArquivo, BAIXADO } from "../lib/baixar";
import { enviarAnexo, urlsDosAnexos, removerAnexo, removerAnexosDoRegistro } from "../api/anexos";
import { maskCPF, maskPhone, maskCPFPrivacy, dataBR, nomeProprio, soDigitos } from "../lib/format";
import { sanitizarCelula, validarAnexo } from "../lib/drive";
import { atestadoVencido, textoDaIdade } from "../lib/carteirinha";
import {
  useToast, useConfirm, Input, Button, PageHeader, Modal, Field, Select, Textarea, Badge, EmptyState,
} from "../ui";
import ListaQueAbre from "../components/confirmacoes/ListaQueAbre";
import BuscaUnidade from "../components/BuscaUnidade";
import Carteirinha from "../components/piscina/Carteirinha";
import { imagemDaCarteirinha } from "../components/piscina/imagemDaCarteirinha";
import RecorteDaFoto from "../components/piscina/RecorteDaFoto";
import { Chave, Ficha, Filtros, Iniciais, MaisFiltros, Opcoes, PainelDeFiltros, Paginador } from "../components/app/pecas";

// `piscina` é administrativo: pelas políticas do 0015, porteiro e conselheiro
// não alcançam — é aqui que está o atestado médico. A mensagem do Postgres fala
// de row-level security, que não diz nada a quem está na tela.
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para alterar cadastros da piscina.";
  }
  // A coluna do recorte nasce no 0095 (era 0088, número repetido). Sem ele, o PostgREST recusa.
  if (/caminho_foto_carteirinha/i.test(msg)) {
    return "O banco ainda não guarda o recorte da foto. Aplique a migração 0095 no Supabase.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Sem conexão com o servidor. Tente de novo.";
  }
  return msg;
};

const SITUACOES = ["Ativo", "Inativo", "Vencido"];
const TOM_SITUACAO = { Ativo: "positive", Inativo: "neutral", Vencido: "danger" };
/** Quantos cadastros ativos uma unidade pode ter ao mesmo tempo. */
const LIMITE_ATIVOS = 8;
/** Cadastros por página (decisão do usuário, 23/11/2026). */
const POR_PAGINA = 20;
const FORM_VAZIO = {
  id_unidade: "", id_morador: "", nome: "", cpf: "", nascimento: "", telefone: "",
  validade: "", status: "Ativo", obs: "", fotoBase64: "", atestadoBase64: "",
};

/** "2026-02-27 00:00:00" ou "2026-02-27T…" → "2026-02-27" (o formato do <input type=date>). */
function paraDataISO(valor) {
  if (!valor) return "";
  const s = String(valor).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return s.split(" ")[0].split("T")[0];
}

const COLUNAS_EXPORTACAO = [
  { id: "id_unidade", label: "Unidade", selected: true },
  { id: "nome", label: "Nome", selected: true },
  { id: "nascimento", label: "Nascimento", selected: true },
  { id: "idade", label: "Idade", selected: true },
  { id: "telefone", label: "Telefone", selected: true },
  { id: "validade", label: "Validade do atestado", selected: true },
  { id: "cpf", label: "CPF", selected: true },
  { id: "status", label: "Situação", selected: true },
  { id: "obs", label: "Observações", selected: false },
];

/** A foto pequena do cadastro; sem foto, as iniciais. */
function Foto({ c }) {
  const foto = c.url_foto_carteirinha || c.url_foto;
  return foto
    ? <span className="pis-foto"><DriveImage source={foto} alt="" /></span>
    : <Iniciais nome={c.nome} />;
}

export default function Piscina({ user }) {
  const toast = useToast();
  const confirmar = useConfirm();

  const [cadastros, setCadastros] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [moradores, setMoradores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Lista: busca, situação, mais filtros, ordem e quantas aparecem.
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("Todos");
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [filtroAtestado, setFiltroAtestado] = useState("Todos");
  const [periodo, setPeriodo] = useState({ inicio: "", fim: "" });
  const [ordem, setOrdem] = useState({ chave: "nome", direcao: "asc" });
  const [pagina, setPagina] = useState(1);

  // Ver, editar, exportar.
  const [vendo, setVendo] = useState(null);
  const [form, setForm] = useState(null); // null = fechado
  const [moradorCadastrado, setMoradorCadastrado] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [colunas, setColunas] = useState(COLUNAS_EXPORTACAO);
  const [baixando, setBaixando] = useState(false);
  const cartaoRef = useRef(null);
  const [recortando, setRecortando] = useState(""); // a foto inteira, em data URL
  const [salvandoRecorte, setSalvandoRecorte] = useState(false);
  const [abrindoFoto, setAbrindoFoto] = useState(false);
  const [avisoFoto, setAvisoFoto] = useState(false);

  const unidadePorId = useMemo(() => new Map(unidades.map((u) => [String(u.id), u])), [unidades]);
  /** "B5-206", o rótulo da unidade em toda a tela. */
  const rotuloUnidade = (id) => {
    const u = unidadePorId.get(String(id));
    return u ? `B${u.bloco}-${u.unidade}` : String(id ?? "");
  };
  /** A ordem do prédio: bloco, depois apartamento. */
  const ordemUnidade = (id) => {
    const u = unidadePorId.get(String(id));
    return u ? Number(u.bloco) * 10000 + Number(u.unidade) : Number(id) || 0;
  };

  // ---------- carregar ----------
  const carregar = async () => {
    try {
      const [rPiscina, rUnidades, rMoradores] = await Promise.all([
        listar("PISCINA"), listar("UNIDADES"), listar("MORADORES"),
      ]);
      // Cadastro novo guarda os arquivos no bucket (`caminho_foto`,
      // `caminho_atestado`); os 204 antigos continuam no Drive, com `url_*`.
      // A URL assinada é resolvida aqui, e o resto da tela só enxerga `url_*`.
      // Os três links de cada cadastro saem juntos: em série, eram três idas e
      // voltas por pessoa antes de a lista aparecer.
      // Em lote (urlsDosAnexos): um link por arquivo, todos juntos, esgotava
      // as conexões do banco no plano grátis (544 DatabaseTimeout, 23/11).
      const brutos = Array.isArray(rPiscina) ? rPiscina : [];
      const links = await urlsDosAnexos(brutos.flatMap((i) => [i.caminho_foto, i.caminho_atestado, i.caminho_foto_carteirinha]));
      const link = (caminho, reserva) => (caminho ? (links.get(caminho) ?? null) : reserva);
      const lista = brutos.map((item) => {
        const url_foto = link(item.caminho_foto, item.url_foto);
        const url_atestado = link(item.caminho_atestado, item.url_atestado);
        const url_foto_carteirinha = link(item.caminho_foto_carteirinha, "");
        return {
        ...item,
        url_foto,
        url_atestado,
        url_foto_carteirinha,
        nascimento: paraDataISO(item.nascimento),
        validade: paraDataISO(item.validade_atestado || item.validade),
        cpf: item.cpf || "",
        status: item.status || "Ativo",
        obs: item.obs || "",
        };
      });
      setCadastros(lista.filter((c) => c.nome || c.id));
      setUnidades(Array.isArray(rUnidades) ? rUnidades : []);
      setMoradores(Array.isArray(rMoradores) ? rMoradores : []);
    } catch (erro) {
      console.error("Piscina: erro ao carregar", erro);
      toast.error("Não foi possível carregar os cadastros.");
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- filtrar, contar, ordenar ----------
  const contagem = useMemo(() => {
    const c = { Todos: cadastros.length };
    for (const s of SITUACOES) c[s] = cadastros.filter((x) => x.status === s).length;
    return c;
  }, [cadastros]);
  const vencidos = useMemo(() => cadastros.filter((c) => c.status === "Ativo" && atestadoVencido(c.validade)).length, [cadastros]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = soDigitos(busca);
    const lista = cadastros.filter((c) => {
      if (situacao !== "Todos" && c.status !== situacao) return false;
      if (filtroAtestado === "Vencido" && !atestadoVencido(c.validade)) return false;
      if (filtroAtestado === "Em dia" && (!c.validade || atestadoVencido(c.validade))) return false;
      if (periodo.inicio && (!c.validade || c.validade < periodo.inicio)) return false;
      if (periodo.fim && (!c.validade || c.validade > periodo.fim)) return false;
      if (!termo) return true;
      return String(c.nome || "").toLowerCase().includes(termo)
        || rotuloUnidade(c.id_unidade).toLowerCase().includes(termo)
        || (digitos.length >= 3 && soDigitos(c.cpf).includes(digitos));
    });
    const valor = (c) => {
      if (ordem.chave === "id_unidade") return ordemUnidade(c.id_unidade);
      if (ordem.chave === "nome") return String(c.nome || "").toLowerCase();
      return String(c[ordem.chave] || "");
    };
    const sinal = ordem.direcao === "asc" ? 1 : -1;
    return [...lista].sort((a, b) => {
      const va = valor(a), vb = valor(b);
      return va < vb ? -sinal : va > vb ? sinal : 0;
    });
  }, [cadastros, busca, situacao, filtroAtestado, periodo, ordem, unidadePorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrosDoPainel = (filtroAtestado !== "Todos" ? 1 : 0) + (periodo.inicio ? 1 : 0) + (periodo.fim ? 1 : 0);
  const limparFiltros = () => { setFiltroAtestado("Todos"); setPeriodo({ inicio: "", fim: "" }); setPagina(1); };
  const ordenar = (chave) => setOrdem((o) => ({ chave, direcao: o.chave === chave && o.direcao === "asc" ? "desc" : "asc" }));

  // ---------- ver ----------
  const ver = (c) => { setVendo(c); prefetchFoto(c.url_foto); };

  // O recorte salvo (0095) é a foto da carteirinha; sem ele, a foto inteira.
  const fotoRecortada = vendo?.url_foto_carteirinha || "";

  /** Abre a foto INTEIRA para a pessoa recortar. */
  const recortarFoto = async () => {
    setAvisoFoto(false);
    setAbrindoFoto(true);
    try {
      const foto = await carregarComoDataUrl(vendo?.url_foto);
      if (!foto) { toast.error("Não foi possível abrir a foto para recortar."); return; }
      setRecortando(foto);
    } finally {
      setAbrindoFoto(false);
    }
  };
  /**
   * Salva o recorte para sempre: sobe como arquivo à parte na pasta da foto e
   * o cadastro passa a apontar para ele. A foto original fica guardada.
   */
  const usarRecorte = async (foto) => {
    if (!vendo || salvandoRecorte) return;
    setSalvandoRecorte(true);
    try {
      const envio = await enviarAnexo("piscina", vendo.id, foto, "carteirinha.jpg");
      if (!envio.success) { toast.error(`O recorte não foi salvo: ${mensagemErro(envio.message)}`); return; }
      const r = await editar("PISCINA", vendo.id, { caminho_foto_carteirinha: envio.caminho });
      if (!r.success) {
        // Sem vínculo, o arquivo sobraria no bucket sem ninguém apontar.
        await removerAnexo(envio.caminho);
        toast.error(mensagemErro(r.message));
        return;
      }
      if (vendo.caminho_foto_carteirinha) {
        const rm = await removerAnexo(vendo.caminho_foto_carteirinha);
        if (!rm.success) console.warn("Recorte antigo não removido:", rm.message);
      }
      // A tela já mostra o recorte (o data URL), sem esperar recarregar.
      const atualizado = { ...vendo, caminho_foto_carteirinha: envio.caminho, url_foto_carteirinha: foto };
      setVendo(atualizado);
      setCadastros((cs) => cs.map((c) => (c.id === vendo.id ? atualizado : c)));
      setRecortando("");
      toast.success("Recorte salvo. A carteirinha usa esta foto a partir de agora.");
    } finally {
      setSalvandoRecorte(false);
    }
  };

  /** Com foto ainda não recortada, pergunta antes; senão, baixa direto. */
  const pedirCarteirinha = () => {
    if (vendo?.url_foto && !fotoRecortada) setAvisoFoto(true);
    else baixarCarteirinha();
  };

  const baixarCarteirinha = async () => {
    if (!vendo || baixando) return;
    setAvisoFoto(false);
    setBaixando(true);
    try {
      const blob = await imagemDaCarteirinha(cartaoRef.current, fotoRecortada || vendo.url_foto);
      const destino = await entregarArquivo(blob, nomeDeArquivo(`Carteirinha ${vendo.nome}`, "png"));
      if (destino === BAIXADO) toast.success("Carteirinha baixada.");
    } catch (erro) {
      console.error("Erro ao gerar a carteirinha:", erro);
      // A mensagem vai junto: o defeito costuma aparecer só no celular de outra pessoa.
      toast.error(`Não foi possível gerar a carteirinha. ${erro?.message || ""}`.trim());
    } finally {
      setBaixando(false);
    }
  };

  const abrirAtestado = (c) => abrirArquivoDrive(
    // Linha migrada tem `caminho_atestado` E `id_atestado_drive`: o bucket
    // vem primeiro, porque o Drive não responde mais desde que o login saiu
    // do Apps Script. `url_atestado` já chega como link assinado.
    c.caminho_atestado ? c.url_atestado : c.id_atestado_drive || c.url_atestado,
  );

  // ---------- criar e editar ----------
  const abrirNovo = () => { setMoradorCadastrado(false); setForm({ ...FORM_VAZIO }); };
  const abrirEditar = (c) => {
    setMoradorCadastrado(Boolean(c.id_morador && c.id_morador !== "AVULSO"));
    setForm({ ...FORM_VAZIO, ...c, fotoBase64: "", atestadoBase64: "" });
    setVendo(null);
  };
  const fecharForm = () => { if (!salvando) setForm(null); };
  const mudar = (campo) => (valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const moradoresDaUnidade = useMemo(
    () => (form?.id_unidade ? moradores.filter((m) => String(m.id_unidade) === String(form.id_unidade)) : []),
    [moradores, form?.id_unidade],
  );
  const escolherMorador = (id) => {
    const m = moradores.find((x) => String(x.id) === String(id));
    setForm((f) => ({
      ...f,
      id_morador: m ? m.id : "",
      nome: m ? nomeProprio(m.nome || "") : "",
      cpf: m ? maskCPF(m.cpf || m.CPF || "") : "",
      telefone: m ? maskPhone(String(m.telefone || m.celular || "")) : "",
    }));
  };
  const alternarMorador = (ligado) => {
    setMoradorCadastrado(ligado);
    if (!ligado) setForm((f) => ({ ...f, id_morador: "", nome: "", cpf: "", telefone: "" }));
  };

  const lerArquivo = (e, campo) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    const r = validarAnexo(arquivo);
    if (!r.ok) { toast.error(r.motivo); return; }
    const leitor = new FileReader();
    leitor.onloadend = () => setForm((f) => ({ ...f, [campo]: leitor.result }));
    leitor.readAsDataURL(arquivo);
  };

  const salvar = async () => {
    if (!form.id_unidade || !form.nome.trim() || !form.validade) {
      toast.error("Preencha a unidade, o nome e a validade do atestado.");
      return;
    }
    const novo = !form.id;
    if (novo && form.status === "Ativo") {
      const ativos = cadastros.filter((c) => String(c.id_unidade) === String(form.id_unidade) && c.status === "Ativo").length;
      if (ativos >= LIMITE_ATIVOS) {
        toast.error(`A unidade ${rotuloUnidade(form.id_unidade)} já tem ${LIMITE_ATIVOS} cadastros ativos, que é o limite. Marque um antigo como inativo para cadastrar outro.`);
        return;
      }
    }

    setSalvando(true);
    // `nascimento` e `validade_atestado` são `date`: campo em branco vira null.
    const dados = {
      id_unidade: Number(form.id_unidade),
      id_morador: form.id_morador || "AVULSO",
      nome: nomeProprio(form.nome.trim()),
      cpf: form.cpf || null,
      nascimento: form.nascimento || null,
      telefone: form.telefone || null,
      validade_atestado: form.validade || null,
      status: form.status || "Ativo",
      obs: form.obs?.trim() || null,
    };
    try {
      const r = novo
        ? await criar("PISCINA", { ...dados, created_by: user?.nome || "Sistema" })
        : await editar("PISCINA", form.id, dados);
      if (!r.success) { toast.error(mensagemErro(r.message)); return; }

      // O id só existe depois do insert, e ele entra no caminho do arquivo no
      // bucket: por isso os arquivos sobem depois da linha. Foto e atestado
      // moram em pastas separadas: atestado é dado de saúde (0019).
      const idRegistro = r.data?.id ?? form.id;
      const caminhos = {};
      const substituidos = [];
      for (const [campo, base64, anterior, pasta] of [
        ["caminho_foto", form.fotoBase64, form.caminho_foto, "piscina"],
        ["caminho_atestado", form.atestadoBase64, form.caminho_atestado, "piscina-atestados"],
      ]) {
        if (!base64) continue;
        const envio = await enviarAnexo(pasta, idRegistro, base64);
        if (!envio.success) { toast.error(`Arquivo não enviado: ${mensagemErro(envio.message)}`); continue; }
        caminhos[campo] = envio.caminho;
        if (anterior) substituidos.push(anterior);
        // Foto nova: o recorte era da antiga e deixa de valer.
        if (campo === "caminho_foto" && form.caminho_foto_carteirinha) {
          caminhos.caminho_foto_carteirinha = null;
          substituidos.push(form.caminho_foto_carteirinha);
        }
      }
      if (Object.keys(caminhos).length) {
        const rv = await editar("PISCINA", idRegistro, caminhos);
        if (!rv.success) toast.error("Cadastro salvo, mas o arquivo não ficou vinculado.");
        else {
          // Só depois do vínculo trocar: apagar antes e falhar a gravação deixaria
          // o cadastro apontando para um arquivo que não existe mais.
          for (const caminho of substituidos) {
            const rm = await removerAnexo(caminho);
            if (!rm.success) console.warn("Anexo substituído não removido:", caminho, rm.message);
          }
        }
      }
      toast.success(novo ? "Cadastro criado" : "Cadastro atualizado");
      setForm(null);
      await carregar();
    } catch (erro) {
      console.error(erro);
      toast.error("Não foi possível conectar ao servidor. Verifique a conexão.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (c) => {
    const ok = await confirmar({
      title: `Excluir o cadastro de ${nomeProprio(c.nome) || "sem nome"}?`,
      description: "O cadastro sai da lista e a foto e o atestado são apagados do sistema. Não dá para desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    // A linha PRIMEIRO, os arquivos depois: falhando a exclusão, a ficha
    // continua com foto e atestado. Na ordem inversa ficaria sem os dois.
    const r = await remover("PISCINA", c.id);
    if (!r.success) { toast.error(mensagemErro(r.message)); return; }
    const sobras = [];
    for (const pasta of ["piscina", "piscina-atestados"]) {
      const rm = await removerAnexosDoRegistro(pasta, c.id);
      if (!rm.success) sobras.push(`${pasta}: ${rm.message}`);
    }
    if (sobras.length) {
      console.warn("Arquivos não removidos do bucket:", sobras);
      toast.error("Cadastro excluído, mas algum arquivo continuou no sistema. Avise o suporte.");
    } else {
      toast.success("Cadastro excluído");
    }
    setVendo(null);
    setForm(null);
    await carregar();
  };

  // ---------- exportar ----------
  const valorExportado = (c, id) => {
    if (id === "id_unidade") return rotuloUnidade(c.id_unidade);
    if (id === "cpf") return maskCPFPrivacy(c.cpf);
    if (id === "nascimento" || id === "validade") return dataBR(c[id]) || "-";
    if (id === "idade") return textoDaIdade(c.nascimento) || "-";
    if (id === "nome") return sanitizarCelula(nomeProprio(c.nome));
    return sanitizarCelula(c[id] || "");
  };
  const exportarExcel = () => {
    const ativas = colunas.filter((c) => c.selected);
    const linhas = filtradas.map((c) => Object.fromEntries(ativas.map((col) => [col.label, valorExportado(c, col.id)])));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Piscina");
    XLSX.writeFile(wb, "Relatorio_Piscina.xlsx");
    setExportando(false);
  };
  const exportarPDF = () => {
    const doc = new jsPDF("l", "mm", "a4");
    const ativas = colunas.filter((c) => c.selected);
    const corpo = filtradas.map((c) => ativas.map((col) => valorExportado(c, col.id)));
    const img = new Image();
    img.src = "/logo.png";
    const gerar = (comLogo) => {
      // O verde do ViT (#B33320), não o verde-limão de antes.
      doc.setDrawColor(36, 80, 58);
      doc.setLineWidth(1.2);
      doc.rect(5, 5, 287, 200);
      if (comLogo) doc.addImage(img, "PNG", 113, 12, 70, 25);
      doc.setFontSize(18);
      doc.setTextColor(28, 43, 36);
      doc.text("Relatório de cadastros da piscina", 148, comLogo ? 45 : 25, { align: "center" });
      autoTable(doc, {
        startY: comLogo ? 55 : 35,
        head: [ativas.map((c) => c.label)],
        body: corpo,
        headStyles: { fillColor: [36, 80, 58], halign: "center", textColor: [255, 255, 255] },
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 3 },
        margin: { left: 10, right: 10 },
      });
      doc.save("Relatorio_Piscina.pdf");
      setExportando(false);
    };
    img.onload = () => gerar(true);
    img.onerror = () => gerar(false);
  };

  // ---------- o que a tela mostra ----------
  // Filtro que encolhe a lista não deixa a tela numa página que não existe mais.
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(filtradas.length / POR_PAGINA)));
  const itens = filtradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);
  const v = vendo;
  const nomeDe = (c) => nomeProprio(c.nome) || "Sem nome";

  return (
    <div>
      <PageHeader
        title="Piscina"
        meta={carregando
          ? "Carregando cadastros"
          : `${cadastros.length} cadastros · ${contagem.Ativo} ativos${vencidos ? ` · ${vencidos} com atestado vencido` : ""}`}
        actions={
          <>
            <Button onClick={() => setExportando(true)} iconLeft={<FileText size={15} />}>Exportar</Button>
            <Button variant="primary" onClick={abrirNovo} iconLeft={<Plus size={16} />}>Novo cadastro</Button>
          </>
        }
      />

      <Filtros
        busca={busca}
        onBusca={(t) => { setBusca(t); setPagina(1); }}
        placeholder="Nome, unidade ou CPF"
        filtro={situacao}
        onFiltro={(s) => { setSituacao(s); setPagina(1); }}
        filtros={[["Todos", "Todos", contagem.Todos], ...SITUACOES.map((s) => [s, s, contagem[s]])]}
        painel={
          <PainelDeFiltros aberto={maisFiltros}>
            <Field label="Atestado">
              <Opcoes rotulo="Atestado" valor={filtroAtestado} onMudar={(a) => { setFiltroAtestado(a); setPagina(1); }}
                opcoes={["Todos", "Em dia", "Vencido"]} />
            </Field>
            <Field label="Validade de">
              <Input type="date" value={periodo.inicio} onChange={(e) => setPeriodo({ ...periodo, inicio: e.target.value })} />
            </Field>
            <Field label="até">
              <Input type="date" value={periodo.fim} onChange={(e) => setPeriodo({ ...periodo, fim: e.target.value })} />
            </Field>
          </PainelDeFiltros>
        }
      >
        <MaisFiltros aberto={maisFiltros} onAlternar={() => setMaisFiltros((a) => !a)} ativos={filtrosDoPainel} onLimpar={limparFiltros} />
      </Filtros>

      {!carregando && filtradas.length === 0 ? (
        <EmptyState
          icon={<Waves size={22} />}
          title={cadastros.length ? "Nenhum cadastro neste filtro" : "Nenhum cadastro na piscina"}
          description={cadastros.length ? "Troque a situação, a busca ou os filtros." : "Cadastre o primeiro em Novo cadastro."}
          action={!cadastros.length && <Button variant="primary" iconLeft={<Plus size={16} />} onClick={abrirNovo}>Novo cadastro</Button>}
        />
      ) : (
        <ListaQueAbre
          colunas={[
            { rotulo: "Unidade", largura: "100px", ordem: "id_unidade" },
            { rotulo: "Nome", largura: "minmax(0, 1.8fr)", ordem: "nome" },
            { rotulo: "Nascimento", largura: "130px", ordem: "nascimento" },
            { rotulo: "Telefone", largura: "150px", ordem: "telefone" },
            { rotulo: "Atestado até", largura: "130px", ordem: "validade" },
            { rotulo: "Situação", largura: "100px", ordem: "status" },
          ]}
          ordenacao={ordem}
          onOrdenar={ordenar}
          larguraAcoes="96px"
          itens={itens}
          carregando={carregando}
          chave={(c) => c.id}
          onAbrir={ver}
          rotuloDaLinha={(c) => `Abrir o cadastro de ${nomeDe(c)} (${rotuloUnidade(c.id_unidade)})`}
          celulas={(c) => [
            <b key="u" className="conf-dado__mono">{rotuloUnidade(c.id_unidade)}</b>,
            <span key="n" className="pis-quem">
              <Foto c={c} />
              <span className="mud-quem">
                <b>{nomeDe(c)}{c.obs?.trim() ? <MessageSquareText size={13} aria-label="Tem observação" /> : null}</b>
                {c.cpf ? <small>{maskCPFPrivacy(c.cpf)}</small> : null}
              </span>
            </span>,
            <span key="d" className="mud-quem">
              <b>{dataBR(c.nascimento) || "—"}</b>
              {c.nascimento ? <small>{textoDaIdade(c.nascimento)}</small> : null}
            </span>,
            <span key="t">{c.telefone ? maskPhone(String(c.telefone)) : "—"}</span>,
            <span key="v" className="mud-quem">
              <b>{dataBR(c.validade) || "—"}</b>
              {atestadoVencido(c.validade) ? <small className="pis-vencido">Vencido</small> : null}
            </span>,
            <Badge key="s" tone={TOM_SITUACAO[c.status] ?? "neutral"}>{c.status}</Badge>,
          ]}
          acoes={(c) => (
            <>
              <Button variant="ghost" size="sm" aria-label={`Ver o cadastro de ${nomeDe(c)}`} onClick={() => ver(c)}><Eye size={16} /></Button>
              <Button variant="ghost" size="sm" aria-label={`Editar o cadastro de ${nomeDe(c)}`} onClick={() => abrirEditar(c)}><Pencil size={16} /></Button>
            </>
          )}
        />
      )}
      <Paginador total={filtradas.length} pagina={paginaAtual} porPagina={POR_PAGINA} onPagina={setPagina} rotulo="Páginas dos cadastros da piscina" />

      {/* ---- Ver: o desenho do detalhe de Encomendas, com a carteirinha no lugar da foto ---- */}
      <Modal
        open={Boolean(v)}
        onClose={() => setVendo(null)}
        title="Cadastro na piscina"
        size="lg"
        footer={v && (
          <div className="app-modal__acoes">
            <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => excluir(v)}>Excluir</Button>
            <Button variant="ghost" iconLeft={<Pencil size={15} />} onClick={() => abrirEditar(v)}>Editar</Button>
            <Button variant="primary" iconLeft={<Download size={15} />} loading={baixando} onClick={pedirCarteirinha}>
              Baixar carteirinha
            </Button>
          </div>
        )}
      >
        {v && (
          <div className="app-modal">
            <div className="app-modal__topo">
              <Foto c={v} />
              <div className="app-modal__quem">
                <strong>{nomeDe(v)}</strong>
                <small>{rotuloUnidade(v.id_unidade)} · {v.id_morador && v.id_morador !== "AVULSO" ? "Morador cadastrado" : "Cadastro avulso"}</small>
                <span className="app-modal__selos">
                  <Badge tone={TOM_SITUACAO[v.status] ?? "neutral"}>{v.status}</Badge>
                  {atestadoVencido(v.validade)
                    ? <Badge tone="danger">Atestado vencido</Badge>
                    : v.validade ? <Badge tone="positive">Atestado em dia</Badge> : null}
                </span>
              </div>
            </div>

            <div className="app-detalhe">
              <div className="app-detalhe__visual">
                <p className="app-detalhe__legenda">Carteirinha</p>
                <Carteirinha ref={cartaoRef} cadastro={v} unidade={rotuloUnidade(v.id_unidade)} fotoRecortada={fotoRecortada} />
                {v.url_foto && (
                  <Button variant="ghost" size="sm" className="pis-recortar" iconLeft={<Crop size={15} />} loading={abrindoFoto} onClick={recortarFoto}>
                    {fotoRecortada ? "Recortar de novo" : "Recortar a foto"}
                  </Button>
                )}
              </div>

              <div className="app-detalhe__dados">
                <Ficha titulo="Cadastro" itens={[
                  ["Nascimento", v.nascimento ? `${dataBR(v.nascimento)} · ${textoDaIdade(v.nascimento)}` : "Não informado"],
                  ["CPF", v.cpf ? maskCPFPrivacy(v.cpf) : "Não informado", true],
                  ["Telefone", v.telefone ? maskPhone(String(v.telefone)) : "Não informado"],
                ]} />
                <Ficha titulo="Atestado médico" itens={[
                  ["Válido até", dataBR(v.validade) || "Não informado"],
                  ["Arquivo", v.url_atestado || v.id_atestado_drive ? "Anexado" : "Nenhum anexado"],
                ]} />
                {(v.url_atestado || v.id_atestado_drive) && (
                  <Button variant="ghost" size="sm" className="pis-atestado" iconLeft={<FileText size={15} />} onClick={() => abrirAtestado(v)}>
                    Abrir o atestado
                  </Button>
                )}
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

      {/* ---- Antes de baixar: quer recortar a foto? ---- */}
      <Modal
        open={avisoFoto}
        onClose={() => setAvisoFoto(false)}
        title="Quer recortar a foto antes de baixar?"
        size="sm"
        footer={
          <div className="app-modal__acoes">
            <Button variant="ghost" onClick={() => setAvisoFoto(false)}>Cancelar</Button>
            <Button variant="secondary" iconLeft={<Download size={15} />} onClick={baixarCarteirinha}>Baixar assim</Button>
            <Button variant="primary" iconLeft={<Crop size={15} />} loading={abrindoFoto} onClick={recortarFoto}>Recortar a foto</Button>
          </div>
        }
      >
        <p className="vit-modal__desc">
          A foto abre inteira e você escolhe o pedaço que vai para o círculo da carteirinha. O recorte fica salvo no cadastro.
        </p>
      </Modal>

      <RecorteDaFoto src={recortando} salvando={salvandoRecorte} onRecorte={usarRecorte} onCancelar={() => { if (!salvandoRecorte) setRecortando(""); }} />

      {/* ---- Criar e editar ---- */}
      <Modal
        open={Boolean(form)}
        onClose={fecharForm}
        title={form?.id ? "Editar cadastro" : "Novo cadastro na piscina"}
        size="md"
        footer={form && (
          <div className="app-modal__acoes">
            {form.id
              ? <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => excluir(form)}>Excluir</Button>
              : <span />}
            <Button variant="ghost" onClick={fecharForm}>Cancelar</Button>
            <Button variant="primary" type="submit" form="form-piscina" loading={salvando}>Salvar</Button>
          </div>
        )}
      >
        {form && (
          <form id="form-piscina" className="mud-form" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
            <Field label="Unidade" required>
              <BuscaUnidade
                unidades={unidades}
                valor={unidadePorId.get(String(form.id_unidade)) ?? null}
                onEscolher={(u) => setForm((f) => ({ ...f, id_unidade: u?.id ?? "" }))}
              />
            </Field>

            <Chave
              ligada={moradorCadastrado}
              onChange={alternarMorador}
              titulo="É morador cadastrado"
              sub="Puxa nome, CPF e telefone do cadastro da unidade"
            />
            {moradorCadastrado && (
              <Field label="Morador" help={form.id_unidade ? undefined : "Escolha a unidade primeiro"}>
                <Select value={form.id_morador || ""} onChange={(e) => escolherMorador(e.target.value)} disabled={!form.id_unidade}>
                  <option value="">Escolha…</option>
                  {moradoresDaUnidade.map((m) => <option key={m.id} value={m.id}>{nomeProprio(m.nome)}</option>)}
                </Select>
              </Field>
            )}

            <Field label="Nome e sobrenome" required>
              <Input value={form.nome} readOnly={moradorCadastrado} onChange={(e) => mudar("nome")(e.target.value)}
                onBlur={(e) => mudar("nome")(nomeProprio(e.target.value))} />
            </Field>
            <div className="mud-form__par">
              <Field label="CPF">
                <Input value={form.cpf} readOnly={moradorCadastrado} inputMode="numeric" placeholder="000.000.000-00"
                  onChange={(e) => mudar("cpf")(maskCPF(e.target.value))} />
              </Field>
              <Field label="Telefone">
                <Input value={form.telefone || ""} inputMode="tel" placeholder="(00) 00000-0000"
                  onChange={(e) => mudar("telefone")(maskPhone(e.target.value))} />
              </Field>
            </div>
            <div className="mud-form__par">
              <Field label="Data de nascimento" help={form.nascimento ? textoDaIdade(form.nascimento) : "Sai na carteirinha"}>
                <Input type="date" value={form.nascimento || ""} onChange={(e) => mudar("nascimento")(e.target.value)} />
              </Field>
              <Field label="Atestado válido até" required>
                <Input type="date" value={form.validade || ""} onChange={(e) => mudar("validade")(e.target.value)} />
              </Field>
            </div>

            <Field label="Situação">
              <Opcoes rotulo="Situação" valor={form.status} onMudar={mudar("status")} opcoes={SITUACOES} />
            </Field>

            <div className="pis-arquivos">
              <div className="pis-arquivo">
                <span className="pis-arquivo__previa" aria-hidden="true">
                  {form.fotoBase64 || form.url_foto
                    ? <DriveImage localSrc={form.fotoBase64} source={form.url_foto} alt="" />
                    : <User size={28} />}
                </span>
                <div className="pis-arquivo__texto">
                  <strong>Foto</strong>
                  <small>{form.fotoBase64 ? "Foto nova escolhida" : form.url_foto ? "Já tem foto" : "Sai na carteirinha"}</small>
                </div>
                <Input id="pis-foto" type="file" accept="image/*" className="pis-arquivo__campo" onChange={(e) => lerArquivo(e, "fotoBase64")} />
                <Button variant="secondary" size="sm" iconLeft={<Upload size={15} />} onClick={() => document.getElementById("pis-foto").click()}>
                  {form.url_foto || form.fotoBase64 ? "Trocar" : "Escolher"}
                </Button>
              </div>
              <div className="pis-arquivo">
                <span className="pis-arquivo__previa pis-arquivo__previa--doc" aria-hidden="true">
                  {form.atestadoBase64 || form.url_atestado || form.id_atestado_drive ? <CheckCircle2 size={24} /> : <Paperclip size={24} />}
                </span>
                <div className="pis-arquivo__texto">
                  <strong>Atestado médico</strong>
                  <small>{form.atestadoBase64 ? "Atestado novo escolhido" : form.url_atestado || form.id_atestado_drive ? "Já tem atestado" : "Foto ou PDF"}</small>
                </div>
                <Input id="pis-atestado" type="file" accept="image/*,application/pdf" className="pis-arquivo__campo" onChange={(e) => lerArquivo(e, "atestadoBase64")} />
                <Button variant="secondary" size="sm" iconLeft={<Upload size={15} />} onClick={() => document.getElementById("pis-atestado").click()}>
                  {form.url_atestado || form.atestadoBase64 ? "Trocar" : "Anexar"}
                </Button>
              </div>
            </div>

            <Field label="Observações">
              <Textarea rows={3} value={form.obs || ""} placeholder="Algo importante sobre este cadastro"
                onChange={(e) => mudar("obs")(e.target.value)} />
            </Field>
          </form>
        )}
      </Modal>

      {/* ---- Exportação ---- */}
      <Modal
        open={exportando}
        onClose={() => setExportando(false)}
        title="Exportar cadastros"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExportando(false)}>Cancelar</Button>
            <Button onClick={exportarExcel} iconLeft={<Download size={15} />}>Excel</Button>
            <Button variant="primary" onClick={exportarPDF} iconLeft={<FileText size={15} />}>PDF</Button>
          </>
        }
      >
        <p className="vit-modal__desc mud-exporta">
          {filtradas.length === cadastros.length
            ? `Serão exportados os ${filtradas.length} cadastros.`
            : `Serão exportados os ${filtradas.length} cadastros que passam nos filtros atuais, de ${cadastros.length} no total.`}
        </p>
        <p className="vit-field__label mud-exporta">Colunas</p>
        <div className="exp-colunas">
          {colunas.map((col) => (
            <button
              key={col.id}
              type="button"
              className={`exp-coluna${col.selected ? " exp-coluna--marcada" : ""}`}
              onClick={() => setColunas((cs) => cs.map((c) => (c.id === col.id ? { ...c, selected: !c.selected } : c)))}
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
