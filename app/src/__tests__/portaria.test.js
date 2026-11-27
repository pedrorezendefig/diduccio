// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  TIPOS, MINUTOS_PADRAO, PASSO_MINUTOS, MINIMO_MINUTOS, MAXIMO_MINUTOS,
  A_PE, CAMINHAO, pedePlaca, semVeiculo, veiculosDoTipo,
  emMaiusculo, padronizarNome, podeSerIlimitado, semRelogio,
  ajustarMinutos, conhecido, dadosDoTipo, daJanelaDeHoje, diaEmBrasilia,
  ehServicoInterno, estaDentro, filtrarHistorico, fimDoDia, formatarDuracao,
  inicioDoDia, limparVeiculo, minutosIniciais, minutosRestantes, pedeEmpresa,
  problemasDaEntrada, temPrazo, temVeiculoGuardado, tipoValido, unirChegadas,
  veiculoPadrao,
} from "../lib/portaria";

/**
 * A portaria deixou de ser só de entregador.
 *
 * O que muda de um tipo para outro é pequeno e consequente: se há prazo, se há
 * empresa, e o que a tela exige antes de liberar. Errar isso não quebra tela
 * nenhuma — só deixa entrar sem registro, ou pede minutos a quem vai passar o
 * fim de semana.
 */

describe("os tipos de entrada", () => {
  it("são os cinco combinados, e nenhum a mais", () => {
    expect(TIPOS.map((t) => t.id)).toEqual([
      "ENTREGADOR", "MOTORISTA_APP", "VISITANTE", "AIRBNB", "SERVICO",
    ]);
  });

  it("prazo vale para quem entra e sai; temporada e serviço ficam de fora", () => {
    // Foi a decisão: "somente airbnb e serviço terceiro fica sem tempo".
    expect(temPrazo("ENTREGADOR")).toBe(true);
    expect(temPrazo("MOTORISTA_APP")).toBe(true);
    expect(temPrazo("VISITANTE")).toBe(true);
    expect(temPrazo("AIRBNB")).toBe(false);
    expect(temPrazo("SERVICO")).toBe(false);
  });

  it("só o prestador de serviço pede empresa", () => {
    expect(pedeEmpresa("SERVICO")).toBe(true);
    for (const outro of ["ENTREGADOR", "MOTORISTA_APP", "VISITANTE", "AIRBNB"]) {
      expect(pedeEmpresa(outro), `${outro} não deveria pedir empresa`).toBe(false);
    }
  });

  it("tipo inventado não passa por válido", () => {
    // O banco tem o mesmo `check`. Aqui é o que impede a tela de montar um
    // formulário para um tipo que a gravação vai recusar.
    expect(tipoValido("ENTREGADOR")).toBe(true);
    expect(tipoValido("PIZZAIOLO")).toBe(false);
    expect(tipoValido("")).toBe(false);
    expect(tipoValido(null)).toBe(false);
    expect(dadosDoTipo("PIZZAIOLO")).toBe(null);
  });

  it("quem não tem prazo abre com null, e não com zero", () => {
    // `null` é o que o banco entende por "sem limite". Zero seria lido como
    // quinze segundos, e a tela mostraria "no limite" já na entrada.
    expect(minutosIniciais("ENTREGADOR")).toBe(MINUTOS_PADRAO);
    expect(minutosIniciais("VISITANTE")).toBe(MINUTOS_PADRAO);
    expect(minutosIniciais("AIRBNB")).toBe(null);
    expect(minutosIniciais("SERVICO")).toBe(null);
  });
});

