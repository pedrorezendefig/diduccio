import React, { useState, useEffect } from "react";
import { useTheme } from "../theme/useTheme";
import { PageHeader, useToast, Modal, Button } from "../ui";
import {
  Bot, Sparkles, Lightbulb, Share2, Download,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Type, List, ListOrdered, Quote, Undo, Redo, Eraser, Highlighter,FileText, Image, Printer
} from "lucide-react";

// --- NOVOS IMPORTS TIPTAP ---
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';

import { Extension } from '@tiptap/core';

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useRef } from "react";
import { chamarEdgeFunction, mensagemDaEdgeFunction } from "../api/edge";

// As chamadas de IA passam pelo backend (proxy) para que as chaves NÃO fiquem no frontend.

export default function Comunicado() {
  const { theme } = useTheme();
  const toast = useToast();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [prompt, setPrompt] = useState("");
  const [tom, setTom] = useState("Formal");
  const [isGerando, setIsGerando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [, forceUpdate] = useState(0);

  // Verde da marca ViT. O comunicado impresso já nascia verde-escuro,
  // então alinhar ao token não muda a identidade do documento.
  const COR_TURQUESA = "#B33320";

  // Tintas fixas do documento. A folha e branca nos dois temas, entao nada
  // aqui pode usar var(--fg-*): no escuro o texto saia branco no branco,
  // inclusive no PDF e na imagem exportados.
  const TINTA_FRACA = "#63675F";

  const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize,
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {};
              }

              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },
});

  // --- CONFIGURAÇÃO DO EDITOR TIPTAP ---
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontSize, // 🔥 ADICIONADO AQUI
    ],
    content: "", 
    editorProps: {
      attributes: {
        style: 'outline: none; min-height: 200px; padding: 5px; width: 100%;',
      },
    },
  });

  // Data Automática Brasil
  const [dataAtual] = useState(() => {
    return new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  });

const [modalExport, setModalExport] = useState(false);
const a4Ref = useRef();
const palcoRef = useRef(null);

/**
 * A folha tem 794px fixos (A4 a 96dpi) e NUNCA muda de largura: é isso que
 * garante que a tela mostre o mesmo que sai no PDF e na imagem. Para caber
 * em telas menores ela é reduzida por transform, não por reflow.
 */
const LARGURA_A4 = 794;
const [escala, setEscala] = useState(1);
const [alturaFolha, setAlturaFolha] = useState(1123);

useEffect(() => {
  const palco = palcoRef.current;
  const folha = a4Ref.current;
  if (!palco || !folha) return;

  const medir = () => {
    // Mede o CONTAINER, não a janela: a lateral e o formulário ao lado já
    // comeram largura, e window.innerWidth ignorava os dois.
    const disponivel = palco.clientWidth;
    // Antes do primeiro layout a largura é 0. Sem esta guarda a escala viraria
    // 0 e a folha sumiria da tela.
    if (disponivel <= 0) return;
    const nova = Math.min(1, disponivel / LARGURA_A4);
    setEscala((antes) => (Math.abs(antes - nova) < 0.002 ? antes : nova));
    // Altura medida, não os 1123px de uma página: o comunicado cresce com o
    // texto, e o valor fixo deixava sobra ou corte quando passava de uma folha.
    setAlturaFolha((antes) => (antes === folha.offsetHeight ? antes : folha.offsetHeight));
  };

  medir();
  const observador = new ResizeObserver(medir);
  observador.observe(palco);
  observador.observe(folha);
  return () => observador.disconnect();
}, []);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

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
        // ATUALIZAÇÃO DO TIPTAP
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

  const baixarPDF = async () => {
  const element = a4Ref.current;
  const clone = element.cloneNode(true);
  Object.assign(clone.style, {
    position: "absolute", left: "-9999px", top: "0",
    transform: "none", transformOrigin: "top left",
    width: "794px", height: "auto", minHeight: "1123px",
    padding: "20mm", backgroundColor: "#fff", display: "flex", flexDirection: "column"
  });
  document.body.appendChild(clone);

  const canvas = await html2canvas(clone, { scale: 2, useCORS: true, width: 794, windowWidth: 794 });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  pdf.addImage(imgData, "PNG", 0, 0, 210, 297);
  pdf.save("comunicado.pdf");
  document.body.removeChild(clone);
};

