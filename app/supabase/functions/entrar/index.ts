// Login: resolve o identificador, conta as tentativas e devolve a sessão.
//
// ATENÇÃO NO DEPLOY — esta é a única função do projeto que roda SEM token:
//
//   npx supabase functions deploy entrar --no-verify-jwt
//
// Sem a flag, o gateway exige um JWT válido antes de chamar a função, e quem
// está tentando entrar ainda não tem nenhum. O resultado seria 401 em todo
// login, com a função nunca chegando a executar.
//
// Por que o login saiu do navegador:
//
// 1. Antes, a tela chamava `email_de_login` para converter CPF em e-mail. Essa
//    função respondia ao visitante anônimo — qualquer um com a chave publicável
//    (que está no bundle) perguntava "existe conta com este CPF?" e recebia o
//    e-mail. Agora a conversão acontece aqui dentro, com a service role, e a
//    função foi fechada para todo mundo no 0023.
//
// 2. Não havia limite de tentativas. Dava para chutar senha na velocidade da
//    rede, contra qualquer conta, para sempre. Limite só existe onde o
//    atacante não controla o código — e o navegador é dele.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/** A mesma frase para conta inexistente e senha errada. Distinguir as duas
 *  transforma a tela de login num verificador de quem tem conta. */
const CREDENCIAL_INVALIDA = "Usuário ou senha incorretos.";

// Por CONTA: apertado. Cinco chutes em quinze minutos é muito mais do que
// alguém que sabe a própria senha precisa, e pouco demais para quem está
// adivinhando.
const LIMITE_POR_CONTA = 5;
const JANELA_POR_CONTA = 15 * 60;

// Por ORIGEM: folgado, e de propósito. O condomínio inteiro sai por um IP só —
// portaria, síndico e administração na mesma rede. Um limite apertado aqui
// trancaria todo mundo por causa de uma pessoa errando a senha. Serve contra
// varredura (mil contas, uma senha cada), não contra erro humano.
const LIMITE_POR_ORIGEM = 30;
const JANELA_POR_ORIGEM = 15 * 60;

