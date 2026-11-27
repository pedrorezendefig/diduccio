// Um Supabase de mentira para o modo demonstração.
//
// O ViT ganhou telas que falam direto com o banco (Início, Modo foco,
// Confirmações, App do morador, Notificações, Agenda, Cotas, Comunicado no
// app). Sem isto, em demo elas ficavam carregando ou diziam "Sem conexão com o
// servidor". Aqui elas recebem dados fictícios do mesmo formato que as funções
// do banco devolvem (os `returns` e os `jsonb_build_object` das migrations),
// montados a partir das unidades e dos moradores de `dados.js`. Nada sai da
// máquina, e o que a tela grava fica só na memória até recarregar a página.
import { TABELAS } from "./dados";

// ----------------------------------------------------------------- ajudantes

function gerador(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = gerador(20261127);
const escolher = (lista) => lista[Math.floor(rnd() * lista.length)];
const entre = (min, max) => min + Math.floor(rnd() * (max - min + 1));

const HORA = 3600_000;
const DIA = 24 * HORA;
/** "YYYY-MM-DD" em Brasília, `d` dias a partir de hoje. */
const diaBR = (d = 0) => new Date(Date.now() + d * DIA).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
/** ISO de `h` horas atrás. */
const horasAtras = (h) => new Date(Date.now() - h * HORA).toISOString();
const mascararCpf = (cpf) => (cpf ? `***.${String(cpf).slice(3, 6)}.${String(cpf).slice(6, 9)}-**` : null);
const unidadePorId = new Map(TABELAS.UNIDADES.map((u) => [String(u.id), u]));
const blocoDe = (id) => Number(unidadePorId.get(String(id))?.bloco ?? 0) || null;
const aptoDe = (id) => Number(unidadePorId.get(String(id))?.unidade ?? 0) || null;
const partes = (nome) => {
  const [primeiro, ...resto] = String(nome).split(" ");
  return { primeiro, sobrenome: resto.join(" ") };
};

// ------------------------------------------------------- app do morador (0047)

const titulares = TABELAS.MORADORES.filter((m) => m.tipo_morador === "Titular");

/** Quem tem conta no app: 3 esperando aprovação, 22 aprovados, 3 que saíram. */
const moradoresApp = titulares.slice(0, 28).map((m, i) => {
  const { primeiro, sobrenome } = partes(m.nome);
  const status = i < 3 ? "pendente" : i < 25 ? "aprovado" : "saiu";
  return {
    id: 500 + i,
    primeiro_nome: primeiro,
    sobrenome,
    nome: m.nome,
    cpf: m.cpf,
    telefone: m.telefone,
    email: m.email,
    unidade_id: m.id_unidade,
    bloco: blocoDe(m.id_unidade),
    unidade: aptoDe(m.id_unidade),
    vinculo: m.tipo_vinculo === "Locatário" ? "Locatário" : "Proprietário",
    tipo: "Titular",
    status,
    pedido_em: horasAtras(entre(2, 70)),
    aprovado_em: status === "pendente" ? null : horasAtras(entre(200, 2000)),
    saiu_em: status === "saiu" ? horasAtras(entre(48, 900)) : null,
    saida_registrada_por: status === "saiu" ? "Solange Ribeiro" : null,
    dependente: i % 5 === 1 ? `${escolher(["Pedro", "Laura", "Miguel", "Júlia"])} ${sobrenome}` : null,
  };
});
const doApp = (status) => moradoresApp.filter((m) => m.status === status);

const reservas = [
  { id: 801, data_reserva: diaBR(3), espacos: "Churrasqueira A", valor: 120 },
  { id: 802, data_reserva: diaBR(12), espacos: "Salão de festas", valor: 320 },
].map((r, i) => {
  const m = doApp("aprovado")[i + 2];
  return {
    ...r,
    faltam: Math.round((new Date(r.data_reserva) - new Date(diaBR(0))) / DIA),
    morador: m.nome,
    bloco: m.bloco,
    unidade: m.unidade,
    pedido_em: horasAtras(10 + i * 20),
    data_anterior: null,
    _m: m,
  };
});

const pedidosVeiculo = [
  { id: 901, origem: "morador", tipo: "cadastrar", veiculo: "Carro", placa: "RIO2A26", modelo: "Fiat Argo", cor: "Prata", com_tag: true, passar_tag: false, motivo_tag: null, status: "pendente", valor: null },
  { id: 902, origem: "morador", tipo: "tag", veiculo: "Carro", placa: "KXT4B19", modelo: "Honda HR-V", cor: "Preta", com_tag: true, passar_tag: false, motivo_tag: "perdida", status: "comprovante", valor: 35 },
  { id: 903, origem: "morador", tipo: "trocar", veiculo: "Moto", placa: "LMN7C88", modelo: "Honda CG 160", cor: "Vermelha", com_tag: false, passar_tag: false, motivo_tag: null, status: "pagar", valor: 35 },
].map((p, i) => {
  const m = doApp("aprovado")[i + 5];
  return { ...p, placa_em_outro: null, quem: m.nome, vinculo: m.vinculo, bloco: m.bloco, unidade: m.unidade, pedido_em: horasAtras(6 + i * 15), _m: m };
});

const SOLICITACOES = [
  { tipo: "piscina", status: "aberta", ultima_msg_de: "morador", dados: { nome: "Carteirinha da piscina", para_quem: "Para a filha, 9 anos" } },
  { tipo: "obra", status: "em_analise", ultima_msg_de: "adm", dados: { assunto: "Troca do piso da cozinha", descricao: "Obra de 5 dias úteis, das 9h às 17h." } },
  { tipo: "reclamacao", status: "aberta", ultima_msg_de: "morador", dados: { assunto: "Barulho depois das 22h", descricao: "Som alto no apartamento de cima, quase toda sexta-feira." } },
  { tipo: "sugestao", status: "registrada", ultima_msg_de: "morador", dados: { assunto: "Bicicletário coberto", descricao: "Cobrir o bicicletário do bloco 2." } },
];
const solicitacoes = SOLICITACOES.map((s, i) => {
  const m = doApp("aprovado")[i + 9];
  const em = horasAtras(8 + i * 26);
  return {
    id: 1001 + i,
    ...s,
    enviada_em: em,
    ultima_msg_em: horasAtras(2 + i * 9),
    nao_lida: s.ultima_msg_de === "morador",
    quem: m.nome,
    vinculo: m.vinculo,
    tipo_morador: m.tipo,
    bloco: m.bloco,
    unidade: m.unidade,
    tarefa_id: null,
    resumo: s.dados.para_quem ?? s.dados.assunto ?? s.dados.nome,
    _m: m,
    mensagens: [{ id: 1, autor: "morador", autor_nome: m.nome, texto: s.dados.descricao ?? s.dados.para_quem ?? s.dados.nome, inicial: true, em }],
  };
});
const finalizadas = [
  { tipo: "corretor", status: "concluida", assunto: "Visita do corretor ao 204" },
  { tipo: "mudanca", status: "concluida", assunto: "Mudança no sábado de manhã" },
  { tipo: "obra", status: "recusada", assunto: "Fechar a varanda com vidro", motivo_recusa: "A convenção não permite mudar a fachada." },
].map((s, i) => {
  const m = doApp("aprovado")[i + 14];
  return {
    id: 1101 + i, tipo: s.tipo, status: s.status, enviada_em: horasAtras(300 + i * 50), fechada_em: horasAtras(120 + i * 40),
    motivo_recusa: s.motivo_recusa ?? null, quem: m.nome, vinculo: m.vinculo, tipo_morador: m.tipo, bloco: m.bloco, unidade: m.unidade,
    resumo: s.assunto, assunto: s.assunto, descricao: null, para_quem: null,
  };
});

const veiculos = TABELAS.VAGAS.filter((v) => v.possui_carro === "Sim").slice(0, 16).map((v, i) => {
  const tag = i < 2 ? "pedida" : i === 2 ? "portaria" : rnd() > 0.3 ? "colada" : null;
  const [modelo, ...cor] = String(v.modelo_carro).split(" ");
  return {
    id: 1201 + i, veiculo: "Carro", placa: v.placa_carro, modelo: modelo || "Carro", cor: cor.join(" ") || null,
    tag, tag_desde: tag ? horasAtras(entre(24, 3000)) : null, tag_de: tag ? "morador" : null,
    tag_numero: tag === "colada" ? String(entre(10000, 99999)) : null, tag_arquivada_em: null,
    arquivado_em: null, arquivado_por: null,
    bloco: blocoDe(v.id_unidade), unidade: aptoDe(v.id_unidade), unidade_id: v.id_unidade,
  };
});

const COM_APP = () => {
  const porUnidade = new Map();
  for (const m of doApp("aprovado")) {
    const lista = porUnidade.get(m.unidade_id) ?? [];
    lista.push(m.nome);
    porUnidade.set(m.unidade_id, lista);
  }
  return [...porUnidade].map(([unidade_id, nomes]) => ({ unidade_id, nomes }));
};

const semInterno = ({ _m, mensagens, dados, ...resto }) => resto; // eslint-disable-line no-unused-vars

// --------------------------------------------------------- tabelas diretas

const noticias = [
  { id: 1, titulo: "Manutenção da piscina", texto: "A piscina fica fechada na terça e na quarta para a limpeza do filtro.", fixada: true, publicada_em: horasAtras(30) },
  { id: 2, titulo: "Dedetização das áreas comuns", texto: "Sábado, das 8h às 12h. Mantenha os animais dentro de casa.", fixada: false, publicada_em: horasAtras(80) },
  { id: 3, titulo: "Nova empresa de portaria", texto: "A partir do dia 1º, a portaria passa a ser feita pela nova equipe.", fixada: false, publicada_em: horasAtras(200) },
].map((n) => ({ caminho_pdf: null, publicada_por: "Marcos Aurélio Pinto", retirada_em: null, retirada_por: null, tamanho_texto: null, ...n }));

const eventos = [
  { tipo: "assembleia", titulo: "Assembleia geral ordinária", inicio: diaBR(9), hora_inicio: "19:30", local: "Salão de festas" },
  { tipo: "manutencao", titulo: "Revisão dos elevadores", inicio: diaBR(2), hora_inicio: "09:00", hora_fim: "12:00", local: "Bloco 1", blocos: [1] },
  { tipo: "falta_agua", titulo: "Limpeza da caixa d'água", inicio: diaBR(5), hora_inicio: "08:00", hora_fim: "14:00" },
  { tipo: "social", titulo: "Festa junina do condomínio", inicio: diaBR(20), hora_inicio: "16:00", local: "Pátio" },
].map((e, i) => ({
  id: i + 1, texto: null, fim: null, hora_fim: null, local: null, blocos: null, avisar: true, lembrete_em: null,
  criado_em: horasAtras(100 + i), criado_por: "Marcos Aurélio Pinto", cancelado_em: null, cancelado_por: null, ...e,
}));

const mesBR = (n) => {
  const [a, m] = diaBR(0).split("-").map(Number);
  const total = a * 12 + m - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
};
const cotas = [
  { id: 1, titulo: "Pintura da fachada", descricao: "Aprovada em assembleia. Cobrada junto com a taxa do mês.", valor_parcela: 180, parcelas: 8, primeiro_mes: mesBR(-2), ultimo_mes: mesBR(5) },
  { id: 2, titulo: "Fundo de obras do telhado", descricao: null, valor_parcela: 95, parcelas: 4, primeiro_mes: mesBR(1), ultimo_mes: mesBR(4) },
].map((c) => ({ assembleia_id: null, criado_em: horasAtras(500), criado_por: "Marcos Aurélio Pinto", atualizado_em: null, encerrado_em: null, encerrado_por: null, ...c }));

const ano = diaBR(0).slice(0, 4);
const feriados = [
  ["01-01", "Confraternização universal"], ["04-21", "Tiradentes"], ["05-01", "Dia do Trabalho"],
  ["09-07", "Independência"], ["10-12", "Nossa Senhora Aparecida"], ["11-02", "Finados"],
  ["11-15", "Proclamação da República"], ["11-20", "Consciência Negra"], ["12-25", "Natal"],
].map(([d, nome]) => ({ data: `${ano}-${d}`, nome, created_at: null }));

const LOJA = {
  noticias,
  noticia_anexos: [],
  eventos_condominio: eventos,
  cotas_extras: cotas,
  feriados,
  assembleias: TABELAS.ASSEMBLEIAS,
  usuarios: TABELAS.usuarios,
  perfis_publicos: TABELAS.usuarios.map(({ id, nome, cargo }) => ({ id, nome, cargo })),
  moradores: TABELAS.MORADORES,
  unidades: TABELAS.UNIDADES,
  entregadores_chegadas: TABELAS.ENTREGADORES_CHEGADAS,
  notas_tarefas: [],
  anexos: [],
};

// ------------------------------------------------------- consultas (from)

const comparar = (a, b) => (a == null ? -1 : b == null ? 1 : a < b ? -1 : a > b ? 1 : 0);

class Consulta {
  constructor(tabela) {
    this.tabela = tabela;
    this.filtros = [];
    this.ordens = [];
    this.limite = null;
    this.modo = "select";
    this.unico = null;
    this.carga = null;
  }
  // Leitura e escrita.
  select(_colunas, opcoes) { if (opcoes?.count) this.contar = true; if (opcoes?.head) this.cabeca = true; return this; }
  insert(v) { this.modo = "insert"; this.carga = v; return this; }
  upsert(v) { this.modo = "upsert"; this.carga = v; return this; }
  update(v) { this.modo = "update"; this.carga = v; return this; }
  delete() { this.modo = "delete"; return this; }
  // Filtros: os que as telas usam. `or` não filtra (devolve tudo do resto).
  filtrar(f) { this.filtros.push(f); return this; }
  eq(c, v) { return this.filtrar((r) => String(r[c]) === String(v)); }
  neq(c, v) { return this.filtrar((r) => String(r[c]) !== String(v)); }
  gt(c, v) { return this.filtrar((r) => r[c] != null && r[c] > v); }
  gte(c, v) { return this.filtrar((r) => r[c] != null && r[c] >= v); }
  lt(c, v) { return this.filtrar((r) => r[c] != null && r[c] < v); }
  lte(c, v) { return this.filtrar((r) => r[c] != null && r[c] <= v); }
  in(c, lista) { const s = new Set((lista ?? []).map(String)); return this.filtrar((r) => s.has(String(r[c]))); }
  is(c, v) { return this.filtrar((r) => (v === null ? r[c] == null : r[c] === v)); }
  like(c, p) { const re = new RegExp(`^${String(p).replace(/%/g, ".*")}$`); return this.filtrar((r) => re.test(String(r[c] ?? ""))); }
  ilike(c, p) { const re = new RegExp(`^${String(p).replace(/%/g, ".*")}$`, "i"); return this.filtrar((r) => re.test(String(r[c] ?? ""))); }
  match(obj) { Object.entries(obj).forEach(([c, v]) => this.eq(c, v)); return this; }
  not() { return this; }
  or() { return this; }
  filter() { return this; }
  contains() { return this; }
  overlaps() { return this; }
  textSearch() { return this; }
  order(c, { ascending = true } = {}) { this.ordens.push([c, ascending]); return this; }
  limit(n) { this.limite = n; return this; }
  range(de, ate) { this.inicio = de; this.limite = ate - de + 1; return this; }
  single() { this.unico = "single"; return this; }
  maybeSingle() { this.unico = "maybe"; return this; }
  returns() { return this; }
  abortSignal() { return this; }
  throwOnError() { return this; }

  executar() {
    const loja = (LOJA[this.tabela] ??= []);
    const casa = (r) => this.filtros.every((f) => f(r));
    if (this.modo === "insert" || this.modo === "upsert") {
      const novos = (Array.isArray(this.carga) ? this.carga : [this.carga]).map((r) => ({
        id: Math.max(0, ...loja.map((x) => Number(x.id) || 0)) + 1,
        created_at: new Date().toISOString(),
        ...r,
      }));
      loja.push(...novos);
      return this.fechar(novos);
    }
    if (this.modo === "update") {
      const alvo = loja.filter(casa);
      alvo.forEach((r) => Object.assign(r, this.carga));
      return this.fechar(alvo);
    }
    if (this.modo === "delete") {
      const fica = loja.filter((r) => !casa(r));
      const saiu = loja.filter(casa);
      LOJA[this.tabela] = fica;
      return this.fechar(saiu);
    }
    let linhas = loja.filter(casa);
    for (const [c, asc] of [...this.ordens].reverse()) {
      linhas = [...linhas].sort((a, b) => (asc ? 1 : -1) * comparar(a[c], b[c]));
    }
    const total = linhas.length;
    if (this.inicio) linhas = linhas.slice(this.inicio);
    if (this.limite != null) linhas = linhas.slice(0, this.limite);
    return this.fechar(linhas.map((r) => ({ ...r })), total);
  }

  fechar(linhas, total = linhas.length) {
    if (this.unico) {
      if (!linhas.length && this.unico === "single") return { data: null, error: { message: "Nenhum registro.", code: "PGRST116" } };
      return { data: linhas[0] ?? null, error: null };
    }
    return { data: this.cabeca ? null : linhas, error: null, count: this.contar ? total : null, status: 200 };
  }

  then(ok, falha) {
    return Promise.resolve().then(() => this.executar()).then(ok, falha);
  }
}

// ---------------------------------------------------- funções do banco (rpc)

const pendencias = () => ({
  cadastros: doApp("pendente").length,
  reservas: reservas.length,
  veiculos: pedidosVeiculo.filter((p) => ["pendente", "comprovante"].includes(p.status)).length,
  solicitacoes: solicitacoes.filter((s) => s.nao_lida || ["aberta", "em_analise"].includes(s.status)).length,
});

const tirar = (lista, id) => {
  const i = lista.findIndex((x) => String(x.id) === String(id));
  return i >= 0 ? lista.splice(i, 1)[0] : null;
};
const achar = (lista, id) => lista.find((x) => String(x.id) === String(id));
const contato = (m) => ({ cpf: mascararCpf(m?.cpf), telefone: m?.telefone ?? null, email: m?.email ?? null });

const RPC = {
  pendencias_da_administracao: pendencias,
  cadastros_para_aprovar: () => doApp("pendente").map((m) => ({ id: m.id, nome: m.nome, bloco: m.bloco, unidade: m.unidade, vinculo: m.vinculo, tipo: m.tipo, pedido_em: m.pedido_em })),
  reservas_para_aprovar: () => reservas.map(semInterno),
  pedidos_veiculo_para_aprovar: () => pedidosVeiculo.map(semInterno),
  solicitacoes_para_responder: () => solicitacoes.map(semInterno),
  solicitacoes_finalizadas: () => finalizadas,
  moradores_no_app: () => moradoresApp.filter((m) => m.status !== "pendente").map(({ cpf, telefone, email, unidade_id, pedido_em, ...m }) => ({ ...m, cpf: mascararCpf(cpf) })), // eslint-disable-line no-unused-vars
  moradores_com_app: COM_APP,
  quem_recebe_encomenda_no_app: COM_APP,
  veiculos_do_condominio: ({ p_arquivados } = {}) => veiculos.filter((v) => Boolean(v.arquivado_em) === Boolean(p_arquivados)),
  tags_a_entregar: () => veiculos.filter((v) => ["pedida", "portaria"].includes(v.tag) && !v.arquivado_em)
    .map((v) => ({ id: v.id, placa: v.placa, modelo: v.modelo, cor: v.cor, tag: v.tag, desde: v.tag_desde, bloco: v.bloco, unidade: v.unidade })),
  unidades_para_cadastro: () => TABELAS.UNIDADES.map((u) => ({ id: u.id, bloco: Number(u.bloco), unidade: Number(u.unidade) })),
  vistas_da_notificacao: () => ({ emitida_em: horasAtras(20), corrigida_em: null, vistas: [] }),
  senha_ja_trocada: () => true,
  quem_retira_pelo_app: () => [],

  detalhe_do_cadastro: ({ p_id }) => {
    const m = achar(moradoresApp, p_id);
    return {
      id: m?.id, ...contato(m), aviso_whatsapp: true, pedido_em: m?.pedido_em, email_confirmado_em: m?.pedido_em,
      no_condominio: TABELAS.MORADORES.filter((x) => x.id_unidade === m?.unidade_id).slice(0, 12)
        .map((x) => ({ nome: x.nome, vinculo: x.tipo_vinculo, tipo: x.tipo_morador })),
      no_app: [],
    };
  },
  detalhe_da_reserva: ({ p_id }) => {
    const r = achar(reservas, p_id);
    return { id: r?.id, ...contato(r?._m), pedido_em: r?.pedido_em, enviada_em: r?.pedido_em, comprovante: null, ocupados: "", livres: "Churrasqueira B" };
  },
  detalhe_do_pedido_veiculo: ({ p_id }) => {
    const p = achar(pedidosVeiculo, p_id);
    return { id: p?.id, ...contato(p?._m), observacao: null, atual: null, comprovante: null };
  },
  detalhe_da_solicitacao: ({ p_id }) => {
    const s = achar(solicitacoes, p_id);
    if (s) s.nao_lida = false;
    return s ? { id: s.id, tipo: s.tipo, status: s.status, dados: s.dados, enviada_em: s.enviada_em, ...contato(s._m), mensagens: s.mensagens } : null;
  },

  aprovar_cadastro: ({ p_id }) => { const m = achar(moradoresApp, p_id); if (m) { m.status = "aprovado"; m.aprovado_em = new Date().toISOString(); } return null; },
  recusar_cadastro: ({ p_id }) => { const m = achar(moradoresApp, p_id); if (m) m.status = "recusado"; return null; },
  editar_cadastro_do_morador: ({ p_id, p_nome, p_sobrenome, p_telefone }) => {
    const m = achar(moradoresApp, p_id);
    if (m) Object.assign(m, { primeiro_nome: p_nome, sobrenome: p_sobrenome, nome: `${p_nome} ${p_sobrenome}`, telefone: p_telefone });
    return null;
  },
  aprovar_reserva: ({ p_id }) => semInterno(tirar(reservas, p_id) ?? {}),
  recusar_reserva: ({ p_id }) => semInterno(tirar(reservas, p_id) ?? {}),
  aprovar_pedido_veiculo: ({ p_id }) => { tirar(pedidosVeiculo, p_id); return null; },
  recusar_pedido_veiculo: ({ p_id }) => { tirar(pedidosVeiculo, p_id); return null; },
  marcar_tag: ({ p_veiculo_id, p_situacao }) => { const v = achar(veiculos, p_veiculo_id); if (v) v.tag = p_situacao; return null; },
  mudar_situacao_da_solicitacao: ({ p_id, p_status, p_motivo }) => {
    const s = achar(solicitacoes, p_id);
    if (!s) return null;
    s.status = p_status;
    if (["concluida", "recusada", "cancelada"].includes(p_status)) {
      tirar(solicitacoes, p_id);
      finalizadas.unshift({ ...semInterno(s), fechada_em: new Date().toISOString(), motivo_recusa: p_motivo ?? null, assunto: s.resumo, descricao: null, para_quem: null });
    }
    return null;
  },
  responder_solicitacao: ({ p_id, p_texto }) => {
    const s = achar(solicitacoes, p_id);
    if (s) {
      s.ultima_msg_de = "adm"; s.ultima_msg_em = new Date().toISOString(); s.nao_lida = false;
      s.mensagens.push({ id: s.mensagens.length + 1, autor: "adm", autor_nome: "Administração", texto: p_texto, inicial: false, em: s.ultima_msg_em });
    }
    return null;
  },
  mandar_para_tarefas: ({ p_id }) => {
    const s = achar(solicitacoes, p_id);
    const id = String(TABELAS.TAREFAS.length + 1);
    TABELAS.TAREFAS.push({ id, titulo: s?.resumo ?? "Pedido do app", situacao: "A_FAZER", responsavel_id: "1", prazo: diaBR(3), created_by: "Marcos Aurélio Pinto", created_at: new Date().toISOString() });
    if (s) s.tarefa_id = Number(id);
    return Number(id);
  },
  registrar_saida_do_morador: ({ p_id }) => { const m = achar(moradoresApp, p_id); if (m) { m.status = "saiu"; m.saiu_em = new Date().toISOString(); } return { ok: true }; },
  previa_da_saida: ({ p_id }) => {
    const m = achar(moradoresApp, p_id);
    return { id: m?.id, nome: m?.nome, vinculo: m?.vinculo, bloco: m?.bloco, unidade: m?.unidade, dependente: m?.dependente, convite_pendente: false, veiculos: [], pedidos_veiculo: [], solicitacoes: [], reservas: [], encomendas: [] };
  },

  // Retirada de encomenda: dá baixa nas encomendas escolhidas da lista da demo.
  registrar_retirada: (a) => darBaixa(a),
  registrar_retirada_do_app: (a) => darBaixa(a),

  // Início da portaria (0083).
  portaria_por_dia: ({ p_desde }) => {
    const dias = [];
    for (let d = 0; diaBR(-d) >= (p_desde ?? diaBR(-30)) && d < 400; d++) {
      const fds = [0, 6].includes(new Date(`${diaBR(-d)}T12:00:00`).getDay());
      dias.push({ dia: diaBR(-d), entradas: entre(fds ? 8 : 14, fds ? 20 : 34), encomendas: entre(fds ? 2 : 6, fds ? 9 : 22), retiradas: entre(fds ? 3 : 5, fds ? 10 : 20) });
    }
    return dias.reverse();
  },
  agenda_da_portaria: ({ p_de, p_ate }) => {
    const vivo = (s) => !/cancel|recus/i.test(String(s ?? ""));
    const dentro = (d) => d >= p_de && d <= p_ate;
    return [
      ...TABELAS.FESTAS.filter((f) => vivo(f.status) && dentro(f.data_reserva)).map((f) => ({ dia: f.data_reserva, tipo: "espaco", titulo: "Salão de festas", unidade_id: f.unidade_id, periodo: null })),
      ...TABELAS.CHURRASQUEIRA.filter((c) => vivo(c.status) && dentro(c.data_reserva)).map((c) => ({ dia: c.data_reserva, tipo: "espaco", titulo: `Churrasqueira ${c.churrasqueira ?? ""}`.trim(), unidade_id: c.unidade_id, periodo: null })),
      ...TABELAS.MUDANCAS.filter((m) => vivo(m.status) && dentro(m.data_mudanca)).map((m) => ({ dia: m.data_mudanca, tipo: "mudanca", titulo: "Mudança", unidade_id: m.id_unidade, periodo: m.periodo })),
    ]
      .map(({ unidade_id, ...x }) => ({ ...x, bloco: blocoDe(unidade_id), unidade: aptoDe(unidade_id) }))
      .sort((a, b) => comparar(a.dia, b.dia) || comparar(a.titulo, b.titulo));
  },
  churrasqueira_da_portaria: () => TABELAS.CHURRASQUEIRA.map((c) => ({
    id: Number(c.id), data_reserva: c.data_reserva, unidade_id: c.unidade_id, morador: c.morador, status: c.status,
    convidados: Number(c.convidados) || null, churrasqueira: c.churrasqueira, pago: c.pago, divergencia_local: null, obs: c.obs || null, tem_comprovante: false,
  })),
};

function darBaixa({ p_entregas, p_itens }) {
  const ids = new Set([...(p_entregas ?? []), ...(p_itens ?? [])].map((x) => String(x?.id ?? x?.id_entrega ?? x)));
  for (const e of TABELAS.ENTREGAS) {
    if (ids.has(String(e.id))) Object.assign(e, { status: "Entregue", data_saida: diaBR(0) });
  }
  return entre(5000, 9999);
}

// ------------------------------------------------------------------ cliente

const ok = (data) => ({ data, error: null });
const ARQUIVO_DEMO = "/logo.png";

const armazenamento = () => ({
  upload: async (caminho) => ok({ path: caminho }),
  remove: async (caminhos) => ok((caminhos ?? []).map((name) => ({ name }))),
  move: async () => ok({ message: "ok" }),
  list: async () => ok([]),
  createSignedUrl: async () => ok({ signedUrl: ARQUIVO_DEMO }),
  createSignedUrls: async (caminhos) => ok((caminhos ?? []).map((path) => ({ path, signedUrl: ARQUIVO_DEMO, error: null }))),
  getPublicUrl: () => ({ data: { publicUrl: ARQUIVO_DEMO } }),
  download: async () => ({ data: null, error: { message: "Sem arquivos no modo demonstração." } }),
});

/** Cria o cliente falso. Mesma forma do `createClient` nas partes que o app usa. */
export function criarSupabaseDemo() {
  return {
    from: (tabela) => new Consulta(tabela),
    rpc: (nome, args = {}) => {
      const f = RPC[nome];
      // Função que a demo não conhece: lista vazia, sem erro, para a tela
      // mostrar o estado vazio em vez de "sem conexão".
      return Promise.resolve(ok(f ? f(args) : []));
    },
    storage: { from: armazenamento },
    functions: { invoke: async () => ok({ success: true }) },
    auth: {
      getSession: async () => ok({ session: null }),
      getUser: async () => ok({ user: null }),
      refreshSession: async () => ok({ session: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: null, error: { message: "No modo demonstração o login é pelo backend falso." } }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ok({ user: null }),
      setSession: async () => ok({ session: null }),
    },
    channel: () => {
      const canal = { on: () => canal, subscribe: () => canal, unsubscribe: async () => "ok" };
      return canal;
    },
    removeChannel: async () => "ok",
    removeAllChannels: async () => [],
  };
}

/** Para o Início da administração: a receita das reservas da demo. */
export const RECEITA_DEMO = () => [...TABELAS.FESTAS, ...TABELAS.CHURRASQUEIRA];
