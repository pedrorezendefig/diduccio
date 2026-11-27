import { describe, it, expect } from "vitest";
import { pendentesDaRetirada } from "../lib/retirada";

/**
 * Uma assinatura para tudo o que o morador leva (2026-11-04): a retirada traz
 * o cadastro aberto e, depois dele, as outras encomendas da mesma unidade que
 * ainda estão na portaria.
 */
const ENCOMENDAS = [
  { id: 5, id_unidade: 12, status: "Pendente" },
  { id: 3, id_unidade: 12, status: "Pendente" },
  { id: 4, id_unidade: 12, status: "Entregue" },
  { id: 7, id_unidade: 12, status: "Parcialmente entregue" },
  { id: 6, id_unidade: 99, status: "Pendente" },
];

describe("pendentesDaRetirada", () => {
  it("o cadastro aberto vem primeiro, depois as outras da unidade", () => {
    expect(pendentesDaRetirada(ENCOMENDAS, 5).map((e) => e.id)).toEqual([5, 3, 7]);
  });

  it("não traz encomenda já entregue nem de outra unidade", () => {
    const ids = pendentesDaRetirada(ENCOMENDAS, 5).map((e) => e.id);
    expect(ids).not.toContain(4);
    expect(ids).not.toContain(6);
  });

  it("cadastro já entregue ou inexistente não abre retirada", () => {
    expect(pendentesDaRetirada(ENCOMENDAS, 4)).toEqual([]);
    expect(pendentesDaRetirada(ENCOMENDAS, null)).toEqual([]);
  });
});