/** SHA-256 em hexadecimal. O identificador nunca é gravado em claro. */
async function digerir(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** O IP de quem chamou, atrás do proxy do Supabase. */
function origemDe(req: Request): string {
  const encaminhado = req.headers.get("x-forwarded-for") ?? "";
  return encaminhado.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "desconhecida";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ success: false, message: "Método não suportado." }, 405);

  let corpo: any;
  try { corpo = await req.json(); } catch { return responder({ success: false, message: "Requisição inválida." }, 400); }

  const identificador = String(corpo?.identificador ?? "").trim();
  const senha = String(corpo?.senha ?? "");
  if (!identificador || !senha) {
    return responder({ success: false, message: "Informe usuário e senha." }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // ---- Antes de qualquer coisa: esta pessoa ainda pode tentar? ----
  // O `toLowerCase` faz "ANA@X.COM" e "ana@x.com" caírem no mesmo contador;
  // sem isso, trocar a caixa das letras zera o limite e ele deixa de existir.
  const chaveConta = `conta:${await digerir(identificador.toLowerCase())}`;
  const chaveOrigem = `origem:${await digerir(origemDe(req))}`;

  for (const [chave, limite, janela] of [
    [chaveConta, LIMITE_POR_CONTA, JANELA_POR_CONTA],
    [chaveOrigem, LIMITE_POR_ORIGEM, JANELA_POR_ORIGEM],
  ] as const) {
    const { data, error } = await admin.rpc("registrar_tentativa_login", {
      p_chave: chave, p_limite: limite, p_janela_segundos: janela,
    });
    // Falha ao contar fecha a porta, não abre. Um erro no banco não pode virar
    // "sem limite" — seria o jeito mais fácil de desligar a proteção.
    if (error) {
      console.error("contagem de tentativas falhou:", error.message);
      return responder({ success: false, message: "Não foi possível entrar agora. Tente de novo." }, 503);
    }
    const r = Array.isArray(data) ? data[0] : data;
    if (r?.bloqueado) {
      const minutos = Math.ceil((r.espera_segundos ?? 60) / 60);
      return responder({
        success: false,
        message: `Muitas tentativas. Espere ${minutos} minuto${minutos === 1 ? "" : "s"} e tente de novo.`,
      }, 429);
    }
  }

  // Faxina ocasional das janelas vencidas: sem agendador, e sem custo em toda
  // chamada. Falhar aqui não afeta o login.
  //
  // Sem `.catch()`: o que `rpc()` devolve NÃO é uma Promise, é um construtor de
  // consulta que só implementa `then`. Chamar `.catch()` nele é `undefined is
  // not a function` — a função inteira estoura e o Deno responde 500 sem os
  // cabeçalhos de CORS, o que no navegador aparece como erro de CORS e esconde
  // a causa. Derrubou o login em produção. Erro do supabase-js vem no resultado,
  // não por exceção.
  if (Math.random() < 0.02) {
    const { error } = await admin.rpc("limpar_tentativas_vencidas");
    if (error) console.error("faxina de tentativas falhou:", error.message);
  }

  // ---- Converte CPF (ou e-mail) no e-mail da conta ----
  const { data: email } = await admin.rpc("email_de_login", { identificador });

  // ---- Autentica ----
  // Com a chave publicável, e não com a service role: quem autentica devolve
  // uma sessão de usuário comum. Autenticar com a service role devolveria um
  // token com poder de administrador, e ele iria para o navegador.
  let sessao = null;
  if (email) {
    const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
    });
    const { data, error } = await comoUsuario.auth.signInWithPassword({
      email: String(email), password: senha,
    });
    if (!error) sessao = data.session;
  }

  if (!sessao) {
    // Identificador que não existe e senha errada saem pela mesma porta, com a
    // mesma frase. A tentativa já foi contada acima — inclusive a de conta
    // inexistente, senão varrer CPFs sairia de graça.
    return responder({ success: false, message: CREDENCIAL_INVALIDA }, 401);
  }

  // Entrou: zera o contador da conta. O da origem fica, senão bastaria um login
  // legítimo no meio da varredura para reabrir o crédito.
  //
  // Esta linha rodava em TODO login correto, e o `.catch()` dela é o que
  // derrubou a produção: a senha era aceita, a sessão era criada, e a resposta
  // nunca saía. Ver a explicação na faxina, acima.
  const { error: erroLimpeza } = await admin.rpc("limpar_tentativas_login", {
    p_chave: chaveConta,
  });
  // Não impede a entrada: a pessoa acertou a senha. O contador dela expira
  // sozinho em quinze minutos.
  if (erroLimpeza) console.error("limpar contador da conta falhou:", erroLimpeza.message);

  // O nome e a marca de senha trocada vêm da tabela `usuarios`, que é fechada.
  // Buscar aqui poupa duas idas ao banco logo depois do login — e o navegador
  // recebe só nome e cargo, nunca a linha inteira, que tem cpf e senha_hash.
  const usuarioId = (sessao.user.app_metadata as any)?.usuario_id ?? null;
  let nome: string | null = null;
  let senhaTrocada = false;
  if (usuarioId != null) {
    const { data: linha } = await admin
      .from("usuarios")
      .select("nome, senha_trocada")
      .eq("id", usuarioId)
      .maybeSingle();
    nome = linha?.nome ?? null;
    senhaTrocada = linha?.senha_trocada === true;
  }

  return responder({
    success: true,
    // O cliente monta a sessão com estes dois. É o mesmo par que o
    // `signInWithPassword` devolveria no navegador — nada a mais.
    access_token: sessao.access_token,
    refresh_token: sessao.refresh_token,
    usuario: {
      id: usuarioId,
      email: String(email),
      cargo: (sessao.user.app_metadata as any)?.cargo ?? "",
      nome: nome || String(email),
    },
    // Senha vinda da migração passou por um arquivo em texto puro. Enquanto não
    // for trocada, não vale como definitiva.
    deveTrocarSenha: senhaTrocada !== true,
  });
});
