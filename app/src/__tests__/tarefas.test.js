// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  SITUACOES, CONCLUIDA, DIAS_NO_QUADRO, rotuloDaSituacao,
  classificarPrazo, noQuadro, ordenarColuna, agruparPorSituacao,
  filtrarTarefas, resumo, iniciais, rotuloDoCargo, pessoasResponsaveis,
  validarTarefa, paraGravar, metaDaTarefa, mensagemErro,
} from "../lib/tarefas";

/**
 * A regra do quadro de tarefas, sem tela.
 *
 * O relógio é fixo e está em Brasília: quarta, 30/09/2026, 15h. Os casos de
 * virada do dia existem porque o dia do prazo é o dia civil de Brasília, e às
 * 23h30 daqui já é o dia seguinte em UTC.
 */
const AGORA = Date.parse("2026-09-30T15:00:00-03:00");

describe("as situações", () => {
  it("são quatro, nesta ordem", () => {
    expect(SITUACOES.map((s) => s.id)).toEqual(["A_FAZER", "EM_ANDAMENTO", "AGUARDANDO", "CONCLUIDA"]);
    expect(CONCLUIDA).toBe("CONCLUIDA");
  });

  it("o rótulo é o da tela, com acento", () => {
    expect(rotuloDaSituacao("A_FAZER")).toBe("A fazer");
    expect(rotuloDaSituacao("CONCLUIDA")).toBe("Concluído");
    expect(rotuloDaSituacao("INVENTADA")).toBe("INVENTADA");
  });
});

describe("o selo do prazo", () => {
  const t = (prazo, extra = {}) => ({ situacao: "A_FAZER", prazo, ...extra });

  it("sem prazo, sem selo", () => {
    expect(classificarPrazo(t(null), AGORA)).toBeNull();
    expect(classificarPrazo(t(""), AGORA)).toBeNull();
  });

  it("mais de um dia à frente é neutro, com a data", () => {
    expect(classificarPrazo(t("2026-10-05"), AGORA)).toEqual({ tom: "normal", texto: "05/10" });
  });

  it("amanhã e hoje avisam", () => {
    expect(classificarPrazo(t("2026-10-01"), AGORA)).toEqual({ tom: "perto", texto: "Amanhã" });
    expect(classificarPrazo(t("2026-09-30"), AGORA)).toEqual({ tom: "perto", texto: "Hoje" });
  });

  it("vencido conta os dias, no singular e no plural", () => {
    expect(classificarPrazo(t("2026-09-29"), AGORA)).toEqual({ tom: "atrasada", texto: "Atrasada 1 dia" });
    expect(classificarPrazo(t("2026-09-28"), AGORA)).toEqual({ tom: "atrasada", texto: "Atrasada 2 dias" });
  });

  it("às 23h30 de Brasília ainda é hoje, embora em UTC já seja amanhã", () => {
    const quase = Date.parse("2026-09-30T23:30:00-03:00");
    expect(classificarPrazo(t("2026-09-30"), quase)).toEqual({ tom: "perto", texto: "Hoje" });
  });

  it("o prazo que vem do banco com hora não confunde", () => {
    expect(classificarPrazo(t("2026-10-05T00:00:00"), AGORA)).toEqual({ tom: "normal", texto: "05/10" });
  });

  it("concluída mostra quando concluiu, e não atraso", () => {
    const feita = t("2026-09-20", { situacao: CONCLUIDA, concluida_em: "2026-09-29T20:00:00Z" });
    expect(classificarPrazo(feita, AGORA)).toEqual({ tom: "feito", texto: "Concluída 29/09" });
  });

  it("concluída sem data ainda diz que está concluída", () => {
    expect(classificarPrazo(t(null, { situacao: CONCLUIDA }), AGORA)).toEqual({ tom: "feito", texto: "Concluída" });
  });
});

describe("o que fica no quadro", () => {
  const feita = (concluida_em) => ({ situacao: CONCLUIDA, concluida_em });

  it("aberta fica sempre", () => {
    expect(noQuadro({ situacao: "AGUARDANDO" }, AGORA)).toBe(true);
  });

  it(`concluída fica por ${DIAS_NO_QUADRO} dias`, () => {
    expect(noQuadro(feita("2026-09-27T12:00:00-03:00"), AGORA)).toBe(true);
    expect(noQuadro(feita("2026-09-23T12:00:00-03:00"), AGORA)).toBe(true);
    expect(noQuadro(feita("2026-09-22T12:00:00-03:00"), AGORA)).toBe(false);
  });

  it("o dia da conclusão é o de Brasília, não o de UTC", () => {
    // 23h30 de 22/09 em Brasília já é 23/09 em UTC, o que a manteria por engano.
    expect(noQuadro(feita("2026-09-22T23:30:00-03:00"), AGORA)).toBe(false);
  });

  it("concluída sem data fica, para não sumir sem ninguém ver", () => {
    expect(noQuadro(feita(null), AGORA)).toBe(true);
  });
});

