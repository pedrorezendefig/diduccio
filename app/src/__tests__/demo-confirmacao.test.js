import { describe, expect, it } from "vitest";
import { TABELAS } from "../demo/dados.js";
import { carimbarEncomendaNova } from "../demo/servidor.js";

// A tela de Encomendas só manda o Aviso para quem tem a Confirmação com
// status "Confirmado". Sem isso o modo demo nunca mostra o WhatsApp.
describe("Confirmação no modo demo", () => {
  it("usa os status que a tela conhece", () => {
    const conhecidos = ["Pendente", "Aguardando", "Confirmado", "Sem Resposta"];
    for (const c of TABELAS.CONFIRMACAO) expect(conhecidos).toContain(c.status);
  });

  it("tem pelo menos um Titular confirmado", () => {
    expect(TABELAS.CONFIRMACAO.some((c) => c.status === "Confirmado")).toBe(true);
  });
});

// O banco real sorteia os dois códigos no insert (migration 0020).
describe("Encomenda nova no modo demo", () => {
  it("ganha Número da encomenda e, com telefone, Código de retirada", () => {
    const e = { telefone: "(21) 98765-4321" };
    carimbarEncomendaNova(e);
    expect(e.numero_encomenda).toMatch(/^\d{4}[A-HJ-NP-Z]$/);
    expect(e.cod).toMatch(/^[A-NP-Z2-9]{5}$/);
  });

  it("sem telefone não ganha Código de retirada", () => {
    const e = { telefone: "" };
    carimbarEncomendaNova(e);
    expect(e.numero_encomenda).toBeTruthy();
    expect(e.cod).toBeUndefined();
  });
});
