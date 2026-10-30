/**
 * Quem entra na portaria, e por quanto tempo.
 *
 * A tela deixou de ser só de entregador. O que muda de um tipo para outro é
 * pequeno e consequente: se há prazo, se há empresa por trás, e o que a tela
 * exige antes de liberar a entrada. Fica tudo aqui, num lugar só, porque
 * espalhado pelo JSX vira quatro condições que discordam entre si.
 */

import { casaComUnidade } from "./unidades";

export const MINUTOS_PADRAO = 15;
export const PASSO_MINUTOS = 5;
export const MINIMO_MINUTOS = 5;
/** Teto de 8 horas: acima disso o prazo deixou de ser prazo. */
export const MAXIMO_MINUTOS = 480;

/**
 * `prazo` — entra e sai; a portaria conta o tempo.
 * `empresa` — o nome da empresa é o que identifica quem entrou, mais que a pessoa.
 *
 * Hóspede de temporada e prestador de serviço ficam sem prazo: pedir minutos a
 * quem vai passar o fim de semana produziria um número que ninguém olha, e a
 * contagem perderia o sentido justamente onde ela importa.
 */
export const TIPOS = [
  { id: "ENTREGADOR",    rotulo: "Entregador",   nota: "iFood, 99, Rappi",     prazo: true,  empresa: false },
  { id: "MOTORISTA_APP", rotulo: "Motorista",    nota: "Uber, 99",             prazo: true,  empresa: false },
  // `ilimitavel`: tem prazo por padrão, mas o porteiro pode tirar o relógio.
  // Só a visita de morador. O entregador e o motorista de aplicativo entram
  // para deixar alguma coisa e sair — dar a eles a opção de ficar sem contagem
  // é abrir a porta que a contagem existe para fechar.
  { id: "VISITANTE",     rotulo: "Visitante",    nota: "visita de morador",    prazo: true,  empresa: false, ilimitavel: true },
  { id: "AIRBNB",        rotulo: "Temporada",    nota: "Airbnb e afins",       prazo: false, empresa: false },
  { id: "SERVICO",       rotulo: "Serviço",      nota: "prestador com veículo", prazo: false, empresa: true },
];

/**
 * Como a pessoa chegou.
 *
 * `A pé/Bike` é o único sem placa para anotar, e é assim que a regra está
 * escrita — pelo que NÃO tem placa, e não pela lista do que tem. Um veículo
 * novo acrescentado aqui já nasce exigindo placa; a lista ao contrário
 * deixaria o veículo novo entrar sem, e ninguém notaria.
 */
export const A_PE = "A pé/Bike";
export const VEICULOS = ["Moto", "Carro", A_PE];

/** Caminhão só no prestador de serviço: é quem chega com ele. */
export const CAMINHAO = "Caminhão";

/**
 * Os veículos que este tipo de entrada oferece.
 *
 * Só o prestador de serviço ganha caminhão — mudança, obra e entrega de
 * material. Oferecer caminhão ao entregador de aplicativo encheria a lista de
 * opção que ninguém escolhe, e lista longa é onde se erra o toque no celular.
 */
export function veiculosDoTipo(id) {
  return id === "SERVICO" ? ["Moto", "Carro", CAMINHAO, A_PE] : VEICULOS;
}

/** Este veículo tem placa para anotar? */
export const pedePlaca = (veiculo) => Boolean(veiculo) && veiculo !== A_PE;

/**
 * Ninguém escolheu o veículo ainda.
 *
 * É o estado em que o formulário fica quando o porteiro responde "não, é outro"
 * na conferência: o que estava preenchido está errado, e o certo ainda não se
 * sabe. Vazio NÃO é o mesmo que "veio a pé" — e tratar os dois como a mesma
 * coisa foi o defeito: a placa desabilitava dizendo "não se aplica", e a
 * entrada podia ser salva sem veículo e sem placa, que é exatamente o que a
 * pergunta existia para impedir.
 */