const baixarImagem = async () => {
  const element = a4Ref.current;
  
  // 1. Criar um clone do elemento A4
  const clone = element.cloneNode(true);
  
  // 2. Estilizar o clone para garantir que ele seja um A4 perfeito
  // Independentemente de onde ele esteja sendo renderizado
  Object.assign(clone.style, {
    position: "absolute",
    left: "-9999px",
    top: "0",
    // Zera a redução da prévia. O clone herda o style inline do original, e
    // sem isto a imagem sairia no tamanho encolhido da tela.
    transform: "none",
    transformOrigin: "top left",
    width: "794px",      // Largura exata de um A4 em 96dpi
    height: "auto",      // Deixa crescer conforme o texto
    minHeight: "1123px",
    margin: "0",
    padding: "20mm",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#fff",
  });

  // 3. Opcional: Se você usa fontes específicas ou estilos globais, 
  // certifique-se de que o clone os herde anexando-o ao body
  document.body.appendChild(clone);

  try {
    const canvas = await html2canvas(clone, {
      scale: 3,
      useCORS: true,
      logging: false,
      width: 794,
      height: clone.offsetHeight,
      windowWidth: 794, // Força o layout de desktop dentro do canvas
    });

    const link = document.createElement("a");
    link.download = "comunicado.jpeg";
    link.href = canvas.toDataURL("image/jpeg", 1.0);
    link.click();
  } catch (err) {
    console.error("Erro ao gerar imagem:", err);
  } finally {
    // 4. Remover o clone do DOM
    document.body.removeChild(clone);
  }
};

