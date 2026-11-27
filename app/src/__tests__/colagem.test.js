import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { limparColagem } from "../lib/colagem";

/**
 * Colar no Comunicado: o texto entra na letra do comunicado. Antes, a fonte,
 * o tamanho e a cor de onde o texto foi copiado vinham junto, e a folha
 * ficava com pedaços diferentes.
 */
describe("limparColagem", () => {
  it("do Word: sai fonte, tamanho, cor e o lixo do Office; fica o texto e o negrito", () => {
    const word = `<!--StartFragment--><p class="MsoNormal" style="margin:0cm;font-family:'Times New Roman';font-size:12pt">
      <span style="font-size:14.0pt;color:#1F3864;mso-bidi-font-family:Arial">Prezados Moradores,<o:p></o:p></span></p>
      <p class="MsoNormal"><b><span style="font-family:Georgia">Dever de Vigilância</span></b> e base legal.</p><!--EndFragment-->`;
    const limpo = limparColagem(word);
    expect(limpo).not.toMatch(/style=|class=|font|mso|<span|<o:p|<!--/i);
    expect(limpo).toContain("Prezados Moradores,");
    expect(limpo).toMatch(/<b>Dever de Vigilância<\/b> e base legal\./);
  });

  it("de site: <font>, <div> e título viram texto em parágrafo, e link vira texto", () => {
    const site = `<div style="font-family:Roboto"><h2 style="color:red">Aviso</h2><font face="Arial" size="5">Texto</font> <a href="http://x">aqui</a></div>`;
    const limpo = limparColagem(site);
    expect(limpo).not.toMatch(/<font|<div|<h2|<a |style=|face=/i);
    expect(limpo).toMatch(/<p>Aviso<\/p>/);
    expect(limpo).toContain("Texto aqui");
  });

  it("listas e quebras ficam", () => {
    expect(limparColagem('<ul style="x"><li class="y">um</li><li>dois</li></ul>linha<br>outra'))
      .toBe("<ul><li>um</li><li>dois</li></ul>linha<br>outra");
  });

  it("o Comunicado usa a limpeza no corpo e cola só texto no título", () => {
    const tela = readFileSync("src/pages/Comunicado.jsx", "utf8");
    expect(tela).toContain("transformPastedHTML: limparColagem");
    expect(tela).toMatch(/onPaste=\{\(e\) => \{[\s\S]*?getData\("text\/plain"\)/);
  });
});
