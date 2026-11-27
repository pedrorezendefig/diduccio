import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * Agendamento no padrão do guia de marca: a agenda do dia continua (é o jeito
 * certo de marcar reunião), mas tocar num agendamento abre o VER (só
 * leitura), o Editar passa ao formulário, e o horário livre abre o NOVO com a
 * hora. As regras de antes seguem: conflito de horário e nome padronizado.
 */

// Datas relativas a hoje: a agenda abre no dia de hoje.
const d = new Date();
const HOJE = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const AGENDAMENTOS = [
  { id: 1, tipo: "Morador", id_unidade: 10, nome: "ana lima", telefone: "21999990000", data: HOJE,
    hora_inicio: "10:00", duracao: "1h", assunto: "Autorização de obra", obs: "", status: "Agendado" },
];

const mockCriar = vi.fn();
const mockEditar = vi.fn();
vi.mock("../api/db", () => ({
  listar: vi.fn((t) => Promise.resolve(
    t === "AGENDAMENTOS" ? AGENDAMENTOS : t === "UNIDADES" ? [{ id: 10, bloco: 5, unidade: 206 }] : [])),
  criar: (...a) => mockCriar(...a),
  editar: (...a) => mockEditar(...a),
  remover: vi.fn(() => Promise.resolve({ success: true })),
}));

import Agendamento from "../pages/Agendamento";

function montar() {
  return render(
    <MemoryRouter>
      <ThemeProvider><ToastProvider><ConfirmProvider>
        <Agendamento user={{ nome: "Marcelo", cargo: "Sindico" }} />
      </ConfirmProvider></ToastProvider></ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCriar.mockResolvedValue({ success: true });
  mockEditar.mockResolvedValue({ success: true });
});

describe("Agendamento no padrão do guia", () => {
  it("o agendamento abre o modal de ver, sem campo, e o Editar passa ao formulário", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: "Ver o agendamento de Ana Lima às 10:00" }));

    const ver = screen.getByRole("dialog", { name: "Detalhes do agendamento" });
    expect(within(ver).getByText("B5-206")).toBeInTheDocument();
    expect(within(ver).getByText("(21) 99999-0000")).toBeInTheDocument();
    expect(within(ver).queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(within(ver).getByRole("button", { name: /Editar/ }));
    const form = screen.getByRole("dialog", { name: "Editar agendamento" });
    expect(within(form).getByRole("radio", { name: "Agendado" })).toHaveAttribute("aria-checked", "true");
  });

  it("o horário livre abre o novo agendamento já com a hora", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: "Agendar às 14:00" }));

    const form = screen.getByRole("dialog", { name: "Novo agendamento" });
    expect(within(form).getByDisplayValue("14:00")).toBeInTheDocument();
  });

  it("horário ocupado mostra o conflito e não grava", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: "Agendar às 14:00" }));
    const form = screen.getByRole("dialog", { name: "Novo agendamento" });

    await user.click(within(form).getByRole("radio", { name: "Prestador" }));
    await user.type(within(form).getByLabelText(/^Nome/), "joão da silva");
    const hora = within(form).getByDisplayValue("14:00");
    await user.clear(hora);
    await user.type(hora, "10:30");
    await user.click(within(form).getByRole("button", { name: "Salvar" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(/Conflito/);
    expect(mockCriar).not.toHaveBeenCalled();
  });

  it("grava o nome como se escreve", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: "Agendar às 14:00" }));
    const form = screen.getByRole("dialog", { name: "Novo agendamento" });

    await user.click(within(form).getByRole("radio", { name: "Prestador" }));
    await user.type(within(form).getByLabelText(/^Nome/), "joão da silva");
    await user.click(within(form).getByRole("button", { name: "Salvar" }));

    expect(mockCriar).toHaveBeenCalledWith("AGENDAMENTOS", expect.objectContaining({
      nome: "João da Silva", tipo: "Prestador de Serviço", hora_inicio: "14:00", id_unidade: null,
    }));
  });
});
