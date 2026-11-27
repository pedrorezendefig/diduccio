import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "../pages/Dashboard";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider } from "../ui";

/**
 * Os números do painel vêm de planilhas diferentes e alguns dependem de um
 * valor de status específico. Errar "ARMAZENADO" ou "possui_carro" não quebra
 * nada: só mostra o número errado, calado. Por isso estes testes.
 */

const ANO = new Date().getFullYear();

const UNIDADES = [
  { id: 1, ocupado: "Sim", status: "Em dia" },
  { id: 2, ocupado: "Sim", status: "Inadimplente", bloco: "3", unidade: "412" },
  { id: 3, ocupado: "Não", status: "Em dia" },
  { id: 4, ocupado: "Sim", status: "Inadimplente" },
];

const FESTAS = [
  { id: "f1", data_reserva: `10/03/${ANO}`, valor_taxa: "R$ 1.200,00", pago: "Sim", status: "Agendado", unidade_id: 2, morador: "Vanderlei Prado" },
  { id: "f2", data_reserva: `15/04/${ANO}`, valor_taxa: "800", pago: "Não", status: "Agendado", unidade_id: "108", morador: "Sueli Andrade" },
  { id: "f3", data_reserva: `20/05/${ANO - 1}`, valor_taxa: "1000", pago: "Sim", status: "Realizado" },
];

const CHURRAS = [
  { id: "c1", data_reserva: `12/03/${ANO}`, valor_taxa: "300", pago: "Sim", status: "Agendado", unidade_id: "207", morador: "Neide Carvalho" },
];

// Só ARMAZENADO conta como "aguardando retirada": PENDENTE ainda não chegou
// à portaria e ENTREGUE/RETIRADO já saiu.
const ENTREGAS = [
  { STATUS: "ARMAZENADO", DATA_ENTRADA: "01/01/2020" },
  { STATUS: "ARMAZENADO", DATA_ENTRADA: `01/01/${ANO + 1}` },
  { status: "armazenado", data_entrada: "01/01/2020" },
  { STATUS: "PENDENTE", DATA_ENTRADA: "01/01/2020" },
  { STATUS: "ENTREGUE", DATA_ENTRADA: "01/01/2020" },
  { STATUS: "RETIRADO", DATA_ENTRADA: "01/01/2020" },
];

const VAGAS = [
  { possui_carro: "Sim", possui_moto: "Não" },
  { possui_carro: "Sim", possui_moto: "Sim" },
  { possui_carro: "Não", possui_moto: "Sim" },
  { possui_carro: "Não", possui_moto: "Não" },
];

// O que a Edge Function `receita` devolve ao conselheiro no lugar de festas e
// churrasqueira: mesma data, mesmo valor, sem morador nem cpf.
const RECEITA = [
  { data_reserva: `10/03/${ANO}`, valor_taxa: "R$ 1.200,00", pago: "Sim", status: "Agendado", origem: "festas" },
  { data_reserva: `12/03/${ANO}`, valor_taxa: "300", pago: "Sim", status: "Agendado", origem: "churrasqueira" },
];

const POR_PLANILHA = {
  UNIDADES, FESTAS, CHURRASQUEIRA: CHURRAS, MUDANCAS: [],
  ENTREGAS, VAGAS, log: [], AGENDAMENTOS: [],
};

const USUARIO = { nome: "Marcelo Tavares", cargo: "Sindico" };

function montar(user = USUARIO) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <Dashboard user={user} />
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

/** Devolve o valor da célula cujo rótulo casa com o texto dado. */
function valorDe(rotulo) {
  const el = screen.getByText(rotulo);
  const celula = el.closest(".dash-num");
  return within(celula).getByText((_, node) =>
    node?.classList?.contains("dash-num__valor")
  ).textContent;
}

// O painel lê pelo `listar` do Supabase, não mais por fetch no Apps Script.
// Falsear a camada de dados em vez do fetch também deixa o teste conferir QUAIS
// tabelas cada cargo pede — que é onde mora o risco agora: pedir uma tabela que
// o RLS nega devolve vazio sem erro, e o número viraria zero em silêncio.
const pedidas = [];
vi.mock("../api/db", () => ({
  listar: vi.fn(async (tabela) => {
    pedidas.push(tabela);
    return POR_PLANILHA[tabela] ?? [];
  }),
}));