export const semVeiculo = (veiculo) => !String(veiculo ?? "").trim();

const porId = new Map(TIPOS.map((t) => [t.id, t]));

export const tipoValido = (id) => porId.has(String(id));
export const dadosDoTipo = (id) => porId.get(String(id)) ?? null;
export const rotuloDoTipo = (id) => porId.get(String(id))?.rotulo ?? String(id ?? "");

/** Este tipo tem prazo contado pela portaria? */
export const temPrazo = (id) => Boolean(porId.get(String(id))?.prazo);

/** Este tipo pede o nome da empresa? */
export const pedeEmpresa = (id) => Boolean(porId.get(String(id))?.empresa);

/**
 * Serviço do PRÓPRIO condomínio: manutenção do elevador, jardinagem, obra da
 * administração.
 *
 * Não há apartamento de destino nem morador que autorize — quem libera é o
 * porteiro de plantão. Sem esta distinção, a entrada ficaria com o bloco em
 * branco, indistinguível de "esqueceram de preencher".
 *
 * Só existe em prestador de serviço, e o `check` do banco diz o mesmo: a marca
 * sozinha, num tipo que tem destino, seria um registro sem endereço e sem
 * explicação.
 */
export const ehServicoInterno = (f) =>
  f?.tipo === "SERVICO" && Boolean(f?.doCondominio);

/**
 * Quem pode entrar sem relógio.
 *
 * Visita de morador não tem hora para ir embora: almoço de domingo, aniversário,
 * a filha que veio passar a tarde. O prazo de 15 minutos existe para o
 * entregador que encosta e sai, e aplicado à visita ele só produzia alarme
 * vermelho no mapa a tarde inteira — que é o jeito mais rápido de o porteiro
 * aprender a ignorar o alarme.
 *
 * Sem relógio, `minutos_permitidos` vai `null` para o banco, que é o mesmo valor
 * do hóspede de temporada e do prestador de serviço. A tela já sabe ler isso: a
 * coluna do prazo mostra "sem limite".
 */
export const podeSerIlimitado = (id) => Boolean(porId.get(String(id))?.ilimitavel);

/**
 * Esta entrada vai ficar sem contagem?
 *
 * Uma função, e não `f.ilimitado` solto: a marca só vale onde o tipo permite, e
 * essa condição precisa ser a mesma na validação, na gravação e no aviso. Três
 * lugares lendo a mesma regra de três jeitos é como ela se perde.
 */
export const semRelogio = (f) =>
  Boolean(f?.ilimitado) && podeSerIlimitado(f?.tipo);

/**
 * Com quantos minutos o formulário abre.
 *
 * `null` para quem não tem prazo — e `null` é o mesmo valor que vai para o
 * banco, onde significa "sem limite". Um zero aqui seria lido como "quinze
 * segundos" na hora de exibir.
 */
export const minutosIniciais = (id) => (temPrazo(id) ? MINUTOS_PADRAO : null);

/**
 * O botão de mais e o de menos.
 *
 * Trava nas duas pontas em vez de deixar o número correr: abaixo do passo o
 * prazo não significa nada, e acima de oito horas quem está registrando queria
 * outro tipo de entrada, não mais um clique.
 */
export function ajustarMinutos(atual, delta) {
  const base = Number.isFinite(Number(atual)) ? Number(atual) : MINUTOS_PADRAO;
  const novo = base + Number(delta || 0);
  return Math.min(MAXIMO_MINUTOS, Math.max(MINIMO_MINUTOS, novo));
}

const soDigitos = (s) => String(s ?? "").replace(/\D/g, "");
const celula = (linha, chave) => {
  if (!linha) return "";
  const alvo = String(chave).toLowerCase();
  const achada = Object.keys(linha).find((k) => k.toLowerCase() === alvo);
  return achada ? linha[achada] : "";
};

