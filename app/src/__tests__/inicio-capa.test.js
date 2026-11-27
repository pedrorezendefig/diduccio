import { describe, it, expect } from "vitest";
import { astroEm, ceuEm, horaEmBrasilia, periodoDoDia, relogio } from "../lib/capa";
import {
  acumuladoPorMes, compromissosDaPortaria, ehGrave, encomendasParadas, noMesmoPeriodo, pendenciasDaAdministracao, pendenciasDaPortaria,
  porMesDoAno, quemEstaDentro, reservasAtivas, semanaDaCapa, soHora, taxasPagas, variacao,
} from "../lib/inicioCapa";

describe("capa: o céu na hora de Brasília", () => {
  it("lê a hora de Brasília, não a do computador", () => {
    // 15:30 UTC é 12:30 em Brasília (UTC-3, sem horário de verão).
    expect(horaEmBrasilia(Date.UTC(2026, 10, 4, 15, 30))).toBe(12.5);
  });

  it("dá nome ao período do dia", () => {
    expect(periodoDoDia(1.2)).toBe("Madrugada");
    expect(periodoDoDia(6)).toBe("Amanhecer");
    expect(periodoDoDia(10)).toBe("Manhã");
    expect(periodoDoDia(14.5)).toBe("Tarde");
    expect(periodoDoDia(18)).toBe("Entardecer");
    expect(periodoDoDia(22)).toBe("Noite");
  });

  it("sol de dia, lua de noite, no alto ao meio-dia e à meia-noite", () => {
    expect(astroEm(12)).toMatchObject({ dia: true, f: 0.5 });
    expect(astroEm(12).altura).toBeCloseTo(1);
    expect(astroEm(0)).toMatchObject({ dia: false, f: 0.5 });
    expect(astroEm(6).altura).toBeCloseTo(0);
  });

  it("acende as janelas e as estrelas só de noite", () => {
    expect(ceuEm(13).janelas).toBe(0);
    expect(ceuEm(13).estrelas).toBe(0);
    expect(ceuEm(22).janelas).toBeGreaterThan(0.8);
    expect(ceuEm(22).estrelas).toBe(1);
  });

  it("muda devagar: meia hora depois o céu é outro, mas parecido", () => {
    const a = ceuEm(18), b = ceuEm(18.5);
    expect(a.meio).not.toBe(b.meio);
    expect(ceuEm(24).topo).toBe(ceuEm(0).topo);
  });

  it("mostra o relógio em HH:MM", () => {
    expect(relogio(9.0833)).toBe("09:05");
    expect(relogio(23.999)).toBe("00:00");
  });
});