// A receita não vem mais de tabela: vem da Edge Function `receita`, porque
// churrasqueira e festas carregam cpf, rg e nome de quem reservou e o
// conselheiro não pode recebê-los. Registrar as chamadas aqui é o que permite
// afirmar que ele pediu a receita — e SÓ ela.
const chamadasEdge = [];
let respostaReceita = { status: 200, ok: true, corpo: { success: true, dados: RECEITA } };
vi.mock("../api/edge", () => ({
  chamarEdgeFunction: vi.fn(async (nome) => {
    chamadasEdge.push(nome);
    return respostaReceita;
  }),
  mensagemDaEdgeFunction: (_r, padrao) => padrao,
}));

beforeEach(() => {
  pedidas.length = 0;
  chamadasEdge.length = 0;
  respostaReceita = { status: 200, ok: true, corpo: { success: true, dados: RECEITA } };
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

async function esperarCarregar() {
  // O componente segura o loading por 400ms de propósito, para o esqueleto
  // não piscar. O teste avança o relógio em vez de esperar de verdade.
  await vi.advanceTimersByTimeAsync(600);
}

describe("Painel", () => {
  it("conta como aguardando retirada só o que está ARMAZENADO", async () => {
    montar();
    await esperarCarregar();
    // 3 armazenados (uma delas com as chaves em minúscula), ignorando
    // PENDENTE, ENTREGUE e RETIRADO.
    expect(valorDe("Encomendas aguardando")).toBe("3");
  });

  it("avisa quantas encomendas estão paradas há mais de 3 dias", async () => {
    montar();
    await esperarCarregar();
    // Duas são de 2020; a terceira tem data no futuro e não conta.
    expect(screen.getByText("2 há mais de 3 dias")).toBeInTheDocument();
  });

  it("conta carros por possui_carro, e cita as motos à parte", async () => {
    montar();
    await esperarCarregar();
    expect(valorDe("Carros registrados")).toBe("2");
    expect(screen.getByText("e 2 motos")).toBeInTheDocument();
  });

  it("soma na receita apenas reservas pagas do ano corrente", async () => {
    montar();
    await esperarCarregar();
    // 1.200 (festa paga) + 300 (churrasqueira paga). A de 800 não está paga e
    // a de 1.000 é do ano anterior.
    expect(valorDe(`Recebido ${ANO}`)).toContain("1.500");
  });

  it("conta como reserva ativa só o que está agendado", async () => {
    montar();
    await esperarCarregar();
    expect(valorDe("Reservas ativas")).toBe("3");
  });

  it("próximos agendamentos mostram o bloco da unidade, não um B5 fixo", async () => {
    montar();
    await esperarCarregar();
    // O id 2 é o B3-412 no cadastro. O card escrevia "B5-" seguido do id.
    expect(screen.getByText(/B3-412 · Vanderlei Prado/)).toBeInTheDocument();
    expect(screen.queryByText(/B5-/)).not.toBeInTheDocument();
  });

  it("mostra a ocupação e a inadimplência juntas", async () => {
    const { container } = montar();
    await esperarCarregar();
    expect(screen.getByText("75%")).toBeInTheDocument();          // 3 de 4
    // O número vai num <strong>, então o texto fica partido entre nós: lê-se
    // o elemento inteiro, não um nó de texto isolado.
    const alerta = container.querySelector(".dash-ocupacao__alerta");
    expect(alerta.textContent.replace(/\s+/g, " ")).toContain("2 unidades inadimplentes");
    expect(alerta.textContent).toContain("50% do total");
  });

  it("compara a receita com o ano anterior", async () => {
    montar();
    await esperarCarregar();
    // 1.500 neste ano contra 1.000 no anterior: alta de 50%.
    expect(screen.getByText(`+50% vs ${ANO - 1}`)).toBeInTheDocument();
  });

  /**
   * O porteiro lê `unidades` e `entregas`, e mais nada — é o que as políticas
   * do 0015 dizem. O painel precisa concordar com o banco: número que ele não
   * pode ler vira "—", nunca zero. Zero afirmaria que não há reserva nenhuma.
   */
  it("porteiro: encomendas de verdade, o resto com traço", async () => {
    montar({ nome: "Edmilson Nogueira", cargo: "Porteiro" });
    await esperarCarregar();

    expect(valorDe("Encomendas aguardando")).toBe("3");
    expect(valorDe("Reservas ativas")).toBe("—");
    expect(valorDe("Carros registrados")).toBe("—");
    expect(valorDe(`Recebido ${ANO}`)).toBe("—");

    // Painel vazio não informa nada: sai da tela em vez de ficar em branco.
    expect(screen.queryByText("Relatórios")).not.toBeInTheDocument();
    expect(screen.queryByText("Hoje e amanhã")).not.toBeInTheDocument();
  });

  it("porteiro não pede as tabelas que o banco nega", async () => {
    montar({ nome: "Edmilson Nogueira", cargo: "Porteiro" });
    await esperarCarregar();
    // Pedir devolveria vazio pelo RLS, sem erro — requisição inútil que ainda
    // por cima confundiria "sem permissão" com "não há nada".
    for (const negada of ["FESTAS", "CHURRASQUEIRA", "MUDANCAS", "VAGAS", "log"]) {
      expect(pedidas, `porteiro não deveria pedir ${negada}`).not.toContain(negada);
    }
    expect(pedidas).toContain("UNIDADES");
    expect(pedidas).toContain("ENTREGAS");
  });

  /**
   * O conselheiro vê o gráfico e o recebido do ano, e nada mais — foi o que o
   * Lucas pediu. Os valores vêm da Edge Function `receita`, não das tabelas:
   * churrasqueira e festas carregam cpf, rg e nome de quem reservou.
   */
  it("conselheiro: gráfico e recebido, o resto com traço", async () => {
    montar({ nome: "Cleide Vasconcelos", cargo: "Conselheiro" });
    await esperarCarregar();

    // 1200 + 300, as duas pagas, vindas da Edge Function.
    expect(valorDe(`Recebido ${ANO}`)).toContain("1.500");
    expect(valorDe("Reservas ativas")).toBe("—");
    expect(valorDe("Encomendas aguardando")).toBe("—");
    expect(valorDe("Carros registrados")).toBe("—");
  });

  it("conselheiro chama a Edge Function, nunca as tabelas de reserva", async () => {
    montar({ nome: "Cleide Vasconcelos", cargo: "Conselheiro" });
    await esperarCarregar();
    expect(chamadasEdge).toContain("receita");
    for (const negada of ["FESTAS", "CHURRASQUEIRA", "MUDANCAS", "VAGAS", "log", "UNIDADES", "RECEITAS_RESERVAS"]) {
      expect(pedidas, `conselheiro não deveria pedir ${negada}`).not.toContain(negada);
    }
  });

  it("só o conselheiro chama a Edge Function de receita", async () => {
    // Os outros cargos leem festas e churrasqueira direto — já enxergam os
    // dados pessoais. Chamar a função também seria uma ida à rede sem motivo.
    montar();
    await esperarCarregar();
    expect(chamadasEdge).not.toContain("receita");
    expect(pedidas).toContain("FESTAS");
  });

  it("se a Edge Function falhar, o conselheiro é avisado em vez de ver zero", async () => {
    // Gráfico zerado por defeito de rede é indistinguível de um ano sem receita
    // nenhuma — e é o número que ele levaria para a reunião de conselho.
    respostaReceita = { falhaConexao: true };
    montar({ nome: "Cleide Vasconcelos", cargo: "Conselheiro" });
    await esperarCarregar();
    expect(screen.getByText("Não consegui carregar a receita.")).toBeInTheDocument();
  });

  it("a agenda de hoje aparece aberta, sem depender de clique", async () => {
    montar();
    await esperarCarregar();
    expect(screen.getByText("Hoje e amanhã")).toBeInTheDocument();
    expect(screen.getByText("Nada marcado")).toBeInTheDocument();
  });
});
