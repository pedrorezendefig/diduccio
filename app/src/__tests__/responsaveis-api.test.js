// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `listarResponsaveis` fora da demo: chama a função do 0043 pelo RPC.
 *
 * Separado do db.test.js porque aquele fixa MODO_DEMO ligado para o arquivo
 * inteiro. Aqui é o caminho de produção — o que a primeira versão da tela
 * errou lendo uma view que não existe mais.
 */

let respostas = [];
let renovacaoFalha = false;
const chamadas = [];

vi.mock("../api/supabase", () => ({
  supabase: {
    // O RPC do supabase-js devolve um objeto com `then`; um async basta aqui.
    rpc: async (nome, args) => {
      chamadas.push([nome, args]);
      return respostas.shift() ?? { data: [], error: null, status: 200 };
    },
    from: () => { throw new Error("listarResponsaveis não pode ler tabela nem view"); },
    auth: {
      refreshSession: async () => ({ error: renovacaoFalha ? { message: "Invalid Refresh Token" } : null }),
    },
  },
}));

vi.mock("../api/config", () => ({ MODO_DEMO: false, URL_DEMO: "https://demo.vit.local/exec" }));
vi.mock("../demo/servidor", () => ({ atender: async () => [] }));

beforeEach(() => {
  respostas = [];
  renovacaoFalha = false;
  chamadas.length = 0;
});

describe("listarResponsaveis", () => {
  it("chama responsaveis_de_tarefa e devolve as linhas", async () => {
    const linhas = [{ id: 1, nome: "Ana", cargo: "Sindico" }];
    respostas = [{ data: linhas, error: null, status: 200 }];
    const { listarResponsaveis } = await import("../api/db");
    await expect(listarResponsaveis()).resolves.toEqual(linhas);
    expect(chamadas).toEqual([["responsaveis_de_tarefa", undefined]]);
  });

  it("sem linha nenhuma devolve lista, não null", async () => {
    respostas = [{ data: null, error: null, status: 200 }];
    const { listarResponsaveis } = await import("../api/db");
    await expect(listarResponsaveis()).resolves.toEqual([]);
  });

  it("erro do banco vira uma frase em português com a mensagem original", async () => {
    respostas = [{ data: null, error: { message: "function does not exist" }, status: 404 }];
    const { listarResponsaveis } = await import("../api/db");
    await expect(listarResponsaveis()).rejects.toThrow(/Não consegui ler os responsáveis: function does not exist/);
  });

  it("sessão acabada diz que a sessão expirou", async () => {
    respostas = [{ data: null, error: { message: "JWT expired" }, status: 401 }];
    renovacaoFalha = true;
    const { listarResponsaveis, SESSAO_EXPIRADA } = await import("../api/db");
    await expect(listarResponsaveis()).rejects.toThrow(SESSAO_EXPIRADA);
  });
});
