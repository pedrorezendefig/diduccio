import { useState, useEffect } from "react";
import {
  Gavel, Upload, Sparkles, Trash2, FileText, Plus, X, ChevronDown,
  Calendar, Users, CheckCircle2, Loader2, AlertCircle, Inbox, FileSignature, ScrollText,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useTheme } from "../theme/useTheme";
import AssembleiaChat from "../components/AssembleiaChat";
import { PageHeader, useToast, useConfirm } from "../ui";
import { listar, criar, editar, remover } from "../api/db";
import { enviarAnexo, urlDoAnexo, removerAnexosDoRegistro } from "../api/anexos";
import { chamarEdgeFunction, mensagemDaEdgeFunction } from "../api/edge";
import { dataBR } from "../lib/format";

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

function iniciais(nome) {
  const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

export default function Assembleia({ user }) {
  const { theme } = useTheme();
  const toast = useToast();
  const confirmar = useConfirm();
  const dark = theme.isDark;
  const podeEscrever = PODE_ESCREVER.includes(user?.cargo);

  const [atas, setAtas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [expandido, setExpandido] = useState(null);

  // Upload + geração
  const [arquivo, setArquivo] = useState(null);
  const [arrastando, setArrastando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  // Rascunho em revisão (null = sem rascunho)
  const [rascunho, setRascunho] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregarAtas = async () => {
    setCarregando(true);
    try {
      const res = await listar("ASSEMBLEIAS");
      const lista = Array.isArray(res) ? res : [];
      lista.sort((a, b) => (b.id || "").localeCompare(a.id || "")); // mais recentes primeiro
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
      setRascunho({
        titulo: res.titulo || "",
        data_assembleia: res.data_assembleia || "",
        resumo_geral: res.resumo_geral || "",
        decisoes: Array.isArray(res.decisoes) ? res.decisoes : [],
        assinantes: Array.isArray(res.assinantes) ? res.assinantes : [],
      });
    } catch {
      setErro("Erro ao processar o PDF.");
    } finally {
      setGerando(false);
    }
  };

  const salvar = async () => {
    if (!arquivo || !rascunho) return;
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
        titulo: rascunho.titulo || null,
        data_assembleia: paraDataISO(rascunho.data_assembleia),
        resumo_geral: rascunho.resumo_geral || null,
        // Colunas de texto guardando JSON, como a planilha fazia — `parseLista`
        // já lê nesse formato, e as atas antigas estão assim.
        decisoes: JSON.stringify(rascunho.decisoes.filter((d) => d.trim())),
        assinantes: JSON.stringify(rascunho.assinantes.filter((a) => a.trim())),
        created_by: user?.nome || user?.email || "",
      });
      if (!r.success) { toast.error(mensagemErro(r.message)); return; }

      const envio = await enviarAnexo("assembleias", id, arquivo, arquivo.name);
      if (!envio.success) {
        toast.error("Ata salva, mas o PDF não subiu. Exclua e cadastre de novo.");
      } else {
        const rv = await editar("ASSEMBLEIAS", id, { caminho_pdf: envio.caminho });
        if (!rv.success) toast.error("Ata salva, mas o PDF não ficou vinculado.");
      }

      setRascunho(null);
      setArquivo(null);
      await carregarAtas();
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (ata) => {
    const ok = await confirmar({
      title: `Excluir a ata "${ata.titulo || "sem título"}"?`,
      description: "O PDF anexado também é removido do Drive. Não dá para desfazer.",
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

    await carregarAtas();
    toast.success("Ata excluída");
  };

  const abrirPdf = async (ata) => {
    // O bucket vem primeiro: a ata migrada tem os dois endereços, e o
    // `pdf_id` do Drive não responde mais — o `getFoto` exige uma sessão que
    // ninguém emite desde que o login saiu do Apps Script.
    //
    // Sumiu daqui todo o rodeio de baixar o PDF em base64 e montar um iframe
    // com `data:`: ele existia porque o arquivo no Drive era privado e só o
    // backend autenticado o alcançava. A URL assinada já carrega a autorização
    // e tem prazo de validade, então abre direto — sem passar os bytes do PDF
    // pelo JavaScript e sem `data:` URL, que era o pedaço que precisava do
    // cuidado com XSS.
    const endereco = await urlDoAnexo({
      caminho_storage: ata.caminho_pdf,
      url_drive: ata.pdf_url,
    });
    if (!endereco) { toast.error("Este PDF não está disponível."); return; }
    window.open(endereco, "_blank", "noopener");
  };

  // ---- edição das listas do rascunho ----
  const setCampo = (campo, valor) => setRascunho((r) => ({ ...r, [campo]: valor }));
  const setItem = (campo, i, valor) =>
    setRascunho((r) => ({ ...r, [campo]: r[campo].map((x, idx) => (idx === i ? valor : x)) }));
  const addItem = (campo) => setRascunho((r) => ({ ...r, [campo]: [...r[campo], ""] }));
  const removeItem = (campo, i) =>
    setRascunho((r) => ({ ...r, [campo]: r[campo].filter((_, idx) => idx !== i) }));

  // ---------- tokens de estilo ----------
  const vars = {
    "--asb-border": theme.border,
    "--asb-card": theme.bgCard,
    "--asb-field": dark ? "var(--bg-app)" : "var(--surface-2)",
    "--asb-hover": dark ? "#243029" : "#FFF4F1",
    "--asb-text": theme.text,
    "--asb-text-sec": theme.textSecondary,
    "--asb-shadow": dark ? "0 10px 30px -12px rgba(0,0,0,.6)" : "0 12px 32px -16px rgba(40,22,18,.28)",
  };

  const secTitle = {
    fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600,
    color: theme.text, margin: 0, letterSpacing: "-.01em",
  };
  const label = {
    display: "block", fontSize: 12, fontWeight: 600, letterSpacing: ".04em",
    textTransform: "uppercase", color: theme.textSecondary, marginBottom: 7,
  };

  return (
    <div className="asb-page" style={{ ...vars, color: theme.text }}>
      <style>{CSS}</style>

      {/* O brilho radial de fundo e o ícone-fantasma gigante do hero saíram:
          eram decoração pura, e o design system pede que o topo da página
          informe o estado em vez de enfeitar. */}
      <div>
        <PageHeader
          title="Assembleia"
          meta={
            carregando
              ? "Carregando atas"
              : `${atas.length} ${atas.length === 1 ? "ata registrada" : "atas registradas"} · resumo gerado por IA a partir do PDF`
          }
        />

        {/* ===== UPLOAD + GERAÇÃO ===== */}
        {podeEscrever && !rascunho && (
          <div className="asb-card asb-in" style={{ padding: 22, marginBottom: 26, animationDelay: "60ms" }}>
            <label
              className={"asb-drop" + (arrastando ? " asb-drop-active" : "") + (arquivo ? " asb-drop-filled" : "")}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); aceitarArquivo(e.dataTransfer.files?.[0]); }}
            >
              <input type="file" accept="application/pdf,.pdf" style={{ display: "none" }}
                onChange={(e) => aceitarArquivo(e.target.files?.[0])} />
              {arquivo ? (
                <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
                  <div className="asb-file-ico"><FileText size={22} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{arquivo.name}</div>
                    <div style={{ fontSize: 12.5, color: theme.textSecondary }}>{formatarTamanho(arquivo.size)} · pronto para gerar</div>
                  </div>
                  <button type="button" className="asb-icon-btn" title="Remover"
                    onClick={(e) => { e.preventDefault(); setArquivo(null); setErro(""); }}><X size={17} /></button>
                </div>
              ) : (
                <>
                  <div className="asb-drop-ico"><Upload size={24} /></div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>Arraste o PDF da ata aqui</div>
                    <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2 }}>ou clique para escolher · somente PDF · até 15&nbsp;MB</div>
                  </div>
                </>
              )}
            </label>

            {erro && (
              <div className="asb-alert" style={{ marginTop: 16 }}>
                <AlertCircle size={17} /> <span>{erro}</span>
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <button className="asb-btn asb-btn-primary" onClick={gerarResumo} disabled={!arquivo || gerando}>
                {gerando ? <Loader2 size={18} className="asb-spin" /> : <Sparkles size={18} />}
                {gerando ? "Lendo a ata…" : "Gerar resumo com IA"}
              </button>
            </div>
          </div>
        )}

        {/* ===== REVISÃO DO RASCUNHO ===== */}
        {rascunho && (
          <div className="asb-card asb-in" style={{ padding: 24, marginBottom: 26, borderColor: dark ? "#B3332055" : "#FCC8B9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div className="asb-chip-accent"><Sparkles size={14} /> Rascunho da IA</div>
              <h2 style={secTitle}>Revisar antes de salvar</h2>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 14 }}>
                <div>
                  <label style={label}>Título</label>
                  <input className="asb-input" value={rascunho.titulo} onChange={(e) => setCampo("titulo", e.target.value)} />
                </div>
                <div>
                  <label style={label}>Data da assembleia</label>
                  <input className="asb-input" value={rascunho.data_assembleia} onChange={(e) => setCampo("data_assembleia", e.target.value)} />
                </div>
              </div>

              <div>
                <label style={label}>Resumo geral</label>
                <textarea className="asb-input" style={{ minHeight: 96, resize: "vertical", lineHeight: 1.55 }}
                  value={rascunho.resumo_geral} onChange={(e) => setCampo("resumo_geral", e.target.value)} />
              </div>

              {[
                { campo: "decisoes", titulo: "Decisões" },
                { campo: "assinantes", titulo: "Quem assinou" },
              ].map(({ campo, titulo }) => (
                <div key={campo}>
                  <label style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}>
                    {campo === "decisoes" ? <CheckCircle2 size={13} /> : <FileSignature size={13} />} {titulo}
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {rascunho[campo].map((item, i) => (
                      <div key={i} style={{ display: "flex", gap: 8 }}>
                        <input className="asb-input" value={item} onChange={(e) => setItem(campo, i, e.target.value)} />
                        <button className="asb-icon-btn" onClick={() => removeItem(campo, i)} title="Remover"><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                  <button className="asb-btn asb-btn-soft" style={{ marginTop: 8, fontSize: 13, padding: "7px 12px" }} onClick={() => addItem(campo)}>
                    <Plus size={14} /> Adicionar
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button className="asb-btn asb-btn-primary" onClick={salvar} disabled={salvando}>
                {salvando ? <Loader2 size={17} className="asb-spin" /> : <CheckCircle2 size={17} />}
                {salvando ? "Salvando…" : "Salvar ata"}
              </button>
              <button className="asb-btn asb-btn-ghost" onClick={() => setRascunho(null)} disabled={salvando}>Descartar</button>
            </div>
          </div>
        )}

        {/* ===== HISTÓRICO ===== */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 2px 16px" }}>
          <ScrollText size={18} color={dark ? "#EF7A5C" : "#D4432A"} />
          <h2 style={secTitle}>Histórico de assembleias</h2>
          {atas.length > 0 && <span className="asb-count">{atas.length}</span>}
        </div>

        {carregando ? (
          <div className="asb-card" style={{ padding: 28, display: "flex", alignItems: "center", gap: 12, color: theme.textSecondary }}>
            <Loader2 size={18} className="asb-spin" /> Carregando atas…
          </div>
        ) : atas.length === 0 ? (
          <div className="asb-empty">
            <div className="asb-empty-ico"><Inbox size={28} /></div>
            <div style={{ fontWeight: 600, fontSize: 15, color: theme.text }}>Nenhuma ata cadastrada ainda</div>
            <div style={{ fontSize: 13.5, color: theme.textSecondary, marginTop: 3 }}>
              {podeEscrever ? "Envie o PDF de uma ata acima para gerar o primeiro resumo." : "As atas registradas aparecerão aqui."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {atas.map((ata, idx) => {
              const decisoes = parseLista(ata.decisoes);
              const assinantes = parseLista(ata.assinantes);
              const aberto = expandido === ata.id;
              return (
                <div key={ata.id} className="asb-card asb-ata asb-in" style={{ animationDelay: `${Math.min(idx, 6) * 55}ms` }}>
                  <div className="asb-ata-bar" aria-hidden />
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px 16px 20px" }}>
                    <div className="asb-date">
                      <Calendar size={15} />
                      <span>{dataBR(ata.data_assembleia) || "s/ data"}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="asb-ata-title">{ata.titulo || "Ata sem título"}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                        <span className="asb-pill asb-pill-blue"><CheckCircle2 size={12} /> {decisoes.length} {decisoes.length === 1 ? "decisão" : "decisões"}</span>
                        {assinantes.length > 0 && (
                          <span className="asb-pill asb-pill-amber"><FileSignature size={12} /> {assinantes.length} {assinantes.length === 1 ? "assinatura" : "assinaturas"}</span>
                        )}
                      </div>
                    </div>
                    <button className="asb-btn asb-btn-soft" style={{ fontSize: 13, padding: "7px 12px" }} onClick={() => abrirPdf(ata)}>
                      <FileText size={15} /> PDF
                    </button>
                    {podeEscrever && (
                      <button className="asb-icon-btn asb-icon-danger" title="Excluir" onClick={() => excluir(ata)}><Trash2 size={16} /></button>
                    )}
                    <button className={"asb-icon-btn asb-chevron" + (aberto ? " asb-chevron-open" : "")}
                      title={aberto ? "Recolher" : "Expandir"} onClick={() => setExpandido(aberto ? null : ata.id)}>
                      <ChevronDown size={17} />
                    </button>
                  </div>

                  {aberto && (
                    <div className="asb-ata-body">
                      {ata.resumo_geral && <p className="asb-resumo">{ata.resumo_geral}</p>}

                      <div className="asb-sub"><CheckCircle2 size={14} /> Decisões</div>
                      {decisoes.length ? (
                        <ol className="asb-decisoes">
                          {decisoes.map((d, i) => (
                            <li key={i}><span className="asb-num">{i + 1}</span><span>{d}</span></li>
                          ))}
                        </ol>
                      ) : <div style={{ color: theme.textSecondary, fontSize: 13.5, marginBottom: 8 }}>Nenhuma decisão registrada.</div>}

                      <div className="asb-sub" style={{ marginTop: 16 }}><Users size={14} /> Assinaram</div>
                      {assinantes.length ? (
                        <div className="asb-assinantes">
                          {assinantes.map((a, i) => (
                            <div key={i} className="asb-assinante"><span className="asb-avatar">{iniciais(a)}</span>{a}</div>
                          ))}
                        </div>
                      ) : <div style={{ color: theme.textSecondary, fontSize: 13.5 }}>Nenhum assinante registrado.</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chat flutuante: busca local nas atas + fallback de IA */}
      <AssembleiaChat atas={atas} />
    </div>
  );
}

const CSS = `
/* Fase 0: o @import de Fraunces no Google Fonts foi removido. Era a única
   requisição externa de fonte que sobrava e derrubava a auto-hospedagem.
   A tipografia definitiva desta página é decidida na Fase 6 (Documento). */

@keyframes asbSpin { to { transform: rotate(360deg); } }
@keyframes asbIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.asb-spin { animation: asbSpin .8s linear infinite; }
.asb-in { animation: asbIn .5s cubic-bezier(.2,.7,.2,1) both; }
@media (prefers-reduced-motion: reduce) { .asb-in { animation: none; } }

.asb-page * { box-sizing: border-box; }

.asb-card {
  background: var(--asb-card);
  border: 1px solid var(--asb-border);
  border-radius: 16px;
  box-shadow: var(--asb-shadow);
}

/* HERO */
.asb-hero {
  position: relative; overflow: hidden;
  border-radius: 20px; padding: 26px 26px;
  background: linear-gradient(135deg, #B33320 0%, #8C2616 42%, #5E180D 100%);
  box-shadow: 0 18px 40px -20px rgba(3,105,161,.75);
}
.asb-hero-glow { position: absolute; inset: 0; background:
  radial-gradient(120% 120% at 100% 0%, rgba(56,189,248,.35), transparent 55%); }
.asb-hero-ghost { position: absolute; right: -22px; bottom: -46px; color: rgba(255,255,255,.10); transform: rotate(-16deg); }
.asb-hero-badge {
  width: 54px; height: 54px; border-radius: 15px; flex: none;
  display: grid; place-items: center; color: #fff;
  background: rgba(255,255,255,.16);
  border: 1px solid rgba(255,255,255,.28);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.25);
  backdrop-filter: blur(4px);
}
.asb-hero-title {
  font-family: var(--font-display); font-weight: 600;
  font-size: 30px; line-height: 1.05; letter-spacing: -.02em; margin: 0; color: #fff;
}
.asb-hero-sub { margin: 6px 0 0; color: rgba(255,255,255,.82); font-size: 14px; max-width: 46ch; }
.asb-hero-stat {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 12px 20px; border-radius: 14px; color: #fff;
  background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22);
}
.asb-hero-stat-num { font-family: var(--font-display); font-size: 30px; font-weight: 700; line-height: 1; }
.asb-hero-stat-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; opacity: .85; margin-top: 4px; }

/* DROPZONE */
.asb-drop {
  display: flex; align-items: center; justify-content: center; gap: 14px;
  flex-direction: column; width: 100%; cursor: pointer;
  padding: 30px 20px; border-radius: 14px;
  border: 1.5px dashed var(--asb-border);
  background: var(--asb-field);
  transition: border-color .18s, background .18s, transform .18s;
}
.asb-drop:hover { border-color: #EF7A5C; background: var(--asb-hover); }
.asb-drop-active { border-color: #E35A3A; background: var(--asb-hover); transform: scale(1.006); }
.asb-drop-filled { border-style: solid; padding: 16px 18px; }
.asb-drop-ico {
  width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center;
  color: #D4432A; background: rgba(212,67,42,.12); border: 1px solid rgba(212,67,42,.22);
}
.asb-file-ico {
  width: 46px; height: 46px; flex: none; border-radius: 12px; display: grid; place-items: center;
  color: #8F1530; background: rgba(220,38,38,.1); border: 1px solid rgba(220,38,38,.2);
}

/* BOTÕES */
.asb-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 18px; border-radius: 11px; font-size: 14px; font-weight: 600;
  cursor: pointer; border: 1px solid transparent; transition: transform .12s, box-shadow .18s, background .18s, opacity .18s;
}
.asb-btn:active { transform: translateY(1px); }
.asb-btn:disabled { opacity: .55; cursor: not-allowed; }
.asb-btn-primary {
  color: #fff; border: none;
  background: linear-gradient(135deg, #E35A3A, #B33320 55%, #E35A3A);
  box-shadow: 0 10px 22px -10px rgba(3,105,161,.85);
}
.asb-btn-primary:not(:disabled):hover { box-shadow: 0 14px 26px -10px rgba(3,105,161,.95); transform: translateY(-1px); }
.asb-btn-ghost { background: transparent; color: var(--asb-text-sec); border: 1px solid var(--asb-border); }
.asb-btn-ghost:hover { background: var(--asb-hover); color: var(--asb-text); }
.asb-btn-soft { background: var(--asb-field); color: var(--asb-text-sec); border: 1px solid var(--asb-border); }
.asb-btn-soft:hover { background: var(--asb-hover); color: #D4432A; border-color: #F7A48E; }

.asb-icon-btn {
  display: grid; place-items: center; width: 36px; height: 36px; flex: none;
  border-radius: 10px; cursor: pointer; color: var(--asb-text-sec);
  background: var(--asb-field); border: 1px solid var(--asb-border);
  transition: background .16s, color .16s, border-color .16s, transform .16s;
}
.asb-icon-btn:hover { background: var(--asb-hover); color: var(--asb-text); }
.asb-icon-danger:hover { background: rgba(220,38,38,.12); color: #B8203F; border-color: rgba(220,38,38,.35); }
.asb-chevron svg { transition: transform .22s ease; }
.asb-chevron-open svg { transform: rotate(180deg); }

/* INPUTS */
.asb-input {
  width: 100%; padding: 11px 13px; border-radius: 10px; font-size: 14px; font-family: inherit;
  color: var(--asb-text); background: var(--asb-field);
  border: 1px solid var(--asb-border); outline: none;
  transition: border-color .16s, box-shadow .16s;
}
.asb-input:focus { border-color: #E35A3A; box-shadow: 0 0 0 3px rgba(227,90,58,.18); }

/* CHIPS / PILLS */
.asb-chip-accent {
  display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700;
  padding: 4px 10px; border-radius: 999px; letter-spacing: .02em;
  color: #E35A3A; background: rgba(227,90,58,.12); border: 1px solid rgba(227,90,58,.25);
}
.asb-count {
  min-width: 22px; height: 22px; padding: 0 7px; border-radius: 999px; font-size: 12px; font-weight: 700;
  display: inline-grid; place-items: center; color: #D4432A;
  background: rgba(212,67,42,.12); border: 1px solid rgba(212,67,42,.25);
}
.asb-pill {
  display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600;
  padding: 3px 9px; border-radius: 999px;
}
.asb-pill-blue { color: #D4432A; background: rgba(212,67,42,.1); border: 1px solid rgba(212,67,42,.2); }
.asb-pill-amber { color: var(--fg-secondary); background: rgba(245,158,11,.13); border: 1px solid rgba(245,158,11,.28); }

/* ALERTA */
.asb-alert {
  display: flex; align-items: center; gap: 9px; font-size: 13.5px; font-weight: 500;
  padding: 11px 14px; border-radius: 11px; color: #8F1530;
  background: rgba(220,38,38,.09); border: 1px solid rgba(220,38,38,.25);
}

/* CARD DA ATA */
.asb-ata { position: relative; overflow: hidden; padding-left: 4px; transition: box-shadow .2s, transform .2s; }
.asb-ata:hover { transform: translateY(-2px); box-shadow: 0 18px 40px -18px rgba(40,22,18,.4); }
.asb-ata-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  background: linear-gradient(180deg, #E35A3A, #E35A3A); }
.asb-date {
  display: flex; flex-direction: column; align-items: center; gap: 3px; flex: none;
  min-width: 84px; padding: 9px 10px; border-radius: 12px; text-align: center;
  font-size: 12.5px; font-weight: 600; color: #D4432A;
  background: var(--asb-field); border: 1px solid var(--asb-border); line-height: 1.15;
}
.asb-ata-title { font-family: var(--font-display); font-weight: 600; font-size: 16.5px;
  letter-spacing: -.01em; color: var(--asb-text); }
.asb-ata-body { padding: 4px 20px 20px 24px; border-top: 1px dashed var(--asb-border); margin: 0 0 0 0; }
.asb-resumo { margin: 16px 0 18px; font-size: 14.5px; line-height: 1.62; color: var(--asb-text);
  padding-left: 14px; border-left: 3px solid rgba(227,90,58,.4); }
.asb-sub { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .05em; color: var(--asb-text-sec); margin-bottom: 10px; }
.asb-decisoes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.asb-decisoes li { display: flex; gap: 11px; align-items: flex-start; font-size: 14px; line-height: 1.5; color: var(--asb-text); }
.asb-num { flex: none; width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center;
  font-size: 12px; font-weight: 700; color: #fff; margin-top: 1px;
  background: linear-gradient(135deg, #E35A3A, #E35A3A); }
.asb-assinantes { display: flex; flex-wrap: wrap; gap: 8px; }
.asb-assinante { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 500;
  padding: 5px 12px 5px 5px; border-radius: 999px; color: var(--asb-text);
  background: var(--asb-field); border: 1px solid var(--asb-border); }
.asb-avatar { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; flex: none;
  font-size: 10.5px; font-weight: 700; color: #fff; letter-spacing: .02em;
  background: linear-gradient(135deg, var(--fg-muted), var(--fg-secondary)); }

/* EMPTY */
.asb-empty {
  text-align: center; padding: 44px 24px; border-radius: 16px;
  border: 1.5px dashed var(--asb-border); background: var(--asb-card);
}
.asb-empty-ico { width: 60px; height: 60px; margin: 0 auto 14px; border-radius: 50%; display: grid; place-items: center;
  color: #D4432A; background: rgba(212,67,42,.1); border: 1px solid rgba(212,67,42,.2); }

@media (max-width: 620px) {
  .asb-hero-stat { display: none; }
  .asb-ata > div:first-of-type + div, .asb-ata .asb-date { min-width: 74px; }
}
`;
