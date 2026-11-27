import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * Vagas no padrão do ViT: lista que abre, pílulas de TAG com contagem, bloco e
 * veículo no "Mais filtros", modal de ver para a vaga e para a TAG, e carro e
 * moto ligados por chave no cadastro.
 */

const mockListar = vi.fn();
vi.mock("../api/db", () => ({
  listar: (...a) => mockListar(...a),
  criar: vi.fn(),
  editar: vi.fn(),
  remover: vi.fn(),
}));

import Vagas from "../pages/Vagas";

const UNIDADES = [
  { id: 5206, bloco: "5", unidade: "206" },
  { id: 1101, bloco: "1", unidade: "101" },
];
const VAGAS = [
  { id: 1, id_unidade: 5206, possui_carro: "Sim", placa_carro: "ABC1D23", modelo_carro: "Gol", cor_carro: "Prata", status_carro: "Ativo", possui_moto: "Não" },
  { id: 2, id_unidade: 1101, possui_carro: "Não", possui_moto: "Sim", placa_moto: "XYZ9K88", modelo_moto: "CG 160", status_moto: "Ativo" },
];
const TAGS = [
  { id: 9, id_vagas: 1, id_unidade: 5206, veiculo: "Carro", status: "Aplicado", nome_solicitante: "ana lima", tipo_solicitante: "Proprietario", custo_total: 0 },
];

const SINDICO = { nome: "Lucas", cargo: "Sindico" };
const envolver = (el) => <ToastProvider><ConfirmProvider>{el}</ConfirmProvider></ToastProvider>;

describe("Vagas no padrão", () => {
  beforeEach(() => {
    mockListar.mockImplementation(async (t) => ({ VAGAS, UNIDADES, TAGS }[t] ?? []));
  });

  it("lista na ordem do prédio, com as pílulas de TAG contadas", async () => {
    render(envolver(<Vagas user={SINDICO} />));
    expect(await screen.findByText("B5-206")).toBeInTheDocument();
    const linhas = screen.getAllByRole("button", { name: /^Abrir a vaga da unidade/ });
    expect(linhas.map((l) => l.getAttribute("aria-label"))).toEqual([
      "Abrir a vaga da unidade B1-101",
      "Abrir a vaga da unidade B5-206",
    ]);

    await userEvent.click(screen.getByRole("button", { name: /^Sem TAG/ }));
    expect(screen.queryByText("B5-206")).not.toBeInTheDocument();
    expect(screen.getByText("B1-101")).toBeInTheDocument();
  });

  it("clicar na linha abre o ver da vaga, só leitura", async () => {
    render(envolver(<Vagas user={SINDICO} />));
    await userEvent.click(await screen.findByRole("button", { name: "Abrir a vaga da unidade B5-206" }));
    const modal = await screen.findByRole("dialog", { name: "Detalhes da vaga" });
    expect(within(modal).getByText("Gol")).toBeInTheDocument();
    expect(within(modal).getByText("Carro · Prata")).toBeInTheDocument();
    expect(within(modal).getByText("ABC1D23")).toBeInTheDocument();
    expect(within(modal).getByText("Ana Lima")).toBeInTheDocument();
    expect(within(modal).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(modal).getByRole("button", { name: /Editar/ })).toBeInTheDocument();
  });

  it("a TAG também abre no ver, com o veículo puxado da vaga", async () => {
    render(envolver(<Vagas user={SINDICO} />));
    await userEvent.click(await screen.findByRole("tab", { name: /TAGs/ }));
    expect(screen.getByText("Ana Lima")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Abrir a TAG da unidade B5-206" }));
    const modal = await screen.findByRole("dialog", { name: "Detalhes da TAG" });
    expect(within(modal).getByText("Gol")).toBeInTheDocument();
    expect(within(modal).getByText("Proprietário")).toBeInTheDocument();
  });

  it("no cadastro, carro e moto ligam por chave e só então pedem a placa", async () => {
    render(envolver(<Vagas user={SINDICO} />));
    await userEvent.click(await screen.findByRole("button", { name: "Nova vaga" }));
    const modal = await screen.findByRole("dialog", { name: "Nova vaga" });
    expect(within(modal).queryByPlaceholderText("ABC1D23")).not.toBeInTheDocument();
    await userEvent.click(within(modal).getByRole("switch", { name: /Possui carro/ }));
    expect(within(modal).getByPlaceholderText("ABC1D23")).toBeInTheDocument();
    expect(within(modal).getByRole("radio", { name: "Ativo" })).toHaveAttribute("aria-checked", "true");
  });

  it("o porteiro vê, mas não ganha lápis na vaga", async () => {
    render(envolver(<Vagas user={{ nome: "Zé", cargo: "Porteiro" }} />));
    await screen.findByText("B5-206");
    expect(screen.queryByRole("button", { name: /^Editar vaga/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Registrar TAG/ }).length).toBeGreaterThan(0);
  });
});