describe("o mais e o menos do prazo", () => {
  it("começa em 15 e anda de 5 em 5", () => {
    expect(MINUTOS_PADRAO).toBe(15);
    expect(PASSO_MINUTOS).toBe(5);
    expect(ajustarMinutos(15, +PASSO_MINUTOS)).toBe(20);
    expect(ajustarMinutos(20, -PASSO_MINUTOS)).toBe(15);
  });

  it("não desce abaixo do próprio passo", () => {
    // Entrada com "0 minuto permitido" é registro que mente, e o botão não
    // pode ser o caminho para produzi-lo.
    expect(ajustarMinutos(MINIMO_MINUTOS, -PASSO_MINUTOS)).toBe(MINIMO_MINUTOS);
    expect(ajustarMinutos(5, -100)).toBe(MINIMO_MINUTOS);
  });

  it("tem teto: acima de oito horas o prazo deixou de ser prazo", () => {
    expect(ajustarMinutos(MAXIMO_MINUTOS, +PASSO_MINUTOS)).toBe(MAXIMO_MINUTOS);
    expect(ajustarMinutos(9999, +5)).toBe(MAXIMO_MINUTOS);
  });

  it("valor estragado volta ao padrão em vez de virar NaN", () => {
    expect(ajustarMinutos(undefined, +5)).toBe(MINUTOS_PADRAO + 5);
    expect(ajustarMinutos("abc", -5)).toBe(MINUTOS_PADRAO - 5);
  });
});

describe("reconhecer quem já esteve aqui", () => {
  const CADASTRO = [
    { id: 1, cpf: "111.222.333-44", nome: "Ana Entregadora", veiculo: "Moto", placa: "ABC1D23" },
    { id: 2, cpf: "55566677788", nome: "Bruno a Pé", veiculo: "", placa: "" },
  ];

  it("acha pelo CPF, com ou sem pontuação", () => {
    // O cadastro veio da planilha com máscara; o campo digita só números.
    expect(conhecido(CADASTRO, "11122233344")?.nome).toBe("Ana Entregadora");
    expect(conhecido(CADASTRO, "111.222.333-44")?.nome).toBe("Ana Entregadora");
    expect(conhecido(CADASTRO, "555.666.777-88")?.nome).toBe("Bruno a Pé");
  });

  it("CPF incompleto não reconhece ninguém", () => {
    expect(conhecido(CADASTRO, "111")).toBe(null);
    expect(conhecido(CADASTRO, "1112223334")).toBe(null);
    expect(conhecido(CADASTRO, "")).toBe(null);
  });

  it("campo vazio não casa com cadastro de CPF vazio", () => {
    // É aqui que a guarda de comprimento ganha o pão. A migração da planilha
    // deixou linhas com o CPF em branco; sem exigir 11 dígitos, `"" === ""` dá
    // verdadeiro e a tela preenche o nome de um estranho no instante em que o
    // porteiro clica no campo, antes de ele digitar coisa alguma.
    const comBuraco = [...CADASTRO, { id: 9, cpf: "", nome: "Linha Velha da Planilha" }];
    expect(conhecido(comBuraco, "")).toBe(null);
    expect(conhecido(comBuraco, "   ")).toBe(null);
    expect(conhecido(comBuraco, null)).toBe(null);
  });

  it("cadastro ausente não estoura", () => {
    expect(conhecido(undefined, "11122233344")).toBe(null);
  });

  it("só pergunta do veículo quem tem veículo guardado", () => {
    // Perguntar "está com este veículo?" sem veículo é um aviso vazio para
    // fechar a cada entrada de quem anda a pé.
    expect(temVeiculoGuardado(CADASTRO[0])).toBe(true);
    expect(temVeiculoGuardado(CADASTRO[1])).toBe(false);
    expect(temVeiculoGuardado(null)).toBe(false);
  });

  it('depois de "não, é outro" a entrada NÃO pode ser salva', () => {
    // O defeito relatado, e o mais grave dos efeitos dele. Vazio não é "veio a
    // pé": é "ninguém escolheu ainda". Tratados como a mesma coisa, a placa
    // deixava de ser cobrada e a entrada era salva sem veículo e sem placa —
    // exatamente o que a pergunta da conferência existe para impedir.
    const depoisDeTrocar = {
      tipo: "ENTREGADOR", cpf: "111.222.333-44", nome: "Ana",
      unidade: { bloco: 5, unidade: 206 }, liberadoPor: "Morador",
      minutos: 15, ...limparVeiculo({ veiculo: "Moto", placa: "ABC1D23" }),
    };
    expect(problemasDaEntrada(depoisDeTrocar).veiculo).toBeTruthy();
  });

  it("vazio e 'a pé' são estados diferentes", () => {
    expect(semVeiculo("")).toBe(true);
    expect(semVeiculo("   ")).toBe(true);
    expect(semVeiculo(null)).toBe(true);
    expect(semVeiculo(undefined)).toBe(true);
    // Quem veio a pé ESTÁ escolhido: não falta nada nele.
    expect(semVeiculo(A_PE)).toBe(false);
    expect(semVeiculo("Moto")).toBe(false);
  });

  it("dizer que não é o veículo apaga veículo, placa e modelo, e só", () => {
    // CPF e nome são da pessoa e não mudaram. Manter o veículo velho convidaria
    // a salvar o dado errado sem perceber.
    const antes = {
      cpf: "11122233344", nome: "Ana", veiculo: "Moto", placa: "ABC1D23",
      modelo: "Honda CG vermelha", tipo: "ENTREGADOR",
    };
    expect(limparVeiculo(antes)).toEqual({
      cpf: "11122233344", nome: "Ana", veiculo: "", placa: "", modelo: "", tipo: "ENTREGADOR",
    });
  });
});

