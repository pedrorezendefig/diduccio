import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * A Churrasqueira para o porteiro, só leitura (0120, 23/11/2026). Ele não lê
 * a tabela: os dados vêm da `churrasqueira_da_portaria`, sem CPF, RG,
 * telefone, valor e comprovantes.
 */
const mockListar = vi.fn();
const mockEditar = vi.fn();
vi.mock("../api/db", () => ({
  listar: (...a) => mockListar(...a),
  criar: vi.fn(),
  editar: (...a) => mockEditar(...a),
  remover: vi.fn(),
}));
const mockRpc = vi.fn();
vi.mock("../api/supabase", () => ({ supabase: { rpc: (...a) => mockRpc(...a) } }));

const Churrasqueira = (await import("../pages/Churrasqueira")).default;

const RESERVA = {
  id: 7, data_reserva: "2099-12-20", unidade_id: 10, morador: "ana souza", status: "Agendado",
  convidados: 25, churrasqueira: "CH-A", pago: "Sim", divergencia_local: null, obs: "Levar a chave às 10h",
  tem_comprovante: true,
};

function montar(cargo) {
  return render(
    <MemoryRouter>
      <ThemeProvider><ToastProvider><ConfirmProvider>
        <Churrasqueira user={{ nome: "Teste", cargo }} />
      </ConfirmProvider></ToastProvider></ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockListar.mockReset();
  mockEditar.mockReset();
  mockRpc.mockReset();
  mockListar.mockImplementation(async (t) => (t === "UNIDADES" ? [{ id: 10, bloco: 3, unidade: 204 }] : []));
  mockRpc.mockResolvedValue({ data: [RESERVA], error: null });
});

describe("Churrasqueira: o porteiro só vê", () => {
  it("lê pela função da portaria, nunca a tabela nem os comprovantes", async () => {
    montar("Porteiro");
    expect(await screen.findByText("Ana Souza")).toBeInTheDocument();
    expect(mockRpc).toHaveBeenCalledWith("churrasqueira_da_portaria");
    const tabelas = mockListar.mock.calls.map((c) => c[0]);
    expect(tabelas).not.toContain("CHURRASQUEIRA");
    expect(tabelas).not.toContain("UPLOADS_CHURRASQUEIRA");
    expect(tabelas).not.toContain("MORADORES");
    // O status automático (Agendado → Realizado) grava: não roda para ele.
    expect(mockEditar).not.toHaveBeenCalled();
  });

  it("sem Nova reserva, Exportar, Contrato, Editar nem Valor", async () => {
    montar("Porteiro");
    await screen.findByText("Ana Souza");
    expect(screen.getByText("Só leitura")).toBeInTheDocument();
    for (const nome of [/Nova reserva/, /Exportar/, /Contrato em branco/, /Editar reserva/, /Gerar contrato/]) {
      expect(screen.queryByRole("button", { name: nome })).toBeNull();
    }
    expect(screen.queryByText("Valor")).toBeNull();
    // Com comprovante, a situação é a do banco (não "Falta Pagamento").
    expect(screen.getAllByText("Agendado").length).toBeGreaterThan(0);
  });

  it("o ver mostra a reserva sem documentos nem ações", async () => {
    montar("Porteiro");
    await screen.findByText("Ana Souza");
    await userEvent.click(screen.getByRole("button", { name: "Ver reserva de Ana Souza" }));
    const d = within(screen.getByRole("dialog", { name: "Detalhes da reserva" }));
    expect(d.getByText("Levar a chave às 10h")).toBeInTheDocument();
    expect(d.getByText("Comprovante anexado pela administração.")).toBeInTheDocument();
    expect(d.queryByText("CPF")).toBeNull();
    expect(d.queryByText("Telefone")).toBeNull();
    expect(d.queryByText("Valor da taxa")).toBeNull();
    expect(d.queryByRole("button", { name: /Editar|Excluir|Gerar contrato/ })).toBeNull();
    expect(d.getAllByRole("button", { name: "Fechar" }).length).toBeGreaterThan(0);
  });

  it("a administração continua com a tela de sempre", async () => {
    mockListar.mockImplementation(async (t) => (t === "CHURRASQUEIRA" ? [{ ...RESERVA, cpf: "11122233344", valor_taxa: 80 }] : t === "UNIDADES" ? [{ id: 10, bloco: 3, unidade: 204 }] : []));
    montar("Sindico");
    await screen.findByText("Ana Souza");
    expect(mockRpc).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Nova reserva/ })).toBeInTheDocument();
  });
});

describe("o menu", () => {
  it("mostra Churrasqueira ao porteiro", () => {
    const sidebar = (readFileSync("src/components/Sidebar.jsx", "utf8") + readFileSync("src/auth/menu.js", "utf8"));
    expect(sidebar).toContain("Churrasqueira: [ROLES.PORTEIRO, ROLES.SINDICO, ROLES.AUX, ROLES.DEV]");
  });
});
