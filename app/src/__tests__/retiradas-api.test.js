// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

let uploadResposta = { data: { path: "x" }, error: null };
let rpcResposta = { data: 42, error: null };
const chamadas = [];

vi.mock("../api/supabase", () => ({
  supabase: {
    storage: { from: () => ({ upload: async (caminho, blob) => { chamadas.push(["upload", caminho, blob]); return uploadResposta; } }) },
    rpc: async (nome, args) => { chamadas.push(["rpc", nome, args]); return rpcResposta; },
  },
}));

beforeEach(() => {
  chamadas.length = 0;
  uploadResposta = { data: { path: "x" }, error: null };
  rpcResposta = { data: 42, error: null };
});

// Blob com conteúdo: um PNG de verdade tem centenas de bytes. Ver o teste do
// blob em branco, mais abaixo.
const assinaturaValida = () => new Blob([new Uint8Array(2000)], { type: "image/png" });

const dados = {
  idUnidade: 5302, nome: "Fulano de Teste", cpf: "111.222.333-44",
  idMorador: null, via: "identificacao", observacao: "",
  entregas: [7], entreguePor: "Porteiro",
};

describe("registrarRetirada", () => {
  it("reconhecido pelo app: grava pela função que completa o CPF no banco, sem mandar CPF", async () => {
    // Auditoria 05/11 (V3, 0096): o CPF de quem usa o app não passa pelo navegador.
    const { registrarRetirada } = await import("../api/retiradas");
    await registrarRetirada({ ...dados, cpf: "", via: "codigo", pelaApp: { cod: "K7M2P", idApp: 42 }, assinatura: assinaturaValida() });
    const [, nome, args] = chamadas.find((c) => c[0] === "rpc");
    expect(nome).toBe("registrar_retirada_do_app");
    expect(args).toMatchObject({ p_cod: "K7M2P", p_id_app: 42, p_id_unidade: 5302 });
    expect(args).not.toHaveProperty("p_retirado_por_cpf");
  });

  it("identificação pelo porteiro: segue na função de sempre, com o CPF digitado", async () => {
    const { registrarRetirada } = await import("../api/retiradas");
    await registrarRetirada({ ...dados, assinatura: assinaturaValida() });
    const [, nome, args] = chamadas.find((c) => c[0] === "rpc");
    expect(nome).toBe("registrar_retirada");
    expect(args.p_retirado_por_cpf).toBe("111.222.333-44");
  });

  it("sobe a assinatura ANTES de gravar a linha", async () => {
    const { registrarRetirada } = await import("../api/retiradas");
    await registrarRetirada({ ...dados, assinatura: assinaturaValida() });
    expect(chamadas.map((c) => c[0])).toEqual(["upload", "rpc"]);
  });

  it("o caminho e sorteado, nao o id da retirada", async () => {
    const { registrarRetirada } = await import("../api/retiradas");
    await registrarRetirada({ ...dados, assinatura: assinaturaValida() });
    const caminho = chamadas.find((c) => c[0] === "upload")[1];
    expect(caminho).toMatch(/^retiradas\/[a-z0-9-]+\/assinatura\.png$/);
    // A pasta não pode ser o id da retirada — ele só existe DEPOIS, e usá-lo
    // obrigaria a gravar a linha antes da assinatura.
    //
    // Compara o segmento, e não `not.toContain("42")`: um uuid contém a
    // sequência "42" em 15% dos sorteios (medido em 200 mil), então aquela
    // asserção reprovaria a suíte sozinha uma vez a cada sete execuções, sem
    // nada estar errado. Teste que falha por acaso ensina a ignorar teste.
    expect(caminho.split("/")[1]).not.toBe("42");
  });

  it("se a assinatura nao subir, NADA e gravado", async () => {
    uploadResposta = { data: null, error: { message: "storage cheio" } };
    const { registrarRetirada } = await import("../api/retiradas");
    const r = await registrarRetirada({ ...dados, assinatura: assinaturaValida() });
    expect(r.success).toBe(false);
    expect(chamadas.some((c) => c[0] === "rpc")).toBe(false);
  });

  it("recusa antes de qualquer rede quando nao ha assinatura", async () => {
    const { registrarRetirada } = await import("../api/retiradas");
    const r = await registrarRetirada({ ...dados, assinatura: null });
    expect(r.success).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("recusa assinatura em BRANCO, que e pior que assinatura nenhuma", async () => {
    // Se o navegador negar o contexto 2D, o campo diz "assinado" e o canvas
    // devolve um PNG vazio. Gravar isso produz um comprovante que parece
    // completo e nao prova nada -- exatamente o que este desenho existe para
    // evitar. Um PNG com traco tem milhares de bytes; um em branco, poucas
    // centenas.
    const emBranco = new Blob([new Uint8Array(120)], { type: "image/png" });
    const { registrarRetirada } = await import("../api/retiradas");
    const r = await registrarRetirada({ ...dados, assinatura: emBranco });
    expect(r.success).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("rubrica curta com traco conferido passa, mesmo abaixo de 1000 bytes", async () => {
    // 24/11/2026: o recorte com margem branca deixa rubrica curta com ~700
    // bytes, e a guarda de tamanho a recusava como "nao capturada". Quando o
    // recorte leu os pixels e achou tinta, o tamanho nao decide mais.
    const rubrica = new Blob([new Uint8Array(700)], { type: "image/png" });
    Object.defineProperty(rubrica, "tintaConferida", { value: true });
    const { registrarRetirada } = await import("../api/retiradas");
    const r = await registrarRetirada({ ...dados, assinatura: rubrica });
    expect(r.success).toBe(true);
  });

  it("devolve o id da retirada quando da certo", async () => {
    const { registrarRetirada } = await import("../api/retiradas");
    const r = await registrarRetirada({ ...dados, assinatura: assinaturaValida() });
    expect(r).toEqual({ success: true, id: 42 });
  });

  it("erro da funcao do banco vira mensagem, nao excecao", async () => {
    rpcResposta = { data: null, error: { message: "Sem encomenda marcada, a observação é obrigatória." } };
    const { registrarRetirada } = await import("../api/retiradas");
    const r = await registrarRetirada({ ...dados, assinatura: assinaturaValida() });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/observação é obrigatória/);
  });

  // Teste e2e 12/11: apto com morador só no app e ninguém no cadastro do
  // condomínio. A encomenda guarda id_morador "" (coluna texto) e o banco
  // respondia 400 "invalid input syntax for type bigint" ao concluir.
  it.each([["", null], ["  ", null], [undefined, null], [null, null], ["17", 17], [17, 17], ["abc", null]])(
    "id_morador %j vai para o banco como %j, nos dois caminhos",
    async (idMorador, esperado) => {
      const { registrarRetirada } = await import("../api/retiradas");
      await registrarRetirada({ ...dados, idMorador, assinatura: assinaturaValida() });
      await registrarRetirada({ ...dados, idMorador, cpf: "", via: "codigo", pelaApp: { cod: "K7M2P", idApp: 42 }, assinatura: assinaturaValida() });
      const rpcs = chamadas.filter((c) => c[0] === "rpc");
      expect(rpcs.map((c) => c[1])).toEqual(["registrar_retirada", "registrar_retirada_do_app"]);
      for (const [, , args] of rpcs) expect(args.p_id_morador).toBe(esperado);
    }
  );
});
