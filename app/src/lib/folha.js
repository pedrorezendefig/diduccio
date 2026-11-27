/**
 * A folha do comunicado sem a trava de A4 (23/11/2026): ela cresce com o
 * texto, e quem exporta escolhe como sai: em folhas A4 ou numa página
 * comprida. Aqui ficam as contas, sem DOM, para dar para testar.
 */

/** Proporção do A4 (altura ÷ largura): 297 ÷ 210. */
export const PROPORCAO_A4 = 297 / 210;

/** Os formatos que o administrador escolhe ao exportar. */
export const FORMATOS = { a4: "Folhas A4", longa: "Uma página comprida" };

/**
 * Onde cortar a folha em páginas A4, em pixels, de cima para baixo.
 *
 * Corta na altura exata da página, a não ser que ali passe uma linha de
 * texto: então sobe até achar uma faixa em branco (no máximo `folga` da
 * página), para nenhuma linha sair partida ao meio entre duas folhas.
 *
 * `emBranco(y)` diz se a linha de pixels y está em branco.
 * Devolve os inícios de cada página: [0, corte1, corte2, ...].
 */
export function pontosDeCorte(alturaTotal, alturaPagina, emBranco = () => true, folga = 0.2) {
  const inicios = [0];
  if (!(alturaPagina > 0)) return inicios;
  let inicio = 0;
  // A sobra menor que 2% de página (sombra, arredondamento) não vira folha.
  while (alturaTotal - inicio > alturaPagina * 1.02) {
    const ideal = Math.floor(inicio + alturaPagina);
    const limite = Math.floor(ideal - alturaPagina * folga);
    let corte = ideal;
    for (let y = ideal; y > limite; y--) {
      if (emBranco(y)) { corte = y; break; }
    }
    inicios.push(corte);
    inicio = corte;
  }
  return inicios;
}

/**
 * Um `emBranco(y)` para um canvas: a linha y é branca (ou quase) de ponta a
 * ponta? Olha um pixel a cada 4, o bastante para achar texto.
 */
export function linhaEmBrancoDoCanvas(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const largura = canvas.width;
  return (y) => {
    if (y < 0 || y >= canvas.height) return true;
    const { data } = ctx.getImageData(0, y, largura, 1);
    for (let i = 0; i < data.length; i += 16) {
      if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) return false;
    }
    return true;
  };
}

/** As páginas recortadas de um canvas: cada uma um canvas do tamanho A4 (fundo branco). */
export function paginasDoCanvas(canvas) {
  const alturaPagina = Math.round(canvas.width * PROPORCAO_A4);
  const inicios = pontosDeCorte(canvas.height, alturaPagina, linhaEmBrancoDoCanvas(canvas));
  return inicios.map((ini, i) => {
    const fim = i + 1 < inicios.length ? inicios[i + 1] : canvas.height;
    const pagina = document.createElement("canvas");
    pagina.width = canvas.width;
    pagina.height = alturaPagina;
    const ctx = pagina.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pagina.width, pagina.height);
    ctx.drawImage(canvas, 0, ini, canvas.width, fim - ini, 0, 0, canvas.width, fim - ini);
    return pagina;
  });
}

/** Altura em mm da página comprida, para 210 mm de largura. */
export const alturaDaPaginaLonga = (larguraPx, alturaPx) => Math.max(297, Math.round((210 * alturaPx) / larguraPx));
