import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { entregarArquivo, nomeDeArquivo, COMPARTILHADO, CANCELADO, BAIXADO } from "../lib/baixar";

/**
 * O download que funciona no computador e falha calado no celular.
 *
 * Foi o defeito da carteirinha da piscina: `link.href = dataUrl; link.click()`
 * com a âncora nunca inserida na página. No Chrome do desktop isso baixa; no
 * Android o clique programático em elemento solto é ignorado, e o `data:` de
 * uma imagem em pixelRatio 2 passa do teto que o Safari aceita como endereço.
 * Nenhum erro é lançado nos dois casos — o botão só não faz nada.
 *
 * Por isso os testes aqui olham COMO o arquivo é entregue, e não só se a função
 * retornou. Um teste que apenas chamasse `entregarArquivo` e esperasse não
 * estourar passaria com o código quebrado.
 */

const PNG = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

let cliques;
let clickOriginal;

beforeEach(() => {
  cliques = [];
  clickOriginal = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function espiao() {
    // Guarda o estado NO MOMENTO do clique: depois a função remove a âncora, e
    // olhar o DOM no fim do teste não diria nada.
    cliques.push({ href: this.href, download: this.download, ligado: this.isConnected });
  };
  vi.useFakeTimers();
});

afterEach(() => {
  HTMLAnchorElement.prototype.click = clickOriginal;
  vi.useRealTimers();
});

const deps = (extra = {}) => ({
  criarUrl: vi.fn(() => "blob:vit/abc"),
  revogarUrl: vi.fn(),
  celular: false,
  nav: null,
  ...extra,
});

describe("entregarArquivo no desktop", () => {
  it("clica com a âncora dentro do documento", async () => {
    // O coração do defeito. Sem isto o download some no celular.
    const d = deps();
    expect(await entregarArquivo(PNG(), "cart.png", d)).toBe(BAIXADO);
    expect(cliques).toHaveLength(1);
    expect(cliques[0].ligado, "âncora clicada fora do documento").toBe(true);
  });

  it("usa blob: e não data:", async () => {
    const d = deps();
    await entregarArquivo(PNG(), "cart.png", d);
    expect(d.criarUrl).toHaveBeenCalledTimes(1);
    expect(cliques[0].href).toBe("blob:vit/abc");
    expect(cliques[0].href.startsWith("data:")).toBe(false);
  });

  it("leva o nome do arquivo junto", async () => {
    await entregarArquivo(PNG(), "Carteirinha_Neide.png", deps());
    expect(cliques[0].download).toBe("Carteirinha_Neide.png");
  });

  it("não revoga a URL antes de o download começar", async () => {
    // Revogar na mesma volta do laço cancela o download em andamento em alguns
    // navegadores — outro jeito de o botão não fazer nada.
    const d = deps();
    await entregarArquivo(PNG(), "cart.png", d);
    expect(d.revogarUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60000);
    expect(d.revogarUrl).toHaveBeenCalledWith("blob:vit/abc");
  });

  it("não tira a âncora do caminho de ninguém", async () => {
    await entregarArquivo(PNG(), "cart.png", deps());
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });

  it("ignora a folha de compartilhamento mesmo quando ela existe", async () => {
    // Chrome de Windows tem Web Share. O botão diz "Baixar": no desktop tem que
    // baixar arquivo, não abrir a folha de compartilhar.
    const share = vi.fn();
    await entregarArquivo(PNG(), "cart.png", deps({ nav: { canShare: () => true, share } }));
    expect(share).not.toHaveBeenCalled();
    expect(cliques).toHaveLength(1);
  });
});

describe("entregarArquivo no celular", () => {
  const noCelular = (nav) => deps({ celular: true, nav });

  it("oferece a folha nativa, que é onde existe 'Salvar imagem'", async () => {
    const share = vi.fn(async () => {});
    const d = noCelular({ canShare: () => true, share });
    expect(await entregarArquivo(PNG(), "cart.png", d)).toBe(COMPARTILHADO);

    const [{ files, title }] = share.mock.calls[0];
    expect(files[0].name).toBe("cart.png");
    expect(files[0].type).toBe("image/png");
    expect(title).toBe("cart.png");
    expect(cliques, "compartilhou e baixou junto").toHaveLength(0);
  });

  it("cancelar não é erro nem vira download", async () => {
    const share = vi.fn(async () => {
      const e = new Error("cancelou");
      e.name = "AbortError";
      throw e;
    });
    const d = noCelular({ canShare: () => true, share });
    expect(await entregarArquivo(PNG(), "cart.png", d)).toBe(CANCELADO);
    expect(cliques).toHaveLength(0);
  });

  it("se a folha falhar por outro motivo, baixa assim mesmo", async () => {
    // iOS recusa `share` chamado fora do gesto do toque. Terminar aqui deixaria
    // o usuário sem arquivo nenhum — exatamente o que estamos consertando.
    const share = vi.fn(async () => { throw new Error("NotAllowedError"); });
    const d = noCelular({ canShare: () => true, share });
    expect(await entregarArquivo(PNG(), "cart.png", d)).toBe(BAIXADO);
    expect(cliques).toHaveLength(1);
    expect(cliques[0].ligado).toBe(true);
  });

  it("navegador que só compartilha texto cai no download", async () => {
    const share = vi.fn();
    const d = noCelular({ canShare: () => false, share });
    expect(await entregarArquivo(PNG(), "cart.png", d)).toBe(BAIXADO);
    expect(share).not.toHaveBeenCalled();
    expect(cliques).toHaveLength(1);
  });

  it("navegador sem Web Share nenhum cai no download", async () => {
    expect(await entregarArquivo(PNG(), "cart.png", noCelular({}))).toBe(BAIXADO);
    expect(cliques).toHaveLength(1);
  });
});

describe("nomeDeArquivo", () => {
  it("tira acento e espaço do nome do morador", () => {
    expect(nomeDeArquivo("Carteirinha Neide Conceição", "png")).toBe("Carteirinha_Neide_Conceicao.png");
  });

  it("não deixa passar barra, que inventa pasta no download", () => {
    const barraInvertida = String.fromCharCode(92);
    expect(nomeDeArquivo(`a/b${barraInvertida}c`, "png")).toBe("a_b_c.png");
  });

  it("aguenta nome vazio", () => {
    expect(nomeDeArquivo("", "png")).toBe("arquivo.png");
    expect(nomeDeArquivo(null, "png")).toBe("arquivo.png");
  });
});