describe("Início com capa: números", () => {
  const HOJE = "2026-11-04";

  it("variação sem base não vira +100%", () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(107, 100)).toBe(7);
    expect(variacao(90, 100)).toBe(-10);
  });

  it("soma por mês só até o mês de hoje", () => {
    const meses = porMesDoAno([{ dia: "2026-01-10", valor: 100 }, { dia: "2026-11-02", valor: 50 }, { dia: "2026-12-01", valor: 999 }, { dia: "2025-11-01", valor: 7 }], HOJE);
    expect(meses).toHaveLength(11);
    expect(meses[0]).toBe(100);
    expect(meses[10]).toBe(50);
  });

  it("compara o mês até hoje com o mês passado até o mesmo dia", () => {
    const pares = [
      { dia: "2026-11-03", valor: 110 },
      { dia: "2026-10-02", valor: 100 },
      { dia: "2026-10-20", valor: 500 }, // depois do dia 4: fica de fora
      { dia: "2025-11-01", valor: 50 },
    ];
    const p = noMesmoPeriodo(pares, HOJE);
    expect(p.mesAtual).toBe(110);
    expect(p.mesAnterior).toBe(100);
    expect(p.noMes).toBe(10);
    expect(p.anoAnterior).toBe(50);
  });

  it("receita conta só taxa paga de reserva viva", () => {
    const pares = taxasPagas(
      [{ data_reserva: "2026-11-01", valor_taxa: "R$ 1.250,00", pago: "Sim", status: "Agendado" }, { data_reserva: "2026-11-02", valor_taxa: 300, pago: "Não" }],
      [{ data_reserva: "2026-11-03", valor_taxa: "200", pago: "Sim", status: "Cancelado" }],
    );
    expect(pares).toEqual([{ dia: "2026-11-01", valor: 1250 }]);
  });

  it("reservas ativas: daqui para a frente, e a mais próxima", () => {
    const r = reservasAtivas({
      festas: [{ data_reserva: "2026-11-10" }, { data_reserva: "2026-10-01" }],
      churrasqueira: [{ data_reserva: "2026-11-06" }, { data_reserva: "2026-11-07", status: "Recusada" }],
      mudancas: [{ data_mudanca: "2026-11-04" }],
    }, HOJE);
    expect(r).toEqual({ total: 3, proxima: "2026-11-04" });
  });

  it("encomenda parada: na portaria há mais de 3 dias, a mais antiga primeiro", () => {
    const paradas = encomendasParadas([
      { id: 1, data_entrada: "2026-10-31", status: "Pendente", id_unidade: 9 },
      { id: 2, data_entrada: "2026-10-29", status: "Pendente" },
      { id: 3, data_entrada: "2026-11-02", status: "Pendente" },
      { id: 4, data_entrada: "2026-10-20", status: "Entregue" },
      { id: 5, data_entrada: "2026-10-20", status: "Armazenado" },
    ], HOJE, [{ id: 9, bloco: 15, unidade: "04" }]);
    expect(paradas.map((e) => e.id)).toEqual([2, 1]);
    expect(paradas[1]).toMatchObject({ dias: 4, rotulo: "15·04" });
  });

  it("quem está dentro, pelos dois tipos mais comuns", () => {
    const abertas = [{ tipo: "VISITANTE" }, { tipo: "VISITANTE" }, { tipo: "VISITANTE" }, { tipo: "SERVICO" }, { tipo: "SERVICO" }, { tipo: "ENTREGADOR" }];
    expect(quemEstaDentro(abertas)).toBe("3 visitantes, 2 prestadores");
    expect(quemEstaDentro([{ tipo: "AIRBNB" }])).toBe("1 hóspede");
  });

  it("carros cadastrados mês a mês, e o sem data conta desde sempre", () => {
    const serie = acumuladoPorMes([null, "2026-06-10T12:00:00Z", "2026-10-02", "2026-11-03"], HOJE, 7);
    // maio .. novembro
    expect(serie).toEqual([1, 2, 2, 2, 2, 3, 4]);
  });

  it("Modo foco grave: 5 ou mais, ou algum fora do prazo", () => {
    expect(ehGrave(0)).toBe(false);
    expect(ehGrave(4)).toBe(false);
    expect(ehGrave(5)).toBe(true);
    expect(ehGrave(1, 1)).toBe(true);
  });

  it("acha a hora no texto do período", () => {
    expect(soHora("08:00 às 12:00")).toBe("08:00");
    expect(soHora("14h")).toBe("14:00");
    expect(soHora("Manhã")).toBe("");
  });
});

describe("Início com capa: listas", () => {
  const HOJE = "2026-11-04";

  it("a agenda da portaria vira compromissos com cor e unidade", () => {
    const lista = compromissosDaPortaria([
      { dia: "2026-11-04", tipo: "mudanca", titulo: "Mudança", bloco: 3, unidade: 203, periodo: "08:00 às 12:00" },
      { dia: "2026-11-05", tipo: "espaco", titulo: "Churrasqueira 2", bloco: 1, unidade: 704, periodo: null },
    ]);
    expect(lista[0]).toMatchObject({ tipo: "mudanca", unidade: "3·203", hora: "08:00" });
    const semana = semanaDaCapa(lista, HOJE, 6);
    expect(semana).toHaveLength(6);
    expect(semana[0]).toMatchObject({ sigla: "QUA", numero: "04" });
    expect(semana[1].itens[0].titulo).toBe("Churrasqueira 2");
    expect(semana[5].itens).toEqual([]);
  });

  it("pendências da administração só com o que existe, a mais urgente primeiro", () => {
    const p = pendenciasDaAdministracao({
      paradas: [{ id: 1 }, { id: 2 }],
      fila: [{ bloco: 4, unidade: "305" }],
      inadimplentes: 0,
      chamadosParados: 0,
      tarefas: [{ id: 9, titulo: "Trocar lâmpadas da garagem", prazo: { tom: "perto", texto: "Hoje" } }],
    });
    expect(p.map((x) => x.chave)).toEqual(["encomendas", "app", "tarefa-9"]);
    expect(p[0].titulo).toBe("2 encomendas há mais de 3 dias");
    expect(p[1]).toMatchObject({ texto: "Confirmações · 4·305", destino: "/modo-foco" });
    expect(pendenciasDaAdministracao({})).toEqual([]);
  });

  it("pendências da portaria: uma encomenda por linha, com o depósito à vista", () => {
    const p = pendenciasDaPortaria([
      { id: 2, nome: "Mercado Livre", rotulo: "2·304", chegou: "2026-10-29", dias: 6, cod: "A1" },
      { id: 1, nome: "Amazon", rotulo: "", chegou: "2026-10-31", dias: 4 },
    ]);
    expect(p[0]).toMatchObject({ titulo: "Mercado Livre · 2·304", selo: "Levar ao depósito", tom: "alerta" });
    expect(p[0].texto).toBe("Chegou em 29/10 · há 6 dias"); // sem o código: quem o informa é o morador
    expect(p[1]).toMatchObject({ titulo: "Amazon", selo: "Depósito amanhã" });
  });
});
