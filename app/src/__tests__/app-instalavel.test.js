// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * O ViT precisa ser instalável na tela inicial do celular.
 *
 * O Chrome só oferece "Instalar app" quando três coisas coincidem: manifest com
 * nome, ícones de 192 e 512, e um service worker com tratador de `fetch`.
 * Faltando qualquer uma, o menu dá apenas o atalho comum — que abre com a barra
 * de endereço por cima e come altura de tela que a portaria não tem de sobra.
 *
 * Nada disso quebra o sistema quando some. Simplesmente deixa de instalar, em
 * silêncio, e ninguém descobre até tentar no celular de outra pessoa.
 */

const ler = (f) => readFileSync(f, "utf8");
const manifest = () => JSON.parse(ler("public/manifest.webmanifest"));

describe("o manifest", () => {
  it("tem nome, escopo e abre em janela própria", () => {
    const m = manifest();
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBeTruthy();
    expect(m.scope).toBe("/");
  });

  it("tem os dois tamanhos que o Chrome exige", () => {
    const tamanhos = manifest().icons.map((i) => i.sizes);
    expect(tamanhos).toContain("192x192");
    expect(tamanhos).toContain("512x512");
  });

  it("tem ícone maskable, senão o Android corta as pontas", () => {
    // A máscara do sistema recorta até 10% de cada lado. Sem uma versão com
    // folga, as barras da marca saem mutiladas na tela inicial.
    const mascara = manifest().icons.filter((i) => i.purpose === "maskable");
    expect(mascara.length).toBeGreaterThanOrEqual(2);
    expect(mascara.map((i) => i.sizes)).toContain("512x512");
  });

  it("todo ícone declarado existe mesmo, e é PNG de verdade", () => {
    // Ícone declarado e ausente derruba a instalação inteira, sem mensagem.
    for (const icone of manifest().icons) {
      const bytes = readFileSync(`public${icone.src}`);
      expect(bytes.subarray(0, 8), `${icone.src} não é PNG`)
        .toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

      // As dimensões vivem no IHDR, bytes 16..24.
      const largura = bytes.readUInt32BE(16);
      const altura = bytes.readUInt32BE(20);
      const [w, h] = icone.sizes.split("x").map(Number);
      expect([largura, altura], `${icone.src} não tem ${icone.sizes}`).toEqual([w, h]);
    }
  });

  it("a cor do tema bate com a do index.html", () => {
    // Divergindo, a barra de status pisca de uma cor para outra ao abrir.
    const html = ler("index.html");
    const doHtml = html.match(/name="theme-color" content="([^"]+)"/)?.[1];
    expect(doHtml).toBe(manifest().theme_color);
  });
});

describe("o service worker", () => {
  const sw = () => ler("public/sw.js");

  it("tem tratador de fetch, que é o que torna instalável", () => {
    expect(sw()).toMatch(/addEventListener\("fetch"/);
  });

  it("NÃO guarda resposta de API", () => {
    // Servir encomenda ou retirada de um cache é pior que a tela não carregar:
    // o porteiro veria um pacote que já saiu, sem nada dizendo que é velho.
    const texto = sw();
    expect(texto).toMatch(/url\.origin !== self\.location\.origin/);
    expect(texto).toMatch(/pedido\.method !== "GET"/);

    // Sem os comentários: o cabeçalho do arquivo cita o Supabase justamente
    // para explicar por que ele fica de fora, e proibir a palavra no arquivo
    // inteiro proibiria a explicação.
    const codigo = texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codigo, "o código não pode mencionar o Supabase").not.toMatch(/supabase/i);
    expect(codigo, "nada de guardar POST").not.toMatch(/caches\.open[\s\S]{0,200}method/i);
  });

  it("só guarda arquivo com nome versionado pelo build", () => {
    // `/assets/algo-a1b2c3.js` muda de nome a cada publicação, então cache
    // velho nunca é servido no lugar de código novo.
    expect(sw()).toContain('url.pathname.startsWith("/assets/")');
  });

  it("não guarda resposta que veio com erro", () => {
    // Resposta parcial ou de erro guardada vira uma tela quebrada que
    // sobrevive ao recarregamento — e some só limpando o site.
    expect(sw()).toMatch(/resposta\.ok && resposta\.status === 200/);
  });

  it("navegação é rede primeiro", () => {
    // Cache primeiro na navegação serviria a versão anterior do app depois de
    // toda publicação.
    expect(sw()).toMatch(/pedido\.mode === "navigate"/);
    expect(sw()).toMatch(/fetch\(pedido\)\.catch\(\(\) => caches\.match/);
  });
});

describe("a página", () => {
  it("aponta para o manifest e para o ícone do iPhone", () => {
    const html = ler("index.html");
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    // O iOS ignora o manifest inteiro: sem estas duas, o atalho do iPhone abre
    // dentro do Safari, com a barra de endereço.
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
  });

  it("registra o service worker só em produção", () => {
    // Em desenvolvimento ele guardaria a casca antiga e faria parecer que a
    // alteração não subiu.
    const main = ler("src/main.jsx");
    expect(main).toMatch(/import\.meta\.env\.PROD && "serviceWorker" in navigator/);
    expect(main).toContain('navigator.serviceWorker.register("/sw.js")');
  });
});