describe("o que falta para liberar a entrada", () => {
  const COMPLETO = {
    tipo: "ENTREGADOR", cpf: "111.222.333-44", nome: "Ana",
    unidade: { bloco: 5, unidade: 206 }, liberadoPor: "Porteiro",
    veiculo: "Moto", placa: "ABC1D23", minutos: 15,
  };

  it("com tudo preenchido, não falta nada", () => {
    expect(problemasDaEntrada(COMPLETO)).toEqual({});
  });

  it("cobra CPF, nome, unidade e quem liberou", () => {
    const vazio = problemasDaEntrada({ tipo: "ENTREGADOR" });
    for (const campo of ["cpf", "nome", "unidade", "liberadoPor"]) {
      expect(vazio[campo], `faltou cobrar ${campo}`).toBeTruthy();
    }
  });

  it("veículo com placa: moto e carro ficam estacionados lá dentro", () => {
    expect(problemasDaEntrada({ ...COMPLETO, placa: "" }).placa).toBeTruthy();
    // Quem chega a pé não tem placa para anotar.
    expect(problemasDaEntrada({ ...COMPLETO, veiculo: "A pé/Bike", placa: "" }).placa).toBeUndefined();
  });

  it("caminhão também tem placa", () => {
    // A regra está escrita pelo que NÃO tem placa. Escrita ao contrário — uma
    // lista de "carro ou moto" —, o caminhão entraria sem placa e ninguém
    // notaria, porque nada quebra: só falta um dado no registro.
    expect(problemasDaEntrada({ ...COMPLETO, tipo: "SERVICO", empresa: "X",
      veiculo: CAMINHAO, placa: "" }).placa).toBeTruthy();
  });

  it("prestador de serviço sem empresa não entra", () => {
    // É o campo que identifica quem entrou: sem ele, o registro diz apenas que
    // "alguém de alguma empresa" passou pelo portão.
    expect(problemasDaEntrada({ ...COMPLETO, tipo: "SERVICO", empresa: "" }).empresa).toBeTruthy();
    expect(problemasDaEntrada({ ...COMPLETO, tipo: "SERVICO", empresa: "Elevadores XPTO" }).empresa)
      .toBeUndefined();
  });

  it("empresa não é cobrada de quem não é prestador", () => {
    expect(problemasDaEntrada({ ...COMPLETO, tipo: "VISITANTE", empresa: "" }).empresa).toBeUndefined();
  });

  it("prazo só é cobrado de quem tem prazo", () => {
    expect(problemasDaEntrada({ ...COMPLETO, minutos: null }).minutos).toBeTruthy();
    expect(problemasDaEntrada({ ...COMPLETO, tipo: "AIRBNB", minutos: null }).minutos).toBeUndefined();
    expect(problemasDaEntrada({ ...COMPLETO, tipo: "SERVICO", empresa: "X", minutos: null }).minutos)
      .toBeUndefined();
  });

  it("tipo inválido é o primeiro problema", () => {
    expect(problemasDaEntrada({}).tipo).toBeTruthy();
  });
});

