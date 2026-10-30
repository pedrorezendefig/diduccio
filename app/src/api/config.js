// Endereço do backend, num lugar só.
//
// A URL do deployment do Apps Script somada ao TOKEN dá leitura e escrita na
// planilha inteira — por isso ela vive em variável de ambiente e não no código.
// Configure `VITE_API_URL` e `VITE_SHEETS_TOKEN` no seu `.env.local`.
//
// Sem `VITE_API_URL` o app sobe em MODO DEMO: nenhuma chamada sai da máquina,
// um backend falso em memória (src/demo/) responde no lugar do Apps Script com
// dados fictícios. É o que roda no repositório público e nas apresentações.

const urlConfigurada = import.meta.env.VITE_API_URL || "";

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
 * A queda automática para demo continua existindo, mas hoje ela não salva um
 * clone sem `.env.local`: `db.js` importa `supabase.js` no topo, e esse módulo
 * lança na importação quando falta a configuração — antes de qualquer código
 * consultar MODO_DEMO. Medido em 17/08/2026. Ou seja, a promessa de "baixou,
 * rodou em demo" só se cumpre com VITE_DEMO=true e as variáveis do Supabase
 * presentes (é o que `.env.local` faz nesta máquina). Consertar isso é mexer na
 * ordem de importação de `db.js`, e fica para outra hora.
 */
export const MODO_DEMO =
  import.meta.env.VITE_DEMO === "true" || !import.meta.env.VITE_SUPABASE_URL;

/** Origem falsa das requisições em demo. O interceptador reconhece por ela. */
export const URL_DEMO = "https://demo.vit.local/exec";

export const API_URL = MODO_DEMO ? URL_DEMO : urlConfigurada;
export const TOKEN = MODO_DEMO ? "demo" : import.meta.env.VITE_SHEETS_TOKEN;

// Alguns módulos nomeavam a constante SHEETS_URL. Mesmo valor, nome antigo.
export const SHEETS_URL = API_URL;
