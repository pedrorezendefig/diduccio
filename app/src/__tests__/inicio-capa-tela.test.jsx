import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { diaEmBrasilia, somarDias } from "../lib/inicio";

/**
 * Início com a capa ilustrada: a versão da administração e a da portaria. O
 * porteiro não lê reservas nem mudanças; a agenda e as contagens dele vêm das
 * funções do 0083.
 */
const HOJE = diaEmBrasilia(Date.now());
const dia = (n) => somarDias(HOJE, n);

const { rpc, listarMock, navegar } = vi.hoisted(() => ({ rpc: vi.fn(), listarMock: vi.fn(), navegar: vi.fn() }));
vi.mock("react-router-dom", async (orig) => ({ ...(await orig()), useNavigate: () => navegar }));
vi.mock("../api/db", () => ({
  listar: listarMock,
  listarChegadas: vi.fn(async ({ abertas } = {}) => (abertas
    ? [{ id: 1, tipo: "VISITANTE" }, { id: 2, tipo: "VISITANTE" }, { id: 3, tipo: "SERVICO" }]
    : [])),
}));
vi.mock("../api/edge", () => ({ chamarEdgeFunction: vi.fn(async () => ({ ok: true, corpo: { dados: [] } })) }));
vi.mock("../api/noticias", () => ({ listarNoticiasNoApp: vi.fn(async () => ({ success: true, data: [{ id: 1, titulo: "Manutenção da piscina" }] })) }));
vi.mock("../api/supabase", () => ({ supabase: { rpc } }));

import InicioCapa from "../pages/InicioCapa";

const TABELAS = {
  UNIDADES: [{ id: 9, bloco: 2, unidade: 304, status: "Inadimplente" }, { id: 10, bloco: 1, unidade: 102 }],
  ENTREGAS: [
    { id: 1, nome: "Mercado Livre", data_entrada: `${dia(-6)}T12:00:00-03:00`, status: "Pendente", id_unidade: 9, cod: "A1" },
    { id: 2, nome: "Amazon", data_entrada: `${dia(-1)}T12:00:00-03:00`, status: "Pendente", id_unidade: 10 },
    { id: 3, nome: "Shopee", data_entrada: `${dia(-2)}T12:00:00-03:00`, status: "Entregue", data_saida: `${HOJE}T10:00:00-03:00` },
  ],
  FESTAS: [{ id: 1, data_reserva: dia(2), unidade_id: 9, status: "Agendado", valor_taxa: 300, pago: "Sim" }],
  CHURRASQUEIRA: [],
  MUDANCAS: [{ id: 1, data_mudanca: `${HOJE}T08:00:00-03:00`, id_unidade: 10, status: "Agendado", periodo: "08:00 às 12:00" }],
  AGENDAMENTOS: [],
  VAGAS: [{ possui_carro: "Sim", possui_moto: "Sim" }, { possui_carro: "Sim" }],
  TAREFAS: [],
};

const montar = (user) => render(<MemoryRouter><ThemeProvider><InicioCapa user={user} /></ThemeProvider></MemoryRouter>);

beforeEach(() => {
  navegar.mockReset();
  listarMock.mockReset().mockImplementation(async (t) => TABELAS[t] ?? []);
  rpc.mockReset().mockImplementation(async (nome) => {
    if (nome === "cadastros_para_aprovar") return { data: [{ id: 5, nome: "Fernanda", bloco: 4, unidade: "305", pedido_em: new Date().toISOString() }], error: null };
    if (nome === "portaria_por_dia") return { data: [{ dia: HOJE, entradas: 12, encomendas: 3, retiradas: 4 }, { dia: dia(-1), entradas: 20, encomendas: 2, retiradas: 1 }], error: null };
    if (nome === "agenda_da_portaria") return { data: [{ dia: HOJE, tipo: "mudanca", titulo: "Mudança", bloco: 1, unidade: 102, periodo: "08:00 às 12:00" }], error: null };
    return { data: [], error: null };
  });
});

