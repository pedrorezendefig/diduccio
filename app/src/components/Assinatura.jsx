import React, { useEffect, useRef, useState } from "react";
import { Button } from "../ui";

/**
 * Quanto se espera pelo `toBlob` antes de desistir.
 *
 * Existe porque `toBlob` tem um terceiro comportamento além de "funciona" e
 * "não existe": ele pode simplesmente NUNCA chamar o callback. É o que o canvas
 * do jsdom faz, e é o que um navegador faz quando a exportação é bloqueada por
 * privacidade ou falta de memória.
 *
 * Sem este prazo, a Promise nunca resolve: quem chamou fica pendurado num
 * `await` para sempre. Na tela isso é o botão girando eternamente, sem erro e
 * sem retirada — o porteiro trava com o morador esperando na frente dele. Cinco
 * segundos é folgado para exportar um PNG de 180px e curto para quem espera.
 */
const PRAZO_EXPORTACAO = 5000;

/**
 * Devolve a assinatura desenhada como Blob PNG, ou `null` quando o navegador
 * não souber exportar.
 *
 * Vive FORA do componente de propósito: `toBlob` não funciona no canvas do
 * jsdom, então qualquer coisa que dependa dele é intestável. Isolando aqui, o
 * componente continua testável e sobra um único ponto do arquivo que depende do
 * navegador de verdade.
 *
 * NUNCA rejeita e nunca fica pendente: devolve `null` em todos os três jeitos de
 * falhar. Quem recusa `null` é `registrarRetirada`, com mensagem escrita para o
 * porteiro ler — e é essa recusa que impede gravar comprovante em branco.
 */
export function assinaturaParaBlob(tela, prazo = PRAZO_EXPORTACAO) {
  return new Promise((resolve) => {
    if (!tela || typeof tela.toBlob !== "function") {
      resolve(null);
      return;
    }

    // Exporta o RECORTE quando dá. Falhando o recorte, exporta o canvas inteiro
    // — enquadramento pior, mas nunca comprovante nenhum.
    const fonte = recortarTinta(tela) ?? tela;
    if (typeof fonte.toBlob !== "function") {
      resolve(null);
      return;
    }

    // Uma resposta só: o `toBlob` pode chamar o callback depois de o prazo ter
    // estourado, e resolver duas vezes esconderia o problema em vez de mostrá-lo.
    let respondeu = false;
    const responder = (blob) => {
      if (respondeu) return;
      respondeu = true;
      clearTimeout(cronometro);
      resolve(blob || null);
    };

    const cronometro = setTimeout(() => responder(null), prazo);

    // `toBlob` também pode lançar em vez de chamar o callback.
    try {
      fonte.toBlob((blob) => responder(blob), "image/png");
    } catch {
      responder(null);
    }
  });
}

/**
 * Menor lado do PNG exportado, em pixels.
 *
 * O recorte é justo por definição, e assinatura curta produziria uma imagem
 * minúscula. Isso importa por um motivo que não é estético: `registrarRetirada`
 * recusa arquivo abaixo de 1000 bytes para pegar comprovante em branco, e um
 * recorte de 40x30 pesaria menos que isso mesmo tendo tinta — a guarda passaria
 * a acusar assinatura de verdade.
 *
 * A folga vem de MARGEM BRANCA, e não de esticar o desenho: branco liso é o que
 * o PNG comprime melhor, então o arquivo cresce pouco e a nitidez não é tocada.
 */
const LADO_MINIMO = 320;

/** Quanto de respiro em volta da tinta, em pixels do canvas. */
const MARGEM = 16;

/**
 * Devolve um canvas só com a tinta, sobre fundo branco.
 *
 * Sem isto o comprovante é o canvas inteiro: um retângulo enorme com um risco
 * no meio. E o fundo branco não é enfeite — o PNG do canvas é TRANSPARENTE, e
 * um comprovante transparente aberto num visualizador de fundo escuro vira uma
 * folha preta com tinta preta.
 *
 * Devolve `null` quando não há tinta ou quando o navegador nega a leitura dos
 * pixels. Quem chama exporta o canvas inteiro nesse caso — pior enquadramento,
 * mesma prova.
 */
