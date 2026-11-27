import React, { useState, useEffect, useRef } from "react";
import {
  PageHeader, useToast, useConfirm, Modal, Button, Field, Textarea, Input, Select, Badge,
} from "../ui";
import {
  Bot, Sparkles, Lightbulb, Share2, Download,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Undo, Redo, Eraser, Highlighter, FileText, Image, Printer,
  Smartphone, Pin, PinOff, EyeOff, Minus, Plus, ChevronRight,
} from "lucide-react";

// --- TIPTAP ---
import { useEditor, EditorContent } from '@tiptap/react';
import { limparColagem } from "../lib/colagem";
import StarterKit from '@tiptap/starter-kit';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { Extension } from '@tiptap/core';

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { chamarEdgeFunction, mensagemDaEdgeFunction } from "../api/edge";
import { listarNoticiasNoApp, fixarNoticia, retirarNoticia } from "../api/noticias";
import PublicarNoApp from "../components/comunicado/PublicarNoApp";
import NoticiasDoApp from "../components/comunicado/NoticiasDoApp";
import { Opcoes } from "../components/app/pecas";
import { dataHoraBR } from "../lib/format";
import { FORMATOS, alturaDaPaginaLonga, paginasDoCanvas } from "../lib/folha";
// O CSS da folha, em texto: a janela de impressão não tem o resto do CSS.
import cssDaFolha from "../styles/comunicado-folha.css?inline";

// As chamadas de IA passam pelo backend (proxy) para que as chaves NÃO fiquem no frontend.

/**
 * A folha tem 794px fixos (A4 a 96dpi) e NUNCA muda de largura: é isso que
 * garante que a tela mostre o mesmo que sai no PDF e na imagem. Para caber
 * em telas menores ela é reduzida por transform, não por reflow.
 */
const LARGURA_A4 = 794;
// A4 a 96 dpi: a altura MÍNIMA da folha. Sem a trava de A4 (23/11/2026), ela
// cresce com o texto; quem exporta escolhe se sai em folhas A4 ou numa
// página comprida (FORMATOS, lib/folha).
const ALTURA_A4 = 1123;
// O que vai para a imagem e o PDF: papel branco, sem a sombra da prévia (o
// canto transparente da sombra virava borda preta no JPEG). A altura é a da
// folha, seja qual for.
const OPCOES_DA_FOTO = { useCORS: true, backgroundColor: "#ffffff", width: LARGURA_A4, windowWidth: LARGURA_A4 };
const TONS = ["Formal", "Amigável", "Urgente"];
const TAMANHOS = [12, 14, 16, 18, 20, 24, 28];

/** O verde da marca (a rampa --brand não inverte no escuro): a cor do texto da folha. */
const corDaMarca = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--brand-700").trim() || "rgb(80, 42, 36)";

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize,
            renderHTML: (attributes) => (attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {}),
          },
        },
      },
    ];
  },
});

