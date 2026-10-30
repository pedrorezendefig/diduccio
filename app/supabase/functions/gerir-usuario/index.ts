// Edita, reseta senha e exclui usuários do sistema.
//
// Existe pelo mesmo motivo que `criar-usuario`: mudar e-mail, senha ou cargo
// de outra pessoa exige a secret key do Supabase, que nunca pode chegar ao
// navegador. Sem esta função, a tela de Usuários gravaria a edição direto no
// Postgres via RLS — o que alcança a tabela, mas nunca a conta de
// autenticação (auth.users). E é essa conta que decide o e-mail de login, a
// senha, e o `cargo` que o RLS lê do JWT.
//
// Deploy: npx supabase functions deploy gerir-usuario
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

const MINIMO_SENHA = 8;

/** Acha a conta de autenticação (auth.users) dona de uma linha de `usuarios`.
 *
 *  Casa por `app_metadata.usuario_id`, não por e-mail. `criar-usuario` grava
 *  esse campo logo depois do insert e ele nunca muda — é o vínculo estável
 *  entre a linha e a conta. O e-mail pode divergir (é exatamente o campo que
 *  a ação "editar" às vezes está no meio de atualizar), então casar por ele
 *  arriscaria pegar a conta errada, ou nenhuma, no meio da própria operação
 *  de troca de e-mail. */
async function buscarContaAuth(admin: any, usuarioId: unknown) {
  // `perPage` alto porque este é o sistema de um condomínio, não uma rede
  // social: uma única página cobre todo mundo, sem precisar paginar.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) return { conta: null, erro: error.message as string };
  const conta = data.users.find(
    (u: any) => String(u.app_metadata?.usuario_id ?? "") === String(usuarioId)
  );
  return { conta: conta ?? null, erro: null as string | null };
}

async function editar(admin: any, id: unknown, corpo: any) {
  const { nome, cargo, cpf, email } = corpo;

  if (!nome?.trim()) return responder({ message: "Informe o nome." }, 400);
  if (!CARGOS_VALIDOS.includes(cargo)) {
    return responder({ message: `Cargo inválido. Use: ${CARGOS_VALIDOS.join(", ")}` }, 400);
  }
  const cpfLimpo = String(cpf ?? "").replace(/\D/g, "");
  if (cpfLimpo && cpfLimpo.length !== 11) {
    return responder({ message: "CPF precisa ter 11 dígitos." }, 400);
  }

  const { data: linhaAtual, error: erroBusca } = await admin
    .from("usuarios")
    .select("id, email, cargo, cpf")
    .eq("id", id)
    .single();
  if (erroBusca || !linhaAtual) return responder({ message: "Usuário não encontrado." }, 404);

  const emailNovo = email?.trim() ? String(email).trim().toLowerCase() : linhaAtual.email;
  const emailMudou = emailNovo !== linhaAtual.email;
  const cargoMudou = cargo !== linhaAtual.cargo;

  // A conta de autenticação só precisa ser tocada se e-mail ou cargo
  // mudaram. Nome e CPF vivem só na tabela — mexer neles não exige a secret
  // key nem afeta login ou permissão.
  let conta: any = null;
  if (emailMudou || cargoMudou) {
    const achado = await buscarContaAuth(admin, id);
    if (achado.erro) return responder({ message: achado.erro }, 400);
    if (!achado.conta) {
      return responder({ message: "Conta de autenticação deste usuário não encontrada." }, 400);
    }
    conta = achado.conta;

    // A conta de autenticação é atualizada ANTES da tabela de propósito: se
    // o e-mail novo já pertencer a outra conta, é aqui que o Supabase recusa
    // — e nada na tabela chega a mudar. Na ordem inversa, a tabela passaria a
    // dizer um e-mail que a conta de autenticação não reconhece.
    const atualizacaoAuth: Record<string, unknown> = {};
    if (emailMudou) {
      atualizacaoAuth.email = emailNovo;
      atualizacaoAuth.email_confirm = true;
    }
    if (cargoMudou) {
      // É daqui que o RLS tira a permissão (função `cargo_atual()` no banco
      // lê o app_metadata do JWT). Esquecer isto faria a pessoa continuar
      // com o acesso antigo até a sessão expirar sozinha. Preserva
      // `usuario_id`: é o campo que `buscarContaAuth` usa para achar esta
      // mesma conta depois — sobrescrever o objeto sem ele quebraria isso.
      atualizacaoAuth.app_metadata = { ...conta.app_metadata, cargo };
    }

    const { error: erroAuth } = await admin.auth.admin.updateUserById(conta.id, atualizacaoAuth);
    if (erroAuth) return responder({ message: erroAuth.message }, 400);
  }

  const { error: erroTabela } = await admin
    .from("usuarios")
    .update({
      nome: nome.trim(),
      cargo,
      cpf: cpfLimpo || linhaAtual.cpf,
      email: emailNovo,
    })
    .eq("id", id);

  if (erroTabela) {
    // A conta de autenticação já mudou; sem desfazer, ela ficaria dizendo
    // algo que a tabela não confirma — o mesmo tipo de divergência que esta
    // função inteira existe para eliminar. Reverte para o estado anterior.
    if (conta) {
      const desfazer: Record<string, unknown> = {};
      if (emailMudou) desfazer.email = linhaAtual.email;
      if (cargoMudou) desfazer.app_metadata = { ...conta.app_metadata, cargo: linhaAtual.cargo };
      await admin.auth.admin.updateUserById(conta.id, desfazer);
    }
    return responder({ message: erroTabela.message }, 400);
  }

  // Mudança de cargo não tem efeito imediato, e quem administra precisa saber.
  //
  // O RLS lê o cargo do JWT (`cargo_atual()` no 0004), não da tabela. A pessoa
  // que está logada continua com o token antigo até ele expirar — um síndico
  // rebaixado a porteiro mantém poder de escrita nesse intervalo.
  //
  // Tentamos revogar a sessão e não é possível: `auth.admin.signOut` exige o
  // JWT da própria pessoa, que o servidor não tem. Verificado empiricamente em
  // 2026-08-11 — passar o id da conta falha e o token antigo segue válido.
  //
  // A mitigação real é reduzir a expiração do JWT nas configurações do projeto
  // (Authentication → Sessions). O padrão é 1 hora; 10 minutos encurtam a
  // janela sem incomodar quem usa, porque o refresh é automático.
  if (cargoMudou) {
    return responder({
      success: true,
      aviso:
        "Cargo alterado. Se a pessoa estiver logada agora, o acesso antigo vale até a sessão dela renovar. Peça que saia e entre de novo para valer na hora.",
    });
  }

  return responder({ success: true });
}

