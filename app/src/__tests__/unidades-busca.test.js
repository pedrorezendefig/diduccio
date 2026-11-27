// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buscarUnidades, casaComUnidade, rotuloCurtoDaUnidade } from "../lib/unidades";

/**
 * A regra de achar uma unidade pelo que a pessoa digitou.
 *
 * Ela nasceu na busca do formulário da portaria e agora serve também ao filtro
 * do histórico — os dois precisam dizer o mesmo para "5206", "5 206", "bloco 5
 * apto 206" e "B5-206", que é como a tabela escreve a unidade. Uma regra em
 * dois lugares divergiria no dia em que alguém arrumasse um dos dois.
 */

const UNIDADES = [
  { id: 1, bloco: 5, unidade: 206 },
  { id: 2, bloco: 5, unidade: 106 },
  { id: 3, bloco: 3, unidade: 101 },
];

describe("casaComUnidade", () => {
  it("aceita o atalho concatenado, o par, o extenso e o rótulo curto da tabela", () => {
    for (const termo of ["5206", "5 206", "bloco 5 apto 206", "B5-206", "b5-206", "b5 206"]) {
      expect(casaComUnidade(termo, UNIDADES[0]), termo).toBe(true);
    }
  });

  it("cada palavra digitada tem de aparecer", () => {
    expect(casaComUnidade("5 101", UNIDADES[0])).toBe(false);
  });

  it("só o bloco casa com o bloco inteiro", () => {
    expect(casaComUnidade("bloco 5", UNIDADES[0])).toBe(true);
    expect(casaComUnidade("bloco 5", UNIDADES[1])).toBe(true);
    expect(casaComUnidade("bloco 5", UNIDADES[2])).toBe(false);
  });

  it("termo vazio não casa com nada", () => {
    // É quem chama que decide o que "vazio" significa: no filtro, "não filtra";
    // na sugestão, "não sugere". Aqui, vazio não é coringa.
    expect(casaComUnidade("", UNIDADES[0])).toBe(false);
    expect(casaComUnidade("   ", UNIDADES[0])).toBe(false);
  });

  it("registro sem unidade não casa com nada", () => {
    // O serviço do próprio condomínio entra sem bloco. "null" escrito no alvo
    // faria o termo "null" achá-lo.
    expect(casaComUnidade("5", { bloco: null, unidade: null })).toBe(false);
    expect(casaComUnidade("null", { bloco: null, unidade: null })).toBe(false);
  });
});

describe("buscarUnidades", () => {
  it("usa a mesma regra, e limita as sugestões", () => {
    expect(buscarUnidades(UNIDADES, "5").map((u) => u.id)).toEqual([1, 2]);
    expect(buscarUnidades(UNIDADES, "B5-206").map((u) => u.id)).toEqual([1]);
    expect(buscarUnidades(UNIDADES, "5", 1)).toHaveLength(1);
  });

  it("vazio devolve lista vazia, e não a lista inteira", () => {
    expect(buscarUnidades(UNIDADES, "")).toEqual([]);
  });

  it("o rótulo curto é o que as tabelas mostram", () => {
    expect(rotuloCurtoDaUnidade(UNIDADES[0])).toBe("B5-206");
    expect(rotuloCurtoDaUnidade(null)).toBe("");
  });
});
