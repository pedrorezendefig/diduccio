import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Film, ImageIcon, Minus, Paperclip, Pin, Plus, RotateCcw, Share2, Smartphone, Upload, X } from "lucide-react";
import { Button, Input, Modal } from "../../ui";
import { ACEITA_ANEXO as ACEITA, MAX_ANEXOS, paragrafosDoTexto, problemaDoAnexo, publicarNoticia, tamanhoLegivel, tipoDoAnexo } from "../../api/noticias";
import "../../styles/publicar-app.css";

const ICONE = { video: Film, imagem: ImageIcon, pdf: FileText };
const ROTULO = { video: "Vídeo", imagem: "Imagem", pdf: "PDF" };
/** Tamanhos da letra da notícia no app (px). Vazio = o padrão do app (≈16). */
const TAMANHOS = [14, 15, 16, 18, 20, 22, 24];
const PADRAO = 16;
/** A prévia é um celular em escala: 16,5 px no app viram 11 px aqui. */
const ESCALA_DA_PREVIA = 11 / 16.5;


/** Hoje como o app escreve no alto da notícia: "4 de novembro de 2026". */
const hojePorExtenso = () =>
  new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

/**
 * Publicar no app do morador (0079 + 0082). À esquerda o que se escolhe: o
 * título (começa igual ao da folha e pode mudar só para o app), o comunicado
 * em PDF, fixar, e os anexos (vídeo, imagem e PDF, quantos quiser). À direita,
 * a prévia ao vivo, num celular, do jeito que o morador vai ver em Notícias.
 *
 * O texto vem da folha (texto puro, parágrafos por linha em branco) e pode
 * ser mexido na própria prévia: o texto, as quebras de linha (Enter) e o
 * tamanho da letra (23/11/2026). Muda só no app; a folha e o PDF continuam
 * como estão. Quem usa monta a janela só quando abre: cada abertura começa
 * do zero, com o título e o texto da folha.
 */