/** O cadastro de quem tem este CPF, ou null. Compara só os dígitos. */
export function conhecido(cadastro, cpf) {
  const alvo = soDigitos(cpf);
  if (alvo.length !== 11) return null;
  return (cadastro ?? []).find((c) => soDigitos(celula(c, "cpf")) === alvo) ?? null;
}

/**
 * O que a tela pergunta ao reconhecer alguém.
 *
 * Só vale a pena perguntar quando há veículo guardado: sem ele, a pergunta
 * "está com este veículo?" não tem sujeito, e o porteiro teria que fechar um
 * aviso vazio a cada entrada de quem anda a pé.
 */
export function temVeiculoGuardado(registro) {
  return Boolean(String(celula(registro, "veiculo") || "").trim());
}

/**
 * O que sobra no formulário quando o porteiro diz "não é este veículo".
 *
 * CPF e nome ficam: são da pessoa, e não mudaram. Veículo, placa e modelo saem, porque
 * é exatamente o que ele acabou de dizer que está errado — deixá-los ali
 * convidaria a salvar o dado velho sem perceber.
 */
export function limparVeiculo(formulario) {
  return { ...formulario, veiculo: "", placa: "", modelo: "" };
}

/**
 * O que falta para liberar a entrada. Devolve `{}` quando não falta nada.
 *
 * Uma função só, e não `if`s espalhados pelo JSX: o botão de salvar e a
 * validação do envio precisam concordar, e quando são dois códigos diferentes
 * eles discordam no dia em que alguém mexe num deles.
 */
/**
 * O nome de quem entrou, em caixa alta.
 *
 * Duas funções e não uma porque elas rodam em momentos diferentes. Enquanto o
 * porteiro digita, o nome só pode subir de caixa: aparar espaço a cada tecla
 * impediria de digitar o sobrenome, porque a barra de espaço seria comida antes
 * da próxima letra. Aparar é coisa de quando o nome já está pronto.
 *
 * Caixa alta é o que padroniza de verdade: "joão", "João" e "JOÃO" viravam três
 * pessoas diferentes na leitura de quem bate o olho na lista, e a mesma pessoa
 * entrava escrita de um jeito por turno. O `toUpperCase` do JavaScript acentua
 * certo — "joão" vira "JOÃO", não "JOAO".
 */
export const emMaiusculo = (v) => String(v ?? "").toUpperCase();

/** A forma definitiva: sem espaço sobrando, sem espaço dobrado, em caixa alta. */
export const padronizarNome = (v) => emMaiusculo(v).replace(/\s+/g, " ").trim();

export function problemasDaEntrada(f = {}) {
  const e = {};
  const interno = ehServicoInterno(f);

  if (!tipoValido(f.tipo)) e.tipo = "Escolha o tipo de entrada.";
  if (soDigitos(f.cpf).length !== 11) e.cpf = "O CPF precisa ter 11 dígitos.";
  if (!String(f.nome ?? "").trim()) e.nome = "Informe o nome de quem está entrando.";
  // Serviço do condomínio não tem destino: cobrar unidade aqui obrigaria o
  // porteiro a escolher um apartamento qualquer para o eletricista do elevador.
  if (!interno && !f.unidade) e.unidade = "Busque e selecione a unidade de destino.";
  // Quem liberou continua sendo cobrado mesmo no serviço interno — lá a tela
  // preenche com o porteiro de plantão, e um registro sem ninguém responsável
  // pela entrada é o que esta tela existe para não produzir.
  if (!String(f.liberadoPor ?? "").trim()) e.liberadoPor = "Informe quem liberou a entrada.";

  // Sem veículo escolhido não dá para liberar: não é "veio a pé", é "ninguém
  // disse ainda". Salvar assim produz um registro que não sabe se entrou carro
  // no condomínio.
  if (semVeiculo(f.veiculo)) e.veiculo = "Escolha como a pessoa chegou.";

  // Veículo com placa: moto, carro e caminhão entram no condomínio e ficam
  // estacionados. Quem chega a pé não tem o que anotar.
  if (pedePlaca(f.veiculo) && !String(f.placa ?? "").trim()) {
    e.placa = "Informe a placa do veículo.";
  }

  if (pedeEmpresa(f.tipo) && !String(f.empresa ?? "").trim()) {
    e.empresa = "Informe a empresa do prestador.";
  }

  // `ilimitado` desliga a cobrança do prazo — e só onde ele pode ser desligado.
  // Sem o `podeSerIlimitado` dentro do `semRelogio`, mandar `ilimitado: true`
  // num entregador faria a entrada dele passar sem prazo nenhum.
  if (temPrazo(f.tipo) && !semRelogio(f)) {
    const m = Number(f.minutos);
    if (!Number.isFinite(m) || m < MINIMO_MINUTOS) e.minutos = "O prazo tem que ser de pelo menos 5 minutos.";
  }
  return e;
}

