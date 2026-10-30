// Cliente único do Supabase para o browser.
//
// Recebe SÓ a publishable key. Ela é pública por natureza — vai compilada
// dentro do bundle e qualquer visitante consegue lê-la. Quem protege os dados
// é o RLS, não o segredo da chave.
//
// A secret key (sb_secret_*) nunca entra aqui nem em nenhum arquivo sob src/:
// ela vive apenas em variável sem prefixo VITE_, lida só por scripts Node.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY precisam estar no .env.local"
  );
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // sessionStorage e não localStorage: o app já expira a sessão em 2h
    // (App.jsx) e fechar a aba deve encerrar o acesso, como hoje.
    storage: globalThis.sessionStorage,
  },
});
