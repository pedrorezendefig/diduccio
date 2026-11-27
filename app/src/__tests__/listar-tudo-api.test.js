// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `listarTudo` e `buscarUm` fora da demo.
 *
 * O defeito que eles corrigem: o PostgREST devolve no máximo mil linhas, e o
 * cadastro da portaria passou disso. Quem ficou fora do corte não era
 * reconhecido pelo CPF, e o cadastro de novo batia no índice único do 0034.
 */

const TABELA = Array.from({ length: 2345 }, (_, i) => ({ id: i + 1, cpf: String(10000000000 + i) }));
const pedidos = [];

/** Um construtor de consulta que lembra o que pediram e corta em mil, como o PostgREST. */
function consulta(tabela) {
  const q = { tabela, ordem: null, de: 0, ate: 999, eq: null };
  const resposta = () => {
    pedidos.push(q);
    let linhas = TABELA;
    if (q.eq) linhas = linhas.filter((l) => String(l[q.eq[0]]) === String(q.eq[1]));
    linhas = linhas.slice(q.de, Math.min(q.ate, q.de + 999) + 1);
    if (q.unica) return { data: linhas[0] ?? null, error: null, status: 200 };
    return { data: linhas, error: null, status: 200 };
  };
  const api = {
    select: () => api,
    order: (col) => { q.ordem = col; return api; },
    range: (de, ate) => { q.de = de; q.ate = ate; return api; },
    eq: (col, v) => { q.eq = [col, v]; return api; },
    limit: () => api,
    maybeSingle: () => { q.unica = true; return api; },
    then: (ok, falha) => Promise.resolve(resposta()).then(ok, falha),
  };
  return api;
}

vi.mock("../api/supabase", () => ({
  supabase: {
    from: (t) => consulta(t),
    auth: { refreshSession: async () => ({ error: null }) },
  },
}));
vi.mock("../api/config", () => ({ MODO_DEMO: false, URL_DEMO: "https://demo.vit.local/exec" }));
vi.mock("../demo/servidor", () => ({ atender: async () => [] }));

beforeEach(() => { pedidos.length = 0; });

describe("listarTudo", () => {
  it("passa de mil: pede página por página até a última vir incompleta", async () => {
    const { listarTudo } = await import("../api/db");
    const linhas = await listarTudo("ENTREGADORES");
    expect(linhas).toHaveLength(2345);
    expect(new Set(linhas.map((l) => l.id)).size).toBe(2345);
    expect(pedidos.map((p) => [p.tabela, p.de, p.ate])).toEqual([
      ["entregadores", 0, 999],
      ["entregadores", 1000, 1999],
      ["entregadores", 2000, 2999],
    ]);
  });

  it("ordena por id: sem ordem, as páginas não se encaixam", async () => {
    const { listarTudo } = await import("../api/db");
    await listarTudo("ENTREGADORES");
    expect(pedidos.every((p) => p.ordem === "id")).toBe(true);
  });
});

describe("buscarUm", () => {
  it("acha quem está depois da milésima linha, pelo valor, no banco", async () => {
    const { buscarUm } = await import("../api/db");
    const alvo = TABELA[1800];
    await expect(buscarUm("ENTREGADORES", "cpf", alvo.cpf)).resolves.toEqual(alvo);
    expect(pedidos[0].eq).toEqual(["cpf", alvo.cpf]);
  });

  it("ninguém com esse valor devolve null", async () => {
    const { buscarUm } = await import("../api/db");
    await expect(buscarUm("ENTREGADORES", "cpf", "00000000000")).resolves.toBeNull();
  });
});