describe("os veículos de cada tipo", () => {
  it("só o prestador de serviço tem caminhão", () => {
    // Mudança, obra, entrega de material. Oferecer caminhão ao entregador de
    // aplicativo encheria a lista de opção que ninguém escolhe — e lista longa
    // é onde se erra o toque no celular.
    expect(veiculosDoTipo("SERVICO")).toContain(CAMINHAO);
    for (const outro of ["ENTREGADOR", "MOTORISTA_APP", "VISITANTE", "AIRBNB"]) {
      expect(veiculosDoTipo(outro), `${outro} não devia ter caminhão`).not.toContain(CAMINHAO);
    }
  });

  it("todo tipo tem pelo menos moto, carro e a pé", () => {
    for (const t of ["SERVICO", "ENTREGADOR", "VISITANTE", "AIRBNB", "MOTORISTA_APP"]) {
      for (const v of ["Moto", "Carro", A_PE]) {
        expect(veiculosDoTipo(t), `${t} sem ${v}`).toContain(v);
      }
    }
  });

  it("placa é do que tem placa, e a pé é a única exceção", () => {
    // A regra escrita pelo avesso — listando quem TEM placa — deixaria todo
    // veículo novo entrar sem, em silêncio.
    expect(pedePlaca("Moto")).toBe(true);
    expect(pedePlaca("Carro")).toBe(true);
    expect(pedePlaca(CAMINHAO)).toBe(true);
    expect(pedePlaca(A_PE)).toBe(false);
    expect(pedePlaca("")).toBe(false);
    expect(pedePlaca(undefined)).toBe(false);
  });
});

describe("serviço do próprio condomínio", () => {
  const INTERNO = {
    tipo: "SERVICO", doCondominio: true, cpf: "111.222.333-44", nome: "Ana",
    empresa: "Elevadores XPTO", liberadoPor: "Jonas Paiva",
    veiculo: "Carro", placa: "ABC1D23", unidade: null,
  };

  it("é a marca mais o tipo, nunca só a marca", () => {
    // O `check` do 0035 diz o mesmo. A marca sozinha, num tipo que tem destino,
    // seria um registro sem endereço e sem explicação.
    expect(ehServicoInterno(INTERNO)).toBe(true);
    expect(ehServicoInterno({ tipo: "ENTREGADOR", doCondominio: true })).toBe(false);
    expect(ehServicoInterno({ tipo: "SERVICO", doCondominio: false })).toBe(false);
    expect(ehServicoInterno(undefined)).toBe(false);
  });

  it("não pede unidade de destino", () => {
    // O eletricista do elevador não vai a apartamento nenhum. Cobrar unidade
    // obrigaria o porteiro a escolher um qualquer, e o registro passaria a
    // dizer que ele subiu num apartamento onde nunca esteve.
    expect(problemasDaEntrada(INTERNO).unidade).toBeUndefined();
  });

  it("continua pedindo quem liberou", () => {
    // Lá a tela preenche com o porteiro de plantão. Entrada sem ninguém
    // responsável é exatamente o que esta tela existe para não produzir.
    expect(problemasDaEntrada({ ...INTERNO, liberadoPor: "" }).liberadoPor).toBeTruthy();
  });

  it("prestador comum continua precisando de unidade", () => {
    // A dispensa é da marca, não do tipo: o prestador contratado pelo morador
    // vai ao apartamento dele.
    const contratado = { ...INTERNO, doCondominio: false };
    expect(problemasDaEntrada(contratado).unidade).toBeTruthy();
  });

  it("e continua precisando de empresa", () => {
    expect(problemasDaEntrada({ ...INTERNO, empresa: "" }).empresa).toBeTruthy();
  });
});

