import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A chamada às Edge Functions estava copiada dentro de Usuarios.jsx. Comunicado,
 * Assembleia e o chat de atas passaram a precisar dela — quatro cópias do mesmo
 * `fetch` são quatro lugares para esquecer o `Authorization`, e sem ele a função
 * responde 401. Na tela isso vira "não autorizado" para quem tem toda a
 * autorização do mundo, e o rastro fica no servidor, não no navegador.
 */

const mockGetSession = vi.fn();
vi.mock("../api/supabase", () => ({
  supabase: { auth: { getSession: (...a) => mockGetSession(...a) } },
}));

const { chamarEdgeFunction, mensagemDaEdgeFunction } = await import("../api/edge");

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "jwt-de-teste" } } });
  globalThis.fetch = vi.fn();
});

describe("chamarEdgeFunction", () => {
  it("manda o token da sessão no cabeçalho", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, texto: "oi" }) });

    const r = await chamarEdgeFunction("ia", { acao: "comunicado", prompt: "obras" });

    const [url, opcoes] = globalThis.fetch.mock.calls[0];
    expect(url).toMatch(/\/functions\/v1\/ia$/);
    expect(opcoes.headers.Authorization).toBe("Bearer jwt-de-teste");
    expect(JSON.parse(opcoes.body)).toEqual({ acao: "comunicado", prompt: "obras" });
    expect(r.ok).toBe(true);
  });

  it("HTTP 200 com success:false NÃO é sucesso", async () => {
    // A função responde 200 quando a IA falha, com `success: false` e um motivo.
    // Olhar só o status HTTP faria a tela tratar "IA sobrecarregada" como texto
    // gerado, e ela mostraria um comunicado vazio como se estivesse pronto.
    globalThis.fetch.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ success: false, message: "A IA está sobrecarregada agora." }),
    });

    const r = await chamarEdgeFunction("ia", { acao: "comunicado" });
    expect(r.ok).toBe(false);
    expect(mensagemDaEdgeFunction(r)).toBe("A IA está sobrecarregada agora.");
  });

  it("sem sessão, avisa em vez de chamar sem token", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const r = await chamarEdgeFunction("ia", {});
    expect(r.falhaSessao).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mensagemDaEdgeFunction(r)).toMatch(/sess/i);
  });

  it("queda de rede não vira exceção na tela", async () => {
    globalThis.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const r = await chamarEdgeFunction("ia", {});
    expect(r.falhaConexao).toBe(true);
    expect(mensagemDaEdgeFunction(r)).toMatch(/conexão/i);
  });

  it("403 vira uma frase sobre permissão, não um código", async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ success: false, message: "Não autorizado." }) });
    const r = await chamarEdgeFunction("ia", { acao: "comunicado" });
    expect(r.ok).toBe(false);
    expect(mensagemDaEdgeFunction(r)).toBe("Você não tem permissão para isso.");
  });

  it("resposta que não é JSON não derruba nada", async () => {
    // Gateway devolvendo HTML de erro é o caso comum aqui.
    globalThis.fetch.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error("não é JSON"); } });
    const r = await chamarEdgeFunction("ia", {});
    expect(r.ok).toBe(false);
    expect(mensagemDaEdgeFunction(r, "Não foi possível gerar.")).toBe("Não foi possível gerar.");
  });
});
