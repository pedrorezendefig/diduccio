import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import useDialogo from "./useDialogo";

/**
 * Painel lateral de detalhe.
 *
 * Existe em vez de um modal centrado porque a lista continua visível atrás:
 * dá para conferir um cadastro, fechar e abrir o seguinte sem perder de vista
 * em que linha se estava. Modal centrado cobre a tabela inteira.
 *
 * Estrutura fixa, porque o arquétipo é sempre o mesmo:
 *   sigla + titulo + meta   quem é
 *   fitas                   o que se procura primeiro (unidade, tipo, situação)
 *   children                os campos, agrupados pela página
 *   footer                  as ações
 *
 * Acessibilidade (Esc, foco preso, foco devolvido, scroll travado) vem de
 * useDialogo, o mesmo do Modal.
 */
export default function Gaveta({
  open,
  onClose,
  sigla,
  titulo,
  meta,
  fitas,
  footer,
  children,
  className = "",
  ...props
}) {
  const painelRef = useDialogo(open, onClose);

  if (!open) return null;

  return createPortal(
    <div
      className="vit-gaveta__veu"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <aside
        ref={painelRef}
        className={`vit-gaveta ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={typeof titulo === "string" ? titulo : undefined}
        tabIndex={-1}
        {...props}
      >
        <div className="vit-gaveta__topo">
          {sigla && <span className="vit-gaveta__sigla" aria-hidden="true">{sigla}</span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="vit-gaveta__titulo">{titulo}</h2>
            {meta && <p className="vit-gaveta__meta">{meta}</p>}
          </div>
          <button
            type="button"
            className="vit-gaveta__fechar"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={17} />
          </button>
        </div>

        {fitas && <div className="vit-gaveta__fitas">{fitas}</div>}

        <div className="vit-gaveta__corpo">{children}</div>

        {footer && <div className="vit-gaveta__pe">{footer}</div>}
      </aside>
    </div>,
    document.body
  );
}
