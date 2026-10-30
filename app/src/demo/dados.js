// Dados fictícios do modo demo.
//
// Nada aqui vem do condomínio real: nomes, CPFs, placas e telefones são
// inventados. Os CPFs têm dígitos verificadores válidos só para não esbarrar na
// validação das telas — não pertencem a ninguém.
//
// A geração é determinística (PRNG com semente fixa): a mesma apresentação
// mostra sempre os mesmos dados, o que evita surpresa na hora de demonstrar.

/** PRNG mulberry32 — determinístico, suficiente para povoar uma demo. */
function gerador(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = gerador(20260805);
const escolher = (lista) => lista[Math.floor(rnd() * lista.length)];
const entre = (min, max) => min + Math.floor(rnd() * (max - min + 1));

const NOMES = [
  "Helena Barroso", "Rafael Quintela", "Marina Vasques", "Otávio Bandeira",
  "Clara Modesto", "Bruno Tavares", "Lívia Rezende", "Caio Serpa",
  "Aline Furtado", "Gustavo Peçanha", "Nara Bittencourt", "Théo Rangel",
  "Sofia Werneck", "Murilo Assunção", "Beatriz Camargo", "Danilo Fontes",
  "Isadora Prado", "Vinícius Aragão", "Letícia Novaes", "Henrique Vilela",
  "Camila Sarmento", "Eduardo Pantoja", "Renata Goulart", "Fábio Andrade",
  "Juliana Espósito", "Leonardo Braga", "Tainá Moura", "Ricardo Salles",
  "Paula Cerqueira", "André Vilhena", "Mariana Ferraz", "Diogo Amorim",
  "Bianca Rocha", "Thiago Menezes", "Larissa Pontes", "Sérgio Dantas",
  "Vitória Lacerda", "Felipe Cordeiro", "Amanda Siqueira", "Rodrigo Bastos",
  "Natália Coutinho", "Márcio Teixeira", "Elisa Monteiro", "Pedro Guimarães",
  "Débora Fialho", "Lucas Peixoto", "Carolina Nogueira", "Igor Palmeira",
];

const SOBRENOMES_DEP = [
  "Barroso", "Quintela", "Vasques", "Bandeira", "Modesto", "Tavares",
  "Rezende", "Serpa", "Furtado", "Peçanha", "Rangel", "Werneck",
];

const PRIMEIROS_DEP = [
  "Ana", "Miguel", "Laura", "Davi", "Alice", "Arthur", "Manuela", "Bernardo",
  "Cecília", "Gael", "Maitê", "Anthony", "Liz", "Ravi", "Aurora", "Noah",
];

const MODELOS_CARRO = [
  "Fiat Argo Drive 1.0", "Hyundai HB20 Comfort", "Jeep Renegade Longitude",
  "Toyota Corolla XEi", "Honda Civic EXL", "Volkswagen T-Cross Highline",
  "Chevrolet Onix LTZ", "Renault Kwid Zen", "Nissan Kicks SV",
  "Peugeot 208 Allure", "Citroën C3 Feel", "Ford Ka SE",
];

const MODELOS_MOTO = [
  "Honda CG 160 Titan", "Yamaha Fazer 250", "Honda PCX 160",
  "Yamaha NMax 160", "Honda Biz 125", "Shineray Jet 50",
];

const CORES = ["Preta", "Prata", "Branca", "Cinza", "Vermelha", "Azul"];

/** CPF fictício com dígitos verificadores válidos. */
function cpfFicticio() {
  const base = Array.from({ length: 9 }, () => entre(0, 9));
  const digito = (nums) => {
    const peso = nums.length + 1;
    const soma = nums.reduce((acc, n, i) => acc + n * (peso - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(base);
  const d2 = digito([...base, d1]);
  return [...base, d1, d2].join("");
}

const rg = () => String(entre(10, 39)) + String(entre(100000, 999999)) + "-" + entre(0, 9);
const telefone = () => `21${entre(96, 99)}${entre(1000000, 9999999)}`;
const placa = () => {
  const L = "ABCDEFGHIJKLMNPQRSTUVWX";
  const l = () => L[Math.floor(rnd() * L.length)];
  return `${l()}${l()}${l()}${entre(0, 9)}${l()}${entre(0, 9)}${entre(0, 9)}`;
};

/** Data relativa a hoje, em ISO curto (YYYY-MM-DD). */
function dia(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const email = (nome) =>
  nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, ".") + "@exemplo.com.br";

// ============================ UNIDADES ============================
// 2 blocos, 8 andares, 4 apartamentos por andar. O id segue o padrão do
// sistema (andar + apartamento), com o bloco à parte.

const unidades = [];
for (const bloco of ["1", "2"]) {
  for (let andar = 1; andar <= 8; andar++) {
    for (let apto = 1; apto <= 4; apto++) {
      const numero = `${andar}${String(apto).padStart(2, "0")}`;
      const ocupado = rnd() > 0.12;
      unidades.push({
        id: `${bloco}${numero}`,
        bloco,
        unidade: numero,
        ocupado: ocupado ? "Sim" : "Não",
        status: rnd() > 0.18 ? "Adimplente" : "Inadimplente",
        valor: String(entre(680, 1240)),
      });
    }
  }
}

const ocupadas = unidades.filter((u) => u.ocupado === "Sim");

// ============================ MORADORES ============================

const moradores = [];
let seqMorador = 1;

ocupadas.forEach((u, i) => {
  const nome = NOMES[i % NOMES.length];
  const vinculo = rnd() > 0.35 ? "Proprietário" : "Locatário";

  moradores.push({
    id: String(seqMorador++),
    id_unidade: u.id,
    nome,
    cpf: cpfFicticio(),
    rg: rg(),
    tipo_vinculo: vinculo,
    tipo_morador: "Titular",
    telefone: telefone(),
    email: email(nome),
    data_entrada: dia(-entre(120, 2200)),
    data_saida: "",
    status: "Ativo",
  });

  // Dependentes: só nome preenchido, como no cadastro real.
  for (let d = 0; d < entre(0, 3); d++) {
    moradores.push({
      id: String(seqMorador++),
      id_unidade: u.id,
      nome: `${escolher(PRIMEIROS_DEP)} ${escolher(SOBRENOMES_DEP)}`,
      cpf: "",
      rg: "",
      tipo_vinculo: vinculo,
      tipo_morador: "Dependente",
      telefone: "",
      email: "",
      data_entrada: "",
      data_saida: "",
      status: "Ativo",
    });
  }
});

const titulares = moradores.filter((m) => m.tipo_morador === "Titular");

// ============================ VAGAS E TAGS ============================

const vagas = ocupadas.map((u, i) => {
  const temCarro = rnd() > 0.22;
  const temMoto = rnd() > 0.72;
  return {
    id: String(i + 1),
    id_unidade: u.id,
    possui_carro: temCarro ? "Sim" : "Não",
    vaga_carro: temCarro ? String(entre(1, 96)) : "",
    placa_carro: temCarro ? placa() : "",
    modelo_carro: temCarro ? `${escolher(MODELOS_CARRO)} ${escolher(CORES)}` : "",
    status_carro: "Ativo",
    possui_moto: temMoto ? "Sim" : "Não",
    vaga_moto: temMoto ? `M${entre(1, 24)}` : "",
    placa_moto: temMoto ? placa() : "",
    modelo_moto: temMoto ? escolher(MODELOS_MOTO) : "",
    status_moto: "Ativo",
    observacoes: "",
  };
});

const tags = vagas
  .filter((v) => v.possui_carro === "Sim" && rnd() > 0.55)
  .slice(0, 14)
  .map((v, i) => ({
    id: String(i + 1),
    id_vagas: v.id,
    id_unidade: v.id_unidade,
    veiculo: "Carro",
    status: escolher(["Solicitado", "Entregue", "Entregue", "Cancelado"]),
  }));

// ============================ USUÁRIOS ============================
// Senha de todos na demo: "demo". O backend falso não guarda hash — é uma
// vitrine, não um sistema de autenticação.

const usuarios = [
  { id: "1", nome: "Marcos Aurélio Pinto", email: "sindico@exemplo.com.br", cargo: "Sindico" },
  { id: "2", nome: "Solange Ribeiro", email: "administrativo@exemplo.com.br", cargo: "Auxiliar Administrativo" },
  { id: "3", nome: "Jonas Paiva", email: "portaria@exemplo.com.br", cargo: "Porteiro" },
  { id: "4", nome: "Wilson Estrela", email: "conselho@exemplo.com.br", cargo: "Conselheiro" },
  { id: "5", nome: "Equipe VITTA", email: "dev@exemplo.com.br", cargo: "Desenvolvedor" },
];

// ============================ RESERVAS ============================

function reserva(i, campoData, extras = {}) {
  const m = escolher(titulares);
  const offset = entre(-45, 40);
  return {
    id: String(i + 1),
    unidade_id: m.id_unidade,
    id_unidade: m.id_unidade,
    morador: m.nome,
    contato: m.telefone,
    [campoData]: dia(offset),
    valor_taxa: String(entre(80, 320)),
    pago: rnd() > 0.35 ? "Sim" : "Não",
    status: offset < 0 ? escolher(["Concluída", "Concluída", "Cancelada"]) : escolher(["Pendente", "Aprovada"]),
    cpf: m.cpf,
    rg: m.rg,
    convidados: String(entre(8, 60)),
    foto: "",
    obs: "",
    ...extras,
  };
}

const festas = Array.from({ length: 16 }, (_, i) => reserva(i, "data_reserva"));

const churrasqueira = Array.from({ length: 18 }, (_, i) =>
  reserva(i, "data_reserva", { churrasqueira: escolher(["Churrasqueira 1", "Churrasqueira 2"]) })
);

const mudancas = Array.from({ length: 9 }, (_, i) => {
  const m = escolher(titulares);
  const offset = entre(-30, 25);
  return {
    id: String(i + 1),
    id_unidade: m.id_unidade,
    morador: m.nome,
    contato: m.telefone,
    data_mudanca: dia(offset),
    data_fim: "",
    status: offset < 0 ? "Concluída" : "Pendente",
    cpf: m.cpf,
    rg: m.rg,
    tipo: escolher(["Entrada", "Saída"]),
    periodo: escolher(["Manhã", "Tarde"]),
    obs: "",
  };
});

const piscina = titulares.slice(0, 26).map((m, i) => ({
  id: String(i + 1),
  id_unidade: m.id_unidade,
  id_morador: m.id,
  nome: m.nome,
  cpf: m.cpf,
  nascimento: dia(-entre(7000, 20000)),
  telefone: m.telefone,
  validade: dia(entre(-20, 300)),
  status: rnd() > 0.2 ? "Ativo" : "Vencido",
  obs: "",
  foto_id: "",
  atestado_id: "",
}));

// ============================ AGENDAMENTOS ============================

const agendamentos = Array.from({ length: 12 }, (_, i) => {
  const m = escolher(titulares);
  return {
    id: String(i + 1),
    tipo: "Morador",
    id_unidade: m.id_unidade,
    id_morador: m.id,
    nome: m.nome,
    telefone: m.telefone,
    data: dia(entre(-10, 20)),
    hora_inicio: `${String(entre(9, 18)).padStart(2, "0")}:00`,
    duracao: escolher(["30min", "1h", "1h30"]),
    assunto: escolher([
      "Segunda via de boleto",
      "Autorização de obra",
      "Reclamação de barulho",
      "Cadastro de biometria",
      "Vistoria de vaga",
      "Entrega de documentos",
    ]),
    obs: "",
    status: escolher(["Agendado", "Agendado", "Concluído"]),
  };
});

// ============================ ENTREGAS / ENCOMENDAS ============================

// Entregadores são pessoas (a exclusão no sistema é por CPF), com a empresa
// registrada à parte.
// O cadastro guarda o veículo da última entrada: é dele que a tela tira o
// preenchimento automático e a pergunta "está com esse veículo agora?".
const entregadores = [
  { id: "1", nome: "Josué Andrade", cpf: cpfFicticio(), empresa: "Correios", telefone: telefone(), status: "Ativo", veiculo: "Carro", placa: placa() },
  { id: "2", nome: "Wesley Fontoura", cpf: cpfFicticio(), empresa: "Mercado Livre", telefone: telefone(), status: "Ativo", veiculo: "Moto", placa: placa() },
  { id: "3", nome: "Priscila Damasceno", cpf: cpfFicticio(), empresa: "Shopee Express", telefone: telefone(), status: "Ativo", veiculo: "Moto", placa: placa() },
  { id: "4", nome: "Alan Verissimo", cpf: cpfFicticio(), empresa: "iFood", telefone: telefone(), status: "Ativo", veiculo: "A pé/Bike", placa: "" },
  { id: "5", nome: "Régis Sampaio", cpf: cpfFicticio(), empresa: "Amazon Logistics", telefone: telefone(), status: "Ativo", veiculo: "Carro", placa: placa() },
];

// Chegadas na portaria.
//
// Nomes de coluna do Postgres, e NÃO os da planilha: a tela lê
// `horario_entrada` e `horario_saida`, e enquanto isto aqui gravava `entrada` e
// `saida` a portaria da demonstração aparecia vazia — a data não existia, o
// filtro do dia descartava tudo, e nada indicava por quê.
//
// Os minutos são contados para trás a partir de agora, de propósito: é o que
// faz o mapa da portaria mostrar amarelo em quem está no prazo e vermelho em
// quem estourou, que é a coisa que a tela tem para mostrar.
const minutosAtras = (m) => new Date(Date.now() - m * 60000).toISOString();

const CHEGADAS_DEMO = [
  { tipo: "ENTREGADOR",    ha: 6,   permitido: 15,   saiuHa: null },
  { tipo: "MOTORISTA_APP", ha: 22,  permitido: 15,   saiuHa: null }, // estourou
  { tipo: "VISITANTE",     ha: 40,  permitido: 60,   saiuHa: null },
  { tipo: "AIRBNB",        ha: 300, permitido: null, saiuHa: null },
  { tipo: "SERVICO",       ha: 180, permitido: null, saiuHa: null, doCondominio: true },
  { tipo: "ENTREGADOR",    ha: 130, permitido: 15,   saiuHa: 120 },
  { tipo: "ENTREGADOR",    ha: 260, permitido: 15,   saiuHa: 250 },
];

const chegadas = CHEGADAS_DEMO.map((c, i) => {
  const e = escolher(entregadores);
  const u = escolher(ocupadas);
  const interno = Boolean(c.doCondominio);
  return {
    id: String(i + 1),
    cpf: e.cpf,
    nome: e.nome,
    tipo: c.tipo,
    empresa: c.tipo === "SERVICO" ? "Elevadores Atlas" : null,
    do_condominio: interno,
    minutos_permitidos: c.permitido,
    veiculo: escolher(["Moto", "Carro", "A pé/Bike"]),
    placa: escolher(["", placa()]),
    modelo: escolher(["", "Honda CG 160 vermelha", "Fiat Uno prata", "Yamaha Fazer preta, baú"]),
    // Serviço do condomínio não tem destino: é o que a marca acima significa.
    bloco: interno ? null : u.bloco,
    apartamento: interno ? null : u.unidade,
    liberado_por: interno ? "Jonas Paiva" : escolher(titulares).nome,
    created_by: "Jonas Paiva",
    saida_por: c.saiuHa === null ? null : "Jonas Paiva",
    horario_entrada: minutosAtras(c.ha),
    horario_saida: c.saiuHa === null ? null : minutosAtras(c.saiuHa),
  };
});

const entregas = Array.from({ length: 22 }, (_, i) => {
  const m = escolher(titulares);
  const recebida = rnd() > 0.45;
  return {
    id: String(i + 1),
    id_unidade: m.id_unidade,
    id_morador: m.id,
    nome: m.nome,
    telefone: m.telefone,
    ident_interna: `ENC-${String(1200 + i)}`,
    data_recebimento: dia(-entre(0, 18)),
    data_entrega: recebida ? dia(-entre(0, 5)) : "",
    status: recebida ? "Entregue" : "Pendente",
    quantidade: String(entre(1, 3)),
    transportadora: escolher(entregadores).nome,
    codigo: String(entre(100000, 999999)),
    responsavel: "Jonas Paiva",
  };
});

// ============================ COMPRAS ============================

const compras = Array.from({ length: 14 }, (_, i) => {
  const status = escolher(["Pendente", "Aprovada", "Comprada", "Reprovada"]);
  return {
    id: String(i + 1),
    titulo_solicitacao: escolher([
      "Lâmpadas LED da garagem",
      "Material de limpeza — mensal",
      "Reparo do portão social",
      "Bomba da piscina",
      "Câmeras do hall de entrada",
      "Tinta para a quadra",
      "Extintores — recarga anual",
      "Grama sintética do playground",
    ]),
    categoria: escolher(["Manutenção", "Limpeza", "Segurança", "Administrativo"]),
    obs: "",
    valor: String(entre(180, 6400)),
    fornecedor: escolher(["Casa & Obra", "Distribuidora Recreio", "TecSeg", "Verde Vivo"]),
    requer_aprovacao: "Sim",
    status,
    unidade: "",
    solicitado_data: dia(-entre(3, 60)),
    comprado_data: status === "Comprada" ? dia(-entre(0, 3)) : "",
    solicitante: escolher(usuarios).nome,
  };
});

const comprasProdutos = compras.slice(0, 8).flatMap((c, i) =>
  Array.from({ length: entre(1, 3) }, (_, j) => ({
    id: `${i + 1}-${j + 1}`,
    id_compra: c.id,
    nome: escolher(["Unidade", "Caixa", "Pacote", "Serviço"]),
    qtd: String(entre(1, 20)),
    valor: String(entre(20, 400)),
  }))
);

// ============================ ASSEMBLEIAS ============================

const assembleias = [
  {
    id: "1",
    titulo: "Assembleia Geral Ordinária",
    data_assembleia: dia(-120),
    pdf_id: "",
    resumo:
      "Aprovada a prestação de contas do exercício anterior por maioria simples. " +
      "Definido reajuste da taxa condominial em 6,4%, com vigência no mês seguinte. " +
      "Eleito o novo conselho fiscal para mandato de dois anos.",
    status: "Publicada",
  },
  {
    id: "2",
    titulo: "Assembleia Extraordinária — Fachada",
    data_assembleia: dia(-45),
    pdf_id: "",
    resumo:
      "Aprovada a contratação da reforma da fachada dos blocos 1 e 2, com pagamento " +
      "parcelado em doze vezes via fundo de obras. Rejeitada a proposta de cobrança " +
      "extra em cota única. Prazo estimado de execução: sete meses.",
    status: "Publicada",
  },
  {
    id: "3",
    titulo: "Assembleia Extraordinária — Regimento da Piscina",
    data_assembleia: dia(-12),
    pdf_id: "",
    resumo:
      "Revisto o regimento de uso da piscina: exigência de atestado dermatológico " +
      "renovado a cada doze meses e limite de dois convidados por unidade aos fins " +
      "de semana. Aprovada a contratação de salva-vidas na alta temporada.",
    status: "Publicada",
  },
];

// ============================ CONFIRMAÇÃO E LOG ============================

const confirmacao = titulares.slice(0, 30).map((m, i) => ({
  id: String(i + 1),
  id_unidade: m.id_unidade,
  id_morador: m.id,
  nome: m.nome,
  telefone: m.telefone,
  confirmado: rnd() > 0.4 ? "Sim" : "Não",
  data_confirmacao: rnd() > 0.4 ? dia(-entre(1, 40)) : "",
}));

const log = Array.from({ length: 30 }, (_, i) => ({
  id: String(i + 1),
  data: dia(-entre(0, 20)),
  usuario: escolher(usuarios).nome,
  acao: escolher(["create", "edit", "delete", "login"]),
  aba: escolher(["MORADORES", "ENTREGAS", "FESTAS", "COMPRAS", "VAGAS"]),
  detalhe: "",
}));

// ============================ TABELAS ============================
// As chaves batem com o parâmetro `sheet` que as páginas enviam ao backend.

/** "AAAA-MM-DD" a `n` dias de hoje: a demo não pode envelhecer para "tudo atrasado". */
const diaDaDemo = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const tarefas = [
  { id: "1", titulo: "Enviar comunicado da dedetização", situacao: "A_FAZER", responsavel_id: "1", prazo: diaDaDemo(1), created_by: "Marcos Aurélio Pinto", created_at: new Date().toISOString() },
  { id: "2", titulo: "Conferir a prestação de contas do mês", situacao: "EM_ANDAMENTO", responsavel_id: "2", prazo: diaDaDemo(0), created_by: "Marcos Aurélio Pinto", created_at: new Date().toISOString() },
  { id: "3", titulo: "Orçamento da limpeza da caixa d'água", situacao: "AGUARDANDO", responsavel_id: "2", prazo: diaDaDemo(6), created_by: "Solange Ribeiro", created_at: new Date().toISOString() },
];

export const TABELAS = {
  UNIDADES: unidades,
  MORADORES: moradores,
  VAGAS: vagas,
  TAGS: tags,
  usuarios,
  AGENDAMENTOS: agendamentos,
  ASSEMBLEIAS: assembleias,
  FESTAS: festas,
  CHURRASQUEIRA: churrasqueira,
  MUDANCAS: mudancas,
  PISCINA: piscina,
  COMPRAS: compras,
  COMPRAS_PRODUTOS: comprasProdutos,
  ENTREGAS: entregas,
  ENTREGADORES: entregadores,
  CHEGADAS: chegadas,
  // A tela chama `listar("ENTREGADORES_CHEGADAS")`, que e o nome da tabela no
  // Postgres; `CHEGADAS` era o nome da aba da planilha e sobrou aqui. Sem esta
  // chave, no modo demonstracao a portaria lia lista vazia e o cadastro de
  // entrada morria em "Aba desconhecida".
  ENTREGADORES_CHEGADAS: chegadas,
  CONFIRMACAO: confirmacao,
  log: log,
  AUDITORIA: log,

  // Anexos: a demo não sobe arquivo nenhum, então as abas de upload e foto
  // existem vazias só para as telas não quebrarem ao ler.
  UPLOADS_FESTAS: [],
  UPLOADS_CHURRASQUEIRA: [],
  UPLOADS_PISCINA: [],
  UPLOADS_COMPRAS: [],
  ENTREGAS_FOTO: [],
  ENTREGAS_NF: [],
  ENTREGAS_RECEBIMENTO: [],
  TAREFAS: tarefas,
  ASSINATURA: [],
};

/**
 * O que a função `responsaveis_de_tarefa()` do 0043 devolve: id, nome e cargo
 * de síndico e auxiliar, em ordem de nome. Fora de TABELAS de propósito: no
 * banco não é tabela nem view, e `listar` não a alcança — a demo não pode
 * ensinar um caminho que a produção não tem, que foi como a tela de Tarefas
 * passou a ler a `perfis_publicos` derrubada no 0016 sem nenhum teste acusar.
 */
export const RESPONSAVEIS_DEMO = usuarios
  .filter((u) => ["Sindico", "Auxiliar Administrativo"].includes(u.cargo))
  .map(({ id, nome, cargo }) => ({ id, nome, cargo }))
  .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

/** Senha única de todos os perfis da demo. */
export const SENHA_DEMO = "demo";
