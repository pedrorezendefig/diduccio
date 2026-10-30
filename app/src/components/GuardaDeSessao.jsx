import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Timer } from "lucide-react";
import { Modal, Button } from "../ui";
import {
  ATIVA, EXPIRADA, PERGUNTANDO,
  faseDaSessao, formatarContagem, limiteDaRota,
} from "../auth/inatividade";

/**
 * A sessão parada, e o aviso antes de ela cair.
 *
 * Fica DENTRO do Router de propósito: o prazo depende da tela aberta — a
 * portaria tem prazo mais curto que o resto —, e só aqui dentro dá para saber
 * qual é ela.
 *
 * Renderiza `null` na maior parte da vida. O que ele faz é carimbar a
 * atividade, contar, e pôr o aviso na tela quando o prazo acaba.
 */
export default function GuardaDeSessao({ ativo, onExpirar }) {
  const { pathname } = useLocation();
  const [, forcar] = useState(0);
  // A fase precisa ser lida por listeners que não re-assinam a cada render.
  const faseRef = useRef(ATIVA);

  const limite = limiteDaRota(pathname);
  const { fase, restante } = faseDaSessao({
    ultimoAcesso: ativo ? sessionStorage.getItem("ultimoAcesso") : null,
    limite,
  });

  // Num efeito, e não no meio do render: escrever num ref durante a
  // renderização é o tipo de coisa que funciona até o React resolver renderizar
  // duas vezes. O listener abaixo lê daqui, e o efeito roda logo depois do
  // commit — a defasagem é de microssegundos, e a fase muda uma vez por hora.
  useEffect(() => { faseRef.current = fase; }, [fase]);

  // Um tique por segundo: é o que a contagem regressiva do aviso precisa. O
  // componente não desenha nada fora do aviso, então o custo fica nele.
  useEffect(() => {
    if (!ativo) return undefined;
    const id = setInterval(() => forcar((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [ativo]);

  /**
   * Carimba a atividade — e NÃO carimba durante o aviso.
   *
   * É a regra inteira do aviso: enquanto a pergunta está na tela, mexer o mouse
   * não renova nada. Sem isso, um esbarrão na mesa manteria o terminal aberto a
   * noite toda, e a pergunta "você ainda está aí?" seria decorativa.
   *
   * A escrita é limitada a uma por segundo. `mousemove` dispara dezenas de
   * vezes por segundo, e cada uma virava uma gravação em sessionStorage.
   */
  useEffect(() => {
    if (!ativo) return undefined;

    let ultimaGravacao = 0;
    const carimbar = () => {
      if (faseRef.current !== ATIVA) return;
      const agora = Date.now();
      if (agora - ultimaGravacao < 1000) return;
      ultimaGravacao = agora;
      sessionStorage.setItem("ultimoAcesso", String(agora));
    };

    const eventos = ["click", "mousemove", "keydown", "scroll", "touchstart"];
    eventos.forEach((e) => window.addEventListener(e, carimbar, { passive: true }));
    return () => eventos.forEach((e) => window.removeEventListener(e, carimbar));
  }, [ativo]);

  // Acabou o tempo de resposta: cai. Num efeito, e não no meio do render —
  // deslogar durante a renderização derruba a árvore no meio do caminho.
  useEffect(() => {
    if (ativo && fase === EXPIRADA) onExpirar?.();
  }, [ativo, fase, onExpirar]);

  if (!ativo || fase !== PERGUNTANDO) return null;

  const continuar = () => {
    sessionStorage.setItem("ultimoAcesso", String(Date.now()));
    forcar((n) => n + 1);
  };

  return (
    <Modal open size="sm" aria-label="Você ainda está aí?" onClose={undefined}>
      <div className="vit-modal__cabecalho-proprio">
        <Timer size={20} aria-hidden="true" />
        <h2 className="vit-modal__title">Você ainda está aí?</h2>
      </div>

      <p className="vit-texto-apoio">
        A tela ficou {formatarContagem(limite)} sem ninguém mexer. Por segurança,
        a sessão vai ser encerrada — o computador da portaria não pode ficar
        aberto sozinho.
      </p>

      {/* `assertive` porque a contagem é a informação: quem usa leitor de tela
          precisa saber que há um relógio correndo, não só que abriu um aviso. */}
      <p className="vit-sessao-contagem" role="alert" aria-live="assertive">
        Saindo em <strong>{formatarContagem(restante)}</strong>
      </p>

      <div className="vit-sessao-acoes">
        <Button variant="ghost" onClick={onExpirar}>Sair agora</Button>
        <Button variant="primary" onClick={continuar}>Continuar conectado</Button>
      </div>
    </Modal>
  );
}