export function recortarTinta(tela, margem = MARGEM, ladoMinimo = LADO_MINIMO) {
  const ctx = tela?.getContext?.("2d");
  if (!ctx || !tela.width || !tela.height) return null;

  let pixels;
  try {
    pixels = ctx.getImageData(0, 0, tela.width, tela.height);
  } catch {
    // Canvas "sujo" por imagem de outra origem, ou leitura bloqueada por
    // privacidade. Não é caso de falhar: é caso de exportar sem recorte.
    return null;
  }

  const { data, width, height } = pixels;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Alfa acima de 8 e não acima de 0: a borda suavizada do traço deixa
      // pixels quase transparentes, e contá-los devolveria quase o canvas todo.
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null; // nada desenhado

  x0 = Math.max(0, x0 - margem);
  y0 = Math.max(0, y0 - margem);
  x1 = Math.min(width - 1, x1 + margem);
  y1 = Math.min(height - 1, y1 + margem);

  const larguraTinta = x1 - x0 + 1;
  const alturaTinta = y1 - y0 + 1;
  const larguraFinal = Math.max(larguraTinta, ladoMinimo);
  const alturaFinal = Math.max(alturaTinta, Math.round(ladoMinimo / 3));

  const corte = document.createElement("canvas");
  corte.width = larguraFinal;
  corte.height = alturaFinal;
  const c = corte.getContext?.("2d");
  if (!c) return null;

  c.fillStyle = "#fff";
  c.fillRect(0, 0, larguraFinal, alturaFinal);
  // Centralizado quando a folga entrou: o desenho vai em escala 1:1, pixel a
  // pixel. Esticar para preencher devolveria a borradeira que este recorte
  // existe para acabar.
  c.drawImage(
    tela,
    x0, y0, larguraTinta, alturaTinta,
    Math.round((larguraFinal - larguraTinta) / 2),
    Math.round((alturaFinal - alturaTinta) / 2),
    larguraTinta, alturaTinta
  );
  return corte;
}

/**
 * Onde o dedo tocou, em coordenadas do canvas.
 *
 * Vive fora do componente para poder ser testada: quando a área está girada
 * 90°, `getBoundingClientRect` devolve a caixa JÁ transformada, e subtrair
 * `left`/`top` como de costume dá um ponto errado — o traço aparece longe do
 * dedo, num lugar que parece aleatório.
 *
 * Girado no sentido horário, o que anda para a direita na tela anda para BAIXO
 * no canvas, e o que desce na tela anda para a ESQUERDA. Daí a troca de eixos e
 * a inversão de um deles.
 */