describe("Início com capa: administração", () => {
  it("saúda pelo nome, mostra os números e o Modo foco com o pedido do app", async () => {
    montar({ nome: "Carla Menezes", cargo: "Sindico" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Carla\./);
    expect(await screen.findByText("1 pedido do app esperando aprovação. Comece pelo mais antigo.")).toBeInTheDocument();
    expect(screen.getByText("e 1 moto")).toBeInTheDocument();
    expect(screen.getByText("1 há mais de 3 dias")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Modo foco: 1 pedido do app esperando/ }));
    expect(navegar).toHaveBeenCalledWith("/modo-foco");
  });

  it("sem pedido esperando, a faixa continua abrindo o Modo foco: ela é a única porta para ele", async () => {
    rpc.mockImplementation(async () => ({ data: [], error: null }));
    montar({ nome: "Carla Menezes", cargo: "Sindico" });
    const faixa = await screen.findByRole("button", { name: "Modo foco: Nenhum pedido do app esperando. Tudo em dia." });
    expect(faixa).toHaveTextContent("Abrir Modo foco");
    await userEvent.click(faixa);
    expect(navegar).toHaveBeenCalledWith("/modo-foco");
  });

  it("as pendências levam para onde se resolve", async () => {
    montar({ nome: "Carla Menezes", cargo: "Sindico" });
    const pend = await screen.findByRole("button", { name: /1 encomenda há mais de 3 dias/ });
    expect(screen.getByRole("button", { name: /1 unidade inadimplente/ })).toBeInTheDocument();
    await userEvent.click(pend);
    expect(navegar).toHaveBeenCalledWith("/encomendas");
  });

  it("tem Abrir agenda, o último comunicado e troca o relatório pela aba", async () => {
    montar({ nome: "Carla Menezes", cargo: "Sindico" });
    expect(await screen.findByText("Último comunicado: “Manutenção da piscina”.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abrir agenda/ })).toBeInTheDocument();
    expect(screen.queryAllByLabelText("by VITTA")).toHaveLength(0); // o Diduccio não assina
    const mudancas = screen.getByRole("button", { name: "Mudanças" });
    await userEvent.click(mudancas);
    expect(mudancas).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: /^Mudanças em \d{4}/ })).toBeInTheDocument();

    // Clicar no ponto de janeiro mostra o mês e o valor; clicar de novo fecha.
    const jan = screen.getByRole("button", { name: /^Janeiro de \d{4}: / });
    await userEvent.click(jan);
    expect(screen.getByRole("status")).toHaveTextContent(/Janeiro de \d{4}/);
    expect(jan).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(jan);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("o sino abre os avisos do dia", async () => {
    montar({ nome: "Carla Menezes", cargo: "Sindico" });
    await screen.findByText(/pedido do app esperando/);
    await userEvent.click(screen.getByRole("button", { name: /aviso/ }));
    expect(screen.getByRole("dialog", { name: "Avisos de hoje" })).toBeInTheDocument();
  });
});

describe("Início com capa: portaria", () => {
  const PORTEIRO = { nome: "José Ribamar", cargo: "Porteiro" };

  it("não pede reserva, mudança nem tarefa: são da administração", async () => {
    montar(PORTEIRO);
    await screen.findByText(/encomenda esperando/);
    const lidas = listarMock.mock.calls.map(([t]) => t);
    for (const t of ["FESTAS", "CHURRASQUEIRA", "MUDANCAS", "AGENDAMENTOS", "TAREFAS", "VAGAS"]) expect(lidas).not.toContain(t);
    expect(rpc).toHaveBeenCalledWith("agenda_da_portaria", { p_de: HOJE, p_ate: dia(5) });
  });

  it("mostra quem está dentro, as retiradas de hoje e as encomendas paradas", async () => {
    montar(PORTEIRO);
    expect(await screen.findByText("entradas ativas · 2 visitantes, 1 prestador")).toBeInTheDocument();
    expect(screen.getByText("+3 que ontem")).toBeInTheDocument();
    expect(screen.getByText("1 encomenda esperando há mais de 3 dias. Avise os moradores pelo app.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mercado Livre · 2·304/ })).toBeInTheDocument();
  });

  it("relatórios de encomendas e de entradas e saídas, e a mudança de hoje", async () => {
    montar(PORTEIRO);
    await screen.findByText(/encomenda esperando/);
    expect(screen.getByRole("button", { name: "Encomendas" })).toBeInTheDocument();
    // Para o porteiro, o relatório abre em Entradas e Saídas.
    expect(screen.getByRole("button", { name: "Entradas e Saídas" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Receita" })).not.toBeInTheDocument();
    expect(screen.getByText("Mudança · 1·102")).toBeInTheDocument();
  });

  it("não tem Abrir agenda e o Fique por dentro leva às encomendas", async () => {
    montar(PORTEIRO);
    await screen.findByText(/encomenda esperando/);
    expect(screen.queryByRole("button", { name: /Abrir agenda/ })).not.toBeInTheDocument();
    expect(screen.getByText("Confira as últimas encomendas do condomínio.")).toBeInTheDocument();
    expect(screen.queryAllByLabelText("by VITTA")).toHaveLength(0); // o Diduccio não assina
    const dentro = screen.getByText("Fique por dentro!").closest("section");
    await userEvent.click(within(dentro).getByRole("button", { name: "Ver encomendas" }));
    expect(navegar).toHaveBeenCalledWith("/encomendas");
  });

  it("sem o 0083 no banco, as entradas mostram o traço em vez de zero", async () => {
    rpc.mockImplementation(async () => ({ data: null, error: { message: "function not found" } }));
    montar(PORTEIRO);
    expect(await screen.findByText("aguardando a atualização do banco")).toBeInTheDocument();
  });
});
