/**
 * O quadro de tarefas da administração, sem tela.
 *
 * Tudo que dá para errar calado mora aqui: o dia do prazo em Brasília, a ordem
 * dentro da coluna, o que some do quadro, o filtro "Minhas". A tela só desenha
 * o que esta lib decide.
 */
import { diaEmBrasilia, hojeEmBrasilia } from "./portaria";
import { normalizar, rotuloCurtoDaUnidade } from "./unidades";

export const CONCLUIDA = "CONCLUIDA";

/** As colunas do quadro, na ordem. O `id` é o que o `check` do 0042 aceita. */
export const SITUACOES = [
  { id: "A_FAZER", rotulo: "A fazer" },
  { id: "EM_ANDAMENTO", rotulo: "Em andamento" },
  { id: "AGUARDANDO", rotulo: "Aguardando" },
  { id: CONCLUIDA, rotulo: "Concluído" },
];

/** Quantos dias uma concluída continua no quadro antes de ir para "anteriores". */
export const DIAS_NO_QUADRO = 7;

export const rotuloDaSituacao = (id) =>
  SITUACOES.find((s) => s.id === id)?.rotulo ?? String(id ?? "");

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-05" -> "05/10". */
const diaEMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * Dias de `de` até `ate`, os dois como "AAAA-MM-DD". Conta em UTC puro de
 * propósito: são dias do calendário, e o fuso já foi resolvido por quem os
 * produziu (`diaEmBrasilia`).
 */
function diasEntre(de, ate) {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);
}

/**
 * O selo do prazo: `{ tom, texto }`, ou `null` quando não há prazo.
 *
 * Os tons casam com o CSS: `normal`, `perto` (âmbar: é contagem de tempo, que é
 * o único uso que o design system permite para o âmbar), `atrasada` e `feito`.
 * Concluída não fica "atrasada": ela já saiu da contagem.
 */
export function classificarPrazo(tarefa, agora = Date.now()) {
  if (tarefa?.situacao === CONCLUIDA) {
    const dia = diaEmBrasilia(tarefa.concluida_em);
    return { tom: "feito", texto: dia ? `Concluída ${diaEMes(dia)}` : "Concluída" };
  }

  const prazo = String(tarefa?.prazo ?? "").slice(0, 10);
  if (!ISO_DIA.test(prazo)) return null;

  const faltam = diasEntre(hojeEmBrasilia(agora), prazo);
  if (faltam < 0) {
    const n = -faltam;
    return { tom: "atrasada", texto: `Atrasada ${n} ${n === 1 ? "dia" : "dias"}` };
  }
  if (faltam === 0) return { tom: "perto", texto: "Hoje" };
  if (faltam === 1) return { tom: "perto", texto: "Amanhã" };
  return { tom: "normal", texto: diaEMes(prazo) };
}

/**
 * Fica no quadro? Aberta, sempre. Concluída, só nos últimos `DIAS_NO_QUADRO`
 * dias; as outras vão para "Ver concluídas anteriores". Concluída sem data
 * fica: esconder o que não se sabe quando terminou faria a tarefa sumir sem
 * ninguém ter visto.
 */
export function noQuadro(tarefa, agora = Date.now()) {
  if (tarefa?.situacao !== CONCLUIDA) return true;
  const dia = diaEmBrasilia(tarefa.concluida_em);
  if (!dia) return true;
  return diasEntre(dia, hojeEmBrasilia(agora)) <= DIAS_NO_QUADRO;
}

/**
 * Instante em milissegundos, ou `null` se faltar/for inválido. A ordem compara
 * instantes e não texto: o banco devolve "Z", "+00:00" ou "-03:00" conforme o
 * caminho, e o `localeCompare` (ICU) não entende fuso, então ordenaria errado.
 */
const instante = (v) => {
  const n = Date.parse(v ?? "");
  return Number.isNaN(n) ? null : n;
};

/** Compara instantes; quem não tem vai para o fim. `sentido` 1 = crescente, -1 = decrescente. */
function compararInstantes(a, b, sentido) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * sentido;
}

/**
 * A ordem dentro de uma coluna. Por prazo, sem prazo por último, empate pela
 * criação — determinística, sem campo de posição para manter. Concluídas, da
 * mais recente para a mais antiga. Devolve lista nova.
 */
export function ordenarColuna(tarefas, situacao) {
  const lista = [...(tarefas ?? [])];
  if (situacao === CONCLUIDA) {
    return lista.sort((a, b) => compararInstantes(instante(a.concluida_em), instante(b.concluida_em), -1));
  }
  return lista.sort((a, b) => {
    const pa = String(a.prazo ?? "").slice(0, 10) || "9999-12-31";
    const pb = String(b.prazo ?? "").slice(0, 10) || "9999-12-31";
    if (pa !== pb) return pa < pb ? -1 : 1;
    return compararInstantes(instante(a.created_at), instante(b.created_at), 1);
  });
}

/** `{ A_FAZER: [...], EM_ANDAMENTO: [...], AGUARDANDO: [...], CONCLUIDA: [...] }`, ordenado. */
export function agruparPorSituacao(tarefas) {
  const grupos = Object.fromEntries(SITUACOES.map((s) => [s.id, []]));
  for (const t of tarefas ?? []) {
    if (!t) continue;
    // Propriedade própria: uma situação como "constructor" não pode achar a do
    // protótipo. Pelo `prototype.hasOwnProperty.call` e não por `Object.hasOwn`,
    // que não existe no Safari antes do iOS 15.4 e derrubaria o quadro inteiro.
    (Object.prototype.hasOwnProperty.call(grupos, t.situacao) ? grupos[t.situacao] : grupos.A_FAZER).push(t);
  }
  for (const s of SITUACOES) grupos[s.id] = ordenarColuna(grupos[s.id], s.id);
  return grupos;
}

