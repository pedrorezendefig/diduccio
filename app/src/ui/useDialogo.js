import { useEffect, useRef } from "react";

const FOCAVEIS =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Diálogos abertos, do mais antigo ao mais novo. Com um confirm por cima da
// gaveta, os dois escutam o teclado no document; sem saber quem é o de cima,
// um Esc fecharia os dois e perderia o que foi digitado na gaveta.
const pilha = [];

// Quantos diálogos travam o scroll. Guardar "o overflow anterior" e restaurá-lo
// falha quando dois diálogos fecham fora de ordem e deixa o body em "hidden".
let travas = 0;

/**
 * Comportamento comum a Modal e Gaveta.
 *
 * Faz o que quase toda implementação caseira esquece:
 *   - fecha com Esc;
 *   - trava o foco dentro do diálogo (Tab circula, não escapa para a página);
 *   - devolve o foco ao elemento que abriu, ao fechar;
 *   - trava o scroll do body enquanto aberto.
 *
 * Existe como hook e não copiado nos dois componentes: são 60 linhas de
 * acessibilidade que precisam envelhecer juntas. Uma correção num lugar e não
 * no outro deixaria um dos dois com o foco escapando.
 *
 * Devolve a ref que deve ir no painel.
 */
export default function useDialogo(open, onClose) {
  const painelRef = useRef(null);
  const gatilhoRef = useRef(null);

  const fichaRef = useRef({});

  // Guarda quem tinha o foco antes de abrir e devolve ao fechar. A devolução
  // fica na limpeza do efeito para valer também quando o diálogo fecha por
  // desmontar (a gaveta de tarefa), e não só quando `open` vira false.
  useEffect(() => {
    if (!open) return;
    gatilhoRef.current = document.activeElement;
    return () => {
      const gatilho = gatilhoRef.current;
      gatilhoRef.current = null;
      if (gatilho instanceof HTMLElement && gatilho.isConnected) gatilho.focus();
    };
  }, [open]);

  // Entra na pilha ao abrir; só o de cima trata Esc e Tab.
  useEffect(() => {
    if (!open) return;
    const ficha = fichaRef.current;
    pilha.push(ficha);
    return () => {
      const i = pilha.indexOf(ficha);
      if (i >= 0) pilha.splice(i, 1);
    };
  }, [open]);

  // Foco inicial no painel.
  useEffect(() => {
    if (!open) return;
    const painel = painelRef.current;
    if (!painel) return;
    const primeiro = painel.querySelector(FOCAVEIS);
    (primeiro instanceof HTMLElement ? primeiro : painel).focus();
  }, [open]);

  // Esc para fechar e Tab preso dentro do diálogo.
  useEffect(() => {
    if (!open) return;

    const aoTeclar = (e) => {
      if (pilha[pilha.length - 1] !== fichaRef.current) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;

      const painel = painelRef.current;
      if (!painel) return;
      const alvos = [...painel.querySelectorAll(FOCAVEIS)].filter(
        (el) => el.offsetParent !== null
      );
      if (alvos.length === 0) {
        e.preventDefault();
        return;
      }
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];

      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar, true);
    return () => document.removeEventListener("keydown", aoTeclar, true);
  }, [open, onClose]);

  // Trava o scroll do fundo.
  useEffect(() => {
    if (!open) return;
    if (travas++ === 0) document.body.style.overflow = "hidden";
    return () => {
      if (--travas === 0) document.body.style.overflow = "";
    };
  }, [open]);

  return painelRef;
}
