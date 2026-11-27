import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A migração dos 402 arquivos do Drive para o bucket criou um estado que antes
 * não existia: a MESMA linha passou a ter os dois endereços ao mesmo tempo.
 * `url_drive` continua gravado — de propósito, é a cópia de segurança, e nada
 * no sistema apaga arquivo do Drive — e `caminho_storage` agora aponta para a
 * cópia que o sistema realmente usa.
 *
 * Nessa situação a ORDEM da consulta é tudo. Perguntando pelo Drive primeiro,
 * as 401 linhas migradas voltariam a apontar para lá, onde o `getFoto` não
 * responde mais desde que o login saiu do Apps Script. O resultado seria o pior
 * tipo de defeito: arquivo presente, tela em branco, nenhum erro em log nenhum.
 */

const mockSignedUrl = vi.fn();
const mockSignedUrls = vi.fn();
const mockList = vi.fn();
const mockRemove = vi.fn();
vi.mock("../api/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: (...a) => mockSignedUrl(...a),
        createSignedUrls: (...a) => mockSignedUrls(...a),
        list: (...a) => mockList(...a),
        remove: (...a) => mockRemove(...a),
      }),
    },
  },
}));

const { urlDoAnexo, urlsDosAnexos, removerAnexo, removerAnexosDoRegistro } = await import("../api/anexos");

const ASSINADA = "https://SEU_PROJECT_REF.supabase.co/storage/v1/object/sign/anexos/piscina/13/x.jpg?token=eyJhbGciOi";
const DRIVE = "https://drive.google.com/file/d/1dtUtiKYJ71Fm48ReQOJmdtiFszD3bZFz/view?usp=drivesdk";

beforeEach(() => {
  vi.clearAllMocks();
  mockSignedUrl.mockResolvedValue({ data: { signedUrl: ASSINADA }, error: null });
});

describe("urlDoAnexo depois da migração do Drive", () => {
  it("linha migrada tem os dois endereços e o bucket ganha", async () => {
    // Este é exatamente o formato de todas as 401 linhas migradas.
    const url = await urlDoAnexo({ url_drive: DRIVE, caminho_storage: "piscina/13/x.jpg" });
    expect(url).toBe(ASSINADA);
    expect(mockSignedUrl).toHaveBeenCalledWith("piscina/13/x.jpg", expect.any(Number));
  });

  it("linha não migrada continua sendo lida do Drive", async () => {
    // Os 3 anexos que o Drive não devolveu ficaram assim, e qualquer arquivo
    // que venha a falhar numa migração futura também. Eles não podem sumir.
    const url = await urlDoAnexo({ url_drive: DRIVE, caminho_storage: null });
    expect(url).toBe(DRIVE);
    expect(mockSignedUrl).not.toHaveBeenCalled();
  });

  it("se o bucket recusar a assinatura, cai para o Drive em vez de sumir", async () => {
    // Sem permissão para o objeto, ou objeto ausente: o registro ainda tem uma
    // origem válida. Devolver null aqui apagaria o anexo da tela sem motivo.
    mockSignedUrl.mockResolvedValue({ data: null, error: { message: "Object not found" } });
    const url = await urlDoAnexo({ url_drive: DRIVE, caminho_storage: "piscina/13/sumiu.jpg" });
    expect(url).toBe(DRIVE);
  });

  it("sem nenhum dos dois, devolve null", async () => {
    expect(await urlDoAnexo({})).toBeNull();
    expect(await urlDoAnexo(null)).toBeNull();
  });

  it("anexo novo, que nunca passou pelo Drive, usa o bucket", async () => {
    expect(await urlDoAnexo({ caminho_storage: "piscina-atestados/208/novo.pdf" })).toBe(ASSINADA);
  });
});

/**
 * O `remove` do Storage tem um comportamento que engana: quando a política
 * BARRA a exclusão, ele responde `error: null` e devolve a lista vazia do que
 * saiu. Quem confere só o `error` conclui "apagado" e segue em frente — com o
 * arquivo ainda no bucket e ainda alcançável por URL assinada.
 *
 * Na tela de piscina isso significa o atestado médico de alguém continuar
 * disponível depois de o sistema dizer, na cara do síndico, que apagou.
 */
