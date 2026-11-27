import { useEffect, useEffectEvent } from "react";

/**
 * Atualiza a tela sozinha: a cada `ms` enquanto ela está visível, e na hora em
 * que a pessoa volta para o app (outra aba, outro app, celular desbloqueado).
 * Assim a resposta da administração aparece sem precisar recarregar a página.
 * Com a tela escondida, não busca nada (não gasta internet nem bateria).
 */
export function useAtualizar(atualizar, ms) {
  const tique = useEffectEvent(() => {
    if (document.visibilityState === "visible") atualizar();
  });
  useEffect(() => {
    const id = setInterval(tique, ms);
    const voltou = () => tique();
    window.addEventListener("focus", voltou);
    document.addEventListener("visibilitychange", voltou);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", voltou);
      document.removeEventListener("visibilitychange", voltou);
    };
  }, [ms]);
}
