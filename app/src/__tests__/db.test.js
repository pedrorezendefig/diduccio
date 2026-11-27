import { describe, it, expect, vi } from "vitest";

// MODO_DEMO é decidido no import de api/config, então o mock vem antes.
vi.mock("../api/config", () => ({
  MODO_DEMO: true,
  API_URL: "https://demo.vit.local/exec",
  TOKEN: "demo",
}));

const { listar, listarResponsaveis, criar, editar, remover, lerNotas, salvarNotas } = await import("../api/db");

describe("db em modo demo", () => {
  it("lista de src/demo sem tocar na rede", async () => {
    const espiao = vi.fn();
    globalThis.fetch = espiao;
    const linhas = await listar("UNIDADES");
    expect(linhas.length).toBeGreaterThan(0);
    // "Nenhuma requisição sai desta máquina" é a promessa que o demo anuncia.
    expect(espiao).not.toHaveBeenCalled();
  });

  it("aceita o nome da aba em maiúsculo, como as páginas usam hoje", async () => {
    const a = await listar("UNIDADES");
    const b = await listar("unidades");
    expect(a.length).toBe(b.length);
  });

  it("criar devolve o registro com id", async () => {
    const r = await criar("TAGS", { veiculo: "Carro", status: "Ativo" });
    expect(r.success).toBe(true);
    expect(r.data.id).toBeTruthy();
  });

  it("editar e remover respondem sucesso", async () => {
    const criado = await criar("TAGS", { veiculo: "Moto" });
    expect((await editar("TAGS", criado.data.id, { veiculo: "Carro" })).success).toBe(true);
    expect((await remover("TAGS", criado.data.id)).success).toBe(true);
  });

  it("os responsáveis de tarefa vêm da demo: só síndico e auxiliar, só id, nome e cargo", async () => {
    const espiao = vi.fn();
    globalThis.fetch = espiao;
    const pessoas = await listarResponsaveis();
    expect(pessoas.length).toBeGreaterThan(0);
    for (const p of pessoas) {
      expect(["Sindico", "Auxiliar Administrativo"]).toContain(p.cargo);
      expect(Object.keys(p).sort()).toEqual(["cargo", "id", "nome"]);
    }
    expect(espiao).not.toHaveBeenCalled();
  });

  it("o bloco de notas salva e lê de volta, sem tocar na rede", async () => {
    const espiao = vi.fn();
    globalThis.fetch = espiao;
    expect(await lerNotas("demo-notas-1")).toBe("");
    expect(await salvarNotas("demo-notas-1", "Trocar lâmpada\nLigar para a Enel")).toEqual({ success: true });
    expect(await lerNotas("demo-notas-1")).toBe("Trocar lâmpada\nLigar para a Enel");
    expect(espiao).not.toHaveBeenCalled();
  });

  it("o bloco de um não aparece no do outro", async () => {
    await salvarNotas("demo-notas-a", "do A");
    await salvarNotas("demo-notas-b", "do B");
    expect(await lerNotas("demo-notas-a")).toBe("do A");
    expect(await lerNotas("demo-notas-b")).toBe("do B");
    // Número e texto são o mesmo usuário: o login pode trazer um ou outro.
    await salvarNotas(77, "do 77");
    expect(await lerNotas("77")).toBe("do 77");
  });
});
