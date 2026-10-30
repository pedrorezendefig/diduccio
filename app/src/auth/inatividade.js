/**
 * Quanto tempo a sessão sobrevive parada, e o que acontece antes de ela cair.
 *
 * A contagem é de INATIVIDADE, e continua sendo: clique, toque, tecla ou
 * movimento do mouse zeram o relógio. Ela só avança quando o computador está
 * realmente parado — que num terminal de portaria significa sem ninguém ali, e
 * é exatamente o caso em que a sessão aberta vira risco.
 *
 * Por isso a portaria tem prazo mais curto que o resto do sistema, e não mais
 * longo: a tela dela fica num lugar de passagem, aberta o turno inteiro.
 *
 * Antes de derrubar, o sistema PERGUNTA. E a pergunta só aceita resposta de
 * gente: enquanto ela está na tela, mexer o mouse não renova nada — tem de
 * clicar. Renovar por movimento faria o aviso não significar coisa alguma,
 * porque um esbarrão na mesa manteria o terminal aberto a noite toda.
 */

/** O resto do sistema: 2 horas, como sempre foi. */
export const LIMITE_PADRAO = 2 * 60 * 60 * 1000;

/**
 * Telas com prazo próprio.
 *
 * A chave é o caminho da rota. Mora aqui, e não dentro da página, porque é
 * regra de sessão: quem procura "quanto tempo até deslogar" tem um lugar só
 * para olhar, em vez de caçar a resposta em cada tela.
 */
export const LIMITE_POR_ROTA = {
  "/entregas": 60 * 60 * 1000, // 1 hora
};

/** Quanto tempo o aviso fica na tela esperando resposta. */
export const TEMPO_DE_RESPOSTA = 2 * 60 * 1000;

/** O prazo desta rota. Cai no padrão quando a rota não tem prazo próprio. */
export function limiteDaRota(caminho) {
  const rota = String(caminho ?? "").split("?")[0].replace(/\/+$/, "") || "/";
  return LIMITE_POR_ROTA[rota] ?? LIMITE_PADRAO;
}

export const ATIVA = "ativa";
export const PERGUNTANDO = "perguntando";
export const EXPIRADA = "expirada";

/**
 * Em que pé está a sessão.
 *
 * `restante` é quanto falta para cair, e só faz sentido na fase de pergunta —
 * é o número que aparece na contagem regressiva do aviso.
 *
 * Sem `ultimoAcesso` a sessão é tratada como ATIVA, e não como expirada: é o
 * estado de quem acabou de entrar, antes do primeiro carimbo. Tratar ausência
 * como expiração derrubaria a pessoa no próprio login.
 */
export function faseDaSessao({ ultimoAcesso, agora = Date.now(), limite = LIMITE_PADRAO,
  resposta = TEMPO_DE_RESPOSTA } = {}) {
  const marco = Number(ultimoAcesso);
  if (!Number.isFinite(marco) || marco <= 0) {
    return { fase: ATIVA, restante: limite };
  }

  const parado = agora - marco;
  const ateSair = limite + resposta - parado;

  if (parado >= limite + resposta) return { fase: EXPIRADA, restante: 0 };
  if (parado >= limite) return { fase: PERGUNTANDO, restante: Math.max(0, ateSair) };
  return { fase: ATIVA, restante: ateSair };
}

/** "1:59" — a contagem do aviso. Nunca negativa, nunca "0:60". */
export function formatarContagem(ms) {
  const total = Math.max(0, Math.ceil(Number(ms) / 1000) || 0);
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
}
