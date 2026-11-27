import { describe, it, expect } from "vitest";
import { dataParaMs, dataBR } from "../lib/format";

/**
 * A migração trocou o formato das datas debaixo das telas, e o modo como isso
 * quebra é traiçoeiro: `"2026-05-16".split("/")` NÃO estoura. Devolve um pedaço
 * só, o dia vira a string inteira, o mês vira `undefined`, e `new Date` disso é
 * Invalid Date. A tela continua de pé e passa a ordenar e filtrar errado —
 * calada — para sempre.
 *
 * O único ponto que estourou de verdade foi o salão de festas, e só porque lá
 * havia um segundo `.split` em cima do `undefined`. Foi sorte: sem esse detalhe
 * ninguém teria descoberto pelo console.
 */
describe("dataParaMs", () => {
  it("ordena ISO do Postgres na ordem certa", () => {
    const datas = ["2026-05-16", "2024-01-02", "2026-01-02"];
    expect([...datas].sort((a, b) => dataParaMs(a) - dataParaMs(b)))
      .toEqual(["2024-01-02", "2026-01-02", "2026-05-16"]);
  });

  it("entende o formato antigo da planilha, que ainda circula", () => {
    // Enquanto houver tela não convertida, os dois formatos convivem.
    expect(dataParaMs("16/05/2026")).toBe(dataParaMs("2026-05-16"));
    expect(dataParaMs("16/05/2026 14:30")).toBe(dataParaMs("2026-05-16 14:30"));
  });

  it("não confunde dia com mês entre os dois formatos", () => {
    // "03/05" é 3 de maio no br e 5 de março no ISO. Um parser que tratasse os
    // dois igual erraria dois meses e ninguém veria.
    expect(dataParaMs("03/05/2026")).toBe(dataParaMs("2026-05-03"));
    expect(dataParaMs("03/05/2026")).not.toBe(dataParaMs("2026-03-05"));
  });

  it("timestamptz com fuso vira um instante comparável", () => {
    expect(dataParaMs("2026-02-20T17:52:36+00:00"))
      .toBeLessThan(dataParaMs("2026-02-20T18:00:00+00:00"));
  });

  it("vazio e lixo viram 0 em vez de NaN", () => {
    // NaN em comparação devolve false dos dois lados: o item não sobe nem
    // desce, e a ordenação fica embaralhada de um jeito que parece aleatório.
    for (const v of [null, undefined, "", "  ", "nao e data"]) {
      expect(dataParaMs(v)).toBe(0);
      expect(Number.isNaN(dataParaMs(v))).toBe(false);
    }
  });

  it("uma lista de verdade, com formatos misturados, ordena certo", () => {
    // Duas ou mais linhas: com UMA só, `sort` nunca chama o comparador e o
    // teste passa sem provar nada. Foi assim que o defeito do salão de festas
    // passou pela minha suíte e apareceu na tela do Lucas.
    const linhas = [
      { data_reserva: "2026-05-16" },
      { data_reserva: "16/05/2024" },
      { data_reserva: null },
      { data_reserva: "2025-12-31" },
    ];
    const ordenado = [...linhas].sort((a, b) => dataParaMs(a.data_reserva) - dataParaMs(b.data_reserva));
    expect(ordenado.map(l => l.data_reserva)).toEqual([null, "16/05/2024", "2025-12-31", "2026-05-16"]);
  });
});

describe("dataBR continua sem deslocar o dia", () => {
  it("não perde um dia por causa de fuso", () => {
    // `new Date("2026-03-22")` é meia-noite UTC; formatado em Brasília vira
    // 21/03. Por isso `dataBR` recorta a string em vez de passar por Date.
    expect(dataBR("2026-03-22")).toBe("22/03/2026");
    expect(dataBR("2026-01-01")).toBe("01/01/2026");
  });
});
