import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, Download, ExternalLink, Eye, FileText, ScrollText, Search, Sparkles, Upload,
} from "lucide-react";
import { Badge, Button, Field, Input, Modal, Skeleton, Textarea, useToast } from "../../ui";
import { MODO_DEMO } from "../../api/config";
import { chamarEdgeFunction } from "../../api/edge";
import { enviarAnexo, listarAnexos, removerAnexo, urlDoAnexo, urlParaBaixar } from "../../api/anexos";
import { dataBR } from "../../lib/format";
import { CORPO, TABELAS } from "../../lib/convencao/integral.ts";
import {
  buscarNaConvencao, buscarNasAtas, rotuloDoTrecho, sem,
} from "../../lib/convencao/pergunta.ts";

// Os dois PDFs moram no bucket, na pasta `assembleias/convencao/`: a primeira
// pasta é a que decide quem lê (0017), e quem lê ata lê a Convenção. O nome
// começa pelo instante do envio, então o mais novo de cada tipo é o que vale.
const PASTA = "convencao";
const DOCUMENTOS = [
  {
    chave: "original",
    titulo: "Convenção original",
    descricao: "A Convenção registrada em cartório, em PDF.",
    baixarComo: "Convencao-Diduccio-original.pdf",
  },
  {
    chave: "transcricao",
    titulo: "Convenção transcrita",
    descricao: "O texto digitado da original. É nele que a IA procura as respostas.",
    baixarComo: "Convencao-Diduccio-transcrita.pdf",
  },
];
const LIMITE_MB = 20;

const EXEMPLOS = [
  "Quantos carros cada apartamento pode parar no condomínio?",
  "Quem está inadimplente pode votar na assembleia?",
  "Qual o horário permitido para obras?",
];

const tamanho = (bytes) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : "");

/** A resposta sem IA: os trechos que a busca achou, na ordem do documento. */
function respostaLocal(pergunta, atas) {
  return {
    resposta: null,
    trechos: buscarNaConvencao(pergunta, 4).map((t) => ({ rotulo: rotuloDoTrecho(t), capitulo: t.capitulo, texto: t.texto })),
    atas: buscarNasAtas(pergunta, atas),
  };
}

