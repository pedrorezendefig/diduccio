import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Eye, EyeOff, FileText, Film, ImageIcon, Pencil, Pin, PinOff, RotateCcw, Smartphone, Trash2, Upload } from "lucide-react";
import { Badge, Button, EmptyState, Input, Modal, useConfirm, useToast } from "../../ui";
import { Ficha, Filtros } from "../app/pecas";
import ListaQueAbre from "../confirmacoes/ListaQueAbre";
import {
  ACEITA_ANEXO, MAX_ANEXOS, acrescentarAnexosNaNoticia, anexosDaNoticia, editarNoticia, fixarNoticia,
  linkDoPdfDaNoticia, listarTodasAsNoticias, paragrafosDoTexto, problemaDoAnexo, republicarNoticia,
  retirarNoticia, tamanhoLegivel, tirarAnexoDaNoticia, tirarPdfDaNoticia,
} from "../../api/noticias";
import { Previa } from "./PublicarNoApp";
import { dataHoraBR } from "../../lib/format";
import "../../styles/publicar-app.css";

const COLUNAS = [
  { rotulo: "Notícia", largura: "minmax(0, 1fr)" },
  { rotulo: "Situação", largura: "120px" },
  { rotulo: "Publicada em", largura: "120px" },
];

const publicada = (n) => !n.retirada_em;
const situacao = (n) => (!publicada(n) ? { texto: "Arquivada", tom: "muted" } : n.fixada ? { texto: "Fixada", tom: "brand" } : { texto: "No app", tom: "positive" });
const dia = (iso) => dataHoraBR(iso).slice(0, 10);
const detalhes = (n) => [n.caminho_pdf && "com PDF", n.anexos ? `${n.anexos} ${n.anexos === 1 ? "anexo" : "anexos"}` : null].filter(Boolean).join(" · ");

/**
 * As notícias do app do morador, publicadas e arquivadas (23/11/2026): abre
 * pelo cartão "No app do morador" do Comunicado. Uma janela só, com três
 * telas: a lista (busca + pílulas), o ver (olho ou clique na linha) e o
 * editar (lápis), que usa o mesmo celular de prévia do Publicar no app:
 * título, texto, quebras de linha e tamanho da letra.
 */
