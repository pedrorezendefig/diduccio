/**
 * O aparelho é de toque?
 *
 * `pointer: coarse` é o dedo; mouse e trackpad são `fine`. É o teste honesto
 * para "está no celular": não depende de user-agent, que mente, nem da largura
 * da janela, que só diz que a janela está estreita.
 *
 * Duas telas dependem disso por motivos diferentes: a carteirinha da piscina,
 * para oferecer a folha nativa de compartilhamento no lugar do download; e o
 * cadastro de encomenda, para oferecer a câmera ao lado da galeria.
 */
export function ehTelaDeToque() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}
