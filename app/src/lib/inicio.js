// Início e Modo foco: o que as duas telas calculam, sem React, para os testes
// lerem direto. Tudo aqui recebe "agora" por parâmetro; nada lê o relógio
// sozinho, senão o teste muda de resultado conforme o dia em que roda.

import { esperaLonga } from "./confirmacoes";

const DIA = 86_400_000;
const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const SEMANA_LONGA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** "2026-11-03" do dia em Brasília. O condomínio trabalha por dia civil, não por UTC. */
export function diaEmBrasilia(valor) {
  if (!valor) return "";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/**
 * A data pura do banco ("2026-11-03") fica como está; data com hora vira o
 * dia em Brasília. Sem isso, uma mudança às 22h de Brasília cai no dia
 * seguinte (é 01h em UTC).
 */
export function diaDoRegistro(valor) {
  const s = String(valor ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return diaEmBrasilia(s);
}

/** Soma dias a um "AAAA-MM-DD" sem passar por fuso. */
export function somarDias(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Diferença em dias entre dois "AAAA-MM-DD" (b - a). */
export function diasEntre(a, b) {
  const ms = (s) => { const [x, y, z] = s.split("-").map(Number); return Date.UTC(x, y - 1, z); };
  return Math.round((ms(b) - ms(a)) / DIA);
}

/** "Bom dia", "Boa tarde" ou "Boa noite", pela hora de Brasília. */
export function saudacao(agora = Date.now()) {
  const h = Number(new Date(agora).toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** "terça, 3 de novembro". */
export function dataPorExtenso(agora = Date.now()) {
  return new Date(agora).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });
}

/** "15·04": a unidade como a portaria fala. */
export const rotuloUnidade = (u) => (u && u.bloco != null && u.unidade != null ? `${u.bloco}·${u.unidade}` : "");

const vivo = (status) => !/cancel|recus/i.test(String(status ?? ""));

/**
 * Tudo o que está marcado no condomínio, num formato só: { dia, tipo, titulo,
 * unidade }. Reserva cancelada ou recusada não conta. `tipo` escolhe a cor
 * na tela: "espaco", "portaria" ou "adm".
 */
export function eventosDoCondominio({ festas = [], churrasqueira = [], mudancas = [], agendamentos = [], unidades = [] } = {}) {
  const porId = new Map(unidades.map((u) => [String(u.id), u]));
  const un = (id) => rotuloUnidade(porId.get(String(id)));
  const eventos = [];
  for (const f of festas) {
    if (!vivo(f.status)) continue;
    eventos.push({ dia: diaDoRegistro(f.data_reserva), tipo: "espaco", titulo: "Salão de festas", unidade: un(f.unidade_id) });
  }
  for (const c of churrasqueira) {
    if (!vivo(c.status)) continue;
    eventos.push({ dia: diaDoRegistro(c.data_reserva), tipo: "espaco", titulo: `Churrasqueira${c.churrasqueira ? ` ${c.churrasqueira}` : ""}`, unidade: un(c.unidade_id) });
  }
  for (const m of mudancas) {
    if (!vivo(m.status)) continue;
    eventos.push({ dia: diaDoRegistro(m.data_mudanca), tipo: "portaria", titulo: "Mudança", unidade: un(m.id_unidade) });
  }
  for (const a of agendamentos) {
    if (!vivo(a.status)) continue;
    eventos.push({ dia: diaDoRegistro(a.data), tipo: "adm", titulo: a.tipo ? String(a.tipo) : "Agendamento", unidade: "", detalhe: a.nome || a.assunto || "" });
  }
  return eventos.filter((e) => e.dia);
}

/**
 * Os próximos `n` dias a partir de hoje, cada um com o que está marcado.
 * Dia sem nada vem com a lista vazia: a tela mostra "livre".
 */
export function proximosDias(eventos, hoje, n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const dia = somarDias(hoje, i);
    const [a, m, d] = dia.split("-").map(Number);
    const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
    const semana = SEMANA_CURTA[dow];
    return {
      dia,
      numero: String(d).padStart(2, "0"),
      rotulo: i === 0 ? "hoje" : i === 1 ? "amanhã" : semana,
      // O título do cartão quando o dia é escolhido: "Hoje", "Amanhã", "Sexta, 06/11".
      titulo: i === 0 ? "Hoje" : i === 1 ? "Amanhã" : `${SEMANA_LONGA[dow]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`,
      itens: eventos.filter((e) => e.dia === dia),
    };
  });
}

/** Quanto tempo o pedido está esperando, para ordenar a fila. */
const desde = (p) => new Date(p.quando).getTime() || 0;

/**
 * A fila do Modo foco: os mesmos pedidos da tela de Confirmações, numa lista
 * só, do que espera há mais tempo para o mais novo. Fica de fora o que não
 * depende da administração: pedido de veículo esperando o PIX do morador e
 * chamado em que a última palavra já é da administração.
 */
export function filaDoFoco({ cadastros = [], reservas = [], veiculos = [], solicitacoes = [] } = {}, agora = Date.now()) {
  const itens = [
    ...cadastros.map((c) => ({ tipo: "cadastro", id: c.id, quando: c.pedido_em, quem: c.nome, bloco: c.bloco, unidade: c.unidade, bruto: c })),
    ...reservas.map((r) => ({ tipo: "reserva", id: r.id, quando: r.pedido_em, quem: r.morador, bloco: r.bloco, unidade: r.unidade, bruto: r })),
    ...veiculos.filter((v) => v.status !== "pagar")
      .map((v) => ({ tipo: "veiculo", id: v.id, quando: v.pedido_em, quem: v.quem, bloco: v.bloco, unidade: v.unidade, bruto: v })),
    ...solicitacoes.filter((s) => s.nao_lida)
      .map((s) => ({ tipo: "chamado", id: s.id, quando: s.ultima_msg_em ?? s.enviada_em, quem: s.quem, bloco: s.bloco, unidade: s.unidade, bruto: s })),
  ];
  return itens
    .map((i) => ({ ...i, chave: `${i.tipo}-${i.id}`, foraDoPrazo: Boolean(i.quando) && esperaLonga(i.quando, agora) }))
    .sort((a, b) => desde(a) - desde(b));
}

/**
 * Uma série para o mini-gráfico: quantos registros caíram em cada um dos
 * últimos `n` dias (o último é hoje).
 */
export function serieDiaria(datas, hoje, n = 7) {
  const dias = datas.map(diaDoRegistro).filter(Boolean);
  return Array.from({ length: n }, (_, i) => {
    const d = somarDias(hoje, i - (n - 1));
    return dias.filter((x) => x === d).length;
  });
}

/** Quantos registros por mês, nos últimos `n` meses (o último é o mês de `hoje`). */
export function serieMensal(datas, hoje, n = 7) {
  const meses = datas.map((v) => diaDoRegistro(v).slice(0, 7)).filter(Boolean);
  const [a, m] = hoje.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1));
    const chave = dt.toISOString().slice(0, 7);
    return meses.filter((x) => x === chave).length;
  });
}