export function pontoNoCanvas(evento, caixa, girado, bitmap) {
  const px = (evento.clientX || 0) - (caixa.left || 0);
  const py = (evento.clientY || 0) - (caixa.top || 0);

  // Primeiro: o ponto no referencial do ELEMENTO, desfazendo a rotação. Girado,
  // `caixa` é o retângulo envolvente, então largura e altura trocam de lugar.
  const cx = girado ? py : px;
  const cy = girado ? (caixa.width || 0) - px : py;
  const larguraElemento = girado ? (caixa.height || 0) : (caixa.width || 0);
  const alturaElemento = girado ? (caixa.width || 0) : (caixa.height || 0);

  // Sem bitmap conhecido (jsdom, primeiro toque antes do ajuste) não há como
  // converter: devolve o ponto do elemento, que é o comportamento antigo.
  if (!bitmap?.width || !bitmap?.height || !larguraElemento || !alturaElemento) {
    return { x: cx, y: cy };
  }

  /*
   * Segundo: do elemento para o BITMAP.
   *
   * Assim que há tinta, o bitmap para de acompanhar o elemento — redimensionar
   * apagaria o desenho. Quem passa a esticar é o CSS, com `object-fit:
   * contain`, que centraliza a imagem e deixa faixa vazia numa das direções.
   *
   * O cálculo antigo entregava o ponto do ELEMENTO direto para um contexto
   * escalado para o tamanho ANTIGO. Enquanto os dois batiam, funcionava. Bastava
   * a caixa mudar de tamanho — e `100dvh` muda sozinha toda vez que a barra de
   * endereço do celular aparece ou some — para o traço nascer deslocado, às
   * vezes inteiramente fora da área visível. Era o "às vezes não sai a
   * assinatura": o dedo desenhava, e o desenho caía fora do quadro.
   */
  const escala = Math.min(larguraElemento / bitmap.width, alturaElemento / bitmap.height);
  const sobraX = (larguraElemento - bitmap.width * escala) / 2;
  const sobraY = (alturaElemento - bitmap.height * escala) / 2;
  return { x: (cx - sobraX) / escala, y: (cy - sobraY) / escala };
}

/**
 * Campo de assinatura à mão livre.
 *
 * Usado na retirada de encomenda: o morador assina no aparelho do porteiro e
 * isso substitui o livro de papel.
 *
 * props:
 *   aoMudar(temTraco) — chamado na montagem e a cada mudança de estado, para
 *                       quem usa o campo habilitar/desabilitar o "Confirmar".
 *   altura            — altura útil da área de desenho em px (padrão 180).
 */
