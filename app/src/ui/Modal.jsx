import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import useDialogo from "./useDialogo";

/**
 * Diálogo modal.
 *
 * Esc, foco preso, foco devolvido ao fechar e scroll travado vêm de
 * useDialogo, compartilhado com Gaveta. Aqui fica só o que é do modal:
 * fundo clicável para fechar e a moldura centrada.
 *
 * Renderiza em portal no <body>, e o data-theme fica no <html>, então os
 * tokens são herdados corretamente.
 */
export default function Modal({
  open,
  onClose,
  title,
  size = "md",
  footer,
  children,
  className = "",
  ...props
}) {
  const painelRef = useDialogo(open, onClose);

  if (!open) return null;

  const classes = ["vit-modal", `vit-modal--${size}`, className]
    .filter(Boolean).join(" ");

  return createPortal(
    <div
      className="vit-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={painelRef}
        className={classes}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        {...props}
      >
        {title && (
          <div className="vit-modal__head">
            <h2 className="vit-modal__title">{title}</h2>
            <button
              type="button"
              className="vit-modal__close"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="vit-modal__body">{children}</div>
        {footer && <div className="vit-modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
