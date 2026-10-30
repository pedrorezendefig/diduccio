// Autenticação pelo Supabase. Não há mais login no Apps Script.
import { MODO_DEMO } from "./config";
import { supabase } from "./supabase";
import { SESSAO_EXPIRADA, comSessaoValida } from "./sessao";
import { chamarEdgeFunction } from "./edge";
import { atender } from "../demo/servidor";

/** Mesma mensagem para identificador inexistente e senha errada: distinguir os
 *  dois transforma a tela de login num verificador de quem tem conta. */
const CREDENCIAL_INVALIDA = "Usuário ou senha incorretos.";

/**
 * @param identificador CPF (com ou sem máscara) ou e-mail.
 */
export async function entrar(identificador, senha) {
  if (MODO_DEMO) {
    const r = await atender({
      url: "https://demo.vit.local/exec", metodo: "POST",
      corpo: JSON.stringify({ action: "login", email: identificador, senha }),
    });
    return r?.success
      ? { success: true, usuario: r.data, deveTrocarSenha: false }
      : { success: false, message: r?.message };
  }

  // O login inteiro acontece do lado do servidor (Edge Function `entrar`).
  //
  // Antes, esta função convertia CPF em e-mail chamando `email_de_login`, que
  // respondia ao visitante anônimo: com a chave publicável — que está no
  // bundle — dava para perguntar "existe conta com este CPF?" e receber o
  // e-mail de volta. E não havia limite de tentativas em lugar nenhum, porque
  // limite no navegador é limite que o atacante controla.
  //
  // As duas coisas se resolvem no mesmo lugar: a conversão passou para dentro
  // da função, e a contagem de tentativas mora no banco (0023).
  const r = await chamarEdgeFunction("entrar", { identificador, senha }, { exigeSessao: false });

  if (r.falhaConexao) return { success: false, message: "Sem conexão com o servidor. Tente de novo." };
  if (!r.ok) {
    // A função já devolve a frase pronta — inclusive a de "muitas tentativas",
    // que precisa dizer quanto falta. Traduzir de novo aqui só criaria um
    // segundo lugar para a mensagem divergir.
    return { success: false, message: r.corpo?.message || CREDENCIAL_INVALIDA };
  }

  // A sessão vem pronta e é instalada aqui. É o mesmo par de tokens que o
  // `signInWithPassword` devolveria no navegador: o supabase-js passa a
  // renovar sozinho, e nada mais no sistema precisa saber que o login mudou.
  const { error: erroSessao } = await supabase.auth.setSession({
    access_token: r.corpo.access_token,
    refresh_token: r.corpo.refresh_token,
  });
  if (erroSessao) return { success: false, message: "Não foi possível iniciar a sessão. Tente de novo." };

  return {
    success: true,
    usuario: r.corpo.usuario,
    // Senha gerada na migração passou por um arquivo em texto puro no disco.
    // Enquanto não for trocada, não vale como senha definitiva.
    deveTrocarSenha: r.corpo.deveTrocarSenha === true,
  };
}

/**
 * A senha da sessão atual ainda é provisória?
 *
 * O `entrar` acima já devolve isso, mas só uma vez, no instante do login. Uma
 * sessão restaurada do sessionStorage — recarregar a página, reabrir a aba —
 * não passa por ele, e quem teve a senha resetada seguia usando o sistema sem
 * nunca trocá-la. Por isso a pergunta virou função à parte, que o App faz
 * sempre que há usuário.
 *
 * Sem sessão devolve false: não faz sentido exigir troca de quem não entrou, e
 * `senha_ja_trocada()` sem JWT não teria de quem falar.
 */
export async function precisaTrocarSenha() {
  if (MODO_DEMO) return false;

  const { data: sessao } = await supabase.auth.getSession();
  if (!sessao?.session) return false;

  const { data: jaTrocou, error, sessaoAcabou } = await comSessaoValida(() =>
    supabase.rpc("senha_ja_trocada")
  );

  // Sessão vencida NÃO é senha por trocar. Foi o defeito relatado: o token
  // dura 10 minutos, a tela ficava aberta mais que isso, a chamada voltava 401
  // e a exigência de trocar a senha aparecia por cima do painel de quem tinha
  // acabado de trocar. Quem chamou decide o que fazer com isso — aqui só se
  // diz o que de fato aconteceu.
  if (sessaoAcabou) throw new Error(SESSAO_EXPIRADA);

  // Fora o token, erro continua caindo em "precisa trocar", e de propósito:
  // fechado, não aberto. Se a pergunta não pôde ser respondida por um motivo
  // que não é a sessão, uma senha que veio de um arquivo em texto puro não
  // passa por causa disso.
  if (error) return true;
  return jaTrocou !== true;
}

export async function sair() {
  if (!MODO_DEMO) await supabase.auth.signOut();
}