export default function Convencao({ atas, podeEscrever }) {
  const toast = useToast();

  // ---------- os PDFs ----------
  const [arquivos, setArquivos] = useState({});
  const [carregandoPdfs, setCarregandoPdfs] = useState(!MODO_DEMO);
  const [enviando, setEnviando] = useState(null);
  const [vendoPdf, setVendoPdf] = useState(null); // { titulo, url }
  const entradas = useRef({});

  const carregarPdfs = async () => {
    if (MODO_DEMO) return;
    const r = await listarAnexos("assembleias", PASTA);
    const achados = {};
    for (const d of DOCUMENTOS) achados[d.chave] = r.arquivos.find((a) => a.nome.endsWith(`-${d.chave}.pdf`)) ?? null;
    setArquivos(achados);
    setCarregandoPdfs(false);
  };
  useEffect(() => { carregarPdfs(); }, []);

  const enviar = async (doc, arquivo) => {
    if (!arquivo) return;
    if (arquivo.type !== "application/pdf") { toast.error("Escolha um arquivo PDF."); return; }
    if (arquivo.size > LIMITE_MB * 1024 * 1024) { toast.error(`O PDF passa de ${LIMITE_MB} MB.`); return; }
    setEnviando(doc.chave);
    try {
      const antigo = arquivos[doc.chave];
      const r = await enviarAnexo("assembleias", PASTA, arquivo, `${doc.chave}.pdf`);
      if (!r.success) {
        toast.error(/size|large|maximum/i.test(r.message || "")
          ? "O PDF é maior do que o sistema aceita hoje. Aplique a migração 0087 e envie de novo."
          : "Não foi possível guardar o PDF. Tente de novo.");
        return;
      }
      // O antigo sai só depois que o novo chegou: se o envio falhar, a
      // Convenção continua disponível.
      if (antigo) await removerAnexo(antigo.caminho);
      toast.success(antigo ? "PDF trocado" : "PDF guardado");
      await carregarPdfs();
    } finally {
      setEnviando(null);
      if (entradas.current[doc.chave]) entradas.current[doc.chave].value = "";
    }
  };

  const verPdf = async (doc) => {
    const url = await urlDoAnexo({ caminho_storage: arquivos[doc.chave]?.caminho });
    if (!url) { toast.error("Este PDF não está disponível."); return; }
    setVendoPdf({ titulo: doc.titulo, url });
  };

  const baixar = async (doc) => {
    const url = await urlParaBaixar(arquivos[doc.chave]?.caminho, doc.baixarComo);
    if (!url) { toast.error("Este PDF não está disponível."); return; }
    window.location.assign(url);
  };

  // ---------- o texto da transcrição ----------
  const [lendo, setLendo] = useState(false);
  const [foco, setFoco] = useState(null);
  const abrirTexto = (texto = null) => { setFoco(texto); setLendo(true); };

  // ---------- a pergunta ----------
  const [pergunta, setPergunta] = useState("");
  const [perguntando, setPerguntando] = useState(false);
  const [resultado, setResultado] = useState(null); // { pergunta, resposta, trechos, atas, aviso }

  const perguntar = async (texto) => {
    const q = (texto ?? pergunta).trim();
    if (q.length < 5 || perguntando) return;
    if (texto) setPergunta(texto);
    setPerguntando(true);
    try {
      if (MODO_DEMO) {
        setResultado({ pergunta: q, ...respostaLocal(q, atas), aviso: "Na demonstração a IA não roda: estes são os trechos que a busca achou." });
        return;
      }
      const r = await chamarEdgeFunction("ia", { acao: "perguntar-convencao", pergunta: q }, { limiteMs: 45000 });
      if (r.ok && r.corpo?.success) {
        setResultado({
          pergunta: q,
          resposta: r.corpo.resposta,
          trechos: r.corpo.trechos ?? [],
          atas: r.corpo.atas ?? [],
          aviso: r.corpo.resposta ? null : "A IA não respondeu agora. Estes são os trechos que a busca achou.",
        });
        return;
      }
      setResultado({ pergunta: q, ...respostaLocal(q, atas), aviso: "A IA não respondeu agora. Estes são os trechos que a busca achou." });
    } finally {
      setPerguntando(false);
    }
  };

  return (
    <div className="cv-grade">
      {/* ---------- Perguntar ---------- */}
      <section className="cv-cartao" aria-labelledby="cv-perguntar">
        <div className="cv-cartao__topo">
          <span className="cv-cartao__icone" aria-hidden="true"><Sparkles size={18} /></span>
          <div>
            <h2 id="cv-perguntar">Perguntar à Convenção</h2>
            <p className="cv-nota">A IA lê a Convenção e as decisões das atas, e diz de qual item tirou a resposta.</p>
          </div>
        </div>

        <form className="cv-pergunta" onSubmit={(e) => { e.preventDefault(); perguntar(); }}>
          <Field label="Sua pergunta" help="Escreva do seu jeito, como perguntaria a alguém.">
            <Textarea
              rows={3}
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); perguntar(); } }}
              placeholder="Ex.: quem está inadimplente pode votar?"
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            iconLeft={<Search size={16} />}
            loading={perguntando}
            disabled={pergunta.trim().length < 5}
            className="cv-perguntar"
          >
            Perguntar
          </Button>
        </form>

        {!resultado && !perguntando && (
          <div className="cv-exemplos">
            <span className="cv-rotulo">Exemplos</span>
            {EXEMPLOS.map((ex) => (
              <button key={ex} type="button" className="cv-exemplo" onClick={() => perguntar(ex)}>{ex}</button>
            ))}
          </div>
        )}

        {perguntando && (
          <div className="cv-resposta" aria-live="polite">
            <Skeleton h={14} count={3} />
          </div>
        )}

        {resultado && !perguntando && (
          <div className="cv-resposta" aria-live="polite">
            <p className="cv-resposta__pergunta">{resultado.pergunta}</p>
            {resultado.resposta && <p className="cv-resposta__texto">{resultado.resposta}</p>}
            {resultado.aviso && <p className="cv-aviso">{resultado.aviso}</p>}

            {resultado.trechos?.length > 0 && (
              <div className="cv-fontes">
                <span className="cv-rotulo">Na Convenção</span>
                {resultado.trechos.map((t, i) => (
                  <article key={i} className="cv-trecho">
                    <div className="cv-trecho__topo">
                      <Badge tone="brand">{t.rotulo}</Badge>
                      <small>{t.capitulo}</small>
                    </div>
                    <p>{t.texto}</p>
                    <Button variant="ghost" size="sm" iconLeft={<BookOpen size={14} />} onClick={() => abrirTexto(t.texto)}>
                      Ver na Convenção
                    </Button>
                  </article>
                ))}
              </div>
            )}

            {resultado.atas?.length > 0 && (
              <div className="cv-fontes">
                <span className="cv-rotulo">Nas atas</span>
                {resultado.atas.map((a, i) => (
                  <article key={i} className="cv-trecho">
                    <div className="cv-trecho__topo">
                      <Badge tone="neutral">{a.ata}</Badge>
                      <small>{dataBR(a.data)}</small>
                    </div>
                    <p>{a.decisao}</p>
                  </article>
                ))}
              </div>
            )}

            {!resultado.resposta && !resultado.trechos?.length && !resultado.atas?.length && (
              <p className="cv-nota">Não achei nada sobre isso na Convenção nem nas atas. Tente com outras palavras.</p>
            )}
          </div>
        )}
      </section>

      {/* ---------- Documentos ---------- */}
      <section className="cv-cartao" aria-labelledby="cv-documentos">
        <div className="cv-cartao__topo">
          <span className="cv-cartao__icone" aria-hidden="true"><ScrollText size={18} /></span>
          <div>
            <h2 id="cv-documentos">Documentos</h2>
            <p className="cv-nota">Veja aqui dentro ou baixe o PDF.</p>
          </div>
        </div>

        <ul className="cv-docs">
          {DOCUMENTOS.map((doc) => {
            const arq = arquivos[doc.chave];
            const ehTexto = doc.chave === "transcricao";
            return (
              <li key={doc.chave} className="cv-doc">
                <span className="cv-doc__icone" aria-hidden="true"><FileText size={20} /></span>
                <div className="cv-doc__texto">
                  <strong>{doc.titulo}</strong>
                  <small>{doc.descricao}</small>
                  {carregandoPdfs ? (
                    <Skeleton h={12} w="40%" />
                  ) : arq ? (
                    <small className="cv-doc__meta">PDF guardado · {tamanho(arq.tamanho)}</small>
                  ) : (
                    <small className="cv-doc__meta cv-doc__meta--falta">
                      {MODO_DEMO ? "Na demonstração os PDFs não ficam guardados." : "PDF ainda não enviado."}
                    </small>
                  )}
                </div>
                <div className="cv-doc__acoes">
                  {ehTexto && (
                    <Button variant="ghost" size="sm" iconLeft={<BookOpen size={15} />} onClick={() => abrirTexto()}>
                      Ler o texto
                    </Button>
                  )}
                  {arq && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => verPdf(doc)} aria-label={`Ver o PDF da ${doc.titulo}`}>
                        <Eye size={16} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => baixar(doc)} aria-label={`Baixar o PDF da ${doc.titulo}`}>
                        <Download size={16} />
                      </Button>
                    </>
                  )}
                  {podeEscrever && !MODO_DEMO && (
                    <>
                      <Input
                        ref={(el) => { entradas.current[doc.chave] = el; }}
                        type="file"
                        accept="application/pdf"
                        className="cv-arquivo"
                        tabIndex={-1}
                        aria-hidden="true"
                        onChange={(e) => enviar(doc, e.target.files?.[0])}
                      />
                      <Button
                        variant={arq ? "ghost" : "secondary"}
                        size="sm"
                        iconLeft={<Upload size={15} />}
                        loading={enviando === doc.chave}
                        onClick={() => entradas.current[doc.chave]?.click()}
                        aria-label={arq ? `Trocar o PDF da ${doc.titulo}` : `Enviar o PDF da ${doc.titulo}`}
                      >
                        {arq ? "Trocar" : "Enviar PDF"}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------- Ver o PDF ---------- */}
      <Modal
        open={Boolean(vendoPdf)}
        onClose={() => setVendoPdf(null)}
        title={vendoPdf?.titulo}
        size="lg"
        className="cv-modal-pdf"
        footer={(
          <div className="app-modal__acoes">
            <Button variant="ghost" onClick={() => setVendoPdf(null)}>Fechar</Button>
            <Button variant="secondary" iconLeft={<ExternalLink size={16} />} onClick={() => window.open(vendoPdf.url, "_blank", "noopener")}>
              Abrir em outra aba
            </Button>
          </div>
        )}
      >
        {vendoPdf && <iframe className="cv-pdf" src={vendoPdf.url} title={vendoPdf.titulo} />}
      </Modal>

      {/* ---------- Ler o texto ---------- */}
      <LeituraDaConvencao
        aberta={lendo}
        foco={foco}
        onFechar={() => { setLendo(false); setFoco(null); }}
        onBaixar={arquivos.transcricao ? () => baixar(DOCUMENTOS[1]) : null}
      />
    </div>
  );
}

