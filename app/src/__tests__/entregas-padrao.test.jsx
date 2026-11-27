import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * Entradas e Saídas no padrão do ViT: a lista que abre e o modal de ver da
 * entrada, com a saída como ação principal.
 */

const AGORA = new Date().toISOString();
const DENTRO = {
  id: 7, nome: "CARLOS ENTREGADOR", cpf: "12345678901", tipo: "ENTREGADOR",
  bloco: "5", apartamento: "206", liberado_por: "Ana", veiculo: "Moto", placa: "ABC1D23",
  horario_entrada: AGORA, created_by: "Zé", minutos_permitidos: 15,
};

vi.mock("../api/db", () => ({
  listar: vi.fn(async () => []),
  listarTudo: vi.fn(async () => []),
  listarChegadas: vi.fn(async () => [DENTRO]),
  buscarUm: vi.fn(async () => null),
  criar: vi.fn(),
  editar: vi.fn(async () => ({ success: true })),
  remover: vi.fn(),
}));

import Entregas from "../pages/Entregas";

const envolver = (el) => <ToastProvider><ConfirmProvider>{el}</ConfirmProvider></ToastProvider>;

describe("Entradas e Saídas no padrão", () => {
  it("a linha mostra destino curto e o porteiro, e abre o ver da entrada", async () => {
    render(envolver(<Entregas user={{ nome: "Zé", cargo: "Sindico" }} />));
    const linha = await screen.findByRole("button", { name: "Abrir a entrada de CARLOS ENTREGADOR" });
    expect(within(linha).getByText("B5-206")).toBeInTheDocument();
    expect(within(linha).getByText("Zé")).toBeInTheDocument();

    await userEvent.click(linha);
    const ver = await screen.findByRole("dialog", { name: "Detalhes da entrada" });
    // O crachá (à esquerda, como a foto em Encomendas) e a ficha dizem quem liberou.
    expect(within(ver).getByRole("complementary", { name: "Crachá da entrada" })).toBeInTheDocument();
    expect(within(ver).getAllByText("Ana").length).toBeGreaterThan(0);
    expect(within(ver).getByText("***.456.789-**")).toBeInTheDocument();
    expect(within(ver).getByRole("button", { name: /Registrar saída/ })).toBeInTheDocument();
    expect(within(ver).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("na linha ficam o olho e a saída; excluir mora no ver", async () => {
    render(envolver(<Entregas user={{ nome: "Zé", cargo: "Sindico" }} />));
    await screen.findByRole("button", { name: "Abrir a entrada de CARLOS ENTREGADOR" });
    expect(screen.getByRole("button", { name: "Ver a entrada de CARLOS ENTREGADOR" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar saída de CARLOS ENTREGADOR" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Excluir chegada/ })).not.toBeInTheDocument();
  });
});
