// Confirmações (0065): o que as filas de cadastro e de reserva mostram, sem
// React, para os testes lerem direto.

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const MESES_EXTENSO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** O nome de cada tipo de solicitação do app (0068, 0074). */
export const TIPOS_DE_SOLICITACAO = {
  piscina: "Cartão da piscina", obra: "Obra ou reforma", corretor: "Visita de corretor",
  reclamacao: "Reclamação", sugestao: "Sugestão", erro: "Erro no aplicativo", mudanca: "Mudança",
  temporada: "Aluguel de temporada",
};

/** Avisa o menu que os números de pendência mudaram. */
export const EVENTO_PENDENCIAS = "vit:pendencias";

/** A partir de quantos dias para a data a reserva fica em destaque. */
export const DIAS_PERTO = 3;

/** "Bl 5 · 206". */
export const apto = (bloco, unidade) =>
  bloco == null || unidade == null ? "Sem apartamento" : `Bl ${bloco} · ${unidade}`;

/**
 * A folhinha de calendário da reserva. `data` é a data pura do banco
 * ("2026-11-01"); `faltam` vem do banco também (contado no dia de Brasília),
 * para a tela não depender do relógio de quem olha.
 */
export function folhaDaReserva(data, faltam) {
  const [a, m, d] = String(data ?? "").split("-").map(Number);
  if (!a || !m || !d) return null;
  const semana = SEMANA[new Date(a, m - 1, d).getDay()];
  const n = Number(faltam);
  let falta;
  if (n < 0) falta = "a data já passou";
  else if (n === 0) falta = "é hoje";
  else if (n === 1) falta = "amanhã";
  else falta = `daqui a ${n} dias`;
  return {
    mes: MESES[m - 1],
    dia: String(d).padStart(2, "0"),
    semana,
    extenso: `${semana.toLowerCase()}, ${d === 1 ? "1º" : d} de ${MESES_EXTENSO[m - 1]} de ${a}`,
    falta,
    faltam: n,
    perto: n <= DIAS_PERTO,
  };
}

