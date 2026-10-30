/**
 * Ponte entre código fora do React e o Toast.
 *
 * `postBackend` é um módulo puro: não tem acesso a contexto do React, então
 * não consegue chamar useToast(). Em vez de manter alert() nativo lá dentro,
 * o ToastProvider registra aqui uma função de reporte na montagem, e o
 * módulo chama essa função.
 *
 * Se ninguém registrou (por exemplo num teste), o reporte vira console.warn
 * em vez de travar a aba com um alert.
 */

let reportar = null;

/** Chamado pelo ToastProvider. Devolve a função de limpeza. */
export function registrarReporter(fn) {
  reportar = fn;
  return () => {
    if (reportar === fn) reportar = null;
  };
}

/** Chamado por módulos fora do React. */
export function reportarErro(mensagem) {
  if (reportar) reportar(mensagem);
  else console.warn("[ViT]", mensagem);
}