describe("quanto falta do prazo", () => {
  const AGORA = new Date("2026-08-28T14:30:00Z").getTime();
  const entrada = (minutosAtras) =>
    new Date(AGORA - minutosAtras * 60000).toISOString();

  it("conta para baixo enquanto está dentro", () => {
    const c = { horario_entrada: entrada(5), minutos_permitidos: 15, horario_saida: null };
    expect(minutosRestantes(c, AGORA)).toBe(10);
  });

  it("passa a negativo quando estoura", () => {
    // A segunda parte vai usar isto para destacar. Por ora só precisa estar
    // certo — inclusive o sinal.
    const c = { horario_entrada: entrada(23), minutos_permitidos: 15, horario_saida: null };
    expect(minutosRestantes(c, AGORA)).toBe(-8);
  });

  it("quem já saiu não tem contagem", () => {
    // Sem isto, a tela mostraria "40 min a mais" para quem foi embora na hora
    // certa há três horas.
    const c = {
      horario_entrada: entrada(200), minutos_permitidos: 15,
      horario_saida: new Date(AGORA - 190 * 60000).toISOString(),
    };
    expect(minutosRestantes(c, AGORA)).toBe(null);
    expect(estaDentro(c)).toBe(false);
  });

  it("sem prazo, não há contagem", () => {
    const c = { horario_entrada: entrada(600), minutos_permitidos: null, horario_saida: null };
    expect(minutosRestantes(c, AGORA)).toBe(null);
    expect(estaDentro(c)).toBe(true);
  });

  it("horário estragado não vira NaN na tela", () => {
    expect(minutosRestantes({ horario_entrada: "ontem", minutos_permitidos: 15 }, AGORA)).toBe(null);
  });
});

describe("a meia-noite vira a lista, mas não esvazia o prédio", () => {
  // 1º de setembro de 2026, 09:00 em Brasília (12:00 UTC).
  const AGORA = new Date("2026-09-01T12:00:00Z").getTime();
  const chegada = (extra) => ({ id: 1, horario_saida: null, ...extra });

  it("quem entrou hoje aparece", () => {
    const c = chegada({ horario_entrada: "2026-09-01T11:00:00Z", horario_saida: "2026-09-01T11:30:00Z" });
    expect(daJanelaDeHoje([c], AGORA)).toHaveLength(1);
  });

  it("quem entrou ontem e AINDA ESTÁ DENTRO continua aparecendo", () => {
    // É o pedido inteiro. O hóspede de temporada que chegou sexta continua
    // sendo trabalho da portaria no domingo, e uma tela que o esconde faz o
    // porteiro do turno seguinte acreditar que o condomínio está vazio.
    const c = chegada({ id: 2, horario_entrada: "2026-08-28T20:00:00Z" });
    expect(daJanelaDeHoje([c], AGORA)).toHaveLength(1);
  });

  it("quem entrou ontem e já saiu some da lista de hoje", () => {
    const c = chegada({
      id: 3,
      horario_entrada: "2026-08-31T14:00:00Z",
      horario_saida: "2026-08-31T15:00:00Z",
    });
    expect(daJanelaDeHoje([c], AGORA)).toHaveLength(0);
  });

  it("o dia é o de Brasília, e não o de UTC", () => {
    // 1º/09 às 02:00 UTC ainda é 31/08 às 23h no Brasil. Contado em UTC, um
    // registro do fim da noite apareceria no dia seguinte.
    const c = chegada({
      id: 4,
      horario_entrada: "2026-09-01T02:00:00Z",
      horario_saida: "2026-09-01T02:30:00Z",
    });
    expect(daJanelaDeHoje([c], AGORA)).toHaveLength(0);
    expect(diaEmBrasilia("2026-09-01T02:00:00Z")).toBe("2026-08-31");
  });
});

describe("juntar as duas consultas", () => {
  it("quem está nas duas listas aparece uma vez só", () => {
    // A tela pergunta "as de hoje" e "as abertas", e as duas se cruzam em quem
    // entrou hoje e ainda está aqui. Sem juntar por id, essa pessoa apareceria
    // duas vezes e seria contada duas vezes no cabeçalho.
    const c = { id: 7, horario_entrada: "2026-09-01T11:00:00Z" };
    expect(unirChegadas([c], [c])).toHaveLength(1);
  });

  it("devolve da mais recente para a mais antiga", () => {
    const velha = { id: 1, horario_entrada: "2026-08-30T10:00:00Z" };
    const nova = { id: 2, horario_entrada: "2026-09-01T10:00:00Z" };
    expect(unirChegadas([velha], [nova]).map((c) => c.id)).toEqual([2, 1]);
  });

  it("lista faltando não estoura", () => {
    expect(unirChegadas(undefined, null, [])).toEqual([]);
  });
});