describe("a ordem dentro da coluna", () => {
  it("por prazo, sem prazo por último, e empate pela criação", () => {
    const lista = [
      { id: 1, prazo: null, created_at: "2026-09-01T10:00:00Z" },
      { id: 2, prazo: "2026-10-10", created_at: "2026-09-01T10:00:00Z" },
      { id: 3, prazo: "2026-10-02", created_at: "2026-09-05T10:00:00Z" },
      { id: 4, prazo: "2026-10-02", created_at: "2026-09-03T10:00:00Z" },
    ];
    expect(ordenarColuna(lista, "A_FAZER").map((t) => t.id)).toEqual([4, 3, 2, 1]);
  });

  it("concluídas, da mais recente para a mais antiga", () => {
    const lista = [
      { id: 1, concluida_em: "2026-09-25T10:00:00Z" },
      { id: 2, concluida_em: "2026-09-29T10:00:00Z" },
      { id: 3, concluida_em: null },
    ];
    expect(ordenarColuna(lista, CONCLUIDA).map((t) => t.id)).toEqual([2, 1, 3]);
  });

  it("concluídas com fusos misturados comparam o instante, não o texto", () => {
    // 22:00-03:00 de 29/09 = 01:00Z de 30/09, depois de 00:30Z.
    const lista = [
      { id: 2, concluida_em: "2026-09-30T00:30:00+00:00" },
      { id: 1, concluida_em: "2026-09-29T22:00:00-03:00" },
    ];
    expect(ordenarColuna(lista, CONCLUIDA).map((t) => t.id)).toEqual([1, 2]);
  });

  it("o empate pela criação também compara o instante", () => {
    const lista = [
      { id: 2, prazo: "2026-10-02", created_at: "2026-09-29T22:00:00-03:00" },
      { id: 1, prazo: "2026-10-02", created_at: "2026-09-30T00:30:00+00:00" },
    ];
    expect(ordenarColuna(lista, "A_FAZER").map((t) => t.id)).toEqual([1, 2]);
  });

  it("sem criação, vai depois de quem tem, no mesmo prazo", () => {
    const lista = [
      { id: 1, prazo: "2026-10-02" },
      { id: 2, prazo: "2026-10-02", created_at: "2026-09-30T00:30:00Z" },
    ];
    expect(ordenarColuna(lista, "A_FAZER").map((t) => t.id)).toEqual([2, 1]);
  });

  it("não mexe na lista original", () => {
    const lista = [{ id: 2, prazo: "2026-10-10" }, { id: 1, prazo: "2026-10-01" }];
    ordenarColuna(lista, "A_FAZER");
    expect(lista.map((t) => t.id)).toEqual([2, 1]);
  });
});

describe("agrupar por situação", () => {
  it("devolve as quatro colunas, mesmo vazias, já ordenadas", () => {
    const g = agruparPorSituacao([
      { id: 1, situacao: "EM_ANDAMENTO", prazo: "2026-10-09" },
      { id: 2, situacao: "EM_ANDAMENTO", prazo: "2026-10-01" },
    ]);
    expect(Object.keys(g)).toEqual(["A_FAZER", "EM_ANDAMENTO", "AGUARDANDO", "CONCLUIDA"]);
    expect(g.EM_ANDAMENTO.map((t) => t.id)).toEqual([2, 1]);
    expect(g.A_FAZER).toEqual([]);
  });

  it("ignora item vazio e situação que é nome de propriedade de objeto", () => {
    const g = agruparPorSituacao([null, undefined, { id: 7, situacao: "constructor" }]);
    expect(g.A_FAZER.map((t) => t.id)).toEqual([7]);
  });

  it("situação desconhecida cai em A fazer, em vez de sumir", () => {
    expect(agruparPorSituacao([{ id: 9, situacao: "???" }]).A_FAZER.map((t) => t.id)).toEqual([9]);
  });

  it("funciona sem Object.hasOwn, que o Safari só ganhou no iOS 15.4", () => {
    // iPhone antigo sem atualização ainda abre o sistema: sem isto o quadro
    // inteiro estoura num TypeError ao desenhar.
    const hasOwn = Object.hasOwn;
    delete Object.hasOwn;
    try {
      const g = agruparPorSituacao([{ id: 1, situacao: "AGUARDANDO" }, { id: 2, situacao: "constructor" }]);
      expect(g.AGUARDANDO.map((t) => t.id)).toEqual([1]);
      expect(g.A_FAZER.map((t) => t.id)).toEqual([2]);
    } finally {
      Object.hasOwn = hasOwn;
    }
  });
});

