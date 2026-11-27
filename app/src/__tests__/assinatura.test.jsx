import React from "react";
import { readFileSync } from "node:fs";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import Assinatura, { assinaturaParaBlob, pontoNoCanvas, recortarTinta } from "../components/Assinatura";

/** Deixa a janela em pé (celular) ou deitada, e avisa quem escuta. */
const orientar = (largura, altura) => {
  window.innerWidth = largura;
  window.innerHeight = altura;
  fireEvent(window, new Event("resize"));
};

afterEach(cleanup);

/** O jsdom não tem canvas: `getContext` devolve null. O componente precisa
 *  registrar o traço mesmo assim, senão não há o que testar — e um navegador
 *  que negue o contexto deixaria de gravar assinatura sem avisar. */
const tracar = (tela) => {
  fireEvent.pointerDown(tela, { clientX: 10, clientY: 10 });
  fireEvent.pointerMove(tela, { clientX: 40, clientY: 25 });
  fireEvent.pointerUp(tela);
};

describe("Assinatura", () => {
  it("comeca vazia e avisa quem a usa", () => {
    const aoMudar = vi.fn();
    render(<Assinatura aoMudar={aoMudar} />);
    expect(aoMudar).toHaveBeenCalledWith(false);
  });

  it("avisa que passou a ter traco", () => {
    const aoMudar = vi.fn();
    render(<Assinatura aoMudar={aoMudar} />);
    tracar(screen.getByTestId("assinatura-tela"));
    expect(aoMudar).toHaveBeenLastCalledWith(true);
  });

  it("limpar devolve ao estado vazio", () => {
    const aoMudar = vi.fn();
    render(<Assinatura aoMudar={aoMudar} />);
    tracar(screen.getByTestId("assinatura-tela"));
    fireEvent.click(screen.getByRole("button", { name: /limpar/i }));
    expect(aoMudar).toHaveBeenLastCalledWith(false);
  });

  it("o botao limpar fica desabilitado enquanto nao ha traco", () => {
    render(<Assinatura aoMudar={() => {}} />);
    expect(screen.getByRole("button", { name: /limpar/i })).toBeDisabled();
  });
});

/**
 * Tela cheia para assinar no celular.
 *
 * Assinar numa faixa de 180px com o dedo sai apertado, e assinatura apertada é
 * a que não se parece com a do documento.
 */