export default function Assinatura({ aoMudar, altura = 180 }) {
  const telaRef = useRef(null);
  const desenhandoRef = useRef(false);
  const [temTraco, setTemTraco] = useState(false);

  // Assinar numa faixa de 180px com o dedo, no celular, sai apertado — e a
  // assinatura apertada é a que não se parece com a do documento. Em tela cheia
  // o mesmo canvas ocupa o aparelho inteiro.
  const [expandido, setExpandido] = useState(false);

  /**
   * Aparelho em pé.
   *
   * Assinatura é um traço largo e baixo: numa tela em pé sobra altura inútil e
   * falta o comprimento do nome. Com o aparelho em pé, giramos a área 90° para
   * o morador assinar na horizontal sem depender de travar a orientação — o
   * bloqueio de rotação costuma estar ligado, e `screen.orientation.lock` nem
   * existe no Safari do iPhone.
   *
   * Quando o aparelho é virado de verdade, isto passa a falso e a rotação sai:
   * o navegador já entregou a tela deitada, e girar de novo desfaria o ganho.
   */
  const [retrato, setRetrato] = useState(
    () => typeof window !== "undefined" && window.innerHeight > window.innerWidth
  );
  useEffect(() => {
    const medir = () => setRetrato(window.innerHeight > window.innerWidth);
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("orientationchange", medir);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("orientationchange", medir);
    };
  }, []);

  const girado = expandido && retrato;

  // Perguntamos pelo contexto 2D uma única vez e guardamos até a resposta null:
  // ela não muda durante a vida do canvas, e no jsdom cada getContext despeja um
  // "Not implemented" gigante no log, escondendo as falhas de verdade.
  const ctxRef = useRef(undefined);
  const obterContexto = () => {
    if (ctxRef.current === undefined) {
      ctxRef.current = telaRef.current?.getContext?.("2d") || null;
    }
    return ctxRef.current;
  };

  // aoMudar costuma chegar como arrow inline, trocando de identidade a cada
  // render do pai. Guardando numa ref, o efeito abaixo depende só de temTraco e
  // não vira um laço de avisos a cada render.
  const aoMudarRef = useRef(aoMudar);
  useEffect(() => {
    aoMudarRef.current = aoMudar;
  });

  useEffect(() => {
    aoMudarRef.current?.(temTraco);
  }, [temTraco]);

  // O ajuste de tamanho lê "já tem traço?" sem depender do estado, senão o
  // efeito abaixo recriaria o listener a cada traço.
  const temTracoRef = useRef(false);
  useEffect(() => {
    temTracoRef.current = temTraco;
  }, [temTraco]);

  // O canvas precisa de width/height em pixels para desenhar; o CSS só estica a
  // imagem. Reajustamos no tamanho real do elemento (e no DPR, senão o traço
  // sai borrado no celular).
  //
  // A guarda "o tamanho mudou mesmo?" faz duas coisas: evita apagar o desenho à
  // toa — abrir o teclado do celular dispara resize sem mudar o canvas — e evita
  // empilhar `scale(dpr, dpr)` sobre a transformação anterior.
  useEffect(() => {
    const ajustar = () => {
      const tela = telaRef.current;
      if (!tela) return;
      const larguraCSS = tela.clientWidth;
      const alturaCSS = tela.clientHeight;
      if (!larguraCSS || !alturaCSS) return; // jsdom (e elemento oculto) reporta 0

      // ASSINADO NÃO REDIMENSIONA.
      //
      // Mexer em width/height apaga o desenho, e a versão anterior contornava
      // isso tirando um instantâneo e redesenhando menor. Funcionava e degradava
      // a prova: quem assinava em tela cheia via o traço ser reduzido ao voltar
      // para os 180px, e era essa versão reamostrada que virava arquivo.
      //
      // Agora o bitmap fica como está e quem encolhe é o CSS, que só muda a
      // exibição. `object-fit: contain` no elemento evita a distorção.
      if (temTracoRef.current) return;

      // Mínimo de 2: no computador o dpr é 1, e uma assinatura de 600x180 vira
      // um arquivo grosseiro quando alguém amplia para conferir.
      const dpr = Math.max(window.devicePixelRatio || 1, 2);
      const larguraNova = Math.round(larguraCSS * dpr);
      const alturaNova = Math.round(alturaCSS * dpr);
      if (tela.width === larguraNova && tela.height === alturaNova) return;

      tela.width = larguraNova;
      tela.height = alturaNova;

      const ctx = obterContexto();
      if (!ctx) return;
      // Identidade, e nao `scale(dpr, dpr)`: quem converte tela -> bitmap agora
      // e `pontoNoCanvas`, que sabe do `object-fit: contain`. Com as duas
      // conversoes empilhadas, o traco sairia com o deslocamento em dobro.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.lineWidth = 2 * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111827";
    };

    ajustar();
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, [altura, expandido, girado]);

  // Sair da tela cheia pelo botão Voltar do celular, em vez de fechar o diálogo
  // inteiro e perder a retirada pela metade.
  useEffect(() => {
    if (!expandido) return undefined;
    const aoTeclar = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setExpandido(false);
      }
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [expandido]);

  const posicao = (evento) => {
    const tela = telaRef.current;
    const caixa = tela?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
    return pontoNoCanvas(evento, caixa, girado, tela);
  };

  // Eventos pointer* (e não mouse* + touch*): um único conjunto atende dedo,
  // caneta e mouse, e não dispara o clique fantasma que o toque emite depois do
  // touchend — que, dentro do diálogo de retirada, chegava a confirmar sozinho.
  const aoApontar = (evento) => {
    const tela = telaRef.current;
    desenhandoRef.current = true;

    // O ponteiro pode sair do canvas no meio da assinatura; capturando, o traço
    // continua sendo nosso até soltar. jsdom não implementa a captura, daí a
    // guarda — sem ela o teste (e um navegador antigo) quebrava aqui.
    if (typeof tela?.setPointerCapture === "function") {
      try {
        tela.setPointerCapture(evento.pointerId);
      } catch {
        /* ponteiro já liberado: desenhar sem captura ainda funciona */
      }
    }

    const { x, y } = posicao(evento);
    const ctx = obterContexto();
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y); // um toque seco também deixa marca
      ctx.stroke();
    }

    // Marcamos o traço MESMO sem contexto 2D. O jsdom devolve null em
    // getContext, e um navegador pode negá-lo (memória, canvas bloqueado por
    // privacidade); nesses casos o campo continuaria dizendo "vazio" e a
    // retirada seria barrada sem explicação. Antes registrar que houve
    // assinatura e falhar na exportação, que é visível.
    setTemTraco(true);
  };

  const aoMover = (evento) => {
    if (!desenhandoRef.current) return;
    const ctx = obterContexto();
    if (!ctx) return;
    const { x, y } = posicao(evento);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const aoSoltar = () => {
    desenhandoRef.current = false;
  };

  const limpar = () => {
    const tela = telaRef.current;
    const ctx = obterContexto();
    if (ctx && tela) ctx.clearRect(0, 0, tela.width, tela.height);
    desenhandoRef.current = false;
    setTemTraco(false);
  };

  /**
   * Uma árvore só, com a classe mudando.
   *
   * Renderizar a tela cheia como outro trecho de JSX faria o React criar OUTRO
   * canvas, e o desenho mora no elemento: trocar de elemento apaga a assinatura
   * no instante em que o morador aperta "Pronto". Mantendo o mesmo nó e mudando
   * só o CSS, o que muda é o tamanho — e disso o efeito acima dá conta.
   */
  const classes = ["assinatura"];
  if (expandido) classes.push("assinatura--cheia");
  if (girado) classes.push("assinatura--girada");

  return (
    <div className={classes.join(" ")}>
      {/* Tudo mora DENTRO da área de assinatura: em tela cheia ela ocupa o
          aparelho inteiro, e o que estivesse fora dela roubaria espaço de
          quem está assinando. Quando a área gira, guia, aviso e botões giram
          junto — senão o morador leria os botões de lado. */}
      <div className="assinatura__area">
        <canvas
          ref={telaRef}
          data-testid="assinatura-tela"
          onPointerDown={aoApontar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          style={{
            width: "100%",
            height: expandido ? "100%" : altura,
            display: "block",
            // Branco fixo, sem token: o que se vê aqui vira o PNG que substitui
            // o papel. No tema escuro, um fundo de token deixaria a tinta preta
            // invisível na tela e o comprovante exportado seria outro desenho.
            background: "#fff",
            // O bitmap para de acompanhar o elemento assim que há tinta, então
            // as proporções deixam de bater. Sem isto, a assinatura feita em
            // tela cheia apareceria achatada na faixa de 180px.
            objectFit: "contain",
            // Tokens do ViT (src/styles/tokens.css), nunca hex solto.
            border: expandido ? "none" : "1px solid var(--border-strong)",
            borderRadius: expandido ? 0 : "var(--radius-md)",
            // Sem isto o dedo rola a página em vez de assinar.
            touchAction: "none",
            cursor: "crosshair",
          }}
        />

        {/* A linha de guia é um elemento, e NÃO um traço no canvas.
            Desenhá-la no canvas a colocaria dentro do PNG exportado — o
            comprovante sairia riscado, e pior: o arquivo passaria do tamanho
            mínimo que hoje denuncia assinatura em branco, desligando a única
            guarda que existe contra isso. */}
        <div className="assinatura__guia" aria-hidden="true" />

        <p className="assinatura__dica">Assine sobre a linha</p>

        <div className="assinatura__acoes">
          <Button variant="ghost" size="sm" onClick={limpar} disabled={!temTraco}>
            Limpar
          </Button>
          <Button
            variant={expandido ? "primary" : "ghost"}
            size="sm"
            onClick={() => setExpandido((v) => !v)}
          >
            {expandido ? "Pronto" : "Assinar em tela cheia"}
          </Button>
        </div>
      </div>
    </div>
  );
}
