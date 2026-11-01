// As chaves do limite de tentativas do login. Ficam fora do `index.ts` para
// serem testadas sem o runtime do Deno (app/src/__tests__/entrar-chaves.test.js).

/** SHA-256 em hexadecimal. O identificador nunca é gravado em claro. */
async function digerir(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** O identificador do jeito que o SQL `email_de_login` o compara: CPF com só
 *  os dígitos, e-mail com `lower(trim())`. Se o contador não normalizar igual,
 *  `123.456.789-09` e `12345678909` entram na mesma conta e contam em chaves
 *  diferentes, e cada grafia nova é um crédito novo de tentativas. */
function normalizar(identificador: string): string {
  const limpo = identificador.trim().toLowerCase();
  const digitos = limpo.replace(/\D/g, "");
  if (!limpo.includes("@") && digitos.length === 11) return `cpf:${digitos}`;
  return `email:${limpo}`;
}

/** A chave do contador por conta. Com a conta resolvida, conta pelo e-mail
 *  dela: assim o CPF e o e-mail da mesma pessoa somam juntos. Sem conta (o
 *  identificador não existe), conta pelo identificador normalizado, senão
 *  varrer CPFs sairia de graça. */
export async function chaveDaConta(identificador: string, email: string | null): Promise<string> {
  const base = email ? `email:${email.trim().toLowerCase()}` : normalizar(identificador);
  return `conta:${await digerir(base)}`;
}