describe("os filtros do histórico", () => {
  const LINHAS = [
    { id: 1, nome: "Ana Silva", cpf: "111.222.333-44", tipo: "ENTREGADOR", empresa: null,
      placa: "ABC1D23", liberado_por: "Morador 101", created_by: "Jonas",
      bloco: "5", apartamento: "206",
      horario_entrada: "2026-08-20T13:00:00Z", horario_saida: "2026-08-20T13:20:00Z" },
    { id: 2, nome: "Bruno Melo", cpf: "555.666.777-88", tipo: "SERVICO", empresa: "Elevadores XPTO",
      placa: null, liberado_por: "Jonas", created_by: "Jonas",
      bloco: null, apartamento: null,
      horario_entrada: "2026-08-25T12:00:00Z", horario_saida: null },
    { id: 3, nome: "Célia Sá", cpf: "999.888.777-66", tipo: "VISITANTE", empresa: null,
      placa: "XYZ9A88", liberado_por: "Morador 206", created_by: "Marta",
      bloco: "3", apartamento: "101",
      horario_entrada: "2026-08-28T20:00:00Z", horario_saida: "2026-08-29T02:00:00Z" },
  ];
  const ids = (f) => filtrarHistorico(LINHAS, f).map((c) => c.id);

  it("sem filtro, mostra tudo", () => {
    // Filtro que exige preenchimento para mostrar alguma coisa faz a tela abrir
    // vazia e parecer quebrada.
    expect(ids({})).toEqual([1, 2, 3]);
    expect(filtrarHistorico(LINHAS)).toHaveLength(3);
  });

  it("busca por nome, sem depender de acento nem de maiúscula", () => {
    expect(ids({ busca: "celia" })).toEqual([3]);
    expect(ids({ busca: "ANA" })).toEqual([1]);
  });

  it("busca também por empresa, placa e quem liberou", () => {
    expect(ids({ busca: "elevadores" })).toEqual([2]);
    expect(ids({ busca: "xyz9" })).toEqual([3]);
    expect(ids({ busca: "morador 206" })).toEqual([3]);
  });

  it("busca por CPF com ou sem pontuação, e só a partir de três dígitos", () => {
    expect(ids({ busca: "555666" })).toEqual([2]);
    expect(ids({ busca: "999.888" })).toEqual([3]);
    // Um dígito solto casaria com quase todo mundo e faria a busca parecer
    // quebrada em vez de ampla.
    expect(ids({ busca: "5" })).toEqual([]);
  });

  it("situação separa quem está dentro de quem já saiu", () => {
    expect(ids({ situacao: "dentro" })).toEqual([2]);
    expect(ids({ situacao: "saiu" })).toEqual([1, 3]);
  });

  it("filtra por tipo", () => {
    expect(ids({ tipo: "SERVICO" })).toEqual([2]);
  });

  it("filtra por unidade do jeito que o porteiro digita", () => {
    // "5206" é bloco 5, apto 206 — a forma concatenada que quem usa o sistema
    // decorou. A regra é a MESMA da busca de unidade do formulário
    // (lib/unidades): o que acha a unidade lá tem de achá-la aqui.
    expect(ids({ unidade: "5206" })).toEqual([1]);
    expect(ids({ unidade: "5 206" })).toEqual([1]);
    expect(ids({ unidade: "bloco 5 apto 206" })).toEqual([1]);
    expect(ids({ unidade: "B5-206" })).toEqual([1]);
  });

  it("só o bloco lista o bloco inteiro", () => {
    expect(ids({ unidade: "bloco 3" })).toEqual([3]);
  });

  it("serviço do próprio condomínio não tem unidade e fica fora do filtro", () => {
    // O Bruno entrou sem bloco. Perguntar "quem foi ao bloco 5" não é
    // perguntar por quem não foi a bloco nenhum.
    expect(ids({ unidade: "5" })).toEqual([1]);
  });

  it("unidade em branco não filtra", () => {
    expect(ids({ unidade: "   " })).toEqual([1, 2, 3]);
  });

  it("o recorte de saída usa o dia da SAÍDA, e não o da entrada", () => {
    // A Célia entrou dia 28 e saiu dia 28 às 23h de Brasília — que em UTC já é
    // dia 29. Contado pelo dia errado, ela sumiria do recorte do próprio dia
    // em que saiu.
    expect(ids({ saidaDe: "2026-08-28", saidaAte: "2026-08-28" })).toEqual([3]);
  });

  it("quem não saiu fica fora de qualquer recorte de saída", () => {
    // Perguntar "quem saiu no dia 25" não é perguntar por quem não saiu.
    expect(ids({ saidaDe: "2026-08-01", saidaAte: "2026-12-31" })).toEqual([1, 3]);
  });

  it("os filtros se somam", () => {
    expect(ids({ busca: "a", situacao: "saiu", tipo: "VISITANTE", unidade: "3101" })).toEqual([3]);
    expect(ids({ busca: "a", situacao: "saiu", tipo: "VISITANTE", unidade: "5206" })).toEqual([]);
  });
});