describe("filtrar", () => {
  const unidadePorId = new Map([["7", { id: 7, bloco: 5, unidade: 206 }]]);
  const LISTA = [
    { id: 1, titulo: "Conferir a prestação de contas", responsavel_id: 10 },
    { id: 2, titulo: "Portão", descricao: "Motor travando ao fechar", responsavel_id: 20 },
    { id: 3, titulo: "Vazamento", id_unidade: 7, responsavel_id: 20 },
  ];
  const ids = (f) => filtrarTarefas(LISTA, { unidadePorId, ...f }).map((t) => t.id);

  it("sem filtro, tudo", () => {
    expect(ids({})).toEqual([1, 2, 3]);
  });

  it("\"Minhas\" é pelo responsável, e o id pode vir como texto", () => {
    expect(ids({ minhas: true, meuId: "20" })).toEqual([2, 3]);
  });

  it("\"Minhas\" sem saber quem sou não mostra nada", () => {
    expect(ids({ minhas: true, meuId: null })).toEqual([]);
  });

  it("a busca ignora acento e caixa, e olha a descrição", () => {
    expect(ids({ busca: "PRESTACAO" })).toEqual([1]);
    expect(ids({ busca: "motor" })).toEqual([2]);
  });

  it("a busca acha pela etiqueta da unidade que o cartão mostra", () => {
    expect(ids({ busca: "b5-206" })).toEqual([3]);
  });

  it("a busca acha pelo número que o cartão mostra", () => {
    expect(ids({ busca: "#2" })).toEqual([2]);
  });
});

describe("resumo do cabeçalho", () => {
  it("conta abertas e atrasadas; concluída não conta", () => {
    const r = resumo([
      { situacao: "A_FAZER", prazo: "2026-09-28" },
      { situacao: "AGUARDANDO", prazo: "2026-10-10" },
      { situacao: CONCLUIDA, prazo: "2026-09-01" },
    ], AGORA);
    expect(r).toEqual({ abertas: 2, atrasadas: 1 });
  });
});

describe("pessoas", () => {
  it("iniciais: primeiro e último nome", () => {
    expect(iniciais("Carla Souza Lima")).toBe("CL");
    expect(iniciais("rafael")).toBe("R");
    expect(iniciais("")).toBe("?");
  });

  it("o cargo com acento", () => {
    expect(rotuloDoCargo("Sindico")).toBe("Síndico");
    expect(rotuloDoCargo("Auxiliar Administrativo")).toBe("Auxiliar Administrativo");
  });

  it("responsáveis: síndico e auxiliar do banco, mais quem está logado", () => {
    const perfis = [
      { id: 1, nome: "Carla", cargo: "Sindico" },
      { id: 2, nome: "Rafael", cargo: "Auxiliar Administrativo" },
      { id: 3, nome: "Jonas", cargo: "Porteiro" },
    ];
    // O dev não está no que `responsaveis_de_tarefa()` devolve: sem entrar aqui
    // ele não conseguiria atribuir uma tarefa a si mesmo.
    const dev = { id: 9, nome: "Lucas", cargo: "Desenvolvedor" };
    expect(pessoasResponsaveis(perfis, dev).map((p) => p.id)).toEqual([1, 2, 9]);
    expect(pessoasResponsaveis(perfis, { id: 1, nome: "Carla", cargo: "Sindico" }).map((p) => p.id)).toEqual([1, 2]);
  });
});

describe("o formulário", () => {
  const ok = { titulo: "Trocar lâmpadas", responsavel_id: "2", descricao: "", prazo: "", id_unidade: null, situacao: "A_FAZER" };

  it("título e responsável são obrigatórios", () => {
    expect(validarTarefa(ok)).toEqual({});
    expect(validarTarefa({ ...ok, titulo: "   " })).toEqual({ titulo: "Dê um título à tarefa." });
    expect(validarTarefa({ ...ok, responsavel_id: "" })).toEqual({ responsavel_id: "Escolha o responsável." });
  });

  it("grava vazio como nulo e o responsável como número", () => {
    expect(paraGravar({ ...ok, titulo: "  Trocar lâmpadas  " })).toEqual({
      titulo: "Trocar lâmpadas",
      descricao: null,
      responsavel_id: 2,
      prazo: null,
      id_unidade: null,
      situacao: "A_FAZER",
    });
  });

  it("não manda os campos que são do gatilho", () => {
    const campos = Object.keys(paraGravar(ok));
    for (const doBanco of ["concluida_em", "movida_em", "movida_por", "created_by"]) {
      expect(campos).not.toContain(doBanco);
    }
  });
});

