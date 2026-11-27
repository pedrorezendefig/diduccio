// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CLARO, ESCURO } from "../theme/tokens";

/**
 * Dois defeitos que só existem no celular e no escuro — os dois lugares onde
 * ninguém desenvolve, e por isso os dois que só o usuário encontra.
 */

const TELA = "src/pages/Encomendas.jsx";
const fonte = () => readFileSync(TELA, "utf8");

describe("tirar foto da etiqueta", () => {
  const src = () => fonte();
  // O campo é o <Input> do sistema desde 2026-11-05 (guia de marca); antes era
  // o <input> cru. As garantias abaixo valem para os dois.
  const campos = () => [...src().matchAll(/<[Ii]nput\s+className="enc-foto-input"[\s\S]*?\/>/g)].map((m) => m[0]);

  it("a câmera abre direto no celular", () => {
    // Deixar o sistema perguntar (sem `capture`) foi tentado e falhou no
    // aparelho da portaria: o Android 13+ atende `accept="image/*"` com o
    // seletor de fotos, que nao tem camera. Nao ha como forcar o menu por
    // codigo — ou se pede a camera, ou se aceita o que o aparelho decidir.
    const camera = campos().find((c) => c.includes("capture"));
    expect(camera, "sumiu o campo que abre a câmera").toBeTruthy();
    expect(camera).toMatch(/capture=\{temToque \? "environment" : undefined\}/);
  });

  it("`capture` só no toque: no computador ele só confundiria", () => {
    expect(src()).toContain("const [temToque] = useState(ehTelaDeToque);");
  });

  it("sobra uma saída, porque a foto é obrigatória para cadastrar", () => {
    // Sem ela, camera negada ou quebrada = encomenda que nao entra no sistema.
    // A regra que torna isto obrigatorio esta na propria tela; se ela cair, este
    // teste avisa que a saida deixou de ser necessaria.
    expect(src(), "a foto deixou de ser obrigatória?").toContain('"Foto obrigatória."');

    const semCaptura = campos().filter((c) => !c.includes("capture"));
    expect(semCaptura, "não há como escolher um arquivo já existente").toHaveLength(1);
    expect(src()).toMatch(/className="enc-foto-link"/);
  });

  it("todo campo de arquivo aceita imagem e nada mais", () => {
    const todos = campos();
    expect(todos).toHaveLength(2);
    expect(todos.every((c) => c.includes('accept="image/*"'))).toBe(true);
  });

  it("nenhum campo de arquivo fica em display:none", () => {
    // É o motivo de o toque não fazer nada em parte dos navegadores de celular:
    // clique encaminhado por <label> para campo com `display: none` é ignorado.
    // O CSS da tela mora em styles/encomendas.css desde 2026-11-04.
    const css = readFileSync("src/styles/encomendas.css", "utf8").match(/\.enc-foto-input \{[^}]*\}/)?.[0] ?? "";
    expect(css, ".enc-foto-input sumiu").not.toBe("");
    expect(css).not.toMatch(/display:\s*none/);
    expect(css).toMatch(/position:\s*absolute/);
    expect(css).toMatch(/opacity:\s*0/);
  });
});

/**
 * O quadrado do número da encomenda no modo escuro.
 *
 * O fundo era `var(--fg-heading)` quando escuro. `--fg-heading` é token de
 * TEXTO e vale #FFFFFF no tema escuro: quadrado branco, com o número escrito em
 * #EAEFEA por cima. Branco no branco, exatamente no único dado que aquela
 * janela existe para mostrar — o número que o porteiro tem que copiar na caixa.
 */
describe("contraste do número para anotar", () => {
  const luminancia = (hex) => {
    const canal = (c) => {
      const v = parseInt(c, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const h = hex.replace("#", "");
    return 0.2126 * canal(h.slice(0, 2)) + 0.7152 * canal(h.slice(2, 4)) + 0.0722 * canal(h.slice(4, 6));
  };
  const contraste = (a, b) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };

  it("a conta de contraste está certa (senão o teste abaixo não prova nada)", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contraste("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("o defeito relatado realmente era invisível", () => {
    // Prova que o problema era este e não outro: texto do tema escuro sobre o
    // branco de `--fg-heading` dá contraste ~1.1 — indistinguível.
    expect(contraste(ESCURO.text, ESCURO.ink)).toBeLessThan(1.2);
  });

  it("surface-2 dá contraste de sobra nos dois temas", () => {
    // 4.5 é o mínimo da WCAG para texto normal. O número sai em 34px e peso
    // 800, então passa folgado — mas o piso fica cravado aqui.
    expect(contraste(ESCURO.text, ESCURO["surface-2"])).toBeGreaterThan(4.5);
    expect(contraste(CLARO.text, CLARO["surface-2"])).toBeGreaterThan(4.5);
  });

  it("a tela não usa mais cor de texto como fundo", () => {
    const src = fonte();
    expect(src).not.toMatch(/backgroundColor:\s*theme\.isDark\s*\?\s*'var\(--fg-heading\)'/);
    // Nem em lugar nenhum: `--fg-heading` é `color`, sempre.
    expect([...src.matchAll(/background[A-Za-z-]*:\s*['"`]?var\(--fg-heading\)/g)].map((m) => m[0])).toEqual([]);
  });
});
