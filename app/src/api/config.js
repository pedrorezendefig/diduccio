// Modo demonstração, num lugar só.
//
// Em MODO DEMO nenhuma chamada sai da máquina: um backend falso em memória
// (src/demo/) responde com dados fictícios. É o que roda no repositório
// público e nas apresentações.
//
// 23/11/2026: o Apps Script saiu de vez do sistema. `VITE_API_URL` e
// `VITE_SHEETS_TOKEN` (a URL e o token dele) não são mais lidos — o token ia
// no bundle e qualquer um o lia. Podem ser apagados do .env.local e da Vercel.

/**
 * Modo demo: forçado por VITE_DEMO, ou automático quando não há backend.
 *
 * "Não há backend" passou a significar SUPABASE ausente, e não Apps Script
 * ausente. A distinção não é cosmética: em 17/08/2026 a produção subiu em modo
 * demonstração, com dados fictícios, porque `VITE_API_URL` não estava
 * configurada na Vercel — uma variável do Apps Script, que saiu do sistema há
 * commits. O condomínio inteiro passou a ver números inventados, e o único
 * sinal era a tarja de demonstração no canto.
 *
 * Agora o gatilho é a variável de que o sistema realmente depende: um ambiente
 * com Supabase configurado não cai em demo por descuido.
 *
 * A queda automática para demo continua existindo. Em demo, `supabase.js`
 * entrega o cliente de mentira de src/demo/supabaseDemo.js e não pede endereço
 * nem chave, então um clone sem `.env.local` abre em demo com os dados
 * fictícios (`npm run dev:demo`).
 */
export const MODO_DEMO =
  import.meta.env.VITE_DEMO === "true" || !import.meta.env.VITE_SUPABASE_URL;

/** Origem falsa das requisições em demo. O interceptador reconhece por ela. */
export const URL_DEMO = "https://demo.vit.local/exec";

