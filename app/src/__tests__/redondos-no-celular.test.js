// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Botão redondo não pode ser esticado pela regra de alvo de toque.
 *
 * No celular, o modal de encomendas aplica `min-height: 44px` em todo <button>,
 * para o dedo ter onde acertar. Num botão retangular isso é correto. Num botão
 * com `border-radius: 50%` e 20px de lado, o resultado é uma pílula alta e
 * estreita — o desenho deforma, e o alvo continua com 20px de largura, então
 * nem o problema original se resolve.
 *
 * Já aconteceu três vezes: a bolinha do carrossel, a seta do visualizador, e o
 * X que tira a foto da etiqueta. A exceção existe (`enc-redondo`) e funciona;
 * o que falha é lembrar de aplicá-la. Este teste lembra.
 *
 * Alvo de toque em botão redondo se consegue por PADDING — a área cresce, o
 * desenho não. É o que `.enc-ponto` e `.enc-foto-x` fazem com
 * `background-clip: content-box`.
 */

const TELA = "src/pages/Encomendas.jsx";
const fonte = () => readFileSync(TELA, "utf8");
// O CSS da tela saiu do <style> do componente para styles/encomendas.css
// (guia de marca, 2026-11-04): as regras de toque são conferidas lá.
const estilo = () => readFileSync("src/styles/encomendas.css", "utf8");

/** Cada <button ...> da tela, do "<button" até o ">" que fecha a abertura. */
function aberturasDeBotao(src) {
  const achados = [];
  let i = src.indexOf("<button");
  while (i !== -1) {
    // Para no primeiro ">" que não esteja dentro de {...} nem de aspas: um
    // `style={{...}}` tem chaves, e uma seta `=>` tem ">" que não fecha nada.
    let nivel = 0, aspas = null, j = i;
    for (; j < src.length; j++) {
      const c = src[j];
      if (aspas) { if (c === aspas) aspas = null; continue; }
      if (c === '"' || c === "'") { aspas = c; continue; }
      if (c === "{") nivel++;
      else if (c === "}") nivel--;
      else if (c === ">" && nivel === 0) break;
    }
    achados.push(src.slice(i, j + 1));
    i = src.indexOf("<button", j);
  }
  return achados;
}

describe("botões redondos no modal de encomendas", () => {
  it("o extrator acha os botões (senão o teste passa por engano)", () => {
    const botoes = aberturasDeBotao(fonte());
    expect(botoes.length).toBeGreaterThan(5);
    expect(botoes.every((b) => b.startsWith("<button") && b.endsWith(">"))).toBe(true);
  });

  it("todo botão redondo carrega enc-redondo", () => {
    const redondos = aberturasDeBotao(fonte()).filter((b) => /borderRadius:\s*'50%'/.test(b));
    const desprotegidos = redondos.filter((b) => !b.includes("enc-redondo"));
    expect(
      desprotegidos,
      "botão redondo sem `enc-redondo`: no celular a regra de 44px o estica numa pílula"
    ).toEqual([]);
  });

  it("o X que tira a foto é um deles", () => {
    // O caso concreto desta rodada: 20x20 com raio 50%, sem classe nenhuma.
    const src = fonte();
    const x = aberturasDeBotao(src).find((b) => b.includes("handleRemoveItemPhoto"));
    expect(x, "sumiu o botão de tirar a foto").toBeTruthy();
    expect(x).toContain("enc-redondo");
    expect(x).toContain("enc-foto-x");
  });

  it("TODOS os seletores da regra de 44px preservam a exceção", () => {
    // A regra tem dois seletores, um para `.enc-modal` e outro para
    // `.enc-details-grid`. A primeira versão deste teste procurava a exceção em
    // qualquer lugar do arquivo e dava verde com um dos dois quebrado — provado
    // apagando o `:not()` só do primeiro: os botões redondos do modal
    // deformariam, e o teste não acusava.
    const regra = estilo().match(/([^{}]*)\{\s*min-height:\s*44px;\s*\}/);
    expect(regra, "sumiu a regra de alvo de toque").toBeTruthy();

    const seletores = regra[1].split(",").map((x) => x.trim()).filter(Boolean);
    expect(seletores.length).toBeGreaterThan(1);

    const semExcecao = seletores.filter(
      (sel) => sel.includes("button") && !(sel.includes(":not(.enc-redondo)") && sel.includes(":not(.enc-link)"))
    );
    expect(
      semExcecao,
      "seletor que estica TODO botão: os redondos viram pílula no celular"
    ).toEqual([]);
  });

  it("o X ganha área de toque por padding, não esticando o desenho", () => {
    // Duas regras para `.enc-foto-x`: a de base, com o tamanho que se vê, e a
    // de celular, que só acrescenta padding. Se a de celular mexesse em
    // width/height sem `background-clip`, o desenho cresceria junto.
    const regras = [...estilo().matchAll(/\.enc-foto-x \{([^}]*)\}/g)].map((m) => m[1]);
    expect(regras, "esperava a regra de base e a de celular").toHaveLength(2);

    const celular = regras.find((r) => /padding:\s*[1-9]/.test(r));
    expect(celular, "faltou o padding que aumenta a área de toque").toBeTruthy();
    expect(celular, "sem content-box o padding engorda o círculo vermelho").toContain("background-clip: content-box");
    expect(celular, "sem border-box o padding somaria à largura").toContain("box-sizing: border-box");
  });
});

describe("a foto do detalhe deixa espaço para os dados", () => {
  it("no celular a altura acompanha o aparelho, com piso e teto", () => {
    // Eram 260px fixos. Com rótulo, bolinhas e recuo da grade, sobrava quase
    // nada de tela para o card Destinatário — que é o que a pessoa abriu o
    // detalhe para ler.
    const regra = estilo().match(/\.enc-photo-box \{[^}]*height:[^;]*!important[^}]*\}/)?.[0] ?? "";
    expect(regra, "sumiu a regra de celular da foto").not.toBe("");
    expect(regra).toMatch(/clamp\(/);
    expect(regra, "altura fixa em px volta a comer a tela inteira").not.toMatch(/height:\s*\d+px\s*!important/);
  });
});
