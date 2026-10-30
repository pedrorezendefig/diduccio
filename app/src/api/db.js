// Acesso a dados do Supabase.
//
// As páginas chamam com o nome da ABA em maiúsculo ("UNIDADES"), herdado do
// Apps Script. As tabelas do Postgres são minúsculas. A normalização mora aqui
// para nenhuma página precisar saber disso — e para a conversão de cada tela
// ser uma troca de chamada, não uma reescrita.
import { MODO_DEMO } from "./config";
import { supabase } from "./supabase";
import { atender } from "../demo/servidor";
import { RESPONSAVEIS_DEMO } from "../demo/dados";

const URL_DEMO = "https://demo.vit.local/exec";
const nome = (tabela) => String(tabela).toLowerCase();
// O backend falso indexa `estado[aba]` sem normalizar (TABELAS usa chaves
// maiúsculas: "UNIDADES", "TAGS"...). Quem chama pode mandar "unidades" —
// aqui é onde isso vira "UNIDADES" antes de chegar no demo.
const nomeDemo = (tabela) => String(tabela).toUpperCase();

/**
 * O token de acesso do projeto dura 10 minutos — encurtado de propósito, para
 * que um cargo rebaixado perca o acesso rápido. O efeito colateral é que ele
 * vence o tempo todo durante o uso normal, e uma requisição que sai com o
 * token vencido volta 401.
 *
 * O 401 do PostgREST NÃO é falta de permissão: quando o RLS nega, a resposta é
 * 200 com zero linhas. 401 é sempre problema de token. E o app não tratava
 * isso: `listar` estourava, a tela caía no `catch` e mostrava lista vazia — a
 * pessoa via uma página sem nada e nenhuma explicação. Foi o que aconteceu na
 * tela de Entregas em produção.
 *
 * A segunda chance com token renovado mora no `sessao.js` desde que a mesma
 * confusão apareceu fora daqui: o `precisaTrocarSenha` lia o 401 como "sim,
 * precisa trocar", e a exigência de senha nova voltava sozinha para quem tinha
 * deixado a aba aberta dez minutos. Era a única chamada do sistema que não
 * passava por aqui.
 *
 * `SESSAO_EXPIRADA` continua sendo reexportado deste arquivo: as telas o
 * importam daqui, e mudar isso seria mexer em quem não tem nada com o assunto.
 */
export { SESSAO_EXPIRADA } from "./sessao";
import { SESSAO_EXPIRADA, comSessaoValida } from "./sessao";

export async function listar(tabela) {
  if (MODO_DEMO) return atender({ url: `${URL_DEMO}?sheet=${nomeDemo(tabela)}`, metodo: "GET" });

  const { data, error, sessaoAcabou } = await comSessaoValida(() =>
    supabase.from(nome(tabela)).select("*")
  );
  if (sessaoAcabou) throw new Error(SESSAO_EXPIRADA);
  if (error) throw new Error(`Não consegui ler ${tabela}: ${error.message}`);
  return data ?? [];
}

/**
 * A tabela inteira, de verdade: em páginas de mil, até a última vir incompleta.
 *
 * `listar` para em mil linhas, que é o teto do PostgREST por requisição. Para
 * tabela que cresce sem parar (chegadas, log) a resposta certa é filtrar no
 * banco; esta é para a que precisa estar inteira na tela e continua pequena —
 * o cadastro da portaria, que o 0036 poda sozinho.
 *
 * Ordenado por id: sem ordem, o Postgres não promete que a página 2 continua
 * de onde a 1 parou, e uma linha poderia aparecer duas vezes e outra nunca.
 */
const PAGINA = 1000;

export async function listarTudo(tabela) {
  if (MODO_DEMO) return listar(tabela);

  const todas = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error, sessaoAcabou } = await comSessaoValida(() =>
      supabase.from(nome(tabela)).select("*").order("id").range(de, de + PAGINA - 1)
    );
    if (sessaoAcabou) throw new Error(SESSAO_EXPIRADA);
    if (error) throw new Error(`Não consegui ler ${tabela}: ${error.message}`);
    todas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return todas;
  }
}

/**
 * Uma linha achada pelo valor de uma coluna, no banco — `null` se não houver.
 *
 * `listar` traz a tabela inteira, e o PostgREST corta em mil linhas. Procurar
 * alguém dentro dessa lista funciona até o dia em que a tabela passa de mil: a
 * pessoa existe, a busca diz que não, e quem chama tenta criar de novo. Foi o
 * que aconteceu no cadastro da portaria — o índice único do CPF recusava a
 * entrada, e a recuperação procurava na mesma lista cortada.
 *
 * A portaria hoje carrega com `listarTudo`, e esta continua valendo para quem
 * foi cadastrado por outro porteiro depois de a tela abrir.
 */