/** A transcrição dentro do sistema: capítulos, busca e os quadros no fim. */
function LeituraDaConvencao({ aberta, foco, onFechar, onBaixar }) {
  const [busca, setBusca] = useState("");
  const corpoRef = useRef(null);

  useEffect(() => {
    if (!aberta || !foco) return;
    // Espera o modal desenhar para achar o parágrafo e rolar até ele.
    const t = setTimeout(() => {
      corpoRef.current?.querySelector(".cv-par--foco")?.scrollIntoView({ block: "center" });
    }, 60);
    return () => clearTimeout(t);
  }, [aberta, foco]);

  const termo = sem(busca.trim());
  const paragrafos = useMemo(
    () => CORPO.map((texto, i) => ({ i, texto }))
      .filter((p) => !termo || p.texto.startsWith("CAPÍTULO") || sem(p.texto).includes(termo)),
    [termo]
  );
  const achados = termo ? paragrafos.filter((p) => !p.texto.startsWith("CAPÍTULO")).length : 0;

  const fechar = () => { setBusca(""); onFechar(); };

  return (
    <Modal
      open={aberta}
      onClose={fechar}
      title="Convenção transcrita"
      size="lg"
      footer={(
        <div className="app-modal__acoes">
          <Button variant="ghost" onClick={fechar}>Fechar</Button>
          {onBaixar && <Button variant="secondary" iconLeft={<Download size={16} />} onClick={onBaixar}>Baixar PDF</Button>}
        </div>
      )}
    >
      <div className="cv-leitura" ref={corpoRef}>
        <div className="cv-leitura__busca">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar no texto (ex.: vaga, votar, obra)"
            aria-label="Procurar no texto da Convenção"
          />
          {termo && <small>{achados === 1 ? "1 trecho" : `${achados} trechos`}</small>}
        </div>

        {paragrafos.map(({ i, texto }) => {
          if (texto.startsWith("CAPÍTULO")) return <h3 key={i} className="cv-cap">{texto.replace(/:$/, "")}</h3>;
          if (texto.startsWith("[Folha")) return termo ? null : <span key={i} className="cv-folha">{texto.slice(1, -1)}</span>;
          return <p key={i} className={"cv-par" + (foco === texto ? " cv-par--foco" : "")}>{texto}</p>;
        })}

        {!termo && (
          <div className="cv-quadros">
            <h3 className="cv-cap">Quadros</h3>
            {Object.values(TABELAS).map((t) => (
              <details key={t.titulo} className="cv-quadro">
                <summary>{t.titulo} <small>{t.linhas.length} unidades</small></summary>
                <ul>{t.linhas.map((l) => <li key={l}>{l}</li>)}</ul>
              </details>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
