import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ToastContext } from "./toast-context";
import { registrarReporter } from "../api/reporter";

const DURACAO = { success: 3500, info: 4000, error: 6000 };

/**
 * Provider das notificações. Monte uma vez, na raiz.
 *
 * Substitui as chamadas de alert() do sistema. Diferença que importa:
 * alert() trava a aba e obriga um clique; o toast informa e sai sozinho.
 * Erro fica mais tempo na tela do que sucesso, porque o usuário precisa ler.
 */
export function ToastProvider({ children }) {
  const [itens, setItens] = useState([]);
  const seq = useRef(0);
  const timers = useRef(new Map());

  const remover = useCallback((id) => {
    setItens((atual) => atual.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const empurrar = useCallback((tone, mensagem) => {
    const id = ++seq.current;
    setItens((atual) => [...atual, { id, tone, mensagem }]);
    timers.current.set(
      id,
      setTimeout(() => remover(id), DURACAO[tone] ?? 4000)
    );
    return id;
  }, [remover]);

  const api = useMemo(() => ({
    success: (m) => empurrar("success", m),
    error:   (m) => empurrar("error", m),
    info:    (m) => empurrar("info", m),
    dismiss: remover,
  }), [empurrar, remover]);

  // Dá ao código fora do React (postBackend) um jeito de avisar o usuário
  // sem recorrer a alert() nativo.
  useEffect(() => registrarReporter(api.error), [api.error]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {itens.length > 0 &&
        createPortal(
          <div className="vit-toasts">
            {itens.map((t) => (
              <div
                key={t.id}
                className={`vit-toast vit-toast--${t.tone}`}
                role={t.tone === "error" ? "alert" : "status"}
                aria-live={t.tone === "error" ? "assertive" : "polite"}
              >
                <span className="vit-toast__msg">{t.mensagem}</span>
                <button
                  type="button"
                  className="vit-toast__close"
                  onClick={() => remover(t.id)}
                  aria-label="Fechar aviso"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
