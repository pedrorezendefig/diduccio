/**
 * A segunda chance com token renovado.
 *
 * O token de acesso deste projeto dura 10 MINUTOS. Ele vence durante o uso
 * normal — quem deixa a tela aberta enquanto atende alguém no portão volta com
 * ele vencido —, e a resposta do PostgREST para isso é 401.
 *
 * 401 nunca é resposta de negócio. Confundir os dois já quebrou duas telas
 * neste projeto: a de Entregas, que mostrava lista vazia (indistinguível de
 * "não há encomenda nenhuma"), e a exigência de trocar a senha, que voltava
 * do nada para quem tinha acabado de trocar. Nos dois casos o código lia
 * "a chamada falhou" e escrevia uma afirmação sobre o condomínio.
 *
 * Morava dentro do db.js, onde só o db.js alcançava. Saiu para cá quando ficou
 * claro que a única chamada do sistema que NÃO passava por ele era justamente
 * a que produziu o segundo defeito.
 */
import { supabase } from "./supabase";

export const SESSAO_EXPIRADA = "Sua sessão expirou. Entre de novo.";

/**
 * Isto é problema de token, ou é resposta?
 *
 * Larga de propósito: o Supabase escreve "JWT expired", "invalid JWT" e
 * variações conforme a camada que recusou. Errar para o lado de renovar custa
 * uma chamada; errar para o outro devolve um erro de token como se fosse
 * conteúdo.
 */
export const ehErroDeToken = (error, status) =>
  status === 401 || /jwt|token/i.test(String(error?.message ?? ""));

/**
 * Roda `executar()`. Se cair por token, renova UMA vez e roda de novo.
 *
 * Devolve o resultado da chamada com um `sessaoAcabou` a mais quando nem a
 * renovação salvou — aí a sessão acabou de verdade, e quem chamou decide o que
 * dizer. Uma vez só: se o token novo também for recusado, insistir seria laço.
 */
export async function comSessaoValida(executar) {
  const r = await executar();
  if (!r.error || !ehErroDeToken(r.error, r.status)) return r;

  // `refreshSession` guarda o token novo no cliente, então a segunda tentativa
  // já sai com ele — não é preciso repassar nada.
  const { error: erroRenovacao } = await supabase.auth.refreshSession();
  if (erroRenovacao) return { ...r, sessaoAcabou: true };

  const segunda = await executar();
  if (segunda.error && ehErroDeToken(segunda.error, segunda.status)) {
    return { ...segunda, sessaoAcabou: true };
  }
  return segunda;
}