describe("remover anexo: a lista devolvida é a verdade, não o error", () => {
  it("bloqueio silencioso (sem error, sem nada removido) é falha", async () => {
    mockRemove.mockResolvedValue({ data: [], error: null });
    const r = await removerAnexo("piscina-atestados/13/x.pdf");
    expect(r.success).toBe(false);
  });

  it("removido de fato é sucesso", async () => {
    mockRemove.mockResolvedValue({ data: [{ name: "x.pdf" }], error: null });
    expect((await removerAnexo("piscina-atestados/13/x.pdf")).success).toBe(true);
  });
});

describe("excluir cadastro leva a pasta inteira", () => {
  it("apaga tudo o que está na pasta, não só o que a linha referencia", async () => {
    // A foto trocada antes do 0018 ficou órfã: não aparece em tela nenhuma e
    // some do sistema junto com o cadastro. Sem varrer a pasta, ela fica.
    mockList.mockResolvedValue({
      data: [{ name: "atual.jpg" }, { name: "orfa-de-uma-troca-antiga.jpg" }],
      error: null,
    });
    mockRemove.mockResolvedValue({ data: [{ name: "a" }, { name: "b" }], error: null });

    const r = await removerAnexosDoRegistro("piscina", 13);
    expect(r.success).toBe(true);
    expect(r.removidos).toBe(2);
    expect(mockRemove).toHaveBeenCalledWith([
      "piscina/13/atual.jpg",
      "piscina/13/orfa-de-uma-troca-antiga.jpg",
    ]);
  });

  it("pasta vazia é sucesso sem remover nada", async () => {
    mockList.mockResolvedValue({ data: [], error: null });
    const r = await removerAnexosDoRegistro("piscina-atestados", 13);
    expect(r.success).toBe(true);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("sobrar arquivo é falha, mesmo com parte removida", async () => {
    // Meio apagado é o caso perigoso: o cadastro sumiu e um arquivo ficou.
    // Se isto passasse como sucesso, ninguém jamais saberia.
    mockList.mockResolvedValue({ data: [{ name: "a.jpg" }, { name: "b.pdf" }], error: null });
    mockRemove.mockResolvedValue({ data: [{ name: "a.jpg" }], error: null });

    const r = await removerAnexosDoRegistro("piscina", 13);
    expect(r.success).toBe(false);
    expect(r.removidos).toBe(1);
  });
});

describe("urlsDosAnexos: links em lote (544 DatabaseTimeout de 23/11/2026)", () => {
  const assinar = (caminhos) => ({ data: caminhos.map((p) => ({ path: p, signedUrl: `https://bucket/${p}`, error: null })), error: null });

  it("pede de 100 em 100, um lote depois do outro, sem repetir caminho", async () => {
    mockSignedUrls.mockImplementation(async (caminhos) => assinar(caminhos));
    const caminhos = Array.from({ length: 250 }, (_, i) => `encomendas/${i}/f.jpg`);
    const links = await urlsDosAnexos([...caminhos, caminhos[0], null, ""]);
    expect(mockSignedUrls).toHaveBeenCalledTimes(3);
    expect(mockSignedUrls.mock.calls.map(([c]) => c.length)).toEqual([100, 100, 50]);
    expect(mockSignedUrl).not.toHaveBeenCalled();
    expect(links.size).toBe(250);
    expect(links.get("encomendas/7/f.jpg")).toBe("https://bucket/encomendas/7/f.jpg");
  });

  it("o que falha fica de fora, sem derrubar o resto", async () => {
    mockSignedUrls
      .mockResolvedValueOnce({ data: [{ path: "a/1/x.jpg", signedUrl: "https://bucket/a", error: null }, { path: "a/2/sumiu.jpg", signedUrl: null, error: "not found" }], error: null });
    const links = await urlsDosAnexos(["a/1/x.jpg", "a/2/sumiu.jpg"]);
    expect([...links.keys()]).toEqual(["a/1/x.jpg"]);

    mockSignedUrls.mockRejectedValueOnce(new Error("rede"));
    expect((await urlsDosAnexos(["b/1/y.jpg"])).size).toBe(0);
  });

  it("lista vazia não chama o Storage", async () => {
    expect((await urlsDosAnexos([])).size).toBe(0);
    expect(mockSignedUrls).not.toHaveBeenCalled();
  });
});
