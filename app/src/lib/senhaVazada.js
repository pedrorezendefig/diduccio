// A senha já apareceu em algum vazamento? A mesma checagem das funções do
// servidor (supabase/functions/_shared/senha-vazada.ts), feita aqui na
// troca obrigatória de senha, que vai direto ao Supabase.
//
// Base: Have I Been Pwned, por k-anonimato. Só os 5 primeiros caracteres do
// SHA-1 da senha saem do aparelho; a comparação é feita aqui. Nem a senha nem
// o resumo inteiro chegam a eles. `Add-Padding` deixa a resposta sempre do
// mesmo tamanho.
//
// Sem internet, base fora do ar, ou navegador sem `crypto.subtle` (página
// aberta por http num IP da rede local): "não sei" (null), e a troca segue.

export const MSG_SENHA_VAZADA =
  "Esta senha já apareceu em vazamentos de dados na internet, e quem ataca testa essas primeiro. Escolha outra.";

const BASE = "https://api.pwnedpasswords.com/range/";

/** true = vazada; false = não aparece; null = não deu para saber agora. */
export async function senhaVazada(senha, { buscar = (u, i) => fetch(u, i), tempoMs = 4000 } = {}) {
  try {
    const sutil = globalThis.crypto?.subtle;
    if (!sutil || !senha) return null;
    const bytes = new Uint8Array(await sutil.digest("SHA-1", new TextEncoder().encode(senha)));
    const resumo = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const r = await buscar(BASE + resumo.slice(0, 5), {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(tempoMs),
    });
    if (!r.ok) return null;
    const resto = resumo.slice(5);
    for (const linha of (await r.text()).split("\n")) {
      const [sufixo, vezes] = linha.trim().split(":");
      if (sufixo === resto) return Number(vezes) > 0;
    }
    return false;
  } catch {
    return null;
  }
}