export async function buscarUm(tabela, coluna, valor) {
  if (MODO_DEMO) {
    const todas = await atender({ url: `${URL_DEMO}?sheet=${nomeDemo(tabela)}`, metodo: "GET" });
    return (Array.isArray(todas) ? todas : []).find((x) => String(x[coluna]) === String(valor)) ?? null;
  }

  const { data, error, sessaoAcabou } = await comSessaoValida(() =>
    supabase.from(nome(tabela)).select("*").eq(coluna, valor).limit(1).maybeSingle()
  );
  if (sessaoAcabou) throw new Error(SESSAO_EXPIRADA);
  if (error) throw new Error(`Não consegui ler ${tabela}: ${error.message}`);
  return data ?? null;
}

/**
 * Quem pode receber uma tarefa: id, nome e cargo de síndico e auxiliar.
 *
 * Vem da função `responsaveis_de_tarefa()` do 0043, e não de `listar`: a
 * `usuarios` é fechada (guarda senha_hash e CPF) e a `perfis_publicos`, que a
 * primeira versão do quadro lia, foi derrubada no 0016 por expor nomes a
 * visitante anônimo. Para quem não é da administração a função devolve zero
 * linhas, como o RLS faria.
 */
export async function listarResponsaveis() {
  if (MODO_DEMO) return RESPONSAVEIS_DEMO.map((p) => ({ ...p }));

  const { data, error, sessaoAcabou } = await comSessaoValida(() =>
    supabase.rpc("responsaveis_de_tarefa")
  );
  if (sessaoAcabou) throw new Error(SESSAO_EXPIRADA);
  if (error) throw new Error(`Não consegui ler os responsáveis: ${error.message}`);
  return data ?? [];
}

// O bloco de notas da demo, por usuário. Fica na memória do módulo: some ao
// recarregar a página, e tudo bem — a demo não promete guardar nada, e gravar
// no navegador ensinaria um caminho que a produção não usa (lá é o banco, para
// anotar no celular e ler no computador).
const NOTAS_DEMO = new Map();

/**
 * O bloco de notas de quem está logado (0044). Devolve o texto, "" se ainda
 * não há linha.
 *
 * Sem filtro por id: a linha do dono é a única que o RLS deixa ver, e o dono
 * vem do token, não de um parâmetro que a tela poderia errar. O `usuarioId` só
 * serve à demo, que não tem sessão real.
 */
export async function lerNotas(usuarioId) {
  if (MODO_DEMO) return NOTAS_DEMO.get(String(usuarioId)) ?? "";

  const { data, error, sessaoAcabou } = await comSessaoValida(() =>
    supabase.from("notas_tarefas").select("texto").maybeSingle()
  );
  if (sessaoAcabou) throw new Error(SESSAO_EXPIRADA);
  if (error) throw new Error(`Não consegui ler o bloco de notas: ${error.message}`);
  return data?.texto ?? "";
}

/**
 * Grava o bloco inteiro. Upsert porque a primeira gravação cria a linha e as
 * seguintes a substituem; a chave é o próprio usuário.
 *
 * `usuario_id` vai como número: a coluna é bigint, e o id do login pode chegar
 * como texto. Não é ele que decide de quem é o bloco — o RLS confere contra o
 * token, e um id alheio é recusado. Sem `.select()`: nada do que volta
 * interessa, e pedir a linha de volta só acrescentaria um SELECT ao pedido.
 */
export async function salvarNotas(usuarioId, texto) {
  if (MODO_DEMO) {
    NOTAS_DEMO.set(String(usuarioId), String(texto ?? ""));
    return { success: true };
  }

  const { error, sessaoAcabou } = await comSessaoValida(() =>
    supabase.from("notas_tarefas").upsert(
      { usuario_id: Number(usuarioId), texto: String(texto ?? "") },
      { onConflict: "usuario_id" }
    )
  );
  if (sessaoAcabou) return { success: false, message: SESSAO_EXPIRADA };
  return error ? { success: false, message: error.message } : { success: true };
}