/**
 * Adesão ao app: quantos apartamentos têm ao menos um morador aprovado, e a
 * curva acumulada mês a mês (para o mini-gráfico).
 */
export function adesaoAoApp(moradores, totalDeUnidades, hoje, n = 7) {
  const aprovados = moradores.filter((m) => m.status === "aprovado");
  const aptos = new Set(aprovados.map((m) => `${m.bloco}-${m.unidade}`));
  const total = Number(totalDeUnidades) || 0;
  const [a, m] = hoje.split("-").map(Number);
  const serie = Array.from({ length: n }, (_, i) => {
    const fim = new Date(Date.UTC(a, m - (n - 1 - i), 1)).toISOString().slice(0, 10);
    return new Set(aprovados.filter((x) => diaDoRegistro(x.aprovado_em) && diaDoRegistro(x.aprovado_em) < fim)
      .map((x) => `${x.bloco}-${x.unidade}`)).size;
  });
  return { aptos: aptos.size, total, pct: total ? Math.round((aptos.size / total) * 100) : 0, serie };
}

/** Encomenda que ainda está na portaria (não saiu nem foi para o depósito). */
const naPortaria = (e) => String(e.status ?? "") !== "Entregue" && String(e.status ?? "") !== "Armazenado" && !e.armazenado_data;

/**
 * As encomendas: quantas estão na portaria e quantas vão para o depósito
 * amanhã (o prazo é de 5 dias na portaria, contados da chegada; o 0063 avisa o
 * morador no 4º dia).
 */
export function encomendas(entregas, hoje) {
  const aqui = entregas.filter(naPortaria);
  const amanha = aqui.filter((e) => {
    const d = diaDoRegistro(e.data_entrada);
    return d && diasEntre(d, hoje) === 4;
  });
  return { naPortaria: aqui.length, vaoAmanha: amanha.length, codigosAmanha: amanha.map((e) => e.cod).filter(Boolean) };
}

/**
 * O que precisa de atenção hoje, já em frases, do mais grave para o menos.
 * Recebe os números prontos para não depender de onde vieram.
 */
export function avisosDoDia({ fila = [], encomendasAmanha = 0, chamadosParados = 0 } = {}) {
  const avisos = [];
  const fora = fila.filter((i) => i.foraDoPrazo);
  if (fora.length) {
    const p = fora[0];
    avisos.push({
      grave: true,
      titulo: fora.length === 1 ? "1 pedido do app fora do prazo" : `${fora.length} pedidos do app fora do prazo`,
      texto: `o mais antigo: ${p.quem ?? "morador"}, esperando há mais de 2 dias`,
    });
  }
  if (chamadosParados) {
    avisos.push({ titulo: chamadosParados === 1 ? "1 chamado parado há 3 dias" : `${chamadosParados} chamados parados há 3 dias`, texto: "sem resposta da administração" });
  }
  if (encomendasAmanha) {
    avisos.push({ titulo: encomendasAmanha === 1 ? "1 encomenda vai ao depósito amanhã" : `${encomendasAmanha} encomendas vão ao depósito amanhã`, texto: "o morador já foi avisado pelo app" });
  }
  return avisos;
}

/** Chamado em que o morador escreveu e ninguém respondeu há 3 dias ou mais. */
export const chamadosParados = (solicitacoes, agora = Date.now()) =>
  solicitacoes.filter((s) => s.nao_lida && agora - new Date(s.ultima_msg_em ?? s.enviada_em).getTime() >= 3 * DIA).length;