describe("o começo e o fim do dia em Brasília", () => {
  it("meia-noite daqui, e não de Greenwich", () => {
    // `new Date("2026-08-01")` seria meia-noite em UTC, que no Brasil ainda é
    // 31 de julho às 21h — o filtro "do dia 1º" começaria três horas antes.
    expect(inicioDoDia("2026-08-01")).toBe("2026-08-01T03:00:00.000Z");
    expect(fimDoDia("2026-08-01")).toBe("2026-08-02T02:59:59.999Z");
  });

  it("dia vazio não vira recorte", () => {
    // `undefined` é o que faz a consulta sair sem essa condição. Uma data
    // inválida viraria "Invalid Date" e derrubaria a busca inteira.
    expect(inicioDoDia("")).toBeUndefined();
    expect(fimDoDia(null)).toBeUndefined();
    expect(inicioDoDia("nao-e-data")).toBeUndefined();
  });
});

describe("formatar duração", () => {
  it("minuto até uma hora, depois hora", () => {
    expect(formatarDuracao(15)).toBe("15 min");
    expect(formatarDuracao(59)).toBe("59 min");
    expect(formatarDuracao(60)).toBe("1h");
    expect(formatarDuracao(90)).toBe("1h30");
    expect(formatarDuracao(480)).toBe("8h");
  });

  it("valor ausente não imprime lixo", () => {
    expect(formatarDuracao(null)).toBe("");
    expect(formatarDuracao(undefined)).toBe("");
  });
});

describe("o nome de quem entrou, em caixa alta", () => {
  it("sobe de caixa sem estragar o acento", () => {
    // O `toUpperCase` do JavaScript conhece acento: "joão" vira "JOÃO", e não
    // "JOAO". Trocar isto por um regex de A-Z arrancaria o til e o cedilha, e
    // ninguém repararia até aparecer um "CONCEICAO" na lista.
    expect(emMaiusculo("joão da conceição")).toBe("JOÃO DA CONCEIÇÃO");
    expect(padronizarNome("joão")).toBe("JOÃO");
  });

  it("enquanto se digita, o espaço sobrevive", () => {
    // É a razão de existirem duas funções. Se a do formulário aparasse a cada
    // tecla, a barra de espaço seria comida antes da próxima letra e não daria
    // para digitar o sobrenome.
    expect(emMaiusculo("joao ")).toBe("JOAO ");
    expect(emMaiusculo("ana p")).toBe("ANA P");
  });

  it("na hora de gravar, o espaço sobrando sai", () => {
    expect(padronizarNome("  ana paula  ")).toBe("ANA PAULA");
    expect(padronizarNome("ana    paula")).toBe("ANA PAULA");
    expect(padronizarNome("ana\tpaula\npereira")).toBe("ANA PAULA PEREIRA");
  });

  it("as três grafias da mesma pessoa viram uma só", () => {
    // Era o pedido: a mesma pessoa entrava escrita de um jeito por turno.
    const grafias = ["joão silva", "João Silva", "JOÃO  SILVA "];
    expect(new Set(grafias.map(padronizarNome)).size).toBe(1);
  });

  it("vazio não vira lixo", () => {
    expect(padronizarNome(null)).toBe("");
    expect(padronizarNome(undefined)).toBe("");
    expect(emMaiusculo(null)).toBe("");
  });
});

