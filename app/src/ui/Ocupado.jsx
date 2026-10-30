import React from "react";
import { createPortal } from "react-dom";

/**
 * Véu de bloqueio durante uma gravação.
 *
 * Existe para impedir duplo envio enquanto o Apps Script responde, que leva
 * cerca de 1,5s. Substitui os cinco overlays duplicados que as páginas tinham,
 * cada um com seu próprio hex e nenhum acessível.
 *
 * Diferenças em relação ao anterior:
 *   - véu tingido de verde em vez de azul-slate, e mais leve;
 *   - `role="status"` com `aria-live`, então o leitor de tela anuncia;
 *   - honra prefers-reduced-motion (o giro para, o véu fica);
 *   - a mensagem é configurável, para dizer O QUE está acontecendo.
 *
 * Preferir Button loading ou Table loading quando a operação for local a um
 * componente. Este véu é só para quando a página inteira precisa esperar.
 */
export default function Ocupado({ open, mensagem = "Salvando..." }) {
  if (!open) return null;

  return createPortal(
    <div className="vit-ocupado" role="status" aria-live="polite">
      <span className="vit-ocupado__caixa">
        <span className="vit-ocupado__giro" aria-hidden="true" />
        <span className="vit-ocupado__texto">{mensagem}</span>
      </span>
    </div>,
    document.body
  );
}
