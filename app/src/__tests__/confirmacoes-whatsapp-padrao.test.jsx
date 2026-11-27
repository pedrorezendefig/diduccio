import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * A fila de WhatsApp de Confirmações no padrão do ViT: busca e pílulas de
 * status com contagem, a lista que abre e as marcações dentro do ver.
 */

vi.mock("../api/db", () => ({
  listar: vi.fn(async (t) => ({
    MORADORES: [
      { id: 1, id_unidade: 5206, nome: "Ana Lima", telefone: "11987654321", tipo_morador: "Titular" },
      { id: 2, id_unidade: 1101, nome: "Bruno Reis", telefone: "11912345678", tipo_morador: "Titular" },
    ],
    UNIDADES: [{ id: 5206, bloco: "5", unidade: "206" }, { id: 1101, bloco: "1", unidade: "101" }],
    CONFIRMACAO: [{ id: 9, id_morador: 2, status: "Confirmado", data_envio: "2026-10-01T12:00:00Z" }],
  }[t] ?? [])),
  criar: vi.fn(async () => ({ success: true })),
  editar: vi.fn(async () => ({ success: true })),
}));

import FilaWhatsapp from "../components/confirmacoes/FilaWhatsapp";

const envolver = (el) => <ToastProvider><ConfirmProvider>{el}</ConfirmProvider></ToastProvider>;

describe("Fila de WhatsApp no padrão", () => {
  it("as pílulas contam e filtram o status", async () => {
    render(envolver(<FilaWhatsapp user={{ nome: "Zé", cargo: "Sindico" }} />));
    await screen.findByText("Ana Lima");
    expect(screen.getByRole("button", { name: /^Confirmados/ })).toHaveTextContent("1");
    await userEvent.click(screen.getByRole("button", { name: /^Sem envio/ }));
    expect(screen.getByText("Ana Lima")).toBeInTheDocument();
    expect(screen.queryByText("Bruno Reis")).not.toBeInTheDocument();
  });

  it("a linha abre o ver, com o telefone grande e as marcações no rodapé", async () => {
    render(envolver(<FilaWhatsapp user={{ nome: "Zé", cargo: "Sindico" }} />));
    await userEvent.click(await screen.findByRole("button", { name: "Abrir a confirmação de Ana Lima" }));
    const ver = await screen.findByRole("dialog", { name: "Confirmação do titular" });
    expect(within(ver).getByText("(11) 98765-4321")).toBeInTheDocument();
    for (const nome of ["Sem resposta", "Alterar número", "Confirmado", "Enviar mensagem"]) {
      expect(within(ver).getByRole("button", { name: nome })).toBeInTheDocument();
    }
  });
});
