// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O token de acesso dura 10 minutos neste projeto. Ele vence durante o uso
 * normal, e quem estava com a tela aberta recebia 401 — sem aviso, sem nova
 * tentativa, e com a tela mostrando lista vazia.
 *
 * Vazia é o pior resultado possível aqui, porque é EXATAMENTE o que o RLS
 * produz quando nega leitura de verdade (200 com zero linhas). Quem olha a
 * tela não tem como distinguir "sua sessão venceu" de "não há encomenda
 * nenhuma" — e a segunda é uma afirmação sobre o condomínio.
 */

const construtor = (resposta) => {
  // O supabase-js devolve um objeto que só implementa `then`. Imitar isso
  // importa: foi confundi-lo com uma Promise que derrubou o login.
  const alvo = { then: (r) => Promise.resolve(resposta).then(r) };
  return new Proxy(alvo, {
    get: (o, p) => (p === "then" ? o.then : () => construtor(resposta)),
  });
};

const RESPOSTA_401 = { data: null, error: { message: "JWT expired" }, status: 401 };
const RESPOSTA_OK = { data: [{ id: 1 }], error: null, status: 200 };

let respostas = [];
let renovacaoFalha = false;
let renovacoes = 0;

vi.mock("../api/supabase", () => ({
  supabase: {
    from: () => construtor(respostas.shift() ?? RESPOSTA_OK),
    auth: {
      refreshSession: async () => {
        renovacoes++;
        return { error: renovacaoFalha ? { message: "Invalid Refresh Token" } : null };
      },
    },
  },
}));

vi.mock("../api/config", () => ({ MODO_DEMO: false, URL_DEMO: "https://demo.vit.local/exec" }));
vi.mock("../demo/servidor", () => ({ atender: async () => [] }));

beforeEach(() => {
  respostas = [];
  renovacaoFalha = false;
  renovacoes = 0;
});

describe("token vencido no meio do uso", () => {
  it("renova e refaz a leitura, sem a tela perceber", async () => {
    respostas = [RESPOSTA_401, RESPOSTA_OK];
    const { listar } = await import("../api/db");
    await expect(listar("ENTREGADORES")).resolves.toEqual([{ id: 1 }]);
    expect(renovacoes, "deveria ter renovado exatamente uma vez").toBe(1);
  });

  it("não renova quando a leitura deu certo de primeira", async () => {
    // Renovar a cada chamada seria uma ida à rede extra em toda tela.
    respostas = [RESPOSTA_OK];
    const { listar } = await import("../api/db");
    await listar("ENTREGAS");
    expect(renovacoes).toBe(0);
  });

  it("se a renovação falhar, diz que a sessão expirou", async () => {
    respostas = [RESPOSTA_401];
    renovacaoFalha = true;
    const { listar, SESSAO_EXPIRADA } = await import("../api/db");
    await expect(listar("ENTREGAS")).rejects.toThrow(SESSAO_EXPIRADA);
  });

  it("se o token vencer de novo logo depois, não fica tentando para sempre", async () => {
    // Uma segunda chance, e só. Sem esse limite, um token que o servidor
    // recusa por outro motivo viraria laço infinito de renovação.
    respostas = [RESPOSTA_401, RESPOSTA_401];
    const { listar, SESSAO_EXPIRADA } = await import("../api/db");
    await expect(listar("ENTREGAS")).rejects.toThrow(SESSAO_EXPIRADA);
    expect(renovacoes).toBe(1);
  });

  it("erro que NÃO é de token passa direto, com a mensagem original", async () => {
    // Renovar sessão por causa de coluna inexistente esconderia o defeito real.
    respostas = [{ data: null, error: { message: 'column "x" does not exist' }, status: 400 }];
    const { listar } = await import("../api/db");
    await expect(listar("ENTREGAS")).rejects.toThrow(/column "x" does not exist/);
    expect(renovacoes).toBe(0);
  });

  it("gravar também ganha a segunda chance", async () => {
    respostas = [RESPOSTA_401, { data: { id: 7 }, error: null, status: 201 }];
    const { criar } = await import("../api/db");
    await expect(criar("ENTREGAS", { nome: "x" })).resolves.toEqual({ success: true, data: { id: 7 } });
  });

  it("excluir avisa da sessão em vez de dizer que nada foi apagado", async () => {
    // Sem isto, `remover` cairia no "Nenhum registro foi excluído: sem
    // permissão" — que culpa o cargo por um problema de token.
    respostas = [RESPOSTA_401];
    renovacaoFalha = true;
    const { remover, SESSAO_EXPIRADA } = await import("../api/db");
    await expect(remover("ENTREGAS", 1)).resolves.toEqual({
      success: false, message: SESSAO_EXPIRADA,
    });
  });
});
