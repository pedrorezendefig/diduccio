// Início com capa ilustrada (2026-11): os números, as pendências e o
// relatório das duas versões, a da administração e a da portaria. Sem React e
// sem relógio: `hoje` ("AAAA-MM-DD" em Brasília) chega por parâmetro.

import { diaDoRegistro, diasEntre, rotuloUnidade, somarDias } from "./inicio";

const vivo = (status) => !/cancel|recus/i.test(String(status ?? ""));
const pago = (v) => String(v ?? "").trim().toLowerCase().startsWith("s");

/** "R$ 1.250,00" | "1250,5" | 1250 -> número. O mesmo critério do Dashboard. */
export function valorEmReais(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).replace(/[^\d,.-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

/** "R$ 18.640", sem centavos: é o que cabe no cartão. */
export const emReais = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Variação em % arredondada, ou `null` quando não há base para comparar
 * (antes era zero): "+100%" a partir do nada informaria errado.
 */
export function variacao(atual, anterior) {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/**
 * Pares { dia, valor } somados por mês do ano de `hoje`, de janeiro até o mês
 * de hoje: o gráfico não desenha meses que ainda não chegaram.
 */
export function porMesDoAno(pares, hoje) {
  const [ano, mes] = hoje.split("-").map(Number);
  const meses = Array(mes).fill(0);
  for (const { dia, valor } of pares) {
    if (!dia) continue;
    const [a, m] = dia.split("-").map(Number);
    if (a === ano && m <= mes) meses[m - 1] += valor;
  }
  return meses;
}

/**
 * Mesmo período, para comparar o que é comparável: o mês até hoje contra o
 * mês passado até o mesmo dia, e o ano até hoje contra o ano passado até a
 * mesma data. Comparar o mês pela metade com o mês passado inteiro faria todo
 * começo de mês parecer queda.
 */
export function noMesmoPeriodo(pares, hoje) {
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const mesPassado = mes === 1 ? [ano - 1, 12] : [ano, mes - 1];
  let mesAtual = 0, mesAnterior = 0, anoAtual = 0, anoAnterior = 0;
  for (const { dia: d, valor } of pares) {
    if (!d) continue;
    const [a, m, x] = d.split("-").map(Number);
    if (a === ano && m === mes && x <= dia) mesAtual += valor;
    if (a === mesPassado[0] && m === mesPassado[1] && x <= dia) mesAnterior += valor;
    if (a === ano && (m < mes || (m === mes && x <= dia))) anoAtual += valor;
    if (a === ano - 1 && (m < mes || (m === mes && x <= dia))) anoAnterior += valor;
  }
  return { mesAtual, mesAnterior, anoAtual, anoAnterior, noMes: variacao(mesAtual, mesAnterior), noAno: variacao(anoAtual, anoAnterior) };
}

/** As taxas pagas de salão e churrasqueira, como pares { dia, valor }. */
export function taxasPagas(festas = [], churrasqueira = []) {
  return [...festas, ...churrasqueira]
    .filter((r) => vivo(r.status) && pago(r.pago))
    .map((r) => ({ dia: diaDoRegistro(r.data_reserva), valor: valorEmReais(r.valor_taxa) }));
}

/** Contagem simples: cada registro vale 1 no dia dele. */
export const contagem = (datas) => datas.map((d) => ({ dia: diaDoRegistro(d), valor: 1 })).filter((p) => p.dia);

/**
 * Quantos registros existiam no fim de cada um dos últimos `n` meses (o
 * último é o mês de hoje): a curva de algo que só cresce ou diminui aos poucos,
 * como os carros cadastrados. Registro sem data conta desde sempre: veio da
 * planilha antiga, antes de o banco guardar a data.
 */
export function acumuladoPorMes(datas, hoje, n = 7) {
  const dias = datas.map((d) => diaDoRegistro(d));
  const [a, m] = hoje.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const fim = new Date(Date.UTC(a, m - (n - 1 - i), 1)).toISOString().slice(0, 10);
    return dias.filter((d) => !d || d < fim).length;
  });
}

/**
 * Reservas ativas: salão, churrasqueira e mudança ainda por acontecer (hoje
 * conta), e a próxima delas.
 */
export function reservasAtivas({ festas = [], churrasqueira = [], mudancas = [] }, hoje) {
  const datas = [
    ...festas.filter((r) => vivo(r.status)).map((r) => diaDoRegistro(r.data_reserva)),
    ...churrasqueira.filter((r) => vivo(r.status)).map((r) => diaDoRegistro(r.data_reserva)),
    ...mudancas.filter((r) => vivo(r.status)).map((r) => diaDoRegistro(r.data_mudanca)),
  ].filter((d) => d && d >= hoje).sort();
  return { total: datas.length, proxima: datas[0] ?? null };
}

/** "06/11" de "2026-11-06". */
export const diaEMes = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

/** Na portaria: nem retirada (Entregue) nem levada ao depósito (Armazenado). */
export const naPortaria = (e) => String(e.status ?? "") !== "Entregue" && String(e.status ?? "") !== "Armazenado" && !e.armazenado_data;

/**
 * Encomendas paradas: na portaria há mais de 3 dias, da mais antiga para a
 * mais nova. No 4º dia o app já avisou o morador (0063); no 5º ela vai ao
 * depósito.
 */
export function encomendasParadas(entregas = [], hoje, unidades = []) {
  const porId = new Map(unidades.map((u) => [String(u.id), u]));
  return entregas
    .filter(naPortaria)
    .map((e) => {
      const chegou = diaDoRegistro(e.data_entrada);
      return { ...e, chegou, dias: chegou ? diasEntre(chegou, hoje) : 0, rotulo: rotuloUnidade(porId.get(String(e.id_unidade))) };
    })
    .filter((e) => e.dias > 3)
    .sort((a, b) => b.dias - a.dias);
}

/** Encomendas que o morador retirou hoje. */
export const retiradasNoDia = (entregas = [], dia) =>
  entregas.filter((e) => String(e.status ?? "") === "Entregue" && diaDoRegistro(e.data_saida) === dia).length;

/** Quem está dentro, por tipo: "3 visitantes, 2 prestadores". */
const NOMES_DO_TIPO = {
  ENTREGADOR: ["entregador", "entregadores"], MOTORISTA_APP: ["motorista", "motoristas"],
  VISITANTE: ["visitante", "visitantes"], AIRBNB: ["hóspede", "hóspedes"], SERVICO: ["prestador", "prestadores"],
};
export function quemEstaDentro(abertas = []) {
  const conta = new Map();
  for (const c of abertas) {
    const t = String(c.tipo ?? "ENTREGADOR").toUpperCase();
    conta.set(t, (conta.get(t) ?? 0) + 1);
  }
  return [...conta.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t, n]) => `${n} ${(NOMES_DO_TIPO[t] ?? [t.toLowerCase(), t.toLowerCase()])[n === 1 ? 0 : 1]}`)
    .join(", ");
}