/** Há quanto tempo o pedido espera: "agora", "5 h", "3 dias". */
export function esperaDesde(iso, agora = Date.now()) {
  const ms = agora - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "agora";
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

/** Pedido esperando 2 dias ou mais: a idade fica em destaque. */
export const esperaLonga = (iso, agora = Date.now()) => agora - new Date(iso).getTime() >= 2 * 86_400_000;

/** "(21) 98877-0382". */
export function telefoneLegivel(v) {
  const d = String(v ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || "";
}

/** "R$ 80,00". */
export const reais = (v) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** A mensagem do banco, em português de gente, para o toast. */
export function erroLegivel(e) {
  const msg = e?.message ?? String(e ?? "");
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return "Sem conexão com o servidor. Tente de novo.";
  if (/permission denied|42501/i.test(msg)) return "Você não tem permissão para esta ação.";
  return msg || "Não foi possível concluir. Tente de novo.";
}

/**
 * A solicitação espera a administração quando ainda não tem decisão (aberta
 * ou em análise, mesmo já lida) ou quando o morador escreveu e ninguém leu.
 * Mesma regra do `pendencias_da_administracao` (0107). Reteste de 12/11/2026:
 * abrir a conversa zerava a contagem com o pedido ainda sem decisão.
 */
export const SEM_DECISAO = ["aberta", "em_analise"];
export const solicitacaoEsperando = (s) => SEM_DECISAO.includes(s?.status) || Boolean(s?.nao_lida);

/**
 * Um dado do pedido do app como a administração lê: "2026-11-30" vira
 * "30/11/2026" e "2026-11-20T10:00" vira "20/11/2026, 10:00" (reteste de
 * 12/11/2026: a visita de corretor aparecia crua). O resto vai como está.
 */
export function dadoLegivel(valor, chave = "") {
  const texto = String(valor ?? "");
  // CPF do hóspede de temporada (0111): mascarado, como todo CPF na tela.
  if (chave === "cpf") {
    const d = texto.replace(/\D/g, "");
    return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : texto;
  }
  if (chave === "aceite") return texto === "sim" ? "Sim, o proprietário responde pela conduta do hóspede" : texto;
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (d) return `${d[3]}/${d[2]}/${d[1]}`;
  const dh = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(:\d{2})?$/.exec(texto);
  return dh ? `${dh[3]}/${dh[2]}/${dh[1]}, ${dh[4]}:${dh[5]}` : texto;
}

/**
 * Pendentes: o que já está pronto e espera o morador buscar (pedido do
 * usuário, 12/11/2026). A TAG que chegou na portaria e a solicitação marcada
 * "pronta" (o cartão da piscina, por exemplo). Quando o morador busca, a
 * administração conclui: a TAG vira "colada" e a solicitação, "concluída".
 * Do que está pronto há mais tempo para o mais novo.
 */
export function prontosParaRetirar({ tags = [], solicitacoes = [] } = {}) {
  const daTag = (tags ?? [])
    .filter((v) => v?.tag === "portaria")
    .map((v) => ({
      chave: `tag-${v.id}`, tipo: "tag", id: v.id,
      titulo: "TAG do carro", detalhe: [v.placa, [v.modelo, v.cor].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
      bloco: v.bloco, unidade: v.unidade, quem: "", desde: v.desde ?? null,
      acao: "Colada", feito: "Marcada: TAG colada.",
    }));
  const daSolicitacao = (solicitacoes ?? [])
    .filter((s) => s?.status === "pronta")
    .map((s) => ({
      chave: `sol-${s.id}`, tipo: "solicitacao", id: s.id,
      titulo: `${TIPOS_DE_SOLICITACAO[s.tipo] ?? "Solicitação"} Nº ${s.id}`, detalhe: s.resumo || "",
      bloco: s.bloco, unidade: s.unidade, quem: s.quem || "", desde: s.ultima_msg_em ?? s.enviada_em ?? null,
      acao: "Concluir", feito: "Concluída. O morador foi avisado.",
    }));
  const quando = (i) => (i.desde ? new Date(i.desde).getTime() : Infinity);
  return [...daTag, ...daSolicitacao].sort((a, b) => quando(a) - quando(b));
}

/** "pronto agora", "pronto há 5 h", "pronto há 3 dias". */
export function prontoHa(desde, agora = Date.now()) {
  const e = desde ? esperaDesde(desde, agora) : "";
  return !e ? "pronto" : e === "agora" ? "pronto agora" : `pronto há ${e}`;
}

/**
 * A pergunta antes de finalizar um chamado (pedido do usuário, 12/11/2026):
 * a mesma na conversa, no modo foco e em Pendentes. `nome` é o pedido
 * ("Cartão da piscina Nº 19") e `onde` o apartamento e quem pediu.
 */
export function perguntaDeFinalizar(nome, onde = "") {
  return {
    title: "Tem certeza que quer finalizar o chamado?",
    description: `${nome}${onde ? ` · ${onde}` : ""}. Ele vai para Concluídas e não recebe mais resposta. O morador é avisado.`,
    confirmLabel: "Sim, finalizar",
    cancelLabel: "Voltar",
  };
}

/**
 * O caminho de cada tipo de solicitação (0110, pedido do usuário em
 * 12/11/2026). Corretor, obra e mudança: aprovar encerra (sem Pronto nem
 * Concluir). Reclamação, sugestão e erro: entram Registradas, sem aprovação,
 * e a administração só encerra (ou manda para Tarefas). Piscina: o caminho
 * inteiro. Mesmas regras de `aprovar_encerra` e `so_registra` no banco.
 */
// Aluguel de temporada (0111): o mesmo caminho da obra.
export const APROVAR_ENCERRA = ["corretor", "obra", "mudanca", "temporada"];
export const SO_REGISTRA = ["reclamacao", "sugestao", "erro"];
export const aprovarEncerra = (tipo) => APROVAR_ENCERRA.includes(tipo);
export const soRegistra = (tipo) => SO_REGISTRA.includes(tipo);

/** Os botões de situação da conversa, por tipo: [situação, rótulo]. */
export function passosDoTipo(tipo) {
  if (soRegistra(tipo)) return [["concluida", "Encerrar"]];
  if (aprovarEncerra(tipo)) return [["em_analise", "Em análise"], ["falta_documento", "Falta documento"], ["aprovada", "Aprovar"]];
  return [["em_analise", "Em análise"], ["falta_documento", "Falta documento"], ["aprovada", "Aprovar"], ["pronta", "Marcar pronto"], ["concluida", "Concluir"]];
}

/** A pergunta antes de aprovar quando aprovar encerra o chamado. */
export function perguntaDeAprovar(nome, onde = "") {
  return {
    title: "Aprovar e encerrar o chamado?",
    description: `${nome}${onde ? ` · ${onde}` : ""}. Aprovado, ele vai para Concluídas e não recebe mais resposta. O morador é avisado.`,
    confirmLabel: "Sim, aprovar",
    cancelLabel: "Voltar",
  };
}

/**
 * Histórico (12/11/2026): todas as solicitações, abertas e fechadas, numa
 * lista só, da última movimentação para a mais antiga.
 */
export const POR_PAGINA_HISTORICO = [15, 30];
export const SITUACOES_DO_HISTORICO = [
  ["aberta", "Novas"], ["em_analise", "Em análise"], ["falta_documento", "Falta documento"],
  ["registrada", "Registradas"], ["aprovada", "Aprovadas"], ["pronta", "Prontas"],
  ["concluida", "Concluídas"], ["recusada", "Recusadas"], ["cancelada", "Canceladas"],
];
const SITUACAO_DO_HISTORICO = {
  aberta: { texto: "Nova", tom: "brand" }, em_analise: { texto: "Em análise", tom: "muted" },
  falta_documento: { texto: "Falta documento", tom: "danger" }, registrada: { texto: "Registrada", tom: "brand" },
  aprovada: { texto: "Aprovada", tom: "positive" }, pronta: { texto: "Pronto", tom: "positive" },
  concluida: { texto: "Concluída", tom: "positive" }, recusada: { texto: "Recusada", tom: "danger" },
  cancelada: { texto: "Cancelada pelo morador", tom: "muted" },
};

export function historicoDeSolicitacoes(abertas = [], fechadas = []) {
  const porId = new Map();
  for (const s of [...(fechadas ?? []), ...(abertas ?? [])]) porId.set(s.id, s);
  return [...porId.values()]
    .map((s) => ({
      ...s,
      quando: s.fechada_em ?? s.ultima_msg_em ?? s.enviada_em ?? null,
      situacao: SITUACAO_DO_HISTORICO[s.status] ?? { texto: s.status, tom: "neutral" },
    }))
    .sort((a, b) => String(b.quando ?? "").localeCompare(String(a.quando ?? "")) || b.id - a.id);
}

const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrarHistorico(itens, { busca = "", situacao = "todas", bloco = "", unidade = "" } = {}) {
  const q = semAcento(busca.trim());
  return itens.filter((s) =>
    (situacao === "todas" || s.status === situacao)
    && (!bloco || String(s.bloco) === String(bloco))
    && (!unidade || String(s.unidade) === String(unidade))
    && (!q || semAcento(`${s.id} ${TIPOS_DE_SOLICITACAO[s.tipo] ?? s.tipo} ${s.quem ?? ""} ${apto(s.bloco, s.unidade)} ${s.bloco}${s.unidade} ${s.resumo ?? ""}`).includes(q)));
}

/** Uma página da lista: os itens, a página (ajustada), quantas há e o "1–15". */
export function paginar(lista, pagina = 1, porPagina = 15) {
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const p = Math.min(Math.max(1, Number(pagina) || 1), paginas);
  const inicio = (p - 1) * porPagina;
  return {
    itens: lista.slice(inicio, inicio + porPagina), pagina: p, paginas,
    de: lista.length ? inicio + 1 : 0, ate: Math.min(inicio + porPagina, lista.length),
  };
}