describe("Assinatura em tela cheia", () => {
  const botaoCheia = () => screen.getByRole("button", { name: /tela cheia|pronto/i });

  it("abre e fecha", () => {
    const { container } = render(<Assinatura aoMudar={() => {}} />);
    expect(container.querySelector(".assinatura--cheia")).toBeNull();

    fireEvent.click(botaoCheia());
    expect(container.querySelector(".assinatura--cheia")).not.toBeNull();

    fireEvent.click(botaoCheia()); // agora rotulado "Pronto"
    expect(container.querySelector(".assinatura--cheia")).toBeNull();
  });

  it("MANTÉM o mesmo canvas ao abrir e fechar", () => {
    // O invariante que sustenta a funcionalidade inteira: o desenho mora no
    // elemento canvas, então trocar de elemento apaga a assinatura. Renderizar
    // a tela cheia como outro trecho de JSX faria o React criar outro nó, e o
    // morador assinaria maximizado para ver tudo sumir ao tocar em "Pronto" —
    // sem erro nenhum na tela.
    render(<Assinatura aoMudar={() => {}} />);
    const antes = screen.getByTestId("assinatura-tela");

    fireEvent.click(botaoCheia());
    const durante = screen.getByTestId("assinatura-tela");
    fireEvent.click(botaoCheia());
    const depois = screen.getByTestId("assinatura-tela");

    expect(durante).toBe(antes);
    expect(depois).toBe(antes);
  });

  it("o traço continua valendo depois de maximizar", () => {
    const aoMudar = vi.fn();
    render(<Assinatura aoMudar={aoMudar} />);
    fireEvent.click(botaoCheia());
    tracar(screen.getByTestId("assinatura-tela"));
    fireEvent.click(botaoCheia());
    expect(aoMudar).toHaveBeenLastCalledWith(true);
  });

  it("com o aparelho em pé, gira a área para assinar deitado", () => {
    // Assinatura é um traço largo e baixo: numa tela em pé sobra altura inútil
    // e falta o comprimento do nome. Não dá para contar com travar a
    // orientação — o bloqueio de rotação costuma estar ligado, e o Safari do
    // iPhone não tem `screen.orientation.lock`.
    const largura = window.innerWidth;
    const altura = window.innerHeight;
    const { container } = render(<Assinatura aoMudar={() => {}} />);

    orientar(390, 844); // celular em pé
    fireEvent.click(botaoCheia());
    expect(container.querySelector(".assinatura--girada")).not.toBeNull();

    // Aparelho virado: o navegador já entregou a tela deitada, e girar de novo
    // desfaria o ganho.
    orientar(844, 390);
    expect(container.querySelector(".assinatura--girada")).toBeNull();
    expect(container.querySelector(".assinatura--cheia")).not.toBeNull();

    orientar(largura, altura);
  });

  it("a linha de guia é um elemento, e não um traço no canvas", () => {
    // Desenhá-la no canvas a colocaria dentro do PNG — o comprovante sairia
    // riscado e, pior, o arquivo passaria do tamanho mínimo que hoje denuncia
    // assinatura em branco, desligando a única guarda contra isso.
    const { container } = render(<Assinatura aoMudar={() => {}} />);
    fireEvent.click(botaoCheia());
    expect(container.querySelector(".assinatura__guia")).not.toBeNull();
  });

  it("os botões ficam dentro da área de assinatura", () => {
    // Numa barra própria eles comeriam altura de quem está assinando.
    const { container } = render(<Assinatura aoMudar={() => {}} />);
    fireEvent.click(botaoCheia());
    const area = container.querySelector(".assinatura__area");
    expect(area.querySelector(".assinatura__acoes")).not.toBeNull();
  });

  it("Escape sai da tela cheia sem fechar o diálogo em volta", () => {
    // O diálogo de retirada também escuta Escape. Sem parar a propagação, sair
    // do modo de assinatura levaria junto a retirada inteira.
    const aoEscapar = vi.fn();
    window.addEventListener("keydown", aoEscapar);
    const { container } = render(<Assinatura aoMudar={() => {}} />);

    fireEvent.click(botaoCheia());
    fireEvent.keyDown(window, { key: "Escape" });

    expect(container.querySelector(".assinatura--cheia")).toBeNull();
    expect(aoEscapar).not.toHaveBeenCalled();
    window.removeEventListener("keydown", aoEscapar);
  });
});

/**
 * `toBlob` tem TRÊS jeitos de falhar, e os três precisam devolver null. O
 * terceiro foi encontrado na prática: no canvas do jsdom ele existe, não lança,
 * e simplesmente nunca chama o callback — a Promise ficava pendente para
 * sempre. Na tela isso é o botão de concluir girando eternamente, sem erro e
 * sem retirada, com o morador esperando na frente do porteiro.
 *
 * `null` não é resultado ruim: é o que `registrarRetirada` recusa, com mensagem
 * legível. O inaceitável é ficar pendurado, ou devolver um PNG em branco.
 */
