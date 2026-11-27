// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `lerNotas` e `salvarNotas` fora da demo: a tabela do 0044 pelo supabase-js.
 *
 * Separado do db.test.js porque aquele fixa MODO_DEMO ligado para o arquivo
 * inteiro. O que importa aqui é o formato do pedido: ler sem filtro (quem
 * recorta a linha do dono é o RLS), e gravar por upsert com o `usuario_id`
 * numérico — a coluna é bigint, e o id da demo chega como texto.
 */

let respostas = [];
let renovacaoFalha = false;
const chamadas = [];

// O construtor de consulta do supabase-js é encadeável e "thenable"; aqui cada
// método anota o que recebeu e o fim da cadeia devolve a próxima resposta.
const proxima = () => respostas.shift() ?? { data: null, error: null, status: 200 };
const consulta = (tabela) => ({
  select: (colunas) => {
    chamadas.push(["select", tabela, colunas]);
    return {
      maybeSingle: async () => {
        chamadas.push(["maybeSingle", tabela]);
        return proxima();
      },
    };
  },
  upsert: async (linha, opcoes) => {
    chamadas.push(["upsert", tabela, linha, opcoes]);
    return proxima();
  },
});

vi.mock("../api/supabase", () => ({
  supabase: {
    from: (tabela) => consulta(tabela),
    rpc: () => { throw new Error("o bloco de notas não passa por RPC"); },
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

describe("lerNotas", () => {
  it("lê o texto da notas_tarefas, sem filtrar por id (o RLS recorta)", async () => {
    respostas = [{ data: { texto: "Trocar lâmpada\nLigar para o síndico" }, error: null, status: 200 }];
    const { lerNotas } = await import("../api/db");
    await expect(lerNotas(10)).resolves.toBe("Trocar lâmpada\nLigar para o síndico");
    expect(chamadas).toEqual([["select", "notas_tarefas", "texto"], ["maybeSingle", "notas_tarefas"]]);
  });

  it("sem linha ainda devolve texto vazio", async () => {
    respostas = [{ data: null, error: null, status: 200 }];
    const { lerNotas } = await import("../api/db");
    await expect(lerNotas(10)).resolves.toBe("");
  });

  it("erro do banco vira uma frase em português com a mensagem original", async () => {
    respostas = [{ data: null, error: { message: "relation does not exist" }, status: 404 }];
    const { lerNotas } = await import("../api/db");
    await expect(lerNotas(10)).rejects.toThrow(/Não consegui ler o bloco de notas: relation does not exist/);
  });

  it("sessão acabada diz que a sessão expirou", async () => {
    respostas = [{ data: null, error: { message: "JWT expired" }, status: 401 }];
    renovacaoFalha = true;
    const { lerNotas, SESSAO_EXPIRADA } = await import("../api/db");
    await expect(lerNotas(10)).rejects.toThrow(SESSAO_EXPIRADA);
  });

  it("token vencido é renovado e a leitura sai na segunda", async () => {
    respostas = [
      { data: null, error: { message: "JWT expired" }, status: 401 },
      { data: { texto: "ok" }, error: null, status: 200 },
    ];
    const { lerNotas } = await import("../api/db");
    await expect(lerNotas(10)).resolves.toBe("ok");
  });
});

describe("salvarNotas", () => {
  it("grava por upsert, com usuario_id numérico e onConflict no usuario_id", async () => {
    respostas = [{ data: null, error: null, status: 201 }];
    const { salvarNotas } = await import("../api/db");
    await expect(salvarNotas("10", "uma linha")).resolves.toEqual({ success: true });
    expect(chamadas).toEqual([
      ["upsert", "notas_tarefas", { usuario_id: 10, texto: "uma linha" }, { onConflict: "usuario_id" }],
    ]);
  });

  it("recusa do banco volta como { success: false, message }", async () => {
    respostas = [{ data: null, error: { message: "new row violates row-level security policy", code: "42501" }, status: 403 }];
    const { salvarNotas } = await import("../api/db");
    await expect(salvarNotas(10, "x")).resolves.toEqual({
      success: false, message: "new row violates row-level security policy",
    });
  });

  it("sessão acabada volta como falha com a frase da sessão", async () => {
    respostas = [{ data: null, error: { message: "JWT expired" }, status: 401 }];
    renovacaoFalha = true;
    const { salvarNotas, SESSAO_EXPIRADA } = await import("../api/db");
    await expect(salvarNotas(10, "x")).resolves.toEqual({ success: false, message: SESSAO_EXPIRADA });
  });
});
