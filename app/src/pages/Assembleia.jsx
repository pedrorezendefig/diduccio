import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import {
  Upload, Sparkles, Trash2, FileText, Plus, X, Eye, Pencil, ScrollText, AlertCircle,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import AssembleiaChat from "../components/AssembleiaChat";
import {
  PageHeader, Button, Modal, Field, Input, Textarea, Badge, EmptyState, Skeleton, Tabs, useToast, useConfirm,
} from "../ui";

// A aba Convenção traz o texto inteiro da Convenção (~180 KB): só carrega
// quando alguém abre a aba.
const Convencao = lazy(() => import("../components/assembleia/Convencao"));
import ListaQueAbre from "../components/confirmacoes/ListaQueAbre";
import { Ficha, Filtros, Iniciais } from "../components/app/pecas";
import { listar, criar, editar, remover } from "../api/db";
import { enviarAnexo, urlDoAnexo, removerAnexosDoRegistro } from "../api/anexos";
import { chamarEdgeFunction, mensagemDaEdgeFunction } from "../api/edge";
import { dataBR, nomeProprio } from "../lib/format";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// `assembleias` é administrativo para escrever; o conselheiro só lê (0015). A
// mensagem crua do Postgres fala de row-level security, que não diz nada a quem
// está na tela.
const mensagemErro = (msg) => {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied|PGRST116|coerce the result/i.test(msg)) {
    return "Você não tem permissão para alterar atas de assembleia.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Sem conexão com o servidor. Tente de novo.";
  }
  return msg;
};

/**
 * A data que a IA devolve, no formato que a coluna `date` aceita.
 *
 * O modelo é instruído a responder "dd/mm/aaaa", mas responde o que quiser —
 * às vezes ISO, às vezes por extenso, às vezes nada. `date` recusa string vazia
 * e recusa formato desconhecido, e um insert recusado por causa da data perderia
 * o resumo inteiro que a pessoa acabou de revisar. Quando não dá para entender,
 * grava null: a ata fica sem data e é editável, em vez de não existir.
 */
function paraDataISO(valor) {
  const s = String(valor ?? "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return null;
}

// Extrai o texto selecionável do PDF no navegador. Retorna "" se for escaneado
// (PDF só de imagem) ou se der erro — nesse caso o fluxo cai no OCR do Gemini.
async function extrairTextoPdf(file) {
  try {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let texto = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      texto += content.items.map((it) => it.str).join(" ") + "\n";
    }
    return texto.trim();
  } catch {
    return "";
  }
}

// Cargos que podem enviar/salvar/excluir (Conselheiro é read-only).
const PODE_ESCREVER = ["Sindico", "Auxiliar Administrativo", "Desenvolvedor"];

/** Quantas atas a lista mostra de cada vez; "Mostrar mais" soma outras tantas. */
const LOTE = 30;