/**
 * O que o filtro da tela mostra. "Minhas" é pelo responsável, comparado como
 * texto porque o id do login e o da linha podem chegar um como número e o
 * outro como texto. A busca olha título, descrição e a etiqueta da unidade
 * ("B5-206"), que é o que o cartão mostra. `unidadePorId` é indexado por
 * `String(id)`.
 */
export function filtrarTarefas(tarefas, { minhas = false, meuId = null, busca = "", unidadePorId = new Map() } = {}) {
  const termo = normalizar(busca);
  return (tarefas ?? []).filter((t) => {
    if (minhas && (meuId == null || String(meuId).trim() === "" || String(t.responsavel_id ?? "") !== String(meuId))) return false;
    if (!termo) return true;
    const u = unidadePorId.get(String(t.id_unidade ?? ""));
    // O número entra como o cartão o mostra ("#12"), para quem ouviu "a 12" na
    // reunião achar a tarefa digitando.
    const alvo = normalizar(`#${t.id ?? ""} ${t.titulo ?? ""} ${t.descricao ?? ""} ${u ? rotuloCurtoDaUnidade(u) : ""}`);
    return alvo.includes(termo);
  });
}

/** "N abertas · M atrasadas" do cabeçalho. */
export function resumo(tarefas, agora = Date.now()) {
  let abertas = 0;
  let atrasadas = 0;
  for (const t of tarefas ?? []) {
    if (t.situacao === CONCLUIDA) continue;
    abertas += 1;
    if (classificarPrazo(t, agora)?.tom === "atrasada") atrasadas += 1;
  }
  return { abertas, atrasadas };
}

export function iniciais(nome) {
  const partes = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

export const rotuloDoCargo = (cargo) => (cargo === "Sindico" ? "Síndico" : String(cargo ?? ""));

/** Quem pode receber uma tarefa. */
export const CARGOS_RESPONSAVEIS = ["Sindico", "Auxiliar Administrativo"];

/**
 * A lista do campo Responsável: síndico e auxiliar vindos de
 * `listarResponsaveis` (a função do 0043), mais quem está logado se ainda não
 * estiver nela. A função não devolve o Desenvolvedor; sem a segunda parte o dev
 * não conseguiria atribuir a si mesmo. Se a lista falhar ao carregar, a tela
 * passa `[]` e sobra só quem está logado.
 */
export function pessoasResponsaveis(perfis, user) {
  const lista = (perfis ?? []).filter((p) => CARGOS_RESPONSAVEIS.includes(p.cargo));
  if (user?.id != null && !lista.some((p) => String(p.id) === String(user.id))) {
    lista.push({ id: user.id, nome: user.nome, cargo: user.cargo });
  }
  return lista;
}

/** Número, ou `null` se vazio/não numérico: coluna numérica recusa "" e NaN. */
const numeroOuNulo = (v) => {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** `{}` quando está tudo certo; senão, a mensagem por campo. */
export function validarTarefa(form) {
  const erros = {};
  if (!String(form?.titulo ?? "").trim()) erros.titulo = "Dê um título à tarefa.";
  if (numeroOuNulo(form?.responsavel_id) === null) erros.responsavel_id = "Escolha o responsável.";
  return erros;
}

/**
 * O formulário no formato da tabela. Vazio vira `null` (a coluna `date` recusa
 * texto vazio). Os campos do gatilho — `concluida_em`, `movida_*`,
 * `created_by` — não vão: quem os escreve é o banco.
 */
export function paraGravar(form) {
  const texto = (v) => String(v ?? "").trim() || null;
  return {
    titulo: String(form.titulo ?? "").trim(),
    descricao: texto(form.descricao),
    responsavel_id: numeroOuNulo(form.responsavel_id),
    prazo: texto(form.prazo),
    id_unidade: numeroOuNulo(form.id_unidade),
    situacao: form.situacao,
  };
}

/** "14:10", no relógio de Brasília. Também é o "Salvo às" do bloco de notas. */
export const horaEmBrasilia = (valor) =>
  new Date(valor).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** "Criada por Carla em 26/09. Movida por Rafael em 29/09, às 14:10." */
export function metaDaTarefa(tarefa) {
  if (!tarefa) return "";
  const partes = [];
  const criada = diaEmBrasilia(tarefa.created_at);
  if (criada) partes.push(`Criada${tarefa.created_by ? ` por ${tarefa.created_by}` : ""} em ${diaEMes(criada)}.`);
  const movida = diaEmBrasilia(tarefa.movida_em);
  if (movida) {
    partes.push(`Movida${tarefa.movida_por ? ` por ${tarefa.movida_por}` : ""} em ${diaEMes(movida)}, às ${horaEmBrasilia(tarefa.movida_em)}.`);
  }
  return partes.join(" ");
}

/**
 * A mensagem crua do Postgres fala de row-level security, que não diz nada a
 * quem está na tela. Mesmo padrão de `Assembleia.jsx`.
 */
export function mensagemErro(msg) {
  if (!msg) return "Não foi possível salvar. Tente novamente.";
  if (/row-level security|permission denied/i.test(msg)) {
    return "Você não tem permissão para mexer nas tarefas.";
  }
  if (/PGRST116|coerce the result|Nenhum registro foi excluído/i.test(msg)) {
    return "A tarefa não existe mais ou você não tem permissão. Recarregue a página.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return "Sem conexão com o servidor. Tente de novo.";
  return msg;
}
