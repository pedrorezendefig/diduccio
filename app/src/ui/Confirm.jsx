import React, { useCallback, useRef, useState } from "react";
import { ConfirmContext } from "./confirm-context";
import Modal from "./Modal";
import Button from "./Button";

/**
 * Provider da confirmação. Monte uma vez, na raiz.
 *
 * Substitui window.confirm(). A API é uma Promise, então o código chamador
 * fica praticamente igual ao de antes:
 *
 *   if (!await confirm({ title: "Excluir a reserva de B5-304?" })) return;
 *
 * Diferença que importa: o confirm() nativo só aceita uma string e não diz
 * o que vai ser destruído. Aqui `title` faz a pergunta nomeando o objeto e
 * `description` diz a consequência.
 */
export function ConfirmProvider({ children }) {
  const [pedido, setPedido] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((opcoes = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setPedido({
        title: opcoes.title ?? "Confirmar ação?",
        description: opcoes.description ?? "",
        confirmLabel: opcoes.confirmLabel ?? "Confirmar",
        cancelLabel: opcoes.cancelLabel ?? "Cancelar",
        danger: opcoes.danger ?? false,
      });
    });
  }, []);

  const responder = useCallback((valor) => {
    setPedido(null);
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.(valor);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(pedido)}
        onClose={() => responder(false)}
        title={pedido?.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => responder(false)}>
              {pedido?.cancelLabel}
            </Button>
            <Button
              variant={pedido?.danger ? "danger" : "primary"}
              onClick={() => responder(true)}
            >
              {pedido?.confirmLabel}
            </Button>
          </>
        }
      >
        {pedido?.description && (
          <p className="vit-modal__desc">{pedido.description}</p>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}