describe("assinaturaParaBlob", () => {
  it("devolve null quando nao ha canvas", async () => {
    await expect(assinaturaParaBlob(null)).resolves.toBeNull();
  });

  it("devolve null quando o canvas nao sabe exportar", async () => {
    await expect(assinaturaParaBlob({})).resolves.toBeNull();
  });

  it("devolve null quando toBlob NUNCA responde, em vez de ficar pendurado", async () => {
    const nuncaResponde = { toBlob: () => {} };
    await expect(assinaturaParaBlob(nuncaResponde, 10)).resolves.toBeNull();
  });

  it("devolve null quando toBlob lanca", async () => {
    const lanca = { toBlob: () => { throw new Error("bloqueado por privacidade"); } };
    await expect(assinaturaParaBlob(lanca, 10)).resolves.toBeNull();
  });

  it("devolve o blob quando o navegador exporta", async () => {
    const blob = new Blob([new Uint8Array(2000)], { type: "image/png" });
    const funciona = { toBlob: (cb) => cb(blob) };
    await expect(assinaturaParaBlob(funciona)).resolves.toBe(blob);
  });

  it("sem recorte (pixels nao lidos), o blob NAO sai como traco conferido", async () => {
    // Sem leitura de pixels não há como saber se tem tinta: quem grava volta a
    // usar o tamanho do arquivo como guarda.
    const blob = new Blob([new Uint8Array(700)], { type: "image/png" });
    const r = await assinaturaParaBlob({ toBlob: (cb) => cb(blob) });
    expect(r.tintaConferida).toBeUndefined();
  });

  it("com recorte (tinta achada nos pixels), o blob sai como traco conferido", async () => {
    const data = new Uint8ClampedArray(400 * 200 * 4);
    data[(100 * 400 + 200) * 4 + 3] = 255; // um ponto de tinta
    const tela = {
      width: 400, height: 200,
      getContext: () => ({ getImageData: () => ({ data, width: 400, height: 200 }) }),
      toBlob: (cb) => cb(new Blob([new Uint8Array(3000)])),
    };
    const corte = {
      getContext: () => ({ fillRect: () => {}, drawImage: () => {} }),
      toBlob: (cb) => cb(new Blob([new Uint8Array(700)], { type: "image/png" })),
    };
    vi.spyOn(document, "createElement").mockReturnValue(corte);
    try {
      const r = await assinaturaParaBlob(tela);
      expect(r.size).toBe(700); // é o recorte, não o canvas inteiro
      expect(r.tintaConferida).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("uma resposta atrasada NAO sobrescreve o null do prazo", async () => {
    // Resolver duas vezes esconderia o estouro de prazo em vez de mostrá-lo.
    let guardado;
    const atrasado = { toBlob: (cb) => { guardado = cb; } };
    const p = assinaturaParaBlob(atrasado, 10);
    await expect(p).resolves.toBeNull();
    guardado(new Blob([new Uint8Array(2000)]));
    await expect(p).resolves.toBeNull();
  });
});

/**
 * O ponto tocado, quando a área está girada 90°.
 *
 * `getBoundingClientRect` devolve a caixa JÁ transformada, então subtrair
 * `left`/`top` como de costume dá um ponto errado — e o erro não é sutil: o
 * traço aparece longe do dedo, num lugar que parece aleatório. Como o defeito
 * só existe em celular em pé, seria o tipo de coisa que ninguém pega em teste
 * de tela.
 */
describe("pontoNoCanvas", () => {
  // Tela em pé de 400x800. A área é deitada (800x400) e girada 90°, então a
  // caixa transformada ocupa a tela inteira.
  const CAIXA = { left: 0, top: 0, width: 400, height: 800 };

  it("sem giro, é a subtração de sempre", () => {
    const caixa = { left: 10, top: 20, width: 300, height: 180 };
    expect(pontoNoCanvas({ clientX: 60, clientY: 70 }, caixa, false)).toEqual({ x: 50, y: 50 });
  });

  it("girado, troca os eixos e inverte um deles", () => {
    // Canto de cima à esquerda da TELA é o canto de baixo à esquerda do canvas.
    expect(pontoNoCanvas({ clientX: 0, clientY: 0 }, CAIXA, true)).toEqual({ x: 0, y: 400 });
    // Canto de cima à direita da tela é a origem do canvas.
    expect(pontoNoCanvas({ clientX: 400, clientY: 0 }, CAIXA, true)).toEqual({ x: 0, y: 0 });
    // Descer a tela é andar no comprimento do canvas.
    expect(pontoNoCanvas({ clientX: 400, clientY: 800 }, CAIXA, true)).toEqual({ x: 800, y: 0 });
  });

  it("o meio da tela é o meio do canvas", () => {
    expect(pontoNoCanvas({ clientX: 200, clientY: 400 }, CAIXA, true)).toEqual({ x: 400, y: 200 });
  });

  it("evento sem coordenada não vira NaN", () => {
    expect(pontoNoCanvas({}, CAIXA, true)).toEqual({ x: 0, y: 400 });
  });

  /**
   * O bitmap para de acompanhar o elemento assim que há tinta — redimensionar
   * apagaria o desenho. A partir daí quem estica é o CSS, com `object-fit:
   * contain`, e o ponto tocado precisa atravessar essa conversão.
   *
   * Sem isso, bastava a caixa mudar de tamanho para o traço nascer deslocado —
   * e `100dvh` muda sozinha toda vez que a barra de endereço do celular aparece
   * ou some. Era o "às vezes não sai a assinatura": o dedo desenhava e o
   * desenho caía fora do quadro.
   */
  describe("do elemento para o bitmap", () => {
    it("elemento e bitmap na mesma proporção: só a escala", () => {
      // Caixa de 300x150 exibindo um bitmap de 600x300: tudo vale o dobro.
      const caixa = { left: 0, top: 0, width: 300, height: 150 };
      const bitmap = { width: 600, height: 300 };
      expect(pontoNoCanvas({ clientX: 150, clientY: 75 }, caixa, false, bitmap))
        .toEqual({ x: 300, y: 150 });
    });

    it("desconta a faixa vazia que o `contain` deixa nas laterais", () => {
      // Bitmap 600x300 (2:1) numa caixa 300x300 (1:1): a imagem ocupa 300x150
      // e sobram 75px em cima e embaixo. Tocar no MEIO da caixa é o meio do
      // desenho; sem descontar a sobra, cairia 150px abaixo dele.
      const caixa = { left: 0, top: 0, width: 300, height: 300 };
      const bitmap = { width: 600, height: 300 };
      expect(pontoNoCanvas({ clientX: 150, clientY: 150 }, caixa, false, bitmap))
        .toEqual({ x: 300, y: 150 });
      // O topo do DESENHO fica a 75px do topo da caixa.
      expect(pontoNoCanvas({ clientX: 0, clientY: 75 }, caixa, false, bitmap))
        .toEqual({ x: 0, y: 0 });
    });

    it("a caixa encolher não desloca o traço", () => {
      // É o caso real: a barra de endereço aparece, `100dvh` cai, e o elemento
      // encolhe com o bitmap intacto. O mesmo ponto do desenho continua sob o
      // mesmo ponto da tela, proporcionalmente.
      const bitmap = { width: 600, height: 300 };
      const grande = pontoNoCanvas({ clientX: 150, clientY: 75 },
        { left: 0, top: 0, width: 300, height: 150 }, false, bitmap);
      const menor = pontoNoCanvas({ clientX: 100, clientY: 50 },
        { left: 0, top: 0, width: 200, height: 100 }, false, bitmap);
      expect(menor).toEqual(grande);
    });

    it("girado, a conversão vale igual", () => {
      // Tela em pé 400x800; a área é 800x400 girada. Bitmap 800x400: escala 1.
      const bitmap = { width: 800, height: 400 };
      expect(pontoNoCanvas({ clientX: 200, clientY: 400 }, CAIXA, true, bitmap))
        .toEqual({ x: 400, y: 200 });
    });

    it("sem bitmap, volta ao comportamento antigo", () => {
      // jsdom e o primeiro toque antes do ajuste caem aqui.
      expect(pontoNoCanvas({ clientX: 200, clientY: 400 }, CAIXA, true, null))
        .toEqual({ x: 400, y: 200 });
      expect(pontoNoCanvas({ clientX: 200, clientY: 400 }, CAIXA, true, { width: 0, height: 0 }))
        .toEqual({ x: 400, y: 200 });
    });
  });
});

/**
 * O recorte da tinta.
 *
 * Nasceu de duas reclamações que eram o mesmo defeito: o PNG era o canvas
 * INTEIRO. Assinar ocupa uma faixa no meio de uma área grande, então o
 * comprovante saía como um retângulo branco com um risco perdido no meio — e
 * quem assinava em tela cheia ainda via o traço ser reamostrado para 180px na
 * volta, o que borrava de vez.
 *
 * A conta da caixa delimitadora é o tipo de coisa que erra em silêncio: um
 * índice trocado desloca o recorte e ninguém percebe até abrir o comprovante
 * numa discussão. O jsdom não tem canvas, então os dois canvas são de mentira —
 * o que se mede aqui é a ARITMÉTICA, que é onde mora o risco.
 */
describe("recortarTinta", () => {
  const telaFalsa = (largura, altura, pintar) => {
    const data = new Uint8ClampedArray(largura * altura * 4);
    pintar((x, y, alfa = 255) => { data[(y * largura + x) * 4 + 3] = alfa; });
    return {
      width: largura,
      height: altura,
      getContext: () => ({ getImageData: () => ({ data, width: largura, height: altura }) }),
    };
  };

  /** Troca o canvas que `recortarTinta` cria, e anota o que foi desenhado. */
  const espiarCorte = () => {
    const corte = { width: 0, height: 0, desenhos: [] };
    corte.getContext = () => ({
      fillStyle: "",
      fillRect: (...a) => corte.desenhos.push(["fill", ...a]),
      drawImage: (...a) => corte.desenhos.push(["draw", ...a.slice(1)]),
    });
    vi.spyOn(document, "createElement").mockReturnValue(corte);
    return corte;
  };

  afterEach(() => vi.restoreAllMocks());

  it("recorta a tinta com margem, e não o canvas inteiro", () => {
    const tela = telaFalsa(1000, 400, (por) => {
      for (let x = 500; x <= 560; x++) for (let y = 200; y <= 230; y++) por(x, y);
    });
    const corte = espiarCorte();
    expect(recortarTinta(tela)).toBe(corte);

    // 93x63 de tinta+margem, esticado para o mínimo por MARGEM BRANCA.
    expect([corte.width, corte.height]).toEqual([320, 107]);
    const draw = corte.desenhos.find((d) => d[0] === "draw");
    // Origem no canvas: x 484, y 184, 93x63. Escala 1:1 — nada de esticar.
    expect(draw.slice(1, 5)).toEqual([484, 184, 93, 63]);
    expect(draw.slice(7)).toEqual([93, 63]);
  });

  it("pinta o fundo de branco", () => {
    // O PNG do canvas é transparente. Comprovante transparente aberto num
    // visualizador de fundo escuro vira folha preta com tinta preta.
    const tela = telaFalsa(400, 200, (por) => por(100, 100));
    const corte = espiarCorte();
    recortarTinta(tela);
    expect(corte.desenhos[0][0]).toBe("fill");
  });

  it("canvas em branco devolve null", () => {
    espiarCorte();
    expect(recortarTinta(telaFalsa(400, 200, () => {}))).toBeNull();
  });

  it("ignora a borda suavizada do traço", () => {
    // O antialias deixa pixels quase transparentes espalhados. Contá-los
    // devolveria quase o canvas inteiro — ou seja, recorte nenhum.
    const tela = telaFalsa(400, 200, (por) => {
      por(10, 10, 4);    // fantasma no canto
      por(390, 190, 4);  // fantasma no outro canto
      por(200, 100, 255); // a tinta de verdade
    });
    const corte = espiarCorte();
    recortarTinta(tela);
    const draw = corte.desenhos.find((d) => d[0] === "draw");
    expect(draw.slice(1, 3)).toEqual([184, 84]); // 200-16, 100-16
  });

  it("navegador que nega os pixels devolve null, e não estoura", () => {
    // Canvas bloqueado por privacidade. Quem chama exporta sem recorte:
    // enquadramento pior, mesma prova.
    const bloqueado = {
      width: 100, height: 100,
      getContext: () => ({ getImageData: () => { throw new Error("SecurityError"); } }),
    };
    expect(recortarTinta(bloqueado)).toBeNull();
  });

  it("pixels de mentira (folha toda opaca) não viram traço conferido", () => {
    // Navegador com proteção de privacidade pode devolver uma folha opaca em
    // vez de negar a leitura. Recortar isso marcaria o PNG como assinado.
    espiarCorte();
    const tela = telaFalsa(100, 50, (por) => {
      for (let x = 0; x < 100; x++) for (let y = 0; y < 50; y++) por(x, y);
    });
    expect(recortarTinta(tela)).toBeNull();
  });

  it("canvas sem contexto 2D devolve null", () => {
    expect(recortarTinta({ width: 100, height: 100, getContext: () => null })).toBeNull();
  });
});

/**
 * A tela cheia depende de uma regra de CSS que não tem nada a ver com
 * assinatura — e por isso ninguém liga uma coisa na outra quando quebra.
 *
 * `position: fixed` se prende ao ancestral TRANSFORMADO mais próximo, se
 * houver um. E elemento com animação de `transform` filtrando para a frente
 * (`animation-fill-mode: both`) continua contando como transformado depois de
 * a animação acabar. Como a assinatura vive dentro de um modal, `both` no
 * modal fazia a "tela cheia" cobrir só o cartão do diálogo.
 *
 * Nada disso aparece em teste de componente: o jsdom não calcula layout nem
 * roda animação. Sobra ler a regra.
 */
describe("a tela cheia não pode ficar presa no modal", () => {
  const css = () => readFileSync("src/styles/ui.css", "utf8");

  it("nenhuma animação do modal preenche para a frente", () => {
    const comBoth = [...css().matchAll(/\.vit-modal\s*\{\s*animation:[^;]*;/g)]
      .map((m) => m[0])
      .filter((regra) => /\bboth\b|\bforwards\b/.test(regra));
    expect(
      comBoth,
      "modal com transform filtrando vira bloco de contenção, e o `position: fixed` de dentro para de cobrir a tela"
    ).toEqual([]);
  });

  it("a assinatura em tela cheia continua sendo fixed", () => {
    const retirada = readFileSync("src/styles/retirada.css", "utf8");
    expect(retirada).toMatch(/\.assinatura--cheia\s*\{[^}]*position:\s*fixed/);
  });
});
