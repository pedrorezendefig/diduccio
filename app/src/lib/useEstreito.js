import { useSyncExternalStore } from "react";

/** O mesmo corte do CSS do projeto (`@media (max-width: 768px)`). */
export const CONSULTA_ESTREITO = "(max-width: 768px)";

const temMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

function assinar(avisar) {
  if (!temMatchMedia()) return () => {};
  const mq = window.matchMedia(CONSULTA_ESTREITO);
  // Safari antigo só conhece addListener.
  if (mq.addEventListener) mq.addEventListener("change", avisar);
  else mq.addListener?.(avisar);
  return () => {
    if (mq.removeEventListener) mq.removeEventListener("change", avisar);
    else mq.removeListener?.(avisar);
  };
}

const ler = () => temMatchMedia() && window.matchMedia(CONSULTA_ESTREITO).matches;

/**
 * A tela é de celular? O quadro muda de ESTRUTURA (colunas viram abas), e isso
 * CSS sozinho não faz — por isso a pergunta é feita em JS, com o mesmo corte.
 * `useSyncExternalStore` lê o valor já na primeira pintura, sem setState em efeito.
 */
export function useEstreito() {
  return useSyncExternalStore(assinar, ler, () => false);
}