/** "15 min", "1h30". Minuto solto passa de duas horas e vira ilegível. */
export function formatarDuracao(minutos) {
  // `Number(null)` é 0, e `Number("")` também: sem esta guarda, "sem prazo"
  // saía na tela como "0 min", que é uma afirmação diferente e errada.
  if (minutos === null || minutos === undefined || minutos === "") return "";
  const m = Number(minutos);
  if (!Number.isFinite(m)) return "";
  if (m < 60) return `${m} min`;
  const horas = Math.floor(m / 60);
  const resto = m % 60;
  return resto ? `${horas}h${String(resto).padStart(2, "0")}` : `${horas}h`;
}

/**
 * Quanto falta (positivo) ou quanto passou (negativo), em minutos.
 *
 * `null` quando não há prazo ou quando a pessoa já saiu — nos dois casos não há
 * contagem que faça sentido, e devolver zero faria a tela mostrar "no limite"
 * para quem foi embora há três horas.
 */
export function minutosRestantes(chegada, agora = Date.now()) {
  const permitido = Number(celula(chegada, "minutos_permitidos"));
  if (!Number.isFinite(permitido) || permitido <= 0) return null;
  if (celula(chegada, "horario_saida")) return null;

  const entrada = new Date(celula(chegada, "horario_entrada")).getTime();
  if (!Number.isFinite(entrada)) return null;

  const decorridos = (agora - entrada) / 60000;
  return Math.round(permitido - decorridos);
}

/** Ainda está dentro? */
export const estaDentro = (chegada) => !celula(chegada, "horario_saida");

/**
 * Brasília não tem mais horário de verão desde 2019, então o deslocamento é
 * fixo. Escrito por extenso de propósito: `new Date("2026-08-01")` seria lido
 * como meia-noite em UTC, e no Brasil isso é ainda dia 31 às 21h — o filtro
 * "do dia 1º" começaria três horas antes do dia 1º.
 */
export const FUSO_BRASILIA = "-03:00";