async function resetarSenha(admin: any, id: unknown, corpo: any) {
  const { senha } = corpo;
  if (!senha || String(senha).length < MINIMO_SENHA) {
    return responder({ message: `A senha precisa ter ao menos ${MINIMO_SENHA} caracteres.` }, 400);
  }

  const { conta, erro } = await buscarContaAuth(admin, id);
  if (erro) return responder({ message: erro }, 400);
  if (!conta) return responder({ message: "Conta de autenticação deste usuário não encontrada." }, 400);

  const { error: erroSenha } = await admin.auth.admin.updateUserById(conta.id, {
    password: String(senha),
  });
  if (erroSenha) return responder({ message: erroSenha.message }, 400);

  // Obriga a pessoa a trocar no próximo login, do mesmo jeito que uma conta
  // recém-criada (senha_trocada nasce false em `criar-usuario`). Se esta
  // gravação falhar, a senha já mudou de qualquer forma — devolver sucesso
  // com aviso é mais honesto do que fingir que nada aconteceu.
  const { error: erroTabela } = await admin
    .from("usuarios")
    .update({ senha_trocada: false })
    .eq("id", id);
  if (erroTabela) {
    return responder({
      success: true,
      aviso: "A senha foi trocada, mas não foi possível marcar para redefinição obrigatória.",
    });
  }

  return responder({ success: true });
}

async function excluir(admin: any, id: unknown, quemChamou: any) {
  // Ninguém se autoexclui: travaria o próprio acesso agora mesmo, e se for o
  // último desenvolvedor, ninguém mais teria como administrar o sistema. O id
  // de quem chamou vem do app_metadata do JWT — gravado pela própria
  // `criar-usuario` no servidor — não é algo que o corpo da requisição possa
  // forjar para escapar desta checagem.
  const meuUsuarioId = quemChamou.app_metadata?.usuario_id;
  if (meuUsuarioId !== undefined && String(meuUsuarioId) === String(id)) {
    return responder({ message: "Você não pode excluir a própria conta." }, 400);
  }

  const { data: linha, error: erroBusca } = await admin
    .from("usuarios")
    .select("id")
    .eq("id", id)
    .single();
  if (erroBusca || !linha) return responder({ message: "Usuário não encontrado." }, 404);

  const { conta, erro } = await buscarContaAuth(admin, id);
  if (erro) return responder({ message: erro }, 400);

  // A conta pode já não existir (tentativa repetida depois de uma falha
  // parcial anterior) — segue para apagar a linha mesmo assim, em vez de
  // travar numa situação que a própria função poderia ter deixado pela
  // metade.
  if (conta) {
    const { error: erroExcluirConta } = await admin.auth.admin.deleteUser(conta.id);
    if (erroExcluirConta) return responder({ message: erroExcluirConta.message }, 400);
  }

  const { error: erroExcluirLinha } = await admin.from("usuarios").delete().eq("id", id);
  if (erroExcluirLinha) {
    // A conta já foi apagada; a linha vira órfã, mas órfã do lado seguro —
    // ninguém consegue mais logar com ela. Reportar o erro deixa claro que
    // sobrou uma linha fantasma para limpar, em vez de esconder o problema.
    return responder(
      { message: `Conta removida, mas a linha continua: ${erroExcluirLinha.message}` },
      400
    );
  }

  return responder({ success: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ message: "Método não suportado." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Quem chamou? O token vem do navegador; validamos no servidor. Confiar num
  // cargo enviado no corpo deixaria qualquer porteiro editar ou excluir
  // qualquer um.
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
    return responder({ message: "Apenas o desenvolvedor gerencia usuários." }, 403);
  }

  const corpo = await req.json().catch(() => ({}));
  const { acao, id } = corpo;

  if (id === undefined || id === null || id === "") {
    return responder({ message: "Informe o usuário." }, 400);
  }

  const admin = createClient(url, secret, { auth: { persistSession: false } });

  if (acao === "editar") return editar(admin, id, corpo);
  if (acao === "resetar-senha") return resetarSenha(admin, id, corpo);
  if (acao === "excluir") return excluir(admin, id, quem.user);

  return responder({ message: "Ação inválida." }, 400);
});