/** "HH:MM" de "14:00:00", "14h" ou "9:30". Vazio se não houver hora. */
export function soHora(v) {
  const m = String(v ?? "").match(/(\d{1,2})(?::|h)(\d{2})?/);
  return m ? `${m[1].padStart(2, "0")}:${m[2] ?? "00"}` : "";
}

/**
 * Os compromissos dos próximos dias, já com a cor ("mudanca", "espaco" ou
 * "adm"), a unidade e a hora quando existe. A administração lê as tabelas; a
 * portaria recebe só dia, tipo e unidade pela `agenda_da_portaria` (0083).
 */
export function compromissos({ festas = [], churrasqueira = [], mudancas = [], agendamentos = [], unidades = [] }) {
  const porId = new Map(unidades.map((u) => [String(u.id), u]));
  const un = (id) => rotuloUnidade(porId.get(String(id)));
  const lista = [];
  for (const f of festas) if (vivo(f.status)) lista.push({ dia: diaDoRegistro(f.data_reserva), tipo: "espaco", titulo: "Salão de festas", unidade: un(f.unidade_id), hora: "" });
  for (const c of churrasqueira) if (vivo(c.status)) lista.push({ dia: diaDoRegistro(c.data_reserva), tipo: "espaco", titulo: `Churrasqueira${c.churrasqueira ? ` ${c.churrasqueira}` : ""}`, unidade: un(c.unidade_id), hora: "" });
  for (const m of mudancas) if (vivo(m.status)) lista.push({ dia: diaDoRegistro(m.data_mudanca), tipo: "mudanca", titulo: "Mudança", unidade: un(m.id_unidade), hora: soHora(m.periodo), detalhe: m.periodo && !soHora(m.periodo) ? String(m.periodo) : "" });
  for (const a of agendamentos) if (vivo(a.status) && !/realizado/i.test(String(a.status ?? ""))) lista.push({ dia: diaDoRegistro(a.data), tipo: "adm", titulo: a.tipo ? String(a.tipo) : "Agendamento", unidade: "", hora: soHora(a.hora_inicio), detalhe: a.nome || a.assunto || "" });
  return lista.filter((e) => e.dia);
}