/** Meia-noite deste dia em Brasília, em ISO. `undefined` quando não há dia. */
export function inicioDoDia(dia) {
  if (!dia) return undefined;
  const d = new Date(`${dia}T00:00:00.000${FUSO_BRASILIA}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** O último instante deste dia em Brasília, em ISO. */
export function fimDoDia(dia) {
  if (!dia) return undefined;
  const d = new Date(`${dia}T23:59:59.999${FUSO_BRASILIA}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** O dia de um timestamptz em Brasília, como "AAAA-MM-DD". */
export function diaEmBrasilia(valor) {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/** Hoje em Brasília. A portaria trabalha por dia civil, não por UTC. */
export const hojeEmBrasilia = (agora = Date.now()) => diaEmBrasilia(new Date(agora));

/**
 * Junta listas de chegadas sem repetir ninguém, da mais recente para a mais
 * antiga.
 *
 * A tela pede duas coisas ao banco — as de hoje e as que estão abertas — e as
 * duas se cruzam em quem entrou hoje e ainda está aqui. Sem juntar por `id`,
 * essa pessoa apareceria duas vezes na lista e seria contada duas vezes no
 * cabeçalho.
 */
export function unirChegadas(...listas) {
  const porId = new Map();
  for (const lista of listas) {
    for (const c of lista ?? []) {
      if (c && c.id !== undefined && c.id !== null) porId.set(String(c.id), c);
    }
  }
  return [...porId.values()].sort(
    (a, b) => new Date(celula(b, "horario_entrada")) - new Date(celula(a, "horario_entrada"))
  );
}

/**
 * O que a aba "Chegadas de hoje" mostra.
 *
 * Entrou hoje, OU ainda está dentro — e o "ou" é o pedido: à meia-noite a lista
 * vira, mas quem está no prédio não pode sumir dela. O hóspede de temporada que
 * chegou sexta continua sendo responsabilidade da portaria no domingo, e uma
 * tela que o esconde faz o porteiro do turno seguinte acreditar que o
 * condomínio está vazio.
 */
export function daJanelaDeHoje(chegadas, agora = Date.now()) {
  const hoje = hojeEmBrasilia(agora);
  return (chegadas ?? []).filter(
    (c) => estaDentro(c) || diaEmBrasilia(celula(c, "horario_entrada")) === hoje
  );
}

const semAcento = (s) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * O histórico, peneirado.
 *
 * O recorte de datas já veio do banco; aqui ficam os filtros que não valem uma
 * ida ao servidor a cada tecla digitada. Campo vazio não filtra nada — um
 * filtro que exige preenchimento para mostrar alguma coisa faz a tela abrir
 * vazia e parecer quebrada.
 */
export function filtrarHistorico(chegadas, filtros = {}) {
  const busca = semAcento(filtros.busca);
  const digitos = soDigitos(filtros.busca);

  return (chegadas ?? []).filter((c) => {
    if (filtros.situacao === "dentro" && !estaDentro(c)) return false;
    if (filtros.situacao === "saiu" && estaDentro(c)) return false;
    if (filtros.tipo && celula(c, "tipo") !== filtros.tipo) return false;

    // Unidade do jeito que o porteiro digita: "5206", "5 206", "B5-206". A
    // regra é a mesma da busca do formulário (lib/unidades) — o que acha a
    // unidade lá tem de achá-la aqui. Quem entrou sem bloco, o serviço do
    // próprio condomínio, fica fora de qualquer recorte por unidade: perguntar
    // "quem foi ao bloco 5" não é perguntar por quem não foi a bloco nenhum.
    if (String(filtros.unidade ?? "").trim()
        && !casaComUnidade(filtros.unidade, { bloco: celula(c, "bloco"), unidade: celula(c, "apartamento") })) {
      return false;
    }

    // Saída por dia. Quem ainda não saiu não tem dia de saída, então qualquer
    // recorte de saída o exclui — e é o certo: perguntar "quem saiu no dia 12"
    // não é perguntar por quem não saiu.
    const saida = diaEmBrasilia(celula(c, "horario_saida"));
    if (filtros.saidaDe && (!saida || saida < filtros.saidaDe)) return false;
    if (filtros.saidaAte && (!saida || saida > filtros.saidaAte)) return false;

    if (busca) {
      const alvo = semAcento(
        `${celula(c, "nome")} ${celula(c, "empresa")} ${celula(c, "placa")} ${celula(c, "modelo")} `
        + `${celula(c, "liberado_por")} ${celula(c, "created_by")}`
      );
      const achouTexto = alvo.includes(busca);
      const achouCpf = digitos.length >= 3 && soDigitos(celula(c, "cpf")).includes(digitos);
      if (!achouTexto && !achouCpf) return false;
    }
    return true;
  });
}