const escapeHtml = (str) => String(str ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

/** Um botão da barra de ferramentas. `ativo` vira aria-pressed (negrito, itálico). */
function Ferramenta({ rotulo, onClick, ativo, children }) {
  return (
    <button
      type="button"
      className="com-ferramenta"
      title={rotulo}
      aria-label={rotulo}
      aria-pressed={ativo == null ? undefined : ativo}
      onMouseDown={(e) => e.preventDefault() /* não tira a seleção do texto */}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function Comunicado() {
  const toast = useToast();
  const confirmar = useConfirm();
  const [prompt, setPrompt] = useState("");
  const [tom, setTom] = useState("Formal");
  const [isGerando, setIsGerando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [, forceUpdate] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontSize,
    ],
    content: "",
    editorProps: {
      attributes: { class: "com-folha__editor", "aria-label": "Texto do comunicado" },
      // Texto colado de fora (Word, WhatsApp, site) chega com a fonte, o
      // tamanho e a cor de lá; entra só a estrutura, na letra do comunicado.
      transformPastedHTML: limparColagem,
    },
    // A barra mostra negrito, itálico e tamanho de onde o cursor está.
    onSelectionUpdate: () => forceUpdate((v) => v + 1),
    onTransaction: () => forceUpdate((v) => v + 1),
  });

  // Data Automática Brasil
  const [dataAtual] = useState(() =>
    new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
  );

  const [modalExport, setModalExport] = useState(false);

  // Publicar no app do morador (0079 + 0082): o texto da folha em texto puro
  // (o app não mostra HTML), o título (que pode mudar só para o app), o
  // comunicado em PDF e os anexos. A janela é a PublicarNoApp.
  const [modalPublicar, setModalPublicar] = useState(false);
  // Todas as notícias (publicadas e arquivadas), para ver e editar (23/11/2026).
  const [modalNoticias, setModalNoticias] = useState(false);
  const [noApp, setNoApp] = useState({ carregando: true, lista: [] });

  const recarregarNoApp = async () => {
    const r = await listarNoticiasNoApp();
    setNoApp({ carregando: false, lista: r.data, erro: !r.success });
  };

  useEffect(() => {
    recarregarNoApp();
  }, []);

  const a4Ref = useRef();
  const palcoRef = useRef(null);
  const [escala, setEscala] = useState(1);
  // A folha cresce com o texto: a caixa da prévia acompanha a altura dela.
  const [alturaFolha, setAlturaFolha] = useState(ALTURA_A4);
  // Como sai o PDF e a impressão: em folhas A4 ou numa página comprida.
  const [formato, setFormato] = useState("a4");
  // A prévia do que vai sair, montada quando abre Exportar.
  const [previa, setPrevia] = useState(null);

  useEffect(() => {
    const palco = palcoRef.current;
    const folha = a4Ref.current;
    if (!palco || !folha) return;

    const medir = () => {
      // Mede o CONTAINER, não a janela: a lateral e o formulário ao lado já
      // comeram largura, e window.innerWidth ignorava os dois.
      const disponivel = palco.clientWidth - 2 * parseFloat(getComputedStyle(palco).paddingLeft || 0);
      // Antes do primeiro layout a largura é 0. Sem esta guarda a escala viraria
      // 0 e a folha sumiria da tela.
      if (disponivel <= 0) return;
      const nova = Math.min(1, disponivel / LARGURA_A4);
      setEscala((antes) => (Math.abs(antes - nova) < 0.002 ? antes : nova));
      // offsetHeight não sofre o transform: é a altura de verdade da folha.
      const altura = Math.max(ALTURA_A4, folha.offsetHeight);
      setAlturaFolha((antes) => (antes === altura ? antes : altura));
    };

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(palco);
    observador.observe(folha);
    // O texto cresce dentro da folha (que tem altura fixa): é ele que se mede.
    const texto = folha.querySelector(".com-folha__editor");
    if (texto) observador.observe(texto);
    return () => observador.disconnect();
  }, [editor]);

  const gerarComIA = async () => {
    if (!prompt.trim()) { toast.error("Descreva o assunto do comunicado antes de gerar."); return; }
    setIsGerando(true);

    try {
      // A chave da IA vive na Edge Function, nunca no navegador: chave no
      // bundle é chave publicada. Gemini com queda para o Groq, tudo no
      // servidor — a tela só recebe o texto ou o motivo de não ter recebido.
      const r = await chamarEdgeFunction("ia", { acao: "comunicado", prompt, tom });
      if (!r.ok) throw new Error(mensagemDaEdgeFunction(r, "Não foi possível gerar o conteúdo."));
      let textoBruto = r.corpo.texto || "";

      textoBruto = textoBruto.replace(/```html|```/gi, "").trim();

      if (textoBruto.includes("[TITULO]") && textoBruto.includes("[CORPO]")) {
        const partes = textoBruto.split("[CORPO]");
        const tituloExtraido = partes[0].replace("[TITULO]", "").replace("[CORPO]", "").trim();
        const corpoExtraido = partes[1].trim();

        setTitulo(tituloExtraido);
        if (editor) {
          editor.commands.setContent(corpoExtraido);
          editor.commands.setTextAlign('justify');
        }
      } else {
        const tituloFallback = prompt.toUpperCase() || "COMUNICADO IMPORTANTE";
        setTitulo(tituloFallback);
        if (editor) editor.commands.setContent(textoBruto);
      }
    } catch (err) {
      console.error(err);
      toast.error("A IA não conseguiu gerar o texto. Tente reescrever o assunto.");
    } finally {
      setIsGerando(false);
    }
  };

  if (!editor) return null;

  const getFontSize = () => {
    const attrs = editor.getAttributes('textStyle');
    return attrs.fontSize ? parseInt(attrs.fontSize) : 16; // padrão 16px
  };
  const mudarTamanho = (px) => editor.chain().focus().setMark('textStyle', { fontSize: `${px}px` }).run();

  /**
   * Uma cópia da folha fora da tela, em tamanho cheio, para virar imagem. A
   * cópia herda o `transform` da prévia: sem zerar, a imagem sairia no
   * tamanho encolhido da tela.
   */
  const copiaDaFolha = () => {
    const clone = a4Ref.current.cloneNode(true);
    Object.assign(clone.style, {
      position: "absolute", left: "-9999px", top: "0",
      transform: "none", margin: "0", boxShadow: "none",
      width: `${LARGURA_A4}px`, height: "auto", minHeight: `${ALTURA_A4}px`,
    });
    document.body.appendChild(clone);
    return clone;
  };

  // A folha em PDF (jsPDF). Baixar salva; publicar sobe junto com a notícia.
  // "a4": corta em folhas A4 sem partir linha de texto; "longa": uma página só,
  // da altura da folha.
  const gerarPDF = async (modo = formato) => {
    const clone = copiaDaFolha();
    try {
      const canvas = await html2canvas(clone, { ...OPCOES_DA_FOTO, scale: 2 });
      if (modo === "longa") {
        const altura = alturaDaPaginaLonga(canvas.width, canvas.height);
        const pdf = new jsPDF({ orientation: "p", unit: "mm", format: [210, altura] });
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, (210 * canvas.height) / canvas.width);
        return pdf;
      }
      const pdf = new jsPDF("p", "mm", "a4");
      paginasDoCanvas(canvas).forEach((pagina, i) => {
        if (i > 0) pdf.addPage("a4", "p");
        pdf.addImage(pagina.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
      });
      return pdf;
    } finally {
      document.body.removeChild(clone);
    }
  };

  /** A prévia de Exportar: a folha em miniatura, já cortada no formato escolhido. */
  const montarPrevia = async () => {
    setPrevia({ carregando: true });
    const clone = copiaDaFolha();
    try {
      const canvas = await html2canvas(clone, { ...OPCOES_DA_FOTO, scale: 0.5, logging: false });
      setPrevia({
        a4: paginasDoCanvas(canvas).map((p) => p.toDataURL("image/jpeg", 0.8)),
        longa: canvas.toDataURL("image/jpeg", 0.8),
        alturaMm: alturaDaPaginaLonga(canvas.width, canvas.height),
      });
    } catch (err) {
      console.error("Erro ao montar a prévia:", err);
      setPrevia({ erro: true });
    } finally {
      document.body.removeChild(clone);
    }
  };

  const abrirExportar = () => {
    setModalExport(true);
    montarPrevia();
  };

  const baixarPDF = async () => {
    const pdf = await gerarPDF();
    pdf.save("comunicado.pdf");
  };

  // Parágrafos separados por linha em branco: é o formato que o app lê.
  const textoParaOApp = () => editor.getText({ blockSeparator: "\n\n" }).trim();

  const abrirPublicar = () => {
    if (titulo.trim().length < 3) { toast.error("Escreva o título do comunicado antes de publicar."); return; }
    if (!textoParaOApp()) { toast.error("O comunicado está sem texto."); return; }
    setModalPublicar(true);
  };

  const pdfParaOApp = async () => (await gerarPDF()).output("blob");

  const aoPublicar = (r) => {
    if (!r.success) {
      toast.error("Não foi possível publicar no app. Confira a conexão e tente de novo.");
      return;
    }
    setModalPublicar(false);
    const faltou = [
      r.pdfFalhou && "o comunicado em PDF",
      r.falharam?.length && (r.falharam.length === 1 ? `o anexo ${r.falharam[0]}` : `${r.falharam.length} anexos`),
    ].filter(Boolean);
    if (faltou.length) toast.info(`Publicado no app, mas não subiu: ${faltou.join(" e ")}. O resto está lá.`);
    else toast.success("Publicado no app do morador.");
    recarregarNoApp();
  };

  const alternarFixada = async (n) => {
    const r = await fixarNoticia(n.id, !n.fixada);
    if (!r.success) { toast.error("Não foi possível mudar a fixada."); return; }
    recarregarNoApp();
  };

  const retirar = async (n) => {
    const ok = await confirmar({
      title: `Retirar "${n.titulo}" do app?`,
      description: "Some para os moradores na hora. A notícia fica guardada; não é apagada.",
      confirmLabel: "Retirar",
      danger: true,
    });
    if (!ok) return;
    const r = await retirarNoticia(n.id);
    if (!r.success) { toast.error("Não foi possível retirar a notícia."); return; }
    // Retirada vale na hora; o PDF é que fica baixável por quem já tinha aberto
    // se a troca de endereço (api/noticias.js) falhar.
    if (r.pdfNoAr) toast.info("Retirada do app. O PDF não mudou de endereço: quem já abriu ainda consegue baixar por até 1 hora.");
    else toast.success("Retirada do app.");
    recarregarNoApp();
  };

  const baixarImagem = async () => {
    const clone = copiaDaFolha();
    try {
      const canvas = await html2canvas(clone, { ...OPCOES_DA_FOTO, scale: 3, logging: false });
      const link = document.createElement("a");
      link.download = "comunicado.jpeg";
      link.href = canvas.toDataURL("image/jpeg", 1.0);
      link.click();
    } catch (err) {
      console.error("Erro ao gerar imagem:", err);
      toast.error("Não foi possível gerar a imagem do comunicado.");
    } finally {
      document.body.removeChild(clone);
    }
  };

  const imprimir = () => {
    // A folha inteira (com as classes) e o CSS dela: a janela nova não tem o
    // CSS do sistema. Sem o `transform` da prévia, e no tamanho do papel.
    const folha = a4Ref.current.outerHTML;
    const janela = window.open('', '', 'height=800,width=800');
    if (!janela) { toast.error("O navegador bloqueou a janela de impressão. Libere pop-ups para este site."); return; }

    janela.document.write(`
      <html>
        <head>
          <title>${escapeHtml(titulo || "Comunicado")}</title>
          <style>
            @page { size: ${formato === "longa" ? `210mm ${Math.round((210 * alturaFolha) / LARGURA_A4)}mm` : "A4"}; margin: 0; }
            body { margin: 0; padding: 0; background: white; font-family: Arial, sans-serif; }
            ${cssDaFolha}
            .com-folha {
              transform: none !important; width: 210mm; height: auto; min-height: 297mm; box-shadow: none;
              -webkit-print-color-adjust: exact; print-color-adjust: exact;
            }
            /* Em folhas A4: a linha de texto não se parte entre duas folhas. */
            .com-folha p, .com-folha li { break-inside: avoid; }
          </style>
        </head>
        <body>${folha}</body>
      </html>
    `);

    janela.document.close();
    janela.onload = () => {
      janela.focus();
      janela.print();
      janela.onafterprint = () => janela.close();
    };
  };

  const compartilharImagemWhatsApp = async () => {
    const clone = copiaDaFolha();
    try {
      const canvas = await html2canvas(clone, { ...OPCOES_DA_FOTO, scale: 2 });
      const image = canvas.toDataURL("image/jpeg", 0.95);
      const blob = await (await fetch(image)).blob();
      const arquivo = new File([blob], "comunicado.jpeg", { type: "image/jpeg" });

      // navigator.share com arquivo só existe no celular e em poucos
      // navegadores. Fora deles, baixa a imagem e avisa.
      if (navigator.canShare?.({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], title: titulo || "Comunicado" });
        } catch {
          // Cancelar o compartilhamento é escolha do usuário, não erro.
        }
        return;
      }

      const link = document.createElement("a");
      link.download = "comunicado.jpeg";
      link.href = image;
      link.click();
      toast.info("Seu navegador não compartilha direto. A imagem foi baixada — é só anexar no WhatsApp.");
    } catch (err) {
      console.error("Erro ao gerar imagem:", err);
      toast.error("Não foi possível gerar a imagem do comunicado.");
    } finally {
      document.body.removeChild(clone);
    }
  };

  const cmd = () => editor.chain().focus();
  const tamanho = getFontSize();
  const noAr = noApp.lista.length;
  // O cartão mostra as 5 mais recentes; o resto fica na janela "Notícias no app".
  const MOSTRAR_NO_CARTAO = 5;

  return (
    <div>
      <PageHeader
        title="Comunicado"
        meta={`Rascunho com IA, edição direto na folha${noApp.carregando ? "" : ` · ${noAr} ${noAr === 1 ? "notícia" : "notícias"} no app`}`}
        actions={
          <>
            <Button onClick={abrirPublicar} iconLeft={<Smartphone size={16} />}>
              Publicar no app
            </Button>
            <Button variant="primary" onClick={abrirExportar} iconLeft={<Download size={16} />}>
              Exportar
            </Button>
          </>
        }
      />

      <div className="com-grade">
        <aside className="com-lado">
          <section className="com-cartao" aria-labelledby="ia-titulo">
            <div className="com-cartao__topo">
              <span className="com-cartao__icone" aria-hidden="true"><Bot size={18} /></span>
              <h2 id="ia-titulo">Assistente de IA</h2>
            </div>
            <Field label="O que você quer comunicar?">
              <Textarea
                rows={5}
                placeholder="Ex.: manutenção da piscina na terça, das 8h às 12h"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </Field>
            <Field label="Tom de voz">
              <Opcoes rotulo="Tom de voz" valor={tom} onMudar={setTom} opcoes={TONS} />
            </Field>
            <Button variant="primary" className="com-gerar" iconLeft={<Sparkles size={16} />} loading={isGerando} onClick={gerarComIA}>
              {isGerando ? "Escrevendo…" : "Gerar comunicado"}
            </Button>
            <p className="com-dica">
              <Lightbulb size={16} aria-hidden="true" />
              <span>O texto aparece na folha ao lado. Clique em qualquer parte para editar, até no título.</span>
            </p>
          </section>

          <section className="com-cartao" aria-labelledby="no-app-titulo">
            {/* O topo do cartão abre a janela com todas as notícias, para ver e editar. */}
            <button type="button" className="com-cartao__topo com-cartao__abrir" onClick={() => setModalNoticias(true)} aria-label="Ver e editar as notícias do app">
              <span className="com-cartao__icone" aria-hidden="true"><Smartphone size={18} /></span>
              <h2 id="no-app-titulo">No app do morador</h2>
              {noAr > 0 && <Badge tone="brand">{noAr}</Badge>}
              <ChevronRight size={16} className="com-cartao__seta" aria-hidden="true" />
            </button>
            {noApp.carregando && <p className="com-nota">Carregando…</p>}
            {!noApp.carregando && noApp.erro && (
              <p role="alert" className="com-nota">Não foi possível ver as notícias do app agora.</p>
            )}
            {!noApp.carregando && !noApp.erro && noAr === 0 && (
              <p className="com-nota">Nenhuma notícia no app ainda.</p>
            )}
            {noAr > 0 && (
              <ul className="com-noapp">
                {noApp.lista.slice(0, MOSTRAR_NO_CARTAO).map((n) => (
                  <li key={n.id}>
                    <span className="com-noapp__texto">
                      <strong>
                        {n.fixada && <Pin size={12} aria-label="Fixada" />}
                        {n.titulo}
                      </strong>
                      <small>
                        {dataHoraBR(n.publicada_em).slice(0, 10)}
                        {n.caminho_pdf ? " · com PDF" : ""}
                        {n.anexos ? ` · ${n.anexos} ${n.anexos === 1 ? "anexo" : "anexos"}` : ""}
                      </small>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => alternarFixada(n)}
                      aria-label={n.fixada ? `Desafixar ${n.titulo}` : `Fixar ${n.titulo}`}
                      title={n.fixada ? "Desafixar" : "Fixar no topo"}
                    >
                      {n.fixada ? <PinOff size={15} /> : <Pin size={15} />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => retirar(n)} aria-label={`Retirar ${n.titulo}`} title="Retirar do app">
                      <EyeOff size={15} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {!noApp.carregando && !noApp.erro && (
              <Button variant="ghost" size="sm" className="com-ver-todas" onClick={() => setModalNoticias(true)} iconRight={<ChevronRight size={14} />}>
                {noAr > MOSTRAR_NO_CARTAO ? `Ver todas (${noAr}) e editar` : "Ver todas, editar e arquivadas"}
              </Button>
            )}
          </section>
        </aside>

        <section className="com-editor" aria-label="Folha do comunicado">
          <div className="com-ferramentas" role="toolbar" aria-label="Formatação do texto">
            <Ferramenta rotulo="Desfazer" onClick={() => cmd().undo().run()}><Undo size={16} /></Ferramenta>
            <Ferramenta rotulo="Refazer" onClick={() => cmd().redo().run()}><Redo size={16} /></Ferramenta>
            <span className="com-divisor" aria-hidden="true" />

            <Ferramenta rotulo="Negrito" ativo={editor.isActive('bold')} onClick={() => cmd().toggleBold().run()}><Bold size={16} /></Ferramenta>
            <Ferramenta rotulo="Itálico" ativo={editor.isActive('italic')} onClick={() => cmd().toggleItalic().run()}><Italic size={16} /></Ferramenta>
            <Ferramenta rotulo="Marca-texto" ativo={editor.isActive('highlight')} onClick={() => cmd().toggleHighlight().run()}><Highlighter size={16} /></Ferramenta>
            <Input
              type="color"
              className="com-cor"
              aria-label="Cor do texto"
              title="Cor do texto"
              onInput={(e) => cmd().setColor(e.target.value).run()}
            />
            <button
              type="button"
              className="com-cor-marca"
              aria-label="Cor da marca"
              title="Cor da marca"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => cmd().setColor(corDaMarca()).run()}
            />
            <span className="com-divisor" aria-hidden="true" />

            <Ferramenta rotulo="Alinhar à esquerda" ativo={editor.isActive({ textAlign: 'left' })} onClick={() => cmd().setTextAlign('left').run()}><AlignLeft size={16} /></Ferramenta>
            <Ferramenta rotulo="Centralizar" ativo={editor.isActive({ textAlign: 'center' })} onClick={() => cmd().setTextAlign('center').run()}><AlignCenter size={16} /></Ferramenta>
            <Ferramenta rotulo="Alinhar à direita" ativo={editor.isActive({ textAlign: 'right' })} onClick={() => cmd().setTextAlign('right').run()}><AlignRight size={16} /></Ferramenta>
            <Ferramenta rotulo="Justificar" ativo={editor.isActive({ textAlign: 'justify' })} onClick={() => cmd().setTextAlign('justify').run()}><AlignJustify size={16} /></Ferramenta>
            <span className="com-divisor" aria-hidden="true" />

            <Ferramenta rotulo="Lista com marcadores" ativo={editor.isActive('bulletList')} onClick={() => cmd().toggleBulletList().run()}><List size={16} /></Ferramenta>
            <Ferramenta rotulo="Lista numerada" ativo={editor.isActive('orderedList')} onClick={() => cmd().toggleOrderedList().run()}><ListOrdered size={16} /></Ferramenta>
            <Ferramenta rotulo="Limpar formatação" onClick={() => cmd().unsetAllMarks().run()}><Eraser size={16} /></Ferramenta>
            <span className="com-divisor" aria-hidden="true" />

            <Select
              className="com-tamanho"
              aria-label="Tamanho da letra"
              value={TAMANHOS.includes(tamanho) ? String(tamanho) : ""}
              onChange={(e) => e.target.value && mudarTamanho(e.target.value)}
            >
              <option value="">Tamanho</option>
              {TAMANHOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Ferramenta rotulo="Diminuir a letra" onClick={() => mudarTamanho(Math.max(10, tamanho - 1))}><Minus size={14} /></Ferramenta>
            <span className="com-tamanho-atual" aria-live="polite">{tamanho}px</span>
            <Ferramenta rotulo="Aumentar a letra" onClick={() => mudarTamanho(tamanho + 1)}><Plus size={14} /></Ferramenta>
          </div>

          <div ref={palcoRef} className="com-palco">
            {/* A caixa reserva no layout o tamanho JÁ REDUZIDO. Sem ela a
                folha continuaria ocupando o tamanho cheio e sobraria um vazio
                enorme embaixo em tela pequena. A altura acompanha a folha,
                que cresce com o texto; é calculada na hora, por isso o style. */}
            <div style={{ width: LARGURA_A4 * escala, height: alturaFolha * escala, flexShrink: 0 }}>
              <div ref={a4Ref} className="com-folha" style={{ transform: `scale(${escala})` }}>
                <div className="com-folha__topo">
                  <img className="com-folha__logo" src="/favicon.png" alt="Logo" />
                  <span className="com-folha__marca">DIDUCCIO</span>
                  <div className="com-folha__linha" />
                </div>

                <h2
                  className="com-folha__titulo"
                  contentEditable
                  suppressContentEditableWarning
                  aria-label="Título do comunicado"
                  onBlur={(e) => setTitulo(e.currentTarget.innerText.replace("COMUNICADO: ", ""))}
                  // Colar no título traria a fonte de fora junto: entra só o texto.
                  onPaste={(e) => {
                    e.preventDefault();
                    const texto = e.clipboardData.getData("text/plain").replace(/\s+/g, " ");
                    document.execCommand("insertText", false, texto);
                  }}
                >
                  {titulo ? `COMUNICADO: ${titulo}` : "AGUARDANDO TÍTULO..."}
                </h2>

                <p className="com-folha__data">Data: {dataAtual}</p>

                <div className="com-folha__corpo">
                  <EditorContent editor={editor} />

                  <div className="com-folha__assinatura">
                    <p>Atenciosamente,</p>
                    <div className="com-folha__traco" />
                    <strong>O Síndico</strong>
                    <span>Condomínio Diduccio</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {modalNoticias && (
        <NoticiasDoApp open onClose={() => setModalNoticias(false)} onMudou={recarregarNoApp} />
      )}

      {modalPublicar && (
        <PublicarNoApp
          open
          onClose={() => setModalPublicar(false)}
          tituloInicial={titulo}
          texto={textoParaOApp()}
          gerarPdf={pdfParaOApp}
          onPublicado={aoPublicar}
        />
      )}

      <Modal
        open={modalExport}
        onClose={() => setModalExport(false)}
        title="Exportar comunicado"
        size="md"
        footer={<Button variant="ghost" onClick={() => setModalExport(false)}>Fechar</Button>}
      >
        <Field label="Como sai o PDF e a impressão">
          <Opcoes rotulo="Formato do PDF e da impressão" valor={formato} onMudar={setFormato} opcoes={Object.entries(FORMATOS)} />
        </Field>
        <div className="com-previa" aria-live="polite">
          {(!previa || previa.carregando) && <p className="com-previa__nota">Montando a prévia…</p>}
          {previa?.erro && <p className="com-previa__nota">Não foi possível montar a prévia. O arquivo sai do mesmo jeito.</p>}
          {previa?.a4 && formato === "a4" && (
            <>
              <p className="com-previa__nota">
                Sai em <strong>{previa.a4.length} {previa.a4.length === 1 ? "folha A4" : "folhas A4"}</strong>, sem partir linha de texto entre uma folha e outra.
              </p>
              <div className="com-previa__paginas">
                {previa.a4.map((src, i) => (
                  <figure key={i} className="com-previa__pagina">
                    <img src={src} alt={`Folha ${i + 1}`} />
                    <figcaption>{i + 1}</figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
          {previa?.longa && formato === "longa" && (
            <>
              <p className="com-previa__nota">
                Sai em <strong>uma página de 210 × {previa.alturaMm} mm</strong>, com tudo junto. Boa para ver no celular; na impressora pode não caber numa folha.
              </p>
              <div className="com-previa__paginas">
                <figure className="com-previa__pagina com-previa__pagina--longa">
                  <img src={previa.longa} alt="Página comprida" />
                </figure>
              </div>
            </>
          )}
        </div>
        <p className="vit-modal__desc com-exporta">
          A imagem (JPEG) sai sempre com a folha inteira, numa imagem só.
        </p>

        <div className="com-saidas">
          <button type="button" className="com-saida" onClick={() => { baixarPDF(); setModalExport(false); }}>
            <FileText size={19} aria-hidden="true" />
            <span>
              <strong>Baixar PDF</strong>
              <small>Para imprimir ou anexar por e-mail</small>
            </span>
          </button>

          <button type="button" className="com-saida" onClick={() => { baixarImagem(); setModalExport(false); }}>
            <Image size={19} aria-hidden="true" />
            <span>
              <strong>Baixar JPEG</strong>
              <small>Imagem única, boa para o WhatsApp</small>
            </span>
          </button>

          <button type="button" className="com-saida" onClick={() => { compartilharImagemWhatsApp(); setModalExport(false); }}>
            <Share2 size={19} aria-hidden="true" />
            <span>
              <strong>Compartilhar</strong>
              <small>Abre o WhatsApp no celular; no computador baixa a imagem</small>
            </span>
          </button>

          <button type="button" className="com-saida" onClick={() => { imprimir(); setModalExport(false); }}>
            <Printer size={19} aria-hidden="true" />
            <span>
              <strong>Imprimir</strong>
              <small>Abre a caixa de impressão do navegador</small>
            </span>
          </button>
        </div>
      </Modal>
    </div>
  );
}