/** As linhas da `agenda_da_portaria` no mesmo formato de `compromissos`. */
export const compromissosDaPortaria = (linhas = []) => linhas.map((l) => ({
  dia: diaDoRegistro(l.dia),
  tipo: l.tipo === "mudanca" ? "mudanca" : "espaco",
  titulo: l.titulo,
  unidade: rotuloUnidade(l),
  hora: soHora(l.periodo),
  detalhe: l.periodo && !soHora(l.periodo) ? String(l.periodo) : "",
})).filter((e) => e.dia);

const SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

/** Os `n` dias a partir de hoje, cada um com os compromissos em ordem de hora. */
export function semanaDaCapa(lista, hoje, n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const dia = somarDias(hoje, i);
    const [a, m, d] = dia.split("-").map(Number);
    const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
    return {
      dia, sigla: SEMANA[dow], numero: String(d).padStart(2, "0"),
      itens: lista.filter((e) => e.dia === dia).sort((x, y) => (x.hora || "99").localeCompare(y.hora || "99")),
    };
  });
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * As pendências da administração, da mais urgente para a menos. Cada uma só
 * aparece se existir: lista vazia vira "tudo em dia" na tela.
 */
export function pendenciasDaAdministracao({ paradas = [], fila = [], inadimplentes = 0, chamadosParados = 0, tarefas = [] }) {
  const lista = [];
  if (paradas.length) {
    lista.push({ chave: "encomendas", icone: "encomenda", tom: "alerta", titulo: `${plural(paradas.length, "encomenda", "encomendas")} há mais de 3 dias`, texto: "Portaria · avisar os moradores", selo: "Atenção", destino: "/encomendas" });
  }
  if (fila.length) {
    const quem = fila.slice(0, 2).map((i) => (i.bloco != null && i.unidade != null ? `${i.bloco}·${i.unidade}` : i.quem)).filter(Boolean).join(" e ");
    lista.push({ chave: "app", icone: "app", tom: "azul", titulo: `${plural(fila.length, "pedido esperando", "pedidos esperando")} no app`, texto: `Confirmações${quem ? ` · ${quem}` : ""}`, selo: "Revisar", destino: "/modo-foco" });
  }
  if (chamadosParados) {
    lista.push({ chave: "chamados", icone: "chamado", tom: "laranja", titulo: `${plural(chamadosParados, "chamado", "chamados")} sem resposta há 3 dias`, texto: "Chamados do app", selo: "Responder", destino: "/modo-foco" });
  }
  if (inadimplentes) {
    lista.push({ chave: "inadimplentes", icone: "inadimplente", tom: "laranja", titulo: `${plural(inadimplentes, "unidade inadimplente", "unidades inadimplentes")}`, texto: "Unidades", selo: "Ver lista", destino: "/unidades" });
  }
  for (const t of tarefas.slice(0, 2)) {
    lista.push({ chave: `tarefa-${t.id}`, icone: "tarefa", tom: t.prazo.tom === "atrasada" ? "alerta" : "marca", titulo: t.titulo || "Tarefa", texto: `Tarefas · ${t.prazo.texto.toLowerCase()}`, selo: t.prazo.tom === "atrasada" ? "Atrasada" : "Vence hoje", destino: "/tarefas" });
  }
  return lista.slice(0, 5);
}

/** As pendências da portaria: as encomendas paradas, uma por linha. */
export function pendenciasDaPortaria(paradas = []) {
  return paradas.slice(0, 5).map((e) => ({
    chave: `enc-${e.id}`, icone: "encomenda",
    tom: e.dias >= 5 ? "alerta" : "laranja",
    titulo: `${e.nome || "Encomenda"}${e.rotulo ? ` · ${e.rotulo}` : ""}`,
    // O código de retirada não aparece em tela da portaria: é o morador quem o informa.
    texto: `Chegou em ${diaEMes(e.chegou)} · há ${e.dias} dias`,
    selo: e.dias >= 5 ? "Levar ao depósito" : "Depósito amanhã",
    destino: "/encomendas",
  }));
}

/**
 * Grave: 5 ou mais esperando, ou algum que já passou do prazo (pedido do app
 * fora do prazo; encomenda que já devia ter ido ao depósito).
 */
export const LIMITE_GRAVE = 5;
export const ehGrave = (quantos, foraDoPrazo = 0) => quantos >= LIMITE_GRAVE || foraDoPrazo > 0;
