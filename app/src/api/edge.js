// Chamada a Edge Function, com o token da sessão.
//
// Estava dentro de Usuarios.jsx. Saiu de lá quando Comunicado e Assembleia
// passaram a precisar da mesma coisa: três cópias do mesmo `fetch` são três
// lugares para esquecer o `Authorization` — e sem ele a função responde 401,
// que na tela vira "não autorizado" para quem tem toda a autorização do mundo.
import { supabase } from "./supabase";

/**
 * Os cabeçalhos que toda chamada leva — e a lista que cada Edge Function
 * precisa repetir no `Access-Control-Allow-Headers`.
 *
 * Está aqui, numa constante, porque o teste que cruza os dois lados lia os
 * nomes direto do `fetch` abaixo e quebrou quando o `Authorization` virou um
 * spread condicional. Um teste que depende do formato do código quebra por
 * motivo errado; um que lê uma lista declarada, não.
 *
 * Faltar um nome aqui não dá erro visível: o navegador simplesmente não faz a
 * requisição, e o JavaScript recebe "Failed to fetch" — igualzinho a queda de
 * rede. Foi assim que o Comunicado dizia "sem conexão" com o servidor no ar.
 */
export const CABECALHOS_ENVIADOS = ["authorization", "content-type", "apikey"];

/**
 * Devolve sempre um formato só, para quem chama não precisar de try/catch:
 *   { falhaSessao: true }              — não há sessão; o usuário precisa entrar de novo
 *   { falhaConexao: true }             — a requisição não chegou
 *   { status, ok, corpo }              — a função respondeu; `ok` já considera o `success` do corpo
 */
export async function chamarEdgeFunction(nomeFuncao, corpo, { exigeSessao = true } = {}) {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao?.session?.access_token;
  // `exigeSessao: false` existe para o login, que é a única chamada feita por
  // quem ainda não entrou. Para todas as outras, a ausência de token é um
  // problema a relatar — e não algo a ignorar, o que geraria um 401 do
  // servidor no lugar de uma mensagem que a pessoa entende.
  if (!token && exigeSessao) return { falhaSessao: true };

  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${nomeFuncao}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(corpo),
    });
    const resposta = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok && Boolean(resposta.success), corpo: resposta };
  } catch {
    return { falhaConexao: true };
  }
}

/**
 * A frase que a tela mostra quando a chamada não deu certo.
 *
 * A função nunca devolve o erro cru do provedor de IA — ele carrega modelo,
 * cota e às vezes trecho de chave. O que sobra é uma mensagem já pensada para
 * quem está na tela, e é ela que passa adiante.
 */
export function mensagemDaEdgeFunction(r, padrao = "Não foi possível concluir. Tente novamente.") {
  if (r?.falhaSessao) return "Sua sessão expirou. Entre de novo.";
  if (r?.falhaConexao) return "Sem conexão com o servidor. Tente de novo.";
  if (r?.status === 403) return "Você não tem permissão para isso.";
  return r?.corpo?.message || padrao;
}
