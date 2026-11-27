import { describe, it, expect } from "vitest";
import {
  adesaoAoApp, avisosDoDia, chamadosParados, diaDoRegistro, diasEntre, encomendas, eventosDoCondominio,
  filaDoFoco, proximosDias, saudacao, serieDiaria, serieMensal, somarDias,
} from "../lib/inicio";

const AGORA = new Date("2026-11-03T14:20:00-03:00").getTime();
const HOJE = "2026-11-03";

describe("datas", () => {
  it("data pura do banco fica como está; data com hora vira o dia em Brasília", () => {
    expect(diaDoRegistro("2026-11-07")).toBe("2026-11-07");
    expect(diaDoRegistro("07/11/2026")).toBe("2026-11-07");
    // 22h de Brasília é 01h UTC do dia seguinte: tem de continuar no dia 7.
    expect(diaDoRegistro("2026-11-08T01:00:00Z")).toBe("2026-11-07");
    expect(diaDoRegistro(null)).toBe("");
  });
  it("soma dias e conta a diferença sem passar por fuso", () => {
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-11-01", -1)).toBe("2026-10-31");
    expect(diasEntre("2026-10-30", HOJE)).toBe(4);
  });
  it("saudação pela hora de Brasília", () => {
    expect(saudacao(new Date("2026-11-03T09:00:00-03:00").getTime())).toBe("Bom dia");
    expect(saudacao(new Date("2026-11-03T15:00:00-03:00").getTime())).toBe("Boa tarde");
    expect(saudacao(new Date("2026-11-03T21:00:00-03:00").getTime())).toBe("Boa noite");
  });
});

describe("próximos dias", () => {
  const unidades = [{ id: 1504, bloco: 15, unidade: "04" }, { id: 4305, bloco: 4, unidade: "305" }];
  const eventos = eventosDoCondominio({
    unidades,
    festas: [{ data_reserva: "2026-11-07", unidade_id: 1504, status: "Agendado" }, { data_reserva: "2026-11-07", unidade_id: 1504, status: "Cancelado" }],
    churrasqueira: [{ data_reserva: "2026-11-04", unidade_id: 4305, churrasqueira: "CH-A", status: "Pendente" }],
    mudancas: [{ data_mudanca: "2026-11-03T11:00:00Z", id_unidade: 4305, status: "Agendado" }],
    agendamentos: [{ data: "2026-11-03", tipo: "Reunião", nome: "Conselho" }],
  });

  it("junta reservas, mudanças e agenda; reserva cancelada não conta", () => {
    expect(eventos).toHaveLength(4);
    expect(eventos.find((e) => e.titulo === "Churrasqueira CH-A").unidade).toBe("4·305");
  });

  it("devolve os dias seguidos, com 'hoje', 'amanhã' e o dia da semana; dia vazio vem sem itens", () => {
    const dias = proximosDias(eventos, HOJE, 6);
    expect(dias.map((d) => d.rotulo)).toEqual(["hoje", "amanhã", "qui", "sex", "sáb", "dom"]);
    expect(dias[0].itens.map((e) => e.titulo)).toEqual(["Mudança", "Reunião"]);
    expect(dias[1].itens).toHaveLength(1);
    expect(dias[2].itens).toEqual([]);
    expect(dias[4].numero).toBe("07");
  });
});

