// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { alturaDaPaginaLonga, FORMATOS, pontosDeCorte, PROPORCAO_A4 } from "../lib/folha";

/**
 * A folha do Comunicado sem a trava de A4 (decisão do usuário, 23/11/2026):
 * ela começa num A4 (794 x 1123 a 96 dpi) e cresce com o texto. Ao exportar,
 * o administrador escolhe se o PDF e a impressão saem em folhas A4 (cortadas
 * sem partir linha de texto) ou numa página comprida, e vê a prévia.
 * O fundo continua branco e sem a sombra (ela virava borda preta no JPEG).
 */
const tela = readFileSync("src/pages/Comunicado.jsx", "utf8");
const css = readFileSync("src/styles/comunicado-folha.css", "utf8");
const regra = (seletor) => css.match(new RegExp(`\\${seletor} \\{[^}]*\\}`))?.[0] ?? "";

describe("a folha do Comunicado, sem trava de A4", () => {
  it("começa num A4 e cresce com o texto", () => {
    expect(regra(".com-folha")).toMatch(/min-height: 1123px/);
    expect(regra(".com-folha")).not.toMatch(/(^|[^-])height: 1123px/);
    expect(regra(".com-folha")).not.toMatch(/overflow: hidden/);
    expect(regra(".com-folha__corpo")).not.toMatch(/overflow: hidden/);
    expect(tela).toMatch(/height: alturaFolha \* escala/);
    expect(tela).not.toContain("O texto passou da folha A4");
  });

  it("imagem e PDF com fundo branco, sem a sombra e na altura da folha", () => {
    expect(tela).toMatch(/OPCOES_DA_FOTO = \{[^}]*backgroundColor: "#ffffff"/);
    expect(tela).not.toMatch(/OPCOES_DA_FOTO = \{[^}]*height: ALTURA_A4/);
    expect(tela).toMatch(/boxShadow: "none"/);
    expect(tela).toMatch(/height: "auto", minHeight: `\$\{ALTURA_A4\}px`/);
  });

  it("o administrador escolhe o formato ao exportar e vê a prévia", () => {
    expect(FORMATOS).toEqual({ a4: "Folhas A4", longa: "Uma página comprida" });
    expect(tela).toContain('<Opcoes rotulo="Formato do PDF e da impressão" valor={formato}');
    expect(tela).toContain("paginasDoCanvas(canvas)");
    expect(tela).toMatch(/format: \[210, altura\]/);
  });

  it("a impressão segue o formato escolhido", () => {
    expect(tela).toMatch(/@page \{ size: \$\{formato === "longa"/);
    expect(tela).toMatch(/height: auto; min-height: 297mm/);
  });
});

describe("pontosDeCorte: folhas A4 sem partir linha", () => {
  it("cabe numa folha: uma página só", () => {
    expect(pontosDeCorte(1000, 1123)).toEqual([0]);
    expect(pontosDeCorte(1140, 1123)).toEqual([0]); // sobra menor que 2% não vira folha
  });

  it("corta na altura da página quando ali está em branco", () => {
    expect(pontosDeCorte(2500, 1000)).toEqual([0, 1000, 2000]);
  });

  it("com texto na linha do corte, sobe até a faixa em branco", () => {
    // Texto de 980 a 1010: o corte de 1000 sobe para 979.
    const emBranco = (y) => !(y >= 980 && y <= 1010);
    expect(pontosDeCorte(1800, 1000, emBranco)).toEqual([0, 979]);
  });

  it("sem faixa em branco por perto, corta na altura exata", () => {
    expect(pontosDeCorte(1800, 1000, () => false)).toEqual([0, 1000]);
  });

  it("proporção do A4 e altura da página comprida", () => {
    expect(PROPORCAO_A4).toBeCloseTo(1.414, 3);
    expect(alturaDaPaginaLonga(794, 1123)).toBe(297);
    expect(alturaDaPaginaLonga(794, 2246)).toBe(594);
  });
});