describe("a linha de quem mexeu", () => {
  it("criação e movimento, na hora de Brasília", () => {
    expect(metaDaTarefa({
      created_by: "Carla", created_at: "2026-09-26T13:00:00Z",
      movida_por: "Rafael", movida_em: "2026-09-29T17:10:00Z",
    })).toBe("Criada por Carla em 26/09. Movida por Rafael em 29/09, às 14:10.");
  });

  it("sem movimento, só a criação; sem nome, sem o \"por\"", () => {
    expect(metaDaTarefa({ created_at: "2026-09-26T13:00:00Z" })).toBe("Criada em 26/09.");
  });

  it("tarefa nova não tem linha", () => {
    expect(metaDaTarefa(null)).toBe("");
  });
});

describe("mensagem de erro", () => {
  it("RLS vira frase de gente", () => {
    expect(mensagemErro("new row violates row-level security policy")).toBe("Você não tem permissão para mexer nas tarefas.");
  });

  it("rede vira falta de conexão", () => {
    expect(mensagemErro("Failed to fetch")).toBe("Sem conexão com o servidor. Tente de novo.");
  });

  it("vazio vira a genérica; o resto passa", () => {
    expect(mensagemErro("")).toBe("Não foi possível salvar. Tente novamente.");
    expect(mensagemErro("Sua sessão expirou. Entre de novo.")).toBe("Sua sessão expirou. Entre de novo.");
  });
});

describe("casos de borda da revisão", () => {
  const base = { titulo: "T", responsavel_id: "2", descricao: "", prazo: "", id_unidade: null, situacao: "A_FAZER" };

  it("paraGravar: id_unidade vazio vira nulo, texto vira número, número fica", () => {
    expect(paraGravar({ ...base, id_unidade: "" }).id_unidade).toBeNull();
    expect(paraGravar({ ...base, id_unidade: "7" }).id_unidade).toBe(7);
    expect(paraGravar({ ...base, id_unidade: 7 }).id_unidade).toBe(7);
  });

  it("paraGravar: responsável vazio ou não numérico vira nulo, nunca 0 ou NaN", () => {
    expect(paraGravar({ ...base, responsavel_id: "" }).responsavel_id).toBeNull();
    expect(paraGravar({ ...base, responsavel_id: "abc" }).responsavel_id).toBeNull();
  });

  it("validarTarefa: responsável não numérico conta como faltando", () => {
    expect(validarTarefa({ ...base, responsavel_id: "abc" })).toEqual({ responsavel_id: "Escolha o responsável." });
  });

  it("mensagemErro: registro que não existe mais tem frase própria", () => {
    const frase = "A tarefa não existe mais ou você não tem permissão. Recarregue a página.";
    expect(mensagemErro("PGRST116")).toBe(frase);
    expect(mensagemErro("Nenhum registro foi excluído: sem permissão ou o registro já não existe.")).toBe(frase);
  });

  it("metaDaTarefa: só movimento, sem criação", () => {
    expect(metaDaTarefa({ movida_por: "Rafael", movida_em: "2026-09-29T17:10:00Z" }))
      .toBe("Movida por Rafael em 29/09, às 14:10.");
  });

  it("pessoasResponsaveis: sem usuário devolve só síndico/auxiliar e não mexe na entrada", () => {
    const perfis = [
      { id: 1, nome: "Carla", cargo: "Sindico" },
      { id: 3, nome: "Jonas", cargo: "Porteiro" },
    ];
    expect(pessoasResponsaveis(perfis, null).map((p) => p.id)).toEqual([1]);
    expect(perfis).toHaveLength(2);
  });

  it("filtrarTarefas: \"Minhas\" com meuId vazio não mostra nada", () => {
    const lista = [{ id: 1, titulo: "Sem dono" }, { id: 2, titulo: "X", responsavel_id: 5 }];
    expect(filtrarTarefas(lista, { minhas: true, meuId: "" })).toEqual([]);
  });
});