// Lê um File como base64 (sem o prefixo data:).
function fileParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result.toString();
      resolve(res.indexOf(",") !== -1 ? res.split(",")[1] : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// decisoes/assinantes vêm da planilha como string JSON; normaliza para array.
function parseLista(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function formatarTamanho(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? mb.toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const semAcento = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** O que o formulário de ata edita (o rascunho da IA ou uma ata salva). */
const paraFormulario = (ata) => ({
  id: ata.id ?? null,
  titulo: ata.titulo || "",
  data_assembleia: paraDataISO(ata.data_assembleia) || "",
  resumo_geral: ata.resumo_geral || "",
  decisoes: parseLista(ata.decisoes),
  assinantes: parseLista(ata.assinantes),
});

export default function Assembleia({ user }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const podeEscrever = PODE_ESCREVER.includes(user?.cargo);

  const [atas, setAtas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState("atas");

  // Lista: busca, ano, ordem e quantas aparecem.
  const [busca, setBusca] = useState("");
  const [ano, setAno] = useState("Todos");
  const [ordem, setOrdem] = useState({ chave: "data", direcao: "desc" });
  const [limite, setLimite] = useState(LOTE);

  // Ver.
  const [vendo, setVendo] = useState(null);

  // Nova ata: o PDF, a leitura pela IA e o rascunho em revisão.
  const [novaAberta, setNovaAberta] = useState(false);
  const [arquivo, setArquivo] = useState(null);
  const [arrastando, setArrastando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  // O formulário (rascunho da nova ata, ou a ata em edição).
  const [form, setForm] = useState(null);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregarAtas = async () => {
    setCarregando(true);
    try {
      const res = await listar("ASSEMBLEIAS");
      const lista = Array.isArray(res) ? res : [];
      // Mais recentes primeiro: o chat lê atas[0] como "a última ata".
      lista.sort((a, b) =>
        String(b.data_assembleia || "").localeCompare(String(a.data_assembleia || ""))
        // Mesma data: o id maior é a ata mais nova. Como número: em texto "9" vem depois de "10".
        || (Number(b.id) || 0) - (Number(a.id) || 0)
      );
      setAtas(lista);
    } catch {
      setAtas([]);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarAtas();
  }, []);

  // ---------- nova ata ----------
  const abrirNova = () => {
    setArquivo(null);
    setErro("");
    setForm(null);
    setEditando(false);
    setNovaAberta(true);
  };
  const fecharNova = () => {
    if (gerando || salvando) return;
    setNovaAberta(false);
    setForm(null);
    setArquivo(null);
    setErro("");
  };

  // Valida e aceita o arquivo (usado pelo input e pelo drag-and-drop).
  const aceitarArquivo = (f) => {
    setErro("");
    if (!f) return;
    const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (!ehPdf) return setErro("Só é aceito arquivo PDF.");
    if (f.size > 15 * 1024 * 1024) return setErro("PDF muito grande (máx. 15MB).");
    setArquivo(f);
  };

  const gerarResumo = async () => {
    if (!arquivo) return setErro("Anexe o PDF da ata.");
    setErro("");
    setGerando(true);
    try {
      // 1) Tenta extrair o texto no navegador. Se o PDF tem texto selecionável,
      // vai pelo caminho rápido (texto → Gemini com fallback Groq). Se for
      // escaneado (sem texto), manda o PDF para o Gemini fazer OCR.
      const textoPdf = await extrairTextoPdf(arquivo);
      const r = textoPdf && textoPdf.length > 200
        ? await chamarEdgeFunction("ia", { acao: "resumir-ata-texto", texto: textoPdf })
        : await chamarEdgeFunction("ia", { acao: "resumir-ata-pdf", pdfBase64: await fileParaBase64(arquivo) });

      if (!r.ok) {
        setErro(mensagemDaEdgeFunction(r, "Não foi possível ler o PDF."));
        return; // mantém o arquivo para nova tentativa
      }
      const res = r.corpo;
      setForm(paraFormulario({
        titulo: res.titulo,
        data_assembleia: res.data_assembleia,
        resumo_geral: res.resumo_geral,
        decisoes: Array.isArray(res.decisoes) ? res.decisoes : [],
        assinantes: Array.isArray(res.assinantes) ? res.assinantes : [],
      }));
    } catch {
      setErro("Erro ao processar o PDF.");
    } finally {
      setGerando(false);
    }
  };

  /** As colunas que o formulário grava (as listas como texto JSON, como sempre). */
  const colunasDoForm = () => ({
    titulo: form.titulo.trim() || null,
    data_assembleia: paraDataISO(form.data_assembleia),
    resumo_geral: form.resumo_geral.trim() || null,
    // Colunas de texto guardando JSON, como a planilha fazia — `parseLista`
    // já lê nesse formato, e as atas antigas estão assim.
    decisoes: JSON.stringify(form.decisoes.map((d) => d.trim()).filter(Boolean)),
    assinantes: JSON.stringify(form.assinantes.map((a) => nomeProprio(a.trim())).filter(Boolean)),
  });

  const salvarNova = async () => {
    if (!arquivo || !form) return;
    setSalvando(true);
    try {
      // `assembleias.id` é texto e não tem identity: quem gera é a tela. O
      // formato "ATA-<ms>" é o mesmo da planilha, e ele entra no caminho do
      // arquivo no bucket — as atas antigas já estão em `assembleias/ATA-.../`.
      const id = `ATA-${Date.now()}`;

      // A linha PRIMEIRO, o PDF depois. Invertido, um insert recusado por
      // permissão deixaria um PDF no bucket que nenhuma ata referencia — e
      // ninguém apagaria, porque ninguém saberia que ele existe.
      const r = await criar("ASSEMBLEIAS", {
        id,
        ...colunasDoForm(),
        created_by: user?.nome || user?.email || "",
      });
      if (!r.success) { toast.error(mensagemErro(r.message)); return; }

      const envio = await enviarAnexo("assembleias", id, arquivo, arquivo.name);
      if (!envio.success) {
        toast.error("Ata salva, mas o PDF não subiu. Exclua e cadastre de novo.");
      } else {
        const rv = await editar("ASSEMBLEIAS", id, { caminho_pdf: envio.caminho });
        if (!rv.success) toast.error("Ata salva, mas o PDF não ficou vinculado.");
        else toast.success("Ata salva");
      }

      setNovaAberta(false);
      setForm(null);
      setArquivo(null);
      await carregarAtas();
    } finally {
      setSalvando(false);
    }
  };

  // ---------- editar ----------
  const abrirEditar = (ata) => {
    setForm(paraFormulario(ata));
    setVendo(null);
    setEditando(true);
  };
  const fecharEditar = () => {
    if (salvando) return;
    setEditando(false);
    setForm(null);
  };
  const salvarEdicao = async () => {
    if (!form?.id) return;
    setSalvando(true);
    try {
      const r = await editar("ASSEMBLEIAS", form.id, colunasDoForm());
      if (!r.success) { toast.error(mensagemErro(r.message)); return; }
      toast.success("Ata atualizada");
      setEditando(false);
      setForm(null);
      await carregarAtas();
    } finally {
      setSalvando(false);
    }
  };

  // ---------- excluir e PDF ----------
  const excluir = async (ata) => {
    const ok = await confirmar({
      title: `Excluir a ata "${ata.titulo || "sem título"}"?`,
      description: "O PDF anexado também é removido. Não dá para desfazer.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    const res = await remover("ASSEMBLEIAS", ata.id);
    if (!res.success) { toast.error(mensagemErro(res.message)); return; }

    // A pasta inteira, e não só `caminho_pdf`: se um envio tiver falhado no
    // meio, o que ficou para trás sumiria da tela e continuaria no bucket,
    // alcançável por URL assinada.
    const rm = await removerAnexosDoRegistro("assembleias", ata.id);
    if (!rm.success) {
      console.warn("PDF não removido do bucket:", rm.message);
      toast.error("Ata excluída, mas o PDF continuou no sistema. Avise o suporte.");
    }

    setVendo(null);
    setEditando(false);
    setForm(null);
    await carregarAtas();
    toast.success("Ata excluída");
  };

  const temPdf = (ata) => Boolean(ata?.caminho_pdf || ata?.pdf_url);
  const abrirPdf = async (ata) => {
    // O bucket vem primeiro: a ata migrada tem os dois endereços, e o
    // `pdf_id` do Drive não responde mais. A URL assinada já carrega a
    // autorização e tem prazo de validade, então abre direto.
    const endereco = await urlDoAnexo({
      caminho_storage: ata.caminho_pdf,
      url_drive: ata.pdf_url,
    });
    if (!endereco) { toast.error("Este PDF não está disponível."); return; }
    window.open(endereco, "_blank", "noopener");
  };

  // ---------- edição das listas do formulário ----------
  const setCampo = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const setItem = (campo, i, valor) =>
    setForm((f) => ({ ...f, [campo]: f[campo].map((x, idx) => (idx === i ? valor : x)) }));
  const addItem = (campo) => setForm((f) => ({ ...f, [campo]: [...f[campo], ""] }));
  const removeItem = (campo, i) =>
    setForm((f) => ({ ...f, [campo]: f[campo].filter((_, idx) => idx !== i) }));

  // ---------- o que a lista mostra ----------
  const anoDe = (ata) => String(ata.data_assembleia || "").slice(0, 4);
  const anos = useMemo(
    () => [...new Set(atas.map(anoDe).filter((a) => /^\d{4}$/.test(a)))].sort().reverse(),
    [atas]
  );

  const filtradas = useMemo(() => {
    const termo = semAcento(busca.trim());
    const lista = atas.filter((ata) => {
      if (ano !== "Todos" && anoDe(ata) !== ano) return false;
      if (!termo) return true;
      return [ata.titulo, ata.resumo_geral, ...parseLista(ata.decisoes), ...parseLista(ata.assinantes)]
        .some((t) => semAcento(t).includes(termo));
    });
    const valor = (ata) => {
      if (ordem.chave === "titulo") return semAcento(ata.titulo);
      if (ordem.chave === "decisoes") return parseLista(ata.decisoes).length;
      if (ordem.chave === "assinantes") return parseLista(ata.assinantes).length;
      return String(ata.data_assembleia || "");
    };
    const sinal = ordem.direcao === "asc" ? 1 : -1;
    return [...lista].sort((a, b) => {
      const va = valor(a), vb = valor(b);
      return va < vb ? -sinal : va > vb ? sinal : 0;
    });
  }, [atas, busca, ano, ordem]);

  const ordenar = (chave) => setOrdem((o) => ({
    chave,
    direcao: o.chave === chave && o.direcao === "asc" ? "desc" : "asc",
  }));

  const decisoesNoTotal = atas.reduce((n, a) => n + parseLista(a.decisoes).length, 0);
  const v = vendo;
  const vDecisoes = v ? parseLista(v.decisoes) : [];
  const vAssinantes = v ? parseLista(v.assinantes) : [];

  /** O formulário da ata, o mesmo para revisar o rascunho e para editar. */
  const formulario = form && (
    <form
      id="form-ata"
      className="mud-form"
      onSubmit={(e) => { e.preventDefault(); if (editando) salvarEdicao(); else salvarNova(); }}
    >
      {!editando && (
        <p className="asb-aviso-ia">
          <Sparkles size={15} aria-hidden="true" />
          <span>Rascunho da IA a partir de <b>{arquivo?.name}</b>. Confira antes de salvar.</span>
        </p>
      )}
      <div className="asb-form__par">
        <Field label="Título">
          <Input value={form.titulo} onChange={(e) => setCampo("titulo", e.target.value)} placeholder="Ex.: AGO 2026" />
        </Field>
        <Field label="Data da assembleia" help={form.data_assembleia ? undefined : "A IA não achou a data"}>
          <Input type="date" value={form.data_assembleia} onChange={(e) => setCampo("data_assembleia", e.target.value)} />
        </Field>
      </div>
      <Field label="Resumo geral">
        <Textarea rows={4} value={form.resumo_geral} onChange={(e) => setCampo("resumo_geral", e.target.value)} />
      </Field>
      {[
        { campo: "decisoes", titulo: "Decisões", item: "Decisão", novo: "Adicionar decisão" },
        { campo: "assinantes", titulo: "Quem assinou", item: "Nome", novo: "Adicionar nome" },
      ].map(({ campo, titulo, item, novo }) => (
        <fieldset key={campo} className="asb-itens">
          <legend className="vit-field__label">{titulo}</legend>
          {form[campo].length === 0 && <p className="asb-vazio">Nenhum ainda.</p>}
          {form[campo].map((valor, i) => (
            <div key={i} className="asb-itens__linha">
              {campo === "decisoes" && <span className="asb-num" aria-hidden="true">{i + 1}</span>}
              <Input
                value={valor}
                aria-label={`${item} ${i + 1}`}
                onChange={(e) => setItem(campo, i, e.target.value)}
                onBlur={campo === "assinantes" ? (e) => setItem(campo, i, nomeProprio(e.target.value)) : undefined}
              />
              <Button variant="ghost" size="sm" aria-label={`Remover ${item.toLowerCase()} ${i + 1}`} onClick={() => removeItem(campo, i)}>
                <X size={16} />
              </Button>
            </div>
          ))}
          <div>
            <Button variant="ghost" size="sm" iconLeft={<Plus size={14} />} onClick={() => addItem(campo)}>{novo}</Button>
          </div>
        </fieldset>
      ))}
    </form>
  );

  return (
    <div>
      <PageHeader
        title="Assembleia"
        meta={
          carregando
            ? "Carregando atas"
            : `${plural(atas.length, "ata registrada", "atas registradas")} · ${plural(decisoesNoTotal, "decisão", "decisões")}`
        }
        actions={podeEscrever && aba === "atas" && (
          <Button variant="primary" iconLeft={<Plus size={16} />} onClick={abrirNova}>Nova ata</Button>
        )}
      />

      <Tabs
        className="asb-abas"
        value={aba}
        onChange={setAba}
        items={[
          { value: "atas", label: "Atas", count: atas.length },
          { value: "convencao", label: "Convenção" },
        ]}
      />

      {aba === "convencao" && (
        <Suspense fallback={<Skeleton h={160} />}>
          <Convencao atas={atas} podeEscrever={podeEscrever} />
        </Suspense>
      )}

      {aba === "atas" && (<>
      <Filtros
        busca={busca}
        onBusca={(t) => { setBusca(t); setLimite(LOTE); }}
        placeholder="Título, decisão ou quem assinou"
        rotuloFiltro="Ano"
        filtro={ano}
        onFiltro={(a) => { setAno(a); setLimite(LOTE); }}
        filtros={anos.length > 1
          ? [["Todos", "Todas", atas.length], ...anos.map((a) => [a, a, atas.filter((x) => anoDe(x) === a).length])]
          : undefined}
      />

      {!carregando && filtradas.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={22} />}
          title={atas.length ? "Nenhuma ata neste filtro" : "Nenhuma ata cadastrada ainda"}
          description={atas.length
            ? "Troque a busca ou o ano."
            : podeEscrever
              ? "Envie o PDF de uma ata e a IA monta o resumo e as decisões."
              : "As atas registradas aparecerão aqui."}
          action={!atas.length && podeEscrever
            ? <Button variant="primary" iconLeft={<Plus size={16} />} onClick={abrirNova}>Nova ata</Button>
            : null}
        />
      ) : (
        <ListaQueAbre
          colunas={[
            { rotulo: "Data", largura: "120px", ordem: "data" },
            { rotulo: "Ata", largura: "minmax(0, 2fr)", ordem: "titulo" },
            { rotulo: "Decisões", largura: "110px", ordem: "decisoes" },
            { rotulo: "Assinaturas", largura: "120px", ordem: "assinantes" },
          ]}
          ordenacao={ordem}
          onOrdenar={ordenar}
          larguraAcoes={podeEscrever ? "136px" : "96px"}
          itens={filtradas.slice(0, limite)}
          carregando={carregando}
          chave={(ata) => ata.id}
          onAbrir={setVendo}
          rotuloDaLinha={(ata) => `Abrir a ata ${ata.titulo || "sem título"}`}
          celulas={(ata) => [
            <b key="d" className="conf-dado__mono">{dataBR(ata.data_assembleia) || "Sem data"}</b>,
            <span key="t" className="mud-quem">
              <b>{ata.titulo || "Ata sem título"}</b>
              {ata.resumo_geral ? <small className="asb-linha__resumo">{ata.resumo_geral}</small> : null}
            </span>,
            <Badge key="n" tone={parseLista(ata.decisoes).length ? "brand" : "muted"}>
              {plural(parseLista(ata.decisoes).length, "decisão", "decisões")}
            </Badge>,
            <span key="a" className="conf-dado__mono">{parseLista(ata.assinantes).length || "—"}</span>,
          ]}
          acoes={(ata) => {
            const nome = ata.titulo || "sem título";
            return (
              <>
                <Button variant="ghost" size="sm" title="Abrir o PDF" aria-label={`Abrir o PDF da ata ${nome}`}
                  disabled={!temPdf(ata)} onClick={() => abrirPdf(ata)}>
                  <FileText size={16} />
                </Button>
                <Button variant="ghost" size="sm" title="Ver a ata" aria-label={`Ver a ata ${nome}`} onClick={() => setVendo(ata)}>
                  <Eye size={16} />
                </Button>
                {podeEscrever && (
                  <Button variant="ghost" size="sm" title="Editar a ata" aria-label={`Editar a ata ${nome}`} onClick={() => abrirEditar(ata)}>
                    <Pencil size={16} />
                  </Button>
                )}
              </>
            );
          }}
        />
      )}
      {filtradas.length > limite && (
        <div className="mud-mais">
          <Button variant="ghost" onClick={() => setLimite((n) => n + LOTE)}>
            Mostrar mais ({filtradas.length - limite} restantes)
          </Button>
        </div>
      )}
      </>)}

      {/* ---- Ver: modal centrado, só leitura ---- */}
      <Modal
        open={Boolean(v)}
        onClose={() => setVendo(null)}
        title="Ata da assembleia"
        size="lg"
        footer={v && (
          <div className="app-modal__acoes">
            {podeEscrever
              ? <Button variant="ghost" iconLeft={<Trash2 size={15} />} onClick={() => excluir(v)}>Excluir</Button>
              : <span />}
            <Button className="res-contrato" iconLeft={<FileText size={15} />} disabled={!temPdf(v)} onClick={() => abrirPdf(v)}>
              Abrir PDF
            </Button>
            {podeEscrever && (
              <Button variant="primary" iconLeft={<Pencil size={15} />} onClick={() => abrirEditar(v)}>Editar</Button>
            )}
          </div>
        )}
      >
        {v && (
          <div className="app-modal">
            <div className="app-modal__topo">
              <span className="asb-icone" aria-hidden="true"><ScrollText size={24} /></span>
              <div className="app-modal__quem">
                <strong>{v.titulo || "Ata sem título"}</strong>
                <small>{dataBR(v.data_assembleia) || "Sem data"}</small>
                <span className="app-modal__selos">
                  <Badge tone={vDecisoes.length ? "brand" : "muted"}>{plural(vDecisoes.length, "decisão", "decisões")}</Badge>
                  <Badge tone="neutral">{plural(vAssinantes.length, "assinatura", "assinaturas")}</Badge>
                  {!temPdf(v) && <Badge tone="muted">Sem PDF</Badge>}
                </span>
              </div>
            </div>

            {/* O desenho do detalhe de Encomendas: o que a ata diz à esquerda
                (resumo e decisões), os dados dela à direita. */}
            <div className="app-detalhe">
              <div className="app-detalhe__visual">
                <p className="app-detalhe__legenda">Decisões</p>
                {vDecisoes.length ? (
                  <ol className="asb-decisoes">
                    {vDecisoes.map((d, i) => (
                      <li key={i}><span className="asb-num" aria-hidden="true">{i + 1}</span><span>{d}</span></li>
                    ))}
                  </ol>
                ) : <p className="asb-vazio">Nenhuma decisão registrada.</p>}
                {v.resumo_geral && (
                  <>
                    <p className="app-detalhe__legenda">Resumo</p>
                    <p className="asb-resumo">{v.resumo_geral}</p>
                  </>
                )}
              </div>

              <div className="app-detalhe__dados">
                <Ficha titulo="Ata" itens={[
                  ["Data", dataBR(v.data_assembleia) || "Sem data"],
                  ["Decisões", String(vDecisoes.length)],
                  ["PDF", temPdf(v) ? "Anexado" : "Sem PDF"],
                ]} />
                <section className="app-ficha">
                  <h3 className="app-ficha__titulo">Assinaram</h3>
                  {vAssinantes.length ? (
                    <ul className="asb-assinantes">
                      {vAssinantes.map((x, i) => (
                        <li key={i}><Iniciais nome={x} />{nomeProprio(x)}</li>
                      ))}
                    </ul>
                  ) : <p className="asb-vazio">Nenhum assinante registrado.</p>}
                </section>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Nova ata: envia o PDF, a IA lê, a pessoa revisa e salva ---- */}
      <Modal
        open={novaAberta}
        onClose={fecharNova}
        title={form ? "Revisar a ata" : "Nova ata"}
        size="md"
        footer={
          <div className="app-modal__acoes">
            <span />
            {form ? (
              <>
                <Button variant="ghost" onClick={() => setForm(null)} disabled={salvando}>Voltar</Button>
                <Button variant="primary" type="submit" form="form-ata" loading={salvando}>Salvar ata</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={fecharNova} disabled={gerando}>Cancelar</Button>
                <Button variant="primary" iconLeft={<Sparkles size={15} />} loading={gerando} disabled={!arquivo} onClick={gerarResumo}>
                  {gerando ? "Lendo a ata…" : "Gerar resumo com IA"}
                </Button>
              </>
            )}
          </div>
        }
      >
        {form ? formulario : (
          <div className="mud-form">
            <label
              className={"asb-drop" + (arrastando ? " asb-drop--ativo" : "") + (arquivo ? " asb-drop--cheio" : "")}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); aceitarArquivo(e.dataTransfer.files?.[0]); }}
            >
              <Input type="file" accept="application/pdf,.pdf" className="asb-drop__arquivo" aria-label="PDF da ata"
                onChange={(e) => aceitarArquivo(e.target.files?.[0])} />
              {arquivo ? (
                <span className="asb-drop__escolhido">
                  <span className="asb-drop__pdf" aria-hidden="true"><FileText size={22} /></span>
                  <span className="asb-drop__nome">
                    <b>{arquivo.name}</b>
                    <small>{formatarTamanho(arquivo.size)} · pronto para gerar</small>
                  </span>
                  <Button variant="ghost" size="sm" aria-label="Tirar o PDF"
                    onClick={(e) => { e.preventDefault(); setArquivo(null); setErro(""); }}>
                    <X size={16} />
                  </Button>
                </span>
              ) : (
                <>
                  <span className="asb-drop__icone" aria-hidden="true"><Upload size={22} /></span>
                  <b>Arraste o PDF da ata aqui</b>
                  <small>ou toque para escolher · só PDF, até 15 MB</small>
                </>
              )}
            </label>
            {erro && (
              <p className="asb-erro" role="alert"><AlertCircle size={16} aria-hidden="true" /> {erro}</p>
            )}
            <p className="asb-dica">
              A IA lê a ata e monta o título, a data, o resumo, as decisões e quem assinou. Você confere tudo antes de salvar.
            </p>
          </div>
        )}
      </Modal>

      {/* ---- Editar ---- */}
      <Modal
        open={editando}
        onClose={fecharEditar}
        title="Editar ata"
        size="md"
        footer={form && (
          <div className="app-modal__acoes">
            <Button variant="ghost" iconLeft={<Trash2 size={15} />}
              onClick={() => { const ata = atas.find((a) => a.id === form.id); if (ata) excluir(ata); }}>
              Excluir
            </Button>
            <Button variant="ghost" onClick={fecharEditar} disabled={salvando}>Cancelar</Button>
            <Button variant="primary" type="submit" form="form-ata" loading={salvando}>Salvar</Button>
          </div>
        )}
      >
        {editando && formulario}
      </Modal>

      {/* Chat flutuante: busca local nas atas + fallback de IA */}
      {aba === "atas" && <AssembleiaChat atas={atas} />}
    </div>
  );
}
