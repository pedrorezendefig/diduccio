/**
 * A regra de senha do projeto, num lugar só.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * A tela de trocar senha dizia "a senha precisa ter pelo menos 8 caracteres"
 * para QUALQUER recusa do servidor que mencionasse "at least" e "char". Só que
 * a recusa real deste projeto é outra:
 *
 *   Password should contain at least one character of each:
 *   abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.
 *
 * É sobre TIPOS de caractere, não sobre quantidade. Quem digitava dez letras
 * minúsculas lia que faltava tamanho, aumentava para doze, quinze, e continuava
 * preso — a mensagem mandava fazer exatamente o que já estava feito.
 *
 * Medido contra o servidor: "abc12345" e "abcd1234" são recusados; "Senha123",
 * com oito, passa. O que falta é a maiúscula, nunca o tamanho.
 *
 * Agora a mesma regra vale nos dois lados: a tela recusa antes de enviar, e o
 * que o servidor devolver é traduzido pelo que ele de fato disse.
 */

export const MINIMO = 8;

/** O que a senha já cumpre. */
export function regrasDaSenha(senha) {
  const s = String(senha ?? "");
  return {
    tamanho: s.length >= MINIMO,
    minuscula: /[a-z]/.test(s),
    maiuscula: /[A-Z]/.test(s),
    digito: /[0-9]/.test(s),
  };
}

export function senhaValida(senha) {
  return Object.values(regrasDaSenha(senha)).every(Boolean);
}

/**
 * O que falta, em uma frase, ou "" quando está boa.
 *
 * Diz o que falta, e não "senha inválida": a pessoa não tem como adivinhar qual
 * das quatro regras quebrou, e foi essa adivinhação que travou a portaria.
 */
export function problemaDaSenha(senha) {
  const s = String(senha ?? "");
  if (!s) return "";
  const r = regrasDaSenha(s);
  if (!r.tamanho) return `Use pelo menos ${MINIMO} caracteres.`;

  const faltam = [
    !r.maiuscula && "uma letra maiúscula",
    !r.minuscula && "uma letra minúscula",
    !r.digito && "um número",
  ].filter(Boolean);

  if (!faltam.length) return "";
  if (faltam.length === 1) return `Falta ${faltam[0]}.`;
  return `Faltam ${faltam.slice(0, -1).join(", ")} e ${faltam.at(-1)}.`;
}

/**
 * A recusa do servidor, em português.
 *
 * As mensagens do Supabase Auth vêm sempre em inglês. A ordem dos testes
 * importa: a mensagem de TIPO de caractere também contém "at least" e "char",
 * então ela precisa ser reconhecida ANTES da de tamanho — foi exatamente essa
 * inversão que produziu o defeito.
 */
export function traduzirErroDeSenha(mensagem) {
  const m = String(mensagem ?? "");
  if (!m) return "Não foi possível trocar a senha. Tente novamente.";

  // "should contain at least one character of each: abc…, ABC…, 012…"
  if (/one character of each|contain at least one/i.test(m)) {
    return "A senha precisa ter letra maiúscula, letra minúscula e número.";
  }
  // "should be at least 8 characters" — o número vem do servidor, e não daqui:
  // fixar 8 aqui mentiria de novo no dia em que a política apertar.
  const tamanho = m.match(/at least (\d+) char/i);
  if (tamanho) return `A senha precisa ter pelo menos ${tamanho[1]} caracteres.`;

  if (/different from the old|should be different/i.test(m)) {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (/pwned|leaked|compromised/i.test(m)) {
    return "Esta senha apareceu em vazamentos conhecidos. Escolha outra.";
  }
  if (/network|fetch|load failed/i.test(m)) {
    return "Não foi possível conectar ao servidor.";
  }
  return m;
}
