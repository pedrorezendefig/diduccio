import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A CSP do vercel.json só vale em produção — o Vite não aplica esses headers em
 * desenvolvimento. Sem este teste, um domínio faltando passa despercebido por
 * toda a suíte e só aparece depois do deploy.
 *
 * E "aparece" é otimismo: a CSP não quebra a tela nem devolve erro à aplicação.
 * O navegador simplesmente não carrega o recurso e escreve no console. Foi o
 * que aconteceu com as fotos da Piscina — todo anexo do Supabase Storage foi
 * bloqueado calado, porque `img-src` autorizava só o Google Drive, que já tinha
 * saído do sistema.
 */
// Só um projeto de verdade responde: sem `.env.local` (CI, clone novo) o
// endereço é o de mentira do vite.config.js e estes blocos se pulam.
const PROJETO_REAL = /^https:\/\/.+\.supabase\.co$/.test(import.meta.env.VITE_SUPABASE_URL ?? "");

describe.skipIf(!PROJETO_REAL)("CSP de produção", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const csp = vercel.headers[0].headers.find(
    (h) => h.key === "Content-Security-Policy"
  ).value;
  const diretiva = (nome) => csp.match(new RegExp(`${nome} ([^;]+)`))?.[1] ?? "";

  // Lido do ambiente, e não escrito à mão: se o projeto do Supabase mudar, é o
  // teste que acusa a CSP desatualizada — em vez de a produção acusar.
  const host = new URL(import.meta.env.VITE_SUPABASE_URL).origin;

  it("o endereço do Supabase está configurado no ambiente", () => {
    // Guarda do próprio teste: sem isto, um ambiente sem a variável faria as
    // duas checagens abaixo compararem contra vazio e passarem sempre.
    expect(host).toMatch(/^https:\/\/.+\.supabase\.co$/);
  });

  it("permite CONSULTAR o Supabase (banco, RPC e Edge Functions)", () => {
    expect(diretiva("connect-src")).toContain(host);
  });

  it("permite EXIBIR os anexos do Supabase Storage", () => {
    // Foto de piscina, festas, churrasqueira e encomendas vêm de URL assinada
    // do bucket — mesmo host da API, mas `connect-src` não vale para <img>.
    expect(diretiva("img-src")).toContain(host);
  });

  it("continua bloqueando qualquer outro destino", () => {
    // A CSP é a última linha de defesa contra exfiltração se alguma dependência
    // for comprometida. Não pode virar connect-src *.
    expect(diretiva("connect-src")).not.toContain("*");
  });
});
