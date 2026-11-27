import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider } from "../ui/Toast";
import { ConfirmProvider } from "../ui/Confirm";

/**
 * Encomendas na portaria, o fluxo novo (2026-10-22): abas por onde a encomenda
 * está, a faixa do depósito (5 dias, em lote), a coluna de aviso (app ou
 * WhatsApp) e o recebimento em passos.
 */
const DIA = 86_400_000;
const { tabelas, rpc } = vi.hoisted(() => ({ tabelas: {}, rpc: vi.fn() }));
vi.mock("../api/db", () => ({
  listar: vi.fn(async (t) => tabelas[t] ?? []),
  criar: vi.fn(async () => ({ success: true, data: { id: 99 } })),
  editar: vi.fn(async () => ({ success: true })),
  remover: vi.fn(async () => ({ success: true })),
}));
vi.mock("../api/supabase", () => ({ supabase: { rpc } }));
vi.mock("../api/anexos", () => ({ enviarAnexo: vi.fn(), urlDoAnexo: vi.fn(async () => null), urlsDosAnexos: vi.fn(async () => new Map()), removerAnexo: vi.fn() }));

import Encomendas from "../pages/Encomendas";
import { editar } from "../api/db";

const USUARIO = { id: "p", nome: "Porteiro João", cargo: "Porteiro" };

beforeEach(() => {
  localStorage.clear();
  rpc.mockReset().mockResolvedValue({ data: [{ unidade_id: 7, nomes: ["Lucas", "Marina"] }], error: null });
  Object.assign(tabelas, {
    UNIDADES: [{ id: 7, bloco: 5, unidade: 206 }, { id: 8, bloco: 3, unidade: 104 }],
    MORADORES: [],
    ENTREGAS: [
      { id: 1, id_unidade: 7, nome: "Lucas Moraes", status: "Pendente", quantidade_encomenda: "2", numero_encomenda: "0427B", cod: "7KQ3M", data_entrada: new Date().toISOString(), notificado: "NAO" },
      { id: 2, id_unidade: 8, nome: "Ana Souza", status: "Pendente", quantidade_encomenda: "1", numero_encomenda: "0419A", cod: "H8RWZ", data_entrada: new Date(Date.now() - 6 * DIA).toISOString(), notificado: "NAO" },
    ],
  });
});

const montar = () =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Encomendas user={USUARIO} />
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>
  );

describe("o painel", () => {
  it("abas por onde a encomenda está, e a de 5 dias conta para o depósito", async () => {
    montar();
    expect(await screen.findByRole("tab", { name: /Para o depósito/ })).toHaveTextContent("1");
    for (const aba of ["Na portaria", "No depósito", "Entregues hoje", "Todas"]) {
      expect(screen.getByRole("tab", { name: new RegExp(aba) })).toBeInTheDocument();
    }
  });

  it("a coluna de aviso diz quem recebe no app e quem falta avisar", async () => {
    montar();
    expect((await screen.findAllByText("No app · 2 moradores")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sem app").length).toBeGreaterThan(0);
  });

  it("levar ao depósito em lote: quem levou já vem com o nome de quem está logado", async () => {
    const user = userEvent.setup();
    montar();
    expect(await screen.findByText(/1 encomenda está há 5 dias ou mais na portaria/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Levar ao depósito" }));
    expect(screen.getByRole("dialog", { name: "Levar ao depósito" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Digite o nome completo")).toHaveValue("Porteiro João");
    await user.type(screen.getByPlaceholderText(/Prateleira 3/), "Depósito do subsolo");
    await user.click(screen.getByRole("button", { name: /Confirmar depósito/ }));
    expect(editar).toHaveBeenCalledWith("ENTREGAS", "2", expect.objectContaining({ status: "Armazenado", armazenado_local: "Depósito do subsolo", armazenado_por: "Porteiro João" }));
    expect(editar).not.toHaveBeenCalledWith("ENTREGAS", "1", expect.anything());
  });
});

describe("o recebimento", () => {
  it("começa pelo apartamento: sem ele, não passa para os volumes", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: "Novo recebimento" }));
    const passos = screen.getByLabelText("Passos do recebimento");
    expect(within(passos).getByText(/Apartamento/).closest("span")).toHaveAttribute("aria-current", "step");
    await user.click(screen.getByRole("button", { name: "Continuar: volumes" }));
    expect(screen.getByText("Selecione a unidade destinatária.")).toBeInTheDocument();
    expect(screen.queryByText(/Quantidade de Encomendas/)).not.toBeInTheDocument();
  });
});

describe("a lista e o detalhe no padrão do guia", () => {
  it("o olho abre o detalhe, só de leitura, com a entrega no rodapé", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: "Ver a encomenda de Lucas Moraes" }));

    const detalhe = screen.getByRole("dialog", { name: "Detalhes da encomenda" });
    expect(within(detalhe).getAllByText("0427B", { exact: false }).length).toBeGreaterThan(0);
    expect(within(detalhe).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(detalhe).getByRole("button", { name: /Confirmar entrega/ })).toBeEnabled();
    // Porteiro não edita nem exclui: os botões nem aparecem.
    expect(within(detalhe).queryByRole("button", { name: /^Editar/ })).not.toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: /^Excluir/ })).not.toBeInTheDocument();
  });

  it("a linha inteira também abre o detalhe", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: /^Abrir a encomenda de Ana Souza/ }));
    expect(screen.getByRole("dialog", { name: "Detalhes da encomenda" })).toBeInTheDocument();
  });
});
