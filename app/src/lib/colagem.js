/**
 * O que se cola no editor vira texto do sistema.
 *
 * Copiado do Word, do WhatsApp Web ou de um site, o HTML chega com a fonte, o
 * tamanho em pt, a cor e o fundo de lá — e o editor do Comunicado, que tem
 * tamanho, cor e marca-texto, lia esses `style` e mantinha tudo: a folha
 * ficava com pedaços em outra fonte e outro tamanho. Aqui sai a formatação de
 * fora e fica a estrutura: parágrafo, quebra, negrito, itálico, sublinhado,
 * lista. Cor e tamanho, quem quiser aplica depois, pelos botões.
 */

// O que fica, sem atributo nenhum. O resto é desembrulhado (fica o texto).
const FICA = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "UL", "OL", "LI", "BLOCKQUOTE"]);
// Bloco de fora que vira parágrafo: o texto não pode grudar no de cima.
const VIRA_PARAGRAFO = new Set(["DIV", "H1", "H2", "H3", "H4", "H5", "H6", "TABLE", "TR"]);
// Isto some com o conteúdo: não é texto de ninguém.
const SOME = new Set(["STYLE", "SCRIPT", "META", "LINK", "TITLE", "HEAD", "XML", "O:P", "IMG", "SVG"]);

function limpar(no, doc) {
  [...no.childNodes].forEach((filho) => {
    if (filho.nodeType === 8) { filho.remove(); return; } // comentário (o Word manda vários)
    if (filho.nodeType !== 1) return;
    const tag = filho.tagName.toUpperCase();
    if (SOME.has(tag)) { filho.remove(); return; }
    limpar(filho, doc);
    if (FICA.has(tag)) {
      [...filho.attributes].forEach((a) => filho.removeAttribute(a.name));
      return;
    }
    if (VIRA_PARAGRAFO.has(tag)) {
      const p = doc.createElement("p");
      while (filho.firstChild) p.appendChild(filho.firstChild);
      filho.replaceWith(p);
      return;
    }
    // span, font, a, o resto: fica só o que está dentro.
    filho.replaceWith(...filho.childNodes);
  });
}

/** HTML colado -> HTML só com a estrutura. Para o `transformPastedHTML` do TipTap. */
export function limparColagem(html) {
  if (typeof DOMParser === "undefined") return String(html ?? "");
  const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
  limpar(doc.body, doc);
  return doc.body.innerHTML;
}