export default function PublicarNoApp({ open, onClose, tituloInicial, texto, gerarPdf, onPublicado }) {
  const [titulo, setTitulo] = useState(tituloInicial);
  const [textoApp, setTextoApp] = useState(texto ?? "");
  const [tamanho, setTamanho] = useState(null); // null = padrão do app
  const [comPdf, setComPdf] = useState(true);
  const [fixar, setFixar] = useState(false);
  const [anexos, setAnexos] = useState([]); // { id, arquivo, tipo, url }
  const [recusados, setRecusados] = useState([]);
  const [arrastando, setArrastando] = useState(false);
  const [envio, setEnvio] = useState(null); // null | { etapa, feitos, total }
  const entrada = useRef(null);
  const urls = useRef(new Set());

  // As miniaturas são endereços do próprio navegador: soltar ao sair.
  useEffect(() => {
    const guardadas = urls.current;
    return () => guardadas.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const paragrafos = useMemo(() => paragrafosDoTexto(textoApp), [textoApp]);
  const tituloLimpo = titulo.trim();
  const tituloOk = tituloLimpo.length >= 3 && tituloLimpo.length <= 160;
  const textoLimpo = textoApp.trim();
  const textoOk = textoLimpo.length >= 1 && textoLimpo.length <= 20000;
  const publicando = Boolean(envio);

  function acrescentar(lista) {
    const novos = [];
    const fora = [];
    for (const arquivo of lista) {
      const problema = problemaDoAnexo(arquivo);
      if (problema) { fora.push(`${arquivo.name}: ${problema}`); continue; }
      if (anexos.length + novos.length >= MAX_ANEXOS) { fora.push(`${arquivo.name}: até ${MAX_ANEXOS} anexos por notícia.`); continue; }
      const tipo = tipoDoAnexo(arquivo);
      const url = tipo === "pdf" ? null : URL.createObjectURL(arquivo);
      if (url) urls.current.add(url);
      novos.push({ id: `${Date.now()}-${Math.random()}`, arquivo, tipo, url });
    }
    setAnexos((a) => [...a, ...novos]);
    setRecusados(fora);
  }

  function tirar(id) {
    setAnexos((a) => {
      const sai = a.find((x) => x.id === id);
      if (sai?.url) { URL.revokeObjectURL(sai.url); urls.current.delete(sai.url); }
      return a.filter((x) => x.id !== id);
    });
  }

  function mover(i, passo) {
    setAnexos((a) => {
      const j = i + passo;
      if (j < 0 || j >= a.length) return a;
      const b = [...a];
      [b[i], b[j]] = [b[j], b[i]];
      return b;
    });
  }

  async function publicar() {
    if (!tituloOk || !textoOk || publicando) return;
    setEnvio({ etapa: comPdf ? "pdf" : "anexos", feitos: 0, total: anexos.length });
    let pdf = null;
    if (comPdf) {
      try {
        pdf = await gerarPdf();
      } catch (e) {
        console.error(e);
      }
    }
    setEnvio({ etapa: "anexos", feitos: 0, total: anexos.length });
    const r = await publicarNoticia({
      titulo: tituloLimpo,
      texto: textoLimpo,
      tamanhoTexto: tamanho,
      fixada: fixar,
      pdf,
      anexos: anexos.map((a) => a.arquivo),
      aoProgredir: (feitos, total) => setEnvio({ etapa: "anexos", feitos, total }),
    });
    setEnvio(null);
    onPublicado?.({ ...r, pdfFalhou: r.success && (r.semPdf || (comPdf && !pdf)) });
  }

  const textoDoBotao = !envio
    ? "Publicar no app"
    : envio.etapa === "pdf"
      ? "Gerando o PDF…"
      : envio.total
        ? `Enviando ${Math.min(envio.feitos + 1, envio.total)} de ${envio.total}…`
        : "Publicando…";

  return (
    <Modal
      open={open}
      onClose={() => !publicando && onClose()}
      title="Publicar no app do morador"
      size="lg"
      className="pub-modal"
      footer={
        <>
          {envio?.total > 0 && (
            <div className="pub-progresso" role="progressbar" aria-label="Enviando os anexos" aria-valuemin={0} aria-valuemax={envio.total} aria-valuenow={envio.feitos}>
              <span style={{ width: `${(envio.feitos / envio.total) * 100}%` }} />
            </div>
          )}
          <Button variant="ghost" onClick={onClose} disabled={publicando}>Cancelar</Button>
          <Button variant="primary" onClick={publicar} disabled={!tituloOk || !textoOk || publicando} iconLeft={<Smartphone size={16} />}>
            {textoDoBotao}
          </Button>
        </>
      }
    >
      <div className="pub">
        <div className="pub-form">
          <label className="pub-campo">
            <span className="pub-rotulo">Título no app</span>
            <Input
              className="pub-titulo"
              value={titulo}
              maxLength={160}
              disabled={publicando}
              onChange={(e) => setTitulo(e.target.value)}
              aria-invalid={!tituloOk}
              aria-describedby="pub-titulo-ajuda"
            />
            <span id="pub-titulo-ajuda" className={tituloOk ? "pub-ajuda" : "pub-ajuda pub-ajuda--erro"}>
              {tituloOk ? "Muda só no app; a folha e o PDF continuam com o título original." : "O título precisa de 3 a 160 caracteres."}
              <span className="pub-conta">{tituloLimpo.length}/160</span>
            </span>
          </label>

          <div className="pub-opcoes" role="group" aria-label="Opções">
            <Chave
              ligada={comPdf}
              onChange={setComPdf}
              disabled={publicando}
              icone={<FileText size={17} />}
              titulo="Anexar o comunicado em PDF"
              sub="A folha como está, com cores e negrito"
            />
            <Chave
              ligada={fixar}
              onChange={setFixar}
              disabled={publicando}
              icone={<Pin size={17} />}
              titulo="Fixar no topo"
              sub="Tira a fixada de agora"
            />
          </div>

          <div className="pub-campo">
            <span className="pub-rotulo" id="pub-anexos-rotulo">
              Anexos <small>{anexos.length ? `${anexos.length} de até ${MAX_ANEXOS}` : "vídeo, imagem ou PDF, até 50 MB cada"}</small>
            </span>
            <div
              className={arrastando ? "pub-soltar pub-soltar--em-cima" : "pub-soltar"}
              onDragOver={(e) => { e.preventDefault(); if (!publicando) setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                if (!publicando) acrescentar([...e.dataTransfer.files]);
              }}
            >
              <Upload size={20} aria-hidden="true" />
              <span>
                <strong>Arraste os arquivos aqui</strong> ou
              </span>
              <button type="button" className="pub-escolher" onClick={() => entrada.current?.click()} disabled={publicando}>
                Escolher arquivos
              </button>
              <Input
                ref={entrada}
                type="file"
                multiple
                accept={ACEITA}
                hidden
                aria-labelledby="pub-anexos-rotulo"
                onChange={(e) => { acrescentar([...e.target.files]); e.target.value = ""; }}
              />
            </div>

            {recusados.length > 0 && (
              <ul className="pub-recusados" role="alert">
                {recusados.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}

            {anexos.length > 0 && (
              <ol className="pub-lista" aria-label="Anexos, na ordem em que aparecem no app">
                {anexos.map((a, i) => {
                  const Icone = ICONE[a.tipo];
                  return (
                    <li key={a.id} className="pub-anexo">
                      <span className={`pub-mini pub-mini--${a.tipo}`} aria-hidden="true">
                        {a.tipo === "imagem" ? <img src={a.url} alt="" /> : <Icone size={18} />}
                      </span>
                      <span className="pub-anexo__nome">
                        <strong title={a.arquivo.name}>{a.arquivo.name}</strong>
                        <small>{ROTULO[a.tipo]} · {tamanhoLegivel(a.arquivo.size)}</small>
                      </span>
                      <span className="pub-anexo__acoes">
                        <button type="button" onClick={() => mover(i, -1)} disabled={i === 0 || publicando} aria-label={`Subir ${a.arquivo.name}`}><ArrowUp size={15} /></button>
                        <button type="button" onClick={() => mover(i, 1)} disabled={i === anexos.length - 1 || publicando} aria-label={`Descer ${a.arquivo.name}`}><ArrowDown size={15} /></button>
                        <button type="button" onClick={() => tirar(a.id)} disabled={publicando} aria-label={`Tirar ${a.arquivo.name}`}><X size={15} /></button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <Previa
          titulo={tituloLimpo || "Título da notícia"}
          paragrafos={paragrafos}
          comPdf={comPdf}
          fixar={fixar}
          anexos={anexos}
          texto={textoApp}
          onTexto={setTextoApp}
          textoMudou={textoApp !== (texto ?? "")}
          onRestaurar={() => setTextoApp(texto ?? "")}
          tamanho={tamanho}
          onTamanho={setTamanho}
          textoOk={textoOk}
          bloqueado={publicando}
        />
      </div>
    </Modal>
  );
}

/** Uma opção liga/desliga em cartão: o cartão inteiro é a chave. */
function Chave({ ligada, onChange, disabled, icone, titulo, sub }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      className={ligada ? "pub-chave pub-chave--on" : "pub-chave"}
      onClick={() => onChange(!ligada)}
      disabled={disabled}
    >
      <span className="pub-chave__ic" aria-hidden="true">{icone}</span>
      <span className="pub-chave__tx">
        <strong>{titulo}</strong>
        <small>{sub}</small>
      </span>
      <span className="pub-chave__trilho" aria-hidden="true"><span /></span>
    </button>
  );
}

/**
 * O celular: a notícia aberta como no app (cabeçalho verde com os prédios e a
 * folha embaixo). Cores fixas do app, não do tema deste sistema: é o que o
 * morador vê.
 */
export function Previa({ titulo, paragrafos, comPdf, fixar, anexos, texto, onTexto, textoMudou, onRestaurar, tamanho, onTamanho, textoOk, bloqueado, rotuloRestaurar = "Texto da folha", ajuda = "Muda só no app; a folha e o PDF continuam iguais." }) {
  const [editando, setEditando] = useState(false);
  const caixa = useRef(null);
  // A caixa de texto cresce com o que tem dentro, como a folha do app.
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editando, texto, tamanho]);
  const atual = tamanho ?? PADRAO;
  const passo = (d) => {
    const i = TAMANHOS.indexOf(atual);
    const prox = TAMANHOS[Math.min(TAMANHOS.length - 1, Math.max(0, (i < 0 ? TAMANHOS.indexOf(PADRAO) : i) + d))];
    onTamanho(prox === PADRAO ? null : prox);
  };
  const imagens = anexos.filter((a) => a.tipo === "imagem");
  const videos = anexos.filter((a) => a.tipo === "video");
  const pdfs = anexos.filter((a) => a.tipo === "pdf");
  return (
    <aside className="pub-previa" aria-label="Prévia no app do morador">
      <span className="pub-previa__rotulo"><Smartphone size={14} aria-hidden="true" /> Como fica no app</span>
      <div className="pub-texto-barra" role="toolbar" aria-label="Texto no app">
        <span className="pub-texto-barra__rotulo">Letra</span>
        <button type="button" onClick={() => passo(-1)} disabled={bloqueado || atual <= TAMANHOS[0]} aria-label="Diminuir a letra no app"><Minus size={14} /></button>
        <span className="pub-texto-barra__tam" aria-live="polite">{tamanho ? `${tamanho}px` : "Padrão"}</span>
        <button type="button" onClick={() => passo(1)} disabled={bloqueado || atual >= TAMANHOS[TAMANHOS.length - 1]} aria-label="Aumentar a letra no app"><Plus size={14} /></button>
        {textoMudou && (
          <button type="button" className="pub-texto-barra__volta" onClick={onRestaurar} disabled={bloqueado} title={`Voltar ao ${rotuloRestaurar.toLowerCase()}`}>
            <RotateCcw size={13} aria-hidden="true" /> {rotuloRestaurar}
          </button>
        )}
      </div>
      <p className="pub-ajuda pub-ajuda--previa">
        {editando
          ? "Enter quebra a linha; uma linha em branco começa outro parágrafo."
          : `Clique no texto do celular para editar. ${ajuda}`}
      </p>
      <div className="pub-cel">
        <div className="pub-cel__tela">
          <header className="pv-cab">
            <div className="pv-topo">
              <span className="pv-voltar">‹ Notícias</span>
              <span className="pv-comp"><Share2 size={11} aria-hidden="true" /> Compartilhar</span>
            </div>
            {fixar && <span className="pv-selo"><Pin size={10} aria-hidden="true" /> Fixada</span>}
            <small>{hojePorExtenso()}</small>
            <h3>{titulo}</h3>
            <svg className="pv-predios" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 40V22h18v-12h16v12h14V18h20v22zM70 40V8h18v32zM92 40V20h26v20zM122 40V4h16v36zM142 40V16h22v24zM168 40V12h20v28zM192 40V24h24v16zM220 40V6h16v34zM240 40V18h24v22zM268 40V10h14v30zM286 40V22h14v18z" />
            </svg>
          </header>
          <div className="pv-folha">
            <div className="pv-barra"><span className="pv-play" /> Ouvir notícia</div>
            <div className="pv-texto" style={tamanho ? { "--pv-tam": `${(tamanho * ESCALA_DA_PREVIA).toFixed(2)}px` } : undefined}>
              {editando ? (
                <textarea
                  ref={caixa}
                  className="pv-editor"
                  aria-label="Texto da notícia no app"
                  aria-invalid={!textoOk}
                  value={texto}
                  disabled={bloqueado}
                  onChange={(e) => onTexto(e.target.value)}
                  onBlur={() => setEditando(false)}
                  autoFocus
                />
              ) : (
                <button type="button" className="pv-texto__editar" onClick={() => setEditando(true)} disabled={bloqueado} aria-label="Editar o texto da notícia no app">
                  {paragrafos.length
                    ? paragrafos.map((linhas, i) => (
                        <p key={i}>{linhas.map((l, j) => <React.Fragment key={j}>{j > 0 && <br />}{l}</React.Fragment>)}</p>
                      ))
                    : <p className="pv-vazio">O texto da notícia aparece aqui. Clique para escrever.</p>}
                </button>
              )}
            </div>
            {imagens.length > 0 && (
              <div className={imagens.length === 1 ? "pv-galeria pv-galeria--uma" : "pv-galeria"}>
                {imagens.slice(0, 4).map((a, i) => (
                  <span key={a.id} className="pv-foto">
                    <img src={a.url} alt="" />
                    {i === 3 && imagens.length > 4 && <b>+{imagens.length - 4}</b>}
                  </span>
                ))}
              </div>
            )}
            {videos.map((a) => (
              <span key={a.id} className="pv-video">
                <video src={a.url} muted preload="metadata" playsInline />
                <span className="pv-video__play" aria-hidden="true" />
              </span>
            ))}
            {(comPdf || pdfs.length > 0) && (
              <div className="pv-pdfs">
                {comPdf && <span className="pv-pdf"><FileText size={12} /> Comunicado em PDF</span>}
                {pdfs.map((a) => <span key={a.id} className="pv-pdf"><Paperclip size={12} /> {a.arquivo.name}</span>)}
              </div>
            )}
            <div className="pv-assin"><span className="pv-nr">NR</span> Administração do Diduccio</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