describe("fila do Modo foco", () => {
  const filas = {
    cadastros: [{ id: 1, nome: "Fernanda", pedido_em: "2026-11-02T10:00:00-03:00", bloco: 4, unidade: "305" }],
    reservas: [{ id: 7, morador: "Ricardo", pedido_em: "2026-11-01T10:00:00-03:00", bloco: 15, unidade: "04" }],
    veiculos: [
      { id: 3, quem: "Gustavo", pedido_em: "2026-11-02T21:00:00-03:00", status: "comprovante" },
      { id: 4, quem: "Paga depois", pedido_em: "2026-10-01T10:00:00-03:00", status: "pagar" },
    ],
    solicitacoes: [
      { id: 9, quem: "Mariana", enviada_em: "2026-10-31T18:00:00-03:00", ultima_msg_em: "2026-11-03T08:47:00-03:00", nao_lida: true },
      { id: 10, quem: "Já respondido", enviada_em: "2026-10-20T18:00:00-03:00", nao_lida: false },
    ],
  };

  it("junta as quatro filas, do mais antigo para o mais novo", () => {
    const f = filaDoFoco(filas, AGORA);
    expect(f.map((i) => i.chave)).toEqual(["reserva-7", "cadastro-1", "veiculo-3", "chamado-9"]);
  });

  it("deixa de fora o que não depende da administração", () => {
    const f = filaDoFoco(filas, AGORA);
    expect(f.find((i) => i.chave === "veiculo-4")).toBeUndefined();
    expect(f.find((i) => i.chave === "chamado-10")).toBeUndefined();
  });

  it("marca fora do prazo o que espera há 2 dias ou mais", () => {
    const f = filaDoFoco(filas, AGORA);
    expect(f.filter((i) => i.foraDoPrazo).map((i) => i.chave)).toEqual(["reserva-7"]);
  });

  it("chamado parado: o morador escreveu há 3 dias ou mais e ninguém respondeu", () => {
    expect(chamadosParados([{ nao_lida: true, ultima_msg_em: "2026-10-30T10:00:00-03:00" }, { nao_lida: true, ultima_msg_em: "2026-11-02T10:00:00-03:00" }], AGORA)).toBe(1);
  });
});

describe("métricas", () => {
  it("encomendas na portaria e as que vão ao depósito amanhã (4º dia)", () => {
    const r = encomendas([
      { cod: "K7Q2", data_entrada: "2026-10-30T10:00:00-03:00", status: "Pendente" },
      { cod: "AAAA", data_entrada: "2026-11-02T10:00:00-03:00", status: "Pendente" },
      { cod: "BBBB", data_entrada: "2026-10-30T10:00:00-03:00", status: "Entregue" },
      { cod: "CCCC", data_entrada: "2026-10-20T10:00:00-03:00", status: "Pendente", armazenado_data: "2026-10-25" },
    ], HOJE);
    expect(r).toEqual({ naPortaria: 2, vaoAmanha: 1, codigosAmanha: ["K7Q2"] });
  });

  it("adesão conta apartamentos (não pessoas) com morador aprovado", () => {
    const r = adesaoAoApp([
      { status: "aprovado", bloco: 1, unidade: "101", aprovado_em: "2026-09-10" },
      { status: "aprovado", bloco: 1, unidade: "101", aprovado_em: "2026-10-10" },
      { status: "aprovado", bloco: 2, unidade: "201", aprovado_em: "2026-11-01" },
      { status: "saiu", bloco: 3, unidade: "301", aprovado_em: "2026-08-01" },
    ], 4, HOJE, 3);
    expect(r.aptos).toBe(2);
    expect(r.pct).toBe(50);
    // A curva acumula até o fim de cada mês: set 1, out 1, nov 2.
    expect(r.serie).toEqual([1, 1, 2]);
  });

  it("séries por dia e por mês", () => {
    expect(serieDiaria(["2026-11-03", "2026-11-03", "2026-11-01"], HOJE, 3)).toEqual([1, 0, 2]);
    expect(serieMensal(["2026-09-12", "2026-11-01", "2026-11-20"], HOJE, 3)).toEqual([1, 0, 2]);
  });

  it("avisos vêm do mais grave para o menos", () => {
    const fila = [{ quem: "Ricardo", foraDoPrazo: true }, { quem: "X", foraDoPrazo: false }];
    const a = avisosDoDia({ fila, encomendasAmanha: 3, chamadosParados: 2 });
    expect(a.map((x) => x.titulo)).toEqual([
      "1 pedido do app fora do prazo", "2 chamados parados há 3 dias", "3 encomendas vão ao depósito amanhã",
    ]);
    expect(a[0].grave).toBe(true);
  });
});
