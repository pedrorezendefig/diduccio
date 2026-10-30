// Os números do gráfico de receita, sem os dados pessoais que vêm junto.
//
// Substitui a view `receitas_reservas`, que era `security_invoker = off` — ou
// seja, rodava com as permissões de quem a criou e ignorava o RLS de
// churrasqueira e festas. Era de propósito e funcionava, mas o desenho tinha um
// defeito conhecido: a única coisa que separava o porteiro da receita do
// condomínio era um `where` DENTRO da view. Este projeto já publicou uma versão
// dessa view sem esse `where` (o 0010), e o `create or replace view` do 0015
// foi o que consertou. Um `create or replace` distraído reabria tudo de novo,
// em silêncio, sem nenhum teste do front-end perceber.
//
// Aqui a autorização é a primeira coisa que roda, e a projeção das colunas é
// literal — não existe `select *` para alguém esquecer de filtrar.
//
// Deploy: npx supabase functions deploy receita
//   (com verificação de JWT, o padrão — ao contrário de `entrar`. Assim o
//   gateway do Supabase já barra quem não tem sessão antes de o código rodar.)
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  // Faltar um nome aqui não dá erro no servidor: o navegador simplesmente não
  // manda a requisição, e o front-end recebe "Failed to fetch" — igual a queda
  // de rede. Já aconteceu com o `apikey` nas outras três funções.
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/**
 * As únicas colunas que saem daqui.
 *
 * Escrita uma vez e usada nas duas consultas de propósito: churrasqueira e
 * festas carregam `morador`, `cpf`, `rg` e `contato`, e é exatamente isso que
 * o conselheiro não pode receber. Uma lista por tabela seria duas chances de
 * divergir — e a que divergisse vazaria calada, porque o gráfico continuaria
 * desenhando igual.
 *
 * `status` entra porque o relatório "Status" do painel lê `r.status`. A view
 * antiga não projetava esse campo, então para o conselheiro aquele gráfico
 * mostrava tudo como "Sem status". Não é dado pessoal: vale "Agendado",
 * "Realizado" ou "Cancelado".
 */
const COLUNAS = "data_reserva, valor_taxa, pago, status";

/** Mesma normalização do `cargo_sem_acento()` no 0015.
 *
 *  O cargo é gravado "Sindico", sem acento, mas o app escreve "Síndico" com
 *  acento em vários lugares. Comparar sem normalizar deixaria o síndico de
 *  fora do próprio gráfico — e ele não veria erro nenhum, só um painel vazio. */
const semAcento = (t: string) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Quem enxerga a receita. Repete, em TypeScript, o predicado que a view tinha
 * em SQL (`eh_administrativo() or eh_conselheiro()`), para a troca ser uma
 * troca e não uma mudança de permissão:
 *   - `eh_dev`        → igualdade exata com "Desenvolvedor"
 *   - `eh_sindico`    → dev, ou contém "sindico"
 *   - `eh_auxiliar`   → contém "auxiliar"
 *   - `eh_conselheiro`→ contém "conselheiro"
 * Fica de fora o porteiro, e fica de fora conta sem cargo — lista de permissão,
 * nunca negação: negar por nome deixa passar todo cargo que ainda não existe.
 */
function podeVerReceita(cargo: string): boolean {
  const c = semAcento(cargo);
  return (
    c === "desenvolvedor" ||
    c.includes("sindico") ||
    c.includes("auxiliar") ||
    c.includes("conselheiro")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ message: "Método não suportado." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;

  // O cargo vem do token, validado aqui no servidor — nunca do corpo da
  // requisição. Confiar num cargo enviado pelo navegador transformaria esta
  // função na porta dos fundos das duas tabelas que ela existe para proteger.
  const autorizacao = req.headers.get("Authorization") ?? "";
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: autorizacao } },
  });
  const { data: quem, error: erroQuem } = await comoUsuario.auth.getUser();
  if (erroQuem || !quem?.user) return responder({ message: "Não autenticado." }, 401);

  const cargo = String(quem.user.app_metadata?.cargo ?? "");
  if (!podeVerReceita(cargo)) {
    return responder({ message: "Seu cargo não tem acesso à receita." }, 403);
  }

  // Daqui para baixo roda com a service role, que ignora RLS. É por isso que a
  // checagem acima vem antes e a projeção abaixo é literal.
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const [festas, churras] = await Promise.all([
    admin.from("festas").select(COLUNAS),
    admin.from("churrasqueira").select(COLUNAS),
  ]);

  // Uma das duas falhando devolveria metade da receita como se fosse o total —
  // um número menor que o real, plausível, e sem nada na tela dizendo isso.
  // Melhor não desenhar gráfico nenhum.
  const erro = festas.error ?? churras.error;
  if (erro) return responder({ message: `Não consegui ler as reservas: ${erro.message}` }, 500);

  const dados = [
    ...(festas.data ?? []).map((r) => ({ ...r, origem: "festas" })),
    ...(churras.data ?? []).map((r) => ({ ...r, origem: "churrasqueira" })),
  ];

  return responder({ success: true, dados });
});
