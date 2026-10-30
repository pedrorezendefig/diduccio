// Cria conta de usuário do sistema.
//
// Existe porque `auth.admin.createUser` exige a secret key, e ela nunca pode ir
// para o navegador — é o oposto de todo o desenho de segurança do projeto.
// Aqui ela vive só no servidor, injetada pelo próprio Supabase.
//
// Deploy: npx supabase functions deploy criar-usuario
import { createClient } from "jsr:@supabase/supabase-js@2";

const CARGOS_VALIDOS = [
  "Desenvolvedor",
  "Sindico",
  "Conselheiro",
  "Auxiliar Administrativo",
  "Porteiro",
] as const;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  // `apikey` e `x-client-info` entram aqui porque o supabase-js e o nosso
  // `chamarEdgeFunction` os mandam. O navegador pergunta antes (preflight) e,
  // se um cabeçalho enviado não estiver nesta lista, ele nem chega a fazer a
  // requisição — e o erro que aparece é "Failed to fetch", que parece queda de
  // rede. Foi assim que o Comunicado dizia "sem conexão com o servidor" com o
  // servidor no ar e respondendo.
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/** Usada quando quem cadastra não informa senha. O usuário é obrigado a trocar
 *  no primeiro acesso (senha_trocada nasce false), então ela só precisa
 *  sobreviver a um login. */
const MAIUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";   // sem I e O
const MINUSCULAS = "abcdefghijkmnopqrstuvwxyz";   // sem l
const DIGITOS = "23456789";                       // sem 0 e 1
const ALFABETO = MAIUSCULAS + MINUSCULAS + DIGITOS;

/** Um índice sorteado sem viés de módulo, que enviesaria o alfabeto. */
function sorteie(limite: number): number {
  const teto = Math.floor(256 / limite) * limite;
  const b = new Uint8Array(1);
  do { crypto.getRandomValues(b); } while (b[0] >= teto);
  return b[0] % limite;
}

const de = (conjunto: string) => conjunto[sorteie(conjunto.length)];

function senhaProvisoria(): string {
  // Uma de cada classe, GARANTIDA, e o resto sorteado.
  //
  // A versão anterior sorteava 16 caracteres uniformes de A-Za-z0-9. Parece
  // equivalente, e não é: a chance de sair sem nenhum dígito é (52/62)^16, ou
  // seja 1 em 18. Com "exigir letras e dígitos" ligado no painel do Supabase,
  // esse 1 em 18 vira um cadastro que falha com uma mensagem que ninguém na
  // administração consegue interpretar — e que só acontece às vezes, que é o
  // pior tipo de defeito para diagnosticar.
  //
  // O alfabeto também perdeu 0/O e 1/l/I: esta senha é lida numa tela e
  // digitada em outra, e confundir zero com ó vira "senha incorreta" sem
  // ninguém entender por quê.
  const obrigatorios = [de(MAIUSCULAS), de(MINUSCULAS), de(DIGITOS)];
  const resto = Array.from({ length: 13 }, () => de(ALFABETO));
  const chars = [...obrigatorios, ...resto];

  // Embaralha, senão as três primeiras posições teriam sempre a mesma forma —
  // e um padrão previsível no começo encurta a busca de quem for adivinhar.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = sorteie(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const MINIMO_SENHA = 8;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ message: "Método não suportado." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Quem chamou? O token vem do navegador; validamos no servidor. Confiar num
  // cargo enviado no corpo deixaria qualquer porteiro criar conta de síndico.
  const autorizacao = req.headers.get("Authorization") ?? "";
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: autorizacao } },
  });
  const { data: quem, error: erroQuem } = await comoUsuario.auth.getUser();
  if (erroQuem || !quem?.user) return responder({ message: "Não autenticado." }, 401);

  // Só o desenvolvedor. Esta função roda com a secret key, que ignora RLS —
  // se o teste aqui fosse mais frouxo que a política `usuarios_*` do 0015
  // (também só dev), ela viraria a porta dos fundos justamente da tabela que
  // guarda senha_hash e CPF.
  if (String(quem.user.app_metadata?.cargo ?? "") !== "Desenvolvedor") {
    return responder({ message: "Apenas o desenvolvedor cadastra usuários." }, 403);
  }

  const { nome, email, cpf, cargo, senha: senhaInformada } = await req.json().catch(() => ({}));

  if (!nome?.trim()) return responder({ message: "Informe o nome." }, 400);
  if (!email?.trim()) return responder({ message: "Informe o e-mail." }, 400);
  if (!CARGOS_VALIDOS.includes(cargo)) {
    return responder({ message: `Cargo inválido. Use: ${CARGOS_VALIDOS.join(", ")}` }, 400);
  }

  // Só dígitos, como a coluna espera. O índice único no banco é a garantia
  // final contra CPF repetido; esta checagem existe para a mensagem ser boa.
  const cpfLimpo = String(cpf ?? "").replace(/\D/g, "");
  if (cpfLimpo && cpfLimpo.length !== 11) {
    return responder({ message: "CPF precisa ter 11 dígitos." }, 400);
  }

  // Quem cadastra pode definir a senha inicial. Se não definir, geramos uma —
  // o usuário é obrigado a trocar no primeiro acesso de qualquer forma.
  if (senhaInformada && String(senhaInformada).length < MINIMO_SENHA) {
    return responder({ message: `A senha precisa ter ao menos ${MINIMO_SENHA} caracteres.` }, 400);
  }

  const admin = createClient(url, secret, { auth: { persistSession: false } });
  const senha = senhaInformada ? String(senhaInformada) : senhaProvisoria();

  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: senha,
    email_confirm: true,
    app_metadata: { cargo },
  });
  if (erroAuth) return responder({ message: erroAuth.message }, 400);

  const { data: linha, error: erroLinha } = await admin
    .from("usuarios")
    .insert({
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      cargo,
      cpf: cpfLimpo || null,
      senha_trocada: false,
    })
    .select("id")
    .single();

  if (erroLinha) {
    // Sem isto, um e-mail duplicado ou CPF repetido deixaria uma conta de
    // autenticação órfã, sem linha correspondente — e o login dela quebraria
    // no `email_de_login`, que não acharia nada.
    await admin.auth.admin.deleteUser(criado.user.id);
    return responder({ message: erroLinha.message }, 400);
  }

  // O usuario_id só existe depois do insert, e o RLS depende dele para o
  // usuário marcar a própria senha como trocada.
  await admin.auth.admin.updateUserById(criado.user.id, {
    app_metadata: { cargo, usuario_id: linha.id },
  });

  // Só devolve a senha quando fomos nós que a geramos. Se quem cadastrou a
  // digitou, ele já a conhece — ecoá-la de volta seria expor o segredo numa
  // resposta HTTP sem necessidade nenhuma.
  return responder({
    success: true,
    id: linha.id,
    senhaProvisoria: senhaInformada ? undefined : senha,
  });
});