describe("a visita que fica o tempo que precisar", () => {
  it("só o visitante pode ficar sem relógio", () => {
    // O entregador e o motorista entram para deixar alguma coisa e sair. Dar a
    // eles a opção de ficar sem contagem abre a porta que a contagem fecha.
    expect(podeSerIlimitado("VISITANTE")).toBe(true);
    expect(podeSerIlimitado("ENTREGADOR")).toBe(false);
    expect(podeSerIlimitado("MOTORISTA_APP")).toBe(false);
    // Temporada e serviço já não têm prazo nenhum: a marca ali não significa
    // nada, e oferecê-la seria dizer que existe um relógio para desligar.
    expect(podeSerIlimitado("AIRBNB")).toBe(false);
    expect(podeSerIlimitado("SERVICO")).toBe(false);
    expect(podeSerIlimitado("QUALQUER_COISA")).toBe(false);
  });

  it("a marca só vale onde o tipo permite", () => {
    // É a trava que impede um `ilimitado: true` mandado de fora — pelo
    // DevTools, ou por um estado que não foi limpo ao trocar de tipo — de
    // liberar um entregador sem prazo.
    expect(semRelogio({ tipo: "VISITANTE", ilimitado: true })).toBe(true);
    expect(semRelogio({ tipo: "ENTREGADOR", ilimitado: true })).toBe(false);
    expect(semRelogio({ tipo: "VISITANTE", ilimitado: false })).toBe(false);
    expect(semRelogio({})).toBe(false);
    expect(semRelogio(null)).toBe(false);
  });

  it("marcado, o prazo deixa de ser cobrado", () => {
    const base = {
      tipo: "VISITANTE", cpf: "11122233344", nome: "ANA", unidade: { id: 1 },
      liberadoPor: "PORTEIRO", veiculo: "Carro", placa: "ABC1D23",
    };
    // Sem a marca, um prazo abaixo do mínimo é recusado.
    expect(problemasDaEntrada({ ...base, minutos: 0 }).minutos).toBeTruthy();
    // Com ela, o campo do prazo nem entra na conta.
    expect(problemasDaEntrada({ ...base, minutos: 0, ilimitado: true }).minutos).toBeUndefined();
  });

  it("a marca não vira passe livre para o resto do formulário", () => {
    // Ilimitado tira o relógio, e só o relógio. Nome, unidade e quem liberou
    // continuam obrigatórios.
    const e = problemasDaEntrada({ tipo: "VISITANTE", ilimitado: true, minutos: 0 });
    expect(e.cpf).toBeTruthy();
    expect(e.nome).toBeTruthy();
    expect(e.unidade).toBeTruthy();
    expect(e.liberadoPor).toBeTruthy();
    expect(e.veiculo).toBeTruthy();
  });

  it("um entregador com a marca ligada continua tendo de dar prazo", () => {
    // O caso do estado que sobrou: o porteiro marca no visitante e troca para
    // entregador. A tela limpa a marca, mas a lib não conta com isso.
    const e = problemasDaEntrada({
      tipo: "ENTREGADOR", cpf: "11122233344", nome: "ANA", unidade: { id: 1 },
      liberadoPor: "PORTEIRO", veiculo: "Moto", placa: "ABC1D23",
      minutos: 0, ilimitado: true,
    });
    expect(e.minutos).toBeTruthy();
  });
});

describe("o veículo que já vem marcado", () => {
  it("motorista, visitante e temporada chegam de carro", () => {
    expect(veiculoPadrao("MOTORISTA_APP")).toBe("Carro");
    expect(veiculoPadrao("VISITANTE")).toBe("Carro");
    expect(veiculoPadrao("AIRBNB")).toBe("Carro");
  });

  it("entregador e serviço continuam na moto", () => {
    expect(veiculoPadrao("ENTREGADOR")).toBe("Moto");
    expect(veiculoPadrao("SERVICO")).toBe("Moto");
  });

  it("o padrão está sempre na lista do tipo", () => {
    for (const t of TIPOS) expect(veiculosDoTipo(t.id)).toContain(veiculoPadrao(t.id));
  });
});