/**
 * As chegadas da portaria, filtradas NO BANCO.
 *
 * `listar` traz a tabela inteira, e para esta em especial isso deixa de
 * funcionar sozinho: o PostgREST devolve no máximo mil linhas por requisição, e
 * a portaria de um condomínio de 270 apartamentos passa disso em cerca de um
 * mês. A partir daí, "as chegadas de hoje" seriam procuradas dentro de mil
 * linhas quaisquer — e no dia em que hoje não estivesse entre elas, a tela
 * ficaria vazia sem erro nenhum. É o tipo de falha que só aparece quando já
 * está em produção há semanas.
 *
 *   desde / ate  — recorte por horário de ENTRADA, em ISO.
 *   abertas      — só quem ainda não registrou saída, seja de quando for. Usa o
 *                  índice parcial do 0034.
 *
 * Sempre ordenado da mais recente para a mais antiga: com limite e sem ordem, o
 * que volta é um pedaço arbitrário, que é o problema de novo com outro nome.
 */
export async function listarChegadas({ desde, ate, abertas = false, limite = 1000 } = {}) {
  const dentroDoRecorte = (c) => {
    if (abertas && c.horario_saida) return false;
    if (desde && !(c.horario_entrada >= desde)) return false;
    if (ate && !(c.horario_entrada <= ate)) return false;
    return true;
  };

  if (MODO_DEMO) {
    const todas = await atender({
      url: `${URL_DEMO}?sheet=${nomeDemo("ENTREGADORES_CHEGADAS")}`, metodo: "GET",
    });
    // O mesmo recorte do banco, aplicado aqui: uma demonstração que mostra o
    // que a tela real não mostraria ensina a tela errada.
    return (Array.isArray(todas) ? todas : [])
      .filter(dentroDoRecorte)
      .sort((a, b) => new Date(b.horario_entrada) - new Date(a.horario_entrada))
      .slice(0, limite);
  }

  const { data, error, sessaoAcabou } = await comSessaoValida(() => {
    let q = supabase.from("entregadores_chegadas").select("*");
    if (abertas) q = q.is("horario_saida", null);
    if (desde) q = q.gte("horario_entrada", desde);
    if (ate) q = q.lte("horario_entrada", ate);
    return q.order("horario_entrada", { ascending: false }).limit(limite);
  });

  if (sessaoAcabou) throw new Error(SESSAO_EXPIRADA);
  if (error) throw new Error(`Não consegui ler as chegadas: ${error.message}`);
  return data ?? [];
}

export async function criar(tabela, registro) {
  if (MODO_DEMO) {
    return atender({
      url: URL_DEMO, metodo: "POST",
      corpo: JSON.stringify({ action: "add", sheet: nomeDemo(tabela), ...registro }),
    });
  }
  const { data, error, sessaoAcabou } = await comSessaoValida(() =>
    supabase.from(nome(tabela)).insert(registro).select().single()
  );
  if (sessaoAcabou) return { success: false, message: SESSAO_EXPIRADA };
  return error ? { success: false, message: error.message } : { success: true, data };
}

export async function editar(tabela, id, campos) {
  if (MODO_DEMO) {
    return atender({
      url: URL_DEMO, metodo: "POST",
      corpo: JSON.stringify({ action: "edit", sheet: nomeDemo(tabela), id, ...campos }),
    });
  }
  const { data, error, sessaoAcabou } = await comSessaoValida(() =>
    supabase.from(nome(tabela)).update(campos).eq("id", id).select().single()
  );
  if (sessaoAcabou) return { success: false, message: SESSAO_EXPIRADA };
  return error ? { success: false, message: error.message } : { success: true, data };
}

export async function remover(tabela, id) {
  if (MODO_DEMO) {
    return atender({
      url: URL_DEMO, metodo: "POST",
      corpo: JSON.stringify({ action: "delete", sheet: nomeDemo(tabela), id }),
    });
  }
  // `{ count: "exact" }` pede ao Postgrest para contar as linhas realmente
  // afetadas. Sem isso, um DELETE que o RLS filtra para zero linhas volta
  // com `error: null` — sucesso vazio, não erro — e quem chama reportaria
  // "excluído" sem ter apagado nada. Verificado contra o banco real: um
  // Porteiro tentando excluir uma unidade tem exatamente esse resultado.
  const { error, count, sessaoAcabou } = await comSessaoValida(() =>
    supabase.from(nome(tabela)).delete({ count: "exact" }).eq("id", id)
  );
  if (sessaoAcabou) return { success: false, message: SESSAO_EXPIRADA };
  if (error) return { success: false, message: error.message };
  if (count === 0) {
    return { success: false, message: "Nenhum registro foi excluído: sem permissão ou o registro já não existe." };
  }
  return { success: true };
}