export default function NoticiasDoApp({ open, onClose, onMudou }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [estado, setEstado] = useState({ carregando: true, lista: [] });
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("publicadas");
  const [tela, setTela] = useState({ qual: "lista" }); // { qual: "lista" | "ver" | "editar", id }
  const [salvando, setSalvando] = useState(false);

  const lerNoticias = (r) => ({ carregando: false, lista: r.data, erro: !r.success });
  const carregar = async () => setEstado(lerNoticias(await listarTodasAsNoticias()));
  useEffect(() => {
    let viva = true;
    listarTodasAsNoticias().then((r) => viva && setEstado(lerNoticias(r)));
    return () => { viva = false; };
  }, []);

  const conta = (f) => estado.lista.filter((n) => (f === "publicadas" ? publicada(n) : !publicada(n))).length;
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return estado.lista
      .filter((n) => (filtro === "publicadas" ? publicada(n) : !publicada(n)))
      .filter((n) => !termo || `${n.titulo} ${n.texto}`.toLowerCase().includes(termo));
  }, [estado.lista, filtro, busca]);

  const noticia = estado.lista.find((n) => n.id === tela.id);
  const voltar = () => setTela({ qual: "lista" });
  const depois = async (texto) => {
    toast.success(texto);
    await carregar();
    onMudou?.();
  };

  const alternarFixada = async (n) => {
    const r = await fixarNoticia(n.id, !n.fixada);
    if (!r.success) { toast.error("Não foi possível mudar a fixada."); return; }
    depois(n.fixada ? "Notícia desafixada." : "Notícia fixada no topo do app.");
  };

  const retirar = async (n) => {
    const ok = await confirmar({
      title: `Retirar "${n.titulo}" do app?`,
      description: "Some para os moradores na hora e vai para Arquivadas. Dá para publicar de novo depois.",
      confirmLabel: "Retirar",
      danger: true,
    });
    if (!ok) return;
    const r = await retirarNoticia(n.id);
    if (!r.success) { toast.error("Não foi possível retirar a notícia."); return; }
    depois("Retirada do app. Está em Arquivadas.");
  };

  const republicar = async (n) => {
    const r = await republicarNoticia(n.id);
    if (!r.success) { toast.error("Não foi possível publicar de novo."); return; }
    depois("Publicada de novo no app.");
  };

  const salvar = async (n, dados) => {
    setSalvando(true);
    const r = await editarNoticia(n.id, dados);
    setSalvando(false);
    if (!r.success) { toast.error("Não foi possível salvar. Confira a conexão e tente de novo."); return; }
    await depois(publicada(n) ? "Notícia atualizada no app." : "Notícia arquivada atualizada.");
    setTela({ qual: "ver", id: n.id });
  };

  // ---- Editar ----
  if (tela.qual === "editar" && noticia) {
    return <Editar noticia={noticia} salvando={salvando} onCancelar={() => setTela({ qual: "ver", id: noticia.id })} onSalvar={(d) => salvar(noticia, d)} onClose={onClose} open={open} onAnexoTirado={depois} />;
  }

  // ---- Ver ----
  if (tela.qual === "ver" && noticia) {
    const s = situacao(noticia);
    const viva = publicada(noticia);
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Notícia no app"
        size="lg"
        footer={
          <div className="app-modal__acoes">
            {viva
              ? <Button variant="danger" onClick={() => retirar(noticia)} iconLeft={<EyeOff size={16} />}>Retirar do app</Button>
              : <Button variant="secondary" onClick={() => republicar(noticia)} iconLeft={<RotateCcw size={16} />}>Publicar de novo</Button>}
            {viva && (
              <Button variant="ghost" onClick={() => alternarFixada(noticia)} iconLeft={noticia.fixada ? <PinOff size={16} /> : <Pin size={16} />}>
                {noticia.fixada ? "Desafixar" : "Fixar no topo"}
              </Button>
            )}
            <Button variant="ghost" onClick={voltar} iconLeft={<ArrowLeft size={16} />}>Voltar</Button>
            <Button variant="primary" onClick={() => setTela({ qual: "editar", id: noticia.id })} iconLeft={<Pencil size={16} />}>Editar</Button>
          </div>
        }
      >
        <div className="app-modal">
          <div className="app-modal__topo">
            <span className="com-noticia__icone" aria-hidden="true"><Smartphone size={20} /></span>
            <div className="app-modal__quem">
              <strong>{noticia.titulo}</strong>
              <small>Publicada em {dia(noticia.publicada_em)}{detalhes(noticia) ? ` · ${detalhes(noticia)}` : ""}</small>
              <span className="app-modal__selos"><Badge tone={s.tom}>{s.texto}</Badge></span>
            </div>
          </div>
          <div className="app-modal__colunas">
            <Ficha titulo="No app" itens={[
              ["Situação", s.texto],
              ["Letra", noticia.tamanho_texto ? `${noticia.tamanho_texto}px` : "Padrão"],
              !viva && ["Arquivada em", dia(noticia.retirada_em)],
            ]} />
          </div>
          <section className="com-noticia__texto" aria-label="Texto da notícia">
            {paragrafosDoTexto(noticia.texto).map((linhas, i) => (
              <p key={i}>{linhas.map((l, j) => <React.Fragment key={j}>{j > 0 && <br />}{l}</React.Fragment>)}</p>
            ))}
          </section>
          <AnexosDaNoticia key={`${noticia.id}-${noticia.caminho_pdf}-${noticia.anexos}`} noticia={noticia} onTirado={depois} />
        </div>
      </Modal>
    );
  }

  // ---- Lista ----
  return (
    <Modal open={open} onClose={onClose} title="Notícias no app" size="lg" footer={<Button variant="ghost" onClick={onClose}>Fechar</Button>}>
      <Filtros
        busca={busca}
        onBusca={setBusca}
        placeholder="Título ou texto da notícia"
        filtros={estado.carregando ? null : [["publicadas", "Publicadas", conta("publicadas")], ["arquivadas", "Arquivadas", conta("arquivadas")]]}
        filtro={filtro}
        onFiltro={setFiltro}
      />
      {estado.erro && <p role="alert" className="com-nota">Não foi possível carregar as notícias. Confira a conexão.</p>}
      {!estado.carregando && !estado.erro && filtradas.length === 0 ? (
        <EmptyState
          title={busca ? "Nenhuma notícia com essa busca" : filtro === "publicadas" ? "Nenhuma notícia no app" : "Nenhuma notícia arquivada"}
          description={busca ? "Tente outra palavra do título ou do texto." : filtro === "publicadas" ? "Publique pelo botão Publicar no app." : "As notícias retiradas do app aparecem aqui."}
        />
      ) : (
        <ListaQueAbre
          colunas={COLUNAS}
          larguraAcoes="96px"
          itens={filtradas}
          carregando={estado.carregando}
          chave={(n) => n.id}
          onAbrir={(n) => setTela({ qual: "ver", id: n.id })}
          rotuloDaLinha={(n) => `Ver a notícia ${n.titulo}`}
          celulas={(n) => [
            <span key="t" className="conf-duas">
              <strong>{n.fixada && publicada(n) && <Pin size={12} aria-label="Fixada" />} {n.titulo}</strong>
              {detalhes(n) && <small>{detalhes(n)}</small>}
            </span>,
            <Badge key="s" tone={situacao(n).tom}>{situacao(n).texto}</Badge>,
            <span key="d" className="conf-espera">{dia(n.publicada_em)}</span>,
          ]}
          acoes={(n) => (
            <>
              <Button variant="ghost" size="sm" aria-label={`Ver a notícia ${n.titulo}`} onClick={() => setTela({ qual: "ver", id: n.id })}><Eye size={16} /></Button>
              <Button variant="ghost" size="sm" aria-label={`Editar a notícia ${n.titulo}`} onClick={() => setTela({ qual: "editar", id: n.id })}><Pencil size={16} /></Button>
            </>
          )}
        />
      )}
    </Modal>
  );
}