const escapeHtml = (str) => String(str ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const imprimir = () => {
  const conteudo = a4Ref.current.innerHTML;
  const tituloDocumento = titulo || "Comunicado";

  const janela = window.open('', '', 'height=800,width=800');

  janela.document.write(`
    <html>
      <head>
        <title>${escapeHtml(tituloDocumento)}</title>
        <style>
          @page { size: A4; margin: 0; }
          body { margin: 0; padding: 0; background-color: white; font-family: Arial, sans-serif; }
          
          .print-container {
            width: 210mm;
            height: 297mm;
            padding: 20mm;
            margin: 0 auto;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            position: relative;
            background-color: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Alinhamento da Assinatura */
          div[style*="margin-top: auto"] { 
            margin-top: auto !important; 
          }

          /* Linha do Cabeçalho - Ajustada para o modelo original */
          div[style*="height: 2px"][style*="opacity: 0.2"] {
            height: 2px !important;
            background-color: ${COR_TURQUESA} !important;
            opacity: 0.2 !important;
            display: block !important;
          }

          /* Linha da Assinatura - Ajustada para o modelo original */
          div[style*="width: 200px"][style*="height: 1px"] {
            width: 200px !important;
            height: 1px !important;
            background-color: ${COR_TURQUESA} !important;
            opacity: 0.3 !important;
            margin: 40px auto 10px auto !important;
            display: block !important;
          }

          h2 { color: ${COR_TURQUESA} !important; text-align: center; margin-bottom: 10px; }
          strong { color: ${COR_TURQUESA} !important; }
          img { width: 90px; height: 90px; display: block; margin: 0 auto; }
          
          /* Garante que o texto do corpo respeite as quebras */
          .ProseMirror { white-space: pre-wrap; word-bundle: break-word; }
        </style>
      </head>
      <body>
        <div class="print-container">
          ${conteudo}
        </div>
      </body>
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
  const element = a4Ref.current;
  const clone = element.cloneNode(true);
  Object.assign(clone.style, {
    position: "absolute", left: "-9999px", top: "0",
    transform: "none", transformOrigin: "top left",
    width: "794px", height: "auto", padding: "20mm", backgroundColor: "#fff"
  });
  document.body.appendChild(clone);

  try {
    const canvas = await html2canvas(clone, { scale: 2, useCORS: true, width: 794, windowWidth: 794 });
    const image = canvas.toDataURL("image/jpeg", 0.95);
    const blob = await (await fetch(image)).blob();
    const arquivo = new File([blob], "comunicado.jpeg", { type: "image/jpeg" });

    // navigator.share com arquivo só existe no celular e em poucos
    // navegadores. Antes, fora deles a função terminava sem fazer nada e sem
    // avisar: o botão simplesmente não respondia.
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

  return (
    <div style={{ padding: "10px", paddingTop: isMobile ? 56 : 10 }}>
      <PageHeader
        title="Comunicado"
        meta="Gere um rascunho com IA e edite direto na folha antes de exportar"
        actions={
          <Button variant="primary" onClick={() => setModalExport(true)} iconLeft={<Download size={16} />}>
            Exportar
          </Button>
        }
      />

      <div style={contentGrid}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ ...sectionCard, backgroundColor: theme.mainBg, borderColor: theme.border }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Bot size={22} color={COR_TURQUESA} />
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: theme.text }}>Assistente de IA</h3>
            </div>

            <label style={labelStyle}>O que você quer comunicar?</label>
            <textarea 
              style={{ ...textAreaStyle, backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }}
              placeholder="Ex: Manutenção da piscina..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />

            <label style={labelStyle}>Tom de Voz</label>
            <select 
              style={{ ...selectStyle, backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }}
              value={tom}
              onChange={(e) => setTom(e.target.value)}
            >
              <option value="Formal">Formal</option>
              <option value="Amigável">Amigável</option>
              <option value="Urgente">Urgente</option>
            </select>

            <button 
              onClick={gerarComIA}
              disabled={isGerando}
              style={{...btnGerar, backgroundColor: isGerando ? "var(--fg-muted)" : COR_TURQUESA}}
            >
              <Sparkles size={18} />
              {isGerando ? "Processando..." : "Gerar Comunicado"}
            </button>
          </div>

          <div style={{ ...dicaCard, backgroundColor: "var(--brand-50)", borderColor: "var(--brand-200)" }}>
            <Lightbulb size={20} color={COR_TURQUESA} />
            <p style={{ color: COR_TURQUESA, fontSize: '13px', margin: 0 }}>
              O texto da IA aparecerá dentro da folha. Você pode clicar e editar qualquer parte.
            </p>
          </div>
        </div>

        <div style={{ ...sectionCard, backgroundColor: theme.mainBg, borderColor: theme.border, padding: 0 }}>
          <div style={previewHeader}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
              
              {/* HISTÓRICO */}
              <button onClick={() => editor.chain().focus().undo().run()} style={btnToolbar}><Undo size={16}/></button>
              <button onClick={() => editor.chain().focus().redo().run()} style={btnToolbar}><Redo size={16}/></button>
              <div style={divisor} />

              {/* FORMATAÇÃO */}
              <button 
                onClick={() => editor.chain().focus().toggleBold().run()} 
                style={{...btnToolbar, backgroundColor: editor.isActive('bold') ? 'var(--brand-100)' : 'var(--surface-2)'}}
              >
                <Bold size={16}/>
              </button>
              <button 
                onClick={() => editor.chain().focus().toggleItalic().run()} 
                style={{...btnToolbar, backgroundColor: editor.isActive('italic') ? 'var(--brand-100)' : 'var(--surface-2)'}}
              >
                <Italic size={16}/>
              </button>
              <button onClick={() => editor.chain().focus().toggleHighlight().run()} style={btnToolbar}><Highlighter size={16}/></button>
              
              <input 
                type="color" 
                onInput={e => editor.chain().focus().setColor(e.target.value).run()}
                style={{ width: '25px', height: '25px', border: 'none', background: 'none', cursor: 'pointer' }}
              />

              <button
  onClick={() => editor.chain().focus().setColor(COR_TURQUESA).run()}
  style={{
    width: '25px',
    height: '25px',
    borderRadius: '6px',
    background: COR_TURQUESA,
    border: '1px solid var(--border)',
    cursor: 'pointer'
  }}
  title="Cor padrão do sistema"
/>

              <div style={divisor} />

              {/* ALINHAMENTO */}
              <button onClick={() => editor.chain().focus().setTextAlign('left').run()} style={btnToolbar}><AlignLeft size={16}/></button>
              <button onClick={() => editor.chain().focus().setTextAlign('center').run()} style={btnToolbar}><AlignCenter size={16}/></button>
              <button onClick={() => editor.chain().focus().setTextAlign('right').run()} style={btnToolbar}><AlignRight size={16}/></button>
              <button onClick={() => editor.chain().focus().setTextAlign('justify').run()} style={btnToolbar}><AlignJustify size={16}/></button>

              <div style={divisor} />

              {/* EXTRAS */}
              <button onClick={() => editor.chain().focus().toggleBulletList().run()} style={btnToolbar}><List size={16}/></button>
              <button onClick={() => editor.chain().focus().toggleOrderedList().run()} style={btnToolbar}><ListOrdered size={16}/></button>
              <button onClick={() => editor.chain().focus().unsetAllMarks().run()} style={btnToolbar} title="Limpar"><Eraser size={16}/></button>
              <select
  onChange={(e) => {
    editor.chain().focus().setMark('textStyle', { fontSize: e.target.value }).run();
  }}
  style={{
    padding: '5px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    fontSize: '12px'
  }}
>
  <option value="">Tamanho</option>
  <option value="12px">12</option>
  <option value="14px">14</option>
  <option value="16px">16</option>
  <option value="18px">18</option>
  <option value="20px">20</option>
  <option value="24px">24</option>
  <option value="28px">28</option>
</select>
{/* DIMINUIR */}
  <button
    onClick={() => {
  const current = getFontSize();
  const newSize = Math.max(10, current - 1);

  editor.chain().focus().setMark('textStyle', {
    fontSize: `${newSize}px`
  }).run();

  forceUpdate(v => v + 1);
}}
    style={btnToolbar}
    title="Diminuir fonte"
  >
    ➖
  </button>

  {/* MOSTRAR TAMANHO */}
  <span style={{ fontSize: '12px', minWidth: '30px', textAlign: 'center', color: '#333' }}>
    {getFontSize()}px
  </span>

  {/* AUMENTAR */}
  <button
    onClick={() => {
  const current = getFontSize();
  const newSize = current + 1;

  editor.chain().focus().setMark('textStyle', {
    fontSize: `${newSize}px`
  }).run();

  forceUpdate(v => v + 1);
}}
    style={btnToolbar}
    title="Aumentar fonte"
  >
    ➕
  </button>
            </div>
          </div>

          <div ref={palcoRef} style={previewContent}>
            {/* A caixa reserva no layout o tamanho JÁ REDUZIDO. Sem ela a
                folha continuaria ocupando 794x1123 de espaço e sobraria um
                vazio enorme embaixo em tela pequena. */}
            <div
              style={{
                width: LARGURA_A4 * escala,
                height: alturaFolha * escala,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  ...a4Paper,
                  transform: `scale(${escala})`,
                  transformOrigin: 'top left',
                }}
                ref={a4Ref}
              >
              <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <div style={{ ...logoWrapper, marginTop: '-30px' }}>
                  <img src="/favicon.png" alt="Logo" style={{ width: '90px', height: '90px' }} />
                </div>
                <span style={{ fontSize: '12px', fontWeight: '800', color: COR_TURQUESA, letterSpacing: '2px' }}>
                    DIDUCCIO
                </span>
                <div style={{ height: '2px', background: COR_TURQUESA, marginTop: '15px', opacity: 0.2 }} />
              </div>

              <h2 
                contentEditable={true}
                suppressContentEditableWarning={true}
                onBlur={(e) => setTitulo(e.currentTarget.innerText.replace("COMUNICADO: ", ""))}
                style={{...tituloComunicado, color: COR_TURQUESA, outline: 'none'}}
              >
                {titulo ? `COMUNICADO: ${titulo}` : "AGUARDANDO TÍTULO..."}
              </h2>
              
              <p style={metaData}>Data: {dataAtual}</p>

              <div style={textoCorpo}>
                {/* O TIPTAP ENTRA AQUI */}
                <EditorContent editor={editor} />

                {/* Cores fixas de propósito daqui para baixo: isto é papel
                    branco impresso, não superfície do sistema. Com var(--fg-*)
                    o texto do comunicado ficava branco no branco no tema
                    escuro, e saía assim no PDF e na imagem. */}
                <div style={assinaturaContainer}>
                    <p style={{ margin: 0, fontSize: '14px', color: TINTA_FRACA }}>Atenciosamente,</p>
                    <div style={{ width: '200px', height: '1px', backgroundColor: COR_TURQUESA, margin: '40px auto 10px auto', opacity: 0.3 }} />
                    <strong style={{ display: 'block', fontSize: '16px', color: COR_TURQUESA, textTransform: 'uppercase' }}>
                      O Síndico
                    </strong>
                    <span style={{ fontSize: '12px', color: TINTA_FRACA }}>Condomínio Diduccio</span>
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={modalExport}
        onClose={() => setModalExport(false)}
        title="Exportar comunicado"
        size="sm"
        footer={<Button variant="ghost" onClick={() => setModalExport(false)}>Fechar</Button>}
      >
        <p className="vit-modal__desc" style={{ marginBottom: "var(--space-7)" }}>
          O arquivo sai sempre em A4, no tamanho cheio, independente do tamanho
          desta tela.
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

// Estilos
const a4Paper = { 
  width: '794px', // Largura fixa de um A4 (96 DPI)
  minHeight: '1123px', 
  padding: '20mm', 
  backgroundColor: '#fff', 
  boxShadow: "0 0 20px rgba(0,0,0,0.1)", 
  color: '#333', 
  margin: '0 auto', 
  boxSizing: 'border-box', 
  display: 'flex',
  flexDirection: 'column'
  // O zoom/scale do mobile é aplicado inline (reativo) no JSX, via isMobile.
};
const contentGrid = { 
  display: "grid", 
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", // Ajusta automático
  gap: "25px", 
  alignItems: "start" 
};
const sectionCard = { 
  padding: "24px", 
  borderRadius: "20px", 
  border: "1px solid", 
  overflow: "hidden",
  maxWidth: "100%" // Garante que não ultrapasse a tela
};
const labelStyle = { display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', marginTop: '20px' };
const textAreaStyle = { width: '100%', minHeight: '120px', borderRadius: '12px', padding: '12px', fontSize: '14px', border: '1px solid', resize: 'none', outline: 'none' };
const selectStyle = { width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid', outline: 'none' };
const btnGerar = { width: '100%', marginTop: '25px', padding: '14px', borderRadius: '12px', color: 'white', border: 'none', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' };
const dicaCard = { padding: '15px', borderRadius: '15px', border: '1px solid', display: 'flex', gap: '12px', alignItems: 'center' };
const previewHeader = { padding: '15px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-2)' };
const previewContent = { 
  padding: '20px', 
  display: 'flex', 
  justifyContent: 'center', 
  overflowX: 'auto', // Permite ver o papel todo deslizando pro lado no celular
  backgroundColor: 'var(--border)',
  borderRadius: '0 0 20px 20px'
};
const logoWrapper = { marginBottom: '10px', display: 'flex', justifyContent: 'center' };
const tituloComunicado = { fontSize: '20px', textAlign: 'center', fontWeight: '800', marginBottom: '10px' };
const metaData = { fontSize: '13px', color: '#63675F', textAlign: 'center', marginBottom: '40px' };
const textoCorpo = { 
  fontSize: '16px', 
  lineHeight: '1.8', 
  color: '#1A1C19',
  flex: 1, 
  display: 'flex', 
  flexDirection: 'column',
  wordBreak: 'break-word', // Garante que palavras muito longas não quebrem o layout
  overflowWrap: 'anywhere' 
};
const assinaturaContainer = { textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 'auto' };
const divisor = { width: '1px', height: '20px', background: 'var(--border)', margin: '0 5px' };
const btnToolbar = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '6px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: '0.2s'
};
