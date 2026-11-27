import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * O rodapé dos modais no celular (guia de marca, 2026-11-04): a ação principal
 * em cima e inteira, a da tela (Gerar contrato) embaixo dela, e o resto em
 * metades. A regra já sumiu uma vez numa troca de CSS e ninguém viu até o
 * rodapé da Encomendas aparecer bagunçado — este teste prende ela no lugar.
 */
const css = () => readFileSync("src/styles/app-morador.css", "utf8");

describe("rodapé dos modais no celular", () => {
  it("a regra existe, para telas de até 560px", () => {
    const bloco = css().match(/@media \(max-width: 560px\) \{\s*\.app-modal__acoes \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(bloco, "sumiu a regra do rodapé no celular").not.toBe("");
    expect(bloco).toMatch(/\.vit-btn--primary \{[^}]*flex-basis:\s*100%[^}]*order:\s*-2/);
    expect(bloco).toMatch(/\.res-contrato \{[^}]*flex-basis:\s*100%[^}]*order:\s*-1/);
    expect(bloco).toMatch(/> \.vit-btn \{[^}]*flex:\s*1 1 40%/);
  });
});