/** Editar: título à esquerda; texto, quebras e letra no celular, como no Publicar no app. */
function Editar({ open, onClose, noticia, salvando, onCancelar, onSalvar, onAnexoTirado }) {
  const [titulo, setTitulo] = useState(noticia.titulo);
  const [anexos, setAnexos] = useState([]);
  const [texto, setTexto] = useState(noticia.texto);
  const [tamanho, setTamanho] = useState(noticia.tamanho_texto ?? null);
  const tituloLimpo = titulo.trim();
  const tituloOk = tituloLimpo.length >= 3 && tituloLimpo.length <= 160;
  const textoLimpo = texto.trim();
  const textoOk = textoLimpo.length >= 1 && textoLimpo.length <= 20000;
  const mudou = tituloLimpo !== noticia.titulo || textoLimpo !== noticia.texto.trim() || (tamanho ?? null) !== (noticia.tamanho_texto ?? null);
  const paragrafos = useMemo(() => paragrafosDoTexto(texto), [texto]);

  return (
    <Modal
      open={open}
      onClose={() => !salvando && onClose()}
      title="Editar notícia"
      size="lg"
      className="pub-modal"
      footer={
        <>
          <Button variant="ghost" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button type="submit" form="editar-noticia" variant="primary" loading={salvando} disabled={!tituloOk || !textoOk || !mudou}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="editar-noticia" className="pub" onSubmit={(e) => { e.preventDefault(); if (tituloOk && textoOk && mudou) onSalvar({ titulo: tituloLimpo, texto: textoLimpo, tamanhoTexto: tamanho }); }}>
        <div className="pub-form">
          <label className="pub-campo">
            <span className="pub-rotulo">Título no app</span>
            <Input value={titulo} maxLength={160} disabled={salvando} onChange={(e) => setTitulo(e.target.value)} aria-invalid={!tituloOk} aria-describedby="edn-titulo-ajuda" />
            <span id="edn-titulo-ajuda" className={tituloOk ? "pub-ajuda" : "pub-ajuda pub-ajuda--erro"}>
              {tituloOk ? "O morador vê a mudança na próxima vez que abrir a notícia." : "O título precisa de 3 a 160 caracteres."}
              <span className="pub-conta">{tituloLimpo.length}/160</span>
            </span>
          </label>
          <p className="pub-ajuda">
            {publicada(noticia) ? "A notícia segue no app enquanto você edita." : "Ela continua arquivada; publique de novo pela tela anterior."}
          </p>
          <AnexosDaNoticia key={`${noticia.id}-${noticia.caminho_pdf}-${noticia.anexos}`} noticia={noticia} onTirado={onAnexoTirado} onCarregou={setAnexos} bloqueado={salvando} podeAcrescentar />
        </div>
        <Previa
          titulo={tituloLimpo || "Título da notícia"}
          paragrafos={paragrafos}
          comPdf={Boolean(noticia.caminho_pdf)}
          fixar={noticia.fixada && publicada(noticia)}
          anexos={anexos.map((a) => ({ id: a.id, tipo: a.tipo, url: a.url, arquivo: { name: a.nome } }))}
          texto={texto}
          onTexto={setTexto}
          textoMudou={texto !== noticia.texto}
          onRestaurar={() => setTexto(noticia.texto)}
          tamanho={tamanho}
          onTamanho={setTamanho}
          textoOk={textoOk}
          bloqueado={salvando}
          rotuloRestaurar="Texto publicado"
          ajuda="O morador vê a mudança na próxima vez que abrir."
        />
      </form>
    </Modal>
  );
}

const ICONE = { imagem: ImageIcon, video: Film, pdf: FileText };
const ROTULO = { imagem: "Imagem", video: "Vídeo", pdf: "Documento PDF" };

/**
 * Os anexos de uma notícia publicada (23/11/2026): o PDF do comunicado e as
 * fotos, vídeos e documentos, com abrir e tirar. Tirar vale na hora (some do
 * app) e pede confirmação; não dá para desfazer.
 *
 * No editar (`podeAcrescentar`), entram arquivos novos, depois dos que já
 * existem. Também valem na hora: sobem e aparecem no app sem o Salvar.
 */
function AnexosDaNoticia({ noticia, onTirado, onCarregou, bloqueado = false, podeAcrescentar = false }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [estado, setEstado] = useState({ carregando: true, lista: [] });
  const [tirando, setTirando] = useState(null);
  const [envio, setEnvio] = useState(null); // null | { feitos, total }
  const [recusados, setRecusados] = useState([]);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef(null);
  const enviando = Boolean(envio);

  const acrescentar = async (arquivos) => {
    if (enviando || estado.carregando) return;
    const vao = [];
    const fora = [];
    for (const arquivo of arquivos) {
      const problema = problemaDoAnexo(arquivo);
      if (problema) { fora.push(`${arquivo.name}: ${problema}`); continue; }
      if (estado.lista.length + vao.length >= MAX_ANEXOS) { fora.push(`${arquivo.name}: até ${MAX_ANEXOS} anexos por notícia.`); continue; }
      vao.push(arquivo);
    }
    setRecusados(fora);
    if (!vao.length) return;
    const ordemInicial = estado.lista.reduce((m, a) => Math.max(m, (a.ordem ?? 0) + 1), 0);
    setEnvio({ feitos: 0, total: vao.length });
    const r = await acrescentarAnexosNaNoticia(noticia.id, vao, {
      ordemInicial,
      aoProgredir: (feitos, total) => setEnvio({ feitos, total }),
    });
    setEnvio(null);
    // Avisa por toast: a lista recarrega (e este bloco remonta) logo depois.
    if (r.falharam.length) toast.error(`Não subiu: ${r.falharam.join(", ")}. Confira a conexão e tente de novo.`);
    if (!r.success) return;
    const foram = vao.length - r.falharam.length;
    onTirado?.(foram === 1 ? "Arquivo acrescentado à notícia." : `${foram} arquivos acrescentados à notícia.`);
  };

  useEffect(() => {
    let viva = true;
    anexosDaNoticia(noticia.id).then((r) => {
      if (!viva) return;
      setEstado({ carregando: false, lista: r.data, erro: !r.success });
      onCarregou?.(r.data);
    });
    return () => { viva = false; };
    // A chave do componente muda quando a notícia muda: carregar uma vez basta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrir = async (url) => {
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("Não foi possível abrir o arquivo.");
  };
  const abrirPdf = async () => abrir(await linkDoPdfDaNoticia(noticia.caminho_pdf));

  const tirar = async (item) => {
    const nome = item === "pdf" ? "o comunicado em PDF" : `"${item.nome}"`;
    const ok = await confirmar({
      title: `Tirar ${nome} da notícia?`,
      description: "Some do app do morador na hora. Não dá para desfazer; para voltar, acrescente o arquivo de novo no Editar.",
      confirmLabel: "Tirar",
      danger: true,
    });
    if (!ok) return;
    setTirando(item === "pdf" ? "pdf" : item.id);
    const r = item === "pdf" ? await tirarPdfDaNoticia(noticia.id, noticia.caminho_pdf) : await tirarAnexoDaNoticia(item);
    setTirando(null);
    if (!r.success) { toast.error("Não foi possível tirar o anexo. Confira a conexão e tente de novo."); return; }
    onTirado?.(item === "pdf" ? "Comunicado em PDF tirado da notícia." : "Anexo tirado da notícia.");
  };

  const total = estado.lista.length + (noticia.caminho_pdf ? 1 : 0);
  return (
    <section className="pub-campo com-noticia__anexos" aria-labelledby={`anexos-${noticia.id}`}>
      <span className="pub-rotulo" id={`anexos-${noticia.id}`}>
        Anexos <small>{estado.carregando ? "carregando…" : total ? `${total} no app` : "nenhum"}</small>
      </span>
      {estado.erro && <p role="alert" className="pub-ajuda pub-ajuda--erro">Não foi possível carregar os anexos.</p>}
      {!estado.carregando && total === 0 && <p className="pub-ajuda">Esta notícia não tem foto, vídeo nem documento.</p>}
      {total > 0 && (
        <ol className="pub-lista" aria-label="Anexos da notícia">
          {noticia.caminho_pdf && (
            <li className="pub-anexo">
              <span className="pub-mini pub-mini--pdf" aria-hidden="true"><FileText size={18} /></span>
              <span className="pub-anexo__nome"><strong>Comunicado em PDF</strong><small>A folha do comunicado</small></span>
              <span className="pub-anexo__acoes">
                <button type="button" onClick={abrirPdf} aria-label="Abrir o comunicado em PDF"><ExternalLink size={15} /></button>
                <button type="button" onClick={() => tirar("pdf")} disabled={bloqueado || tirando != null} aria-label="Tirar o comunicado em PDF"><Trash2 size={15} /></button>
              </span>
            </li>
          )}
          {estado.lista.map((a) => {
            const Icone = ICONE[a.tipo] ?? FileText;
            return (
              <li key={a.id} className="pub-anexo">
                <span className={`pub-mini pub-mini--${a.tipo}`} aria-hidden="true">
                  {a.tipo === "imagem" && a.url ? <img src={a.url} alt="" /> : <Icone size={18} />}
                </span>
                <span className="pub-anexo__nome">
                  <strong title={a.nome}>{a.nome}</strong>
                  <small>{ROTULO[a.tipo] ?? "Arquivo"} · {tamanhoLegivel(a.tamanho)}</small>
                </span>
                <span className="pub-anexo__acoes">
                  <button type="button" onClick={() => abrir(a.url)} aria-label={`Abrir ${a.nome}`}><ExternalLink size={15} /></button>
                  <button type="button" onClick={() => tirar(a)} disabled={bloqueado || tirando != null} aria-label={`Tirar ${a.nome}`}><Trash2 size={15} /></button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {podeAcrescentar && (
        <>
          <div
            className={arrastando ? "pub-soltar pub-soltar--em-cima" : "pub-soltar"}
            onDragOver={(e) => { e.preventDefault(); if (!enviando && !bloqueado) setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              if (!bloqueado) acrescentar([...e.dataTransfer.files]);
            }}
          >
            <Upload size={20} aria-hidden="true" />
            <span>
              {enviando
                ? <strong>Enviando {Math.min(envio.feitos + 1, envio.total)} de {envio.total}…</strong>
                : <><strong>Acrescentar arquivos</strong>: arraste aqui ou</>}
            </span>
            <button type="button" className="pub-escolher" onClick={() => entrada.current?.click()} disabled={enviando || bloqueado || estado.carregando}>
              Escolher arquivos
            </button>
            <Input
              ref={entrada}
              type="file"
              multiple
              accept={ACEITA_ANEXO}
              hidden
              aria-label="Acrescentar arquivos à notícia"
              onChange={(e) => { acrescentar([...e.target.files]); e.target.value = ""; }}
            />
          </div>
          {enviando && (
            <div className="pub-progresso" role="progressbar" aria-label="Enviando os arquivos" aria-valuemin={0} aria-valuemax={envio.total} aria-valuenow={envio.feitos}>
              <span style={{ width: `${(envio.feitos / envio.total) * 100}%` }} />
            </div>
          )}
          {recusados.length > 0 && (
            <ul className="pub-recusados" role="alert">
              {recusados.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          <p className="pub-ajuda">Vídeo, imagem ou PDF, até 50 MB cada. Entra no app na hora, sem precisar salvar.</p>
        </>
      )}
    </section>
  );
}
