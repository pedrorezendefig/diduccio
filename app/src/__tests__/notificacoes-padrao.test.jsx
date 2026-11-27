import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * Notificações e multas no padrão do ViT: lista que abre, pílulas de tipo com
 * contagem, unidade pela busca do sistema e reincidência na chave.
 */

const mockListar = vi.fn();
const mockCriar = vi.fn();
vi.mock("../api/db", () => ({
  listar: (...a) => mockListar(...a),
  criar: (...a) => mockCriar(...a),
  editar: vi.fn(),
  remover: vi.fn(),
}));
const mockRpc = vi.fn(async () => ({ data: [], error: null }));
vi.mock("../api/supabase", () => ({ supabase: { rpc: (...a) => mockRpc(...a) } }));
vi.mock("../api/edge", () => ({ chamarEdgeFunction: vi.fn(), mensagemDaEdgeFunction: () => "falhou" }));

import Notificacoes from "../pages/Notificacoes";

const UNIDADES = [{ id: 5206, bloco: "5", unidade: "206" }, { id: 1101, bloco: "1", unidade: "101" }];
const REGISTROS = [
  { id: 1, tipo: "NOTIFICACAO", id_unidade: 5206, destinatario: "ana lima", assunto: "Barulho após as 22h", descricao: "Som alto", created_at: "2026-10-01T10:00:00Z" },
  { id: 2, tipo: "MULTA", id_unidade: 1101, destinatario: "João Pedro", assunto: "Obra sem ART", descricao: "Obra", created_at: "2026-10-05T10:00:00Z", multa_valor: 150 },
];

const USUARIO = { nome: "Lucas", cargo: "Sindico" };
const envolver = (el) => <ToastProvider><ConfirmProvider>{el}</ConfirmProvider></ToastProvider>;

describe("Notificações e multas no padrão", () => {
  beforeEach(() => {
    mockListar.mockImplementation(async (t) => (t === "NOTIFICACOES" ? REGISTROS : t === "UNIDADES" ? UNIDADES : []));
  });

  it("lista com a unidade curta, as pílulas com contagem e o filtro de tipo", async () => {
    render(envolver(<Notificacoes user={USUARIO} />));
    expect(await screen.findByText("B5-206")).toBeInTheDocument();
    expect(screen.getByText("Ana Lima")).toBeInTheDocument();
    expect(screen.getByText(/1 notificações · 1 multas/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Multas/ }));
    expect(screen.queryByText("B5-206")).not.toBeInTheDocument();
    expect(screen.getByText("B1-101")).toBeInTheDocument();
  });

  it("clicar na linha abre o detalhe com quem recebe", async () => {
    render(envolver(<Notificacoes user={USUARIO} />));
    await userEvent.click(await screen.findByRole("button", { name: "Ver a multa de B1-101" }));
    const modal = await screen.findByRole("dialog", { name: "Multa · B1-101" });
    // No topo do detalhe e na ficha "Registro", como no detalhe de Encomendas.
    expect(within(modal).getAllByText("João Pedro").length).toBe(2);
    expect(within(modal).getByText("E-mail para a administradora")).toBeInTheDocument();
    // Só o X do modal fecha: o rodapé não repete um "Fechar".
    expect(within(modal).getAllByRole("button", { name: "Fechar" })).toHaveLength(1);
    expect(within(modal).queryByRole("button", { name: /Imprimir/ })).not.toBeInTheDocument();
  });

  it("no cadastro, a unidade vem da busca e a reincidência é uma chave", async () => {
    render(envolver(<Notificacoes user={USUARIO} />));
    await userEvent.click(await screen.findByRole("button", { name: "Nova notificação" }));
    const modal = await screen.findByRole("dialog", { name: "Nova notificação" });
    expect(within(modal).getByRole("radio", { name: "Notificação" })).toHaveAttribute("aria-checked", "true");

    const campoUnidade = within(modal).getByPlaceholderText(/Digite 5206/);
    await userEvent.type(campoUnidade, "5206");
    await userEvent.click(within(within(modal).getByRole("listbox")).getByRole("button", { name: /B5-206/ }));
    // A unidade já tem uma notificação: aparece a pergunta da reincidência.
    expect(within(modal).getByRole("switch", { name: /É reincidência/ })).toBeInTheDocument();
  });

  it("o destinatário sugere também quem usa o app (teste e2e de 12/11)", async () => {
    mockListar.mockImplementation(async (t) => (
      t === "NOTIFICACOES" ? REGISTROS : t === "UNIDADES" ? UNIDADES
        : t === "MORADORES" ? [{ id: 7, id_unidade: 5206, nome: "Ana Lima" }] : []));
    mockRpc.mockResolvedValueOnce({ data: [{ unidade_id: 5206, nomes: ["Teste Claude", "ana lima"] }], error: null });
    render(envolver(<Notificacoes user={USUARIO} />));
    await userEvent.click(await screen.findByRole("button", { name: "Nova notificação" }));
    const modal = await screen.findByRole("dialog", { name: "Nova notificação" });
    await userEvent.type(within(modal).getByPlaceholderText(/Digite 5206/), "5206");
    await userEvent.click(within(within(modal).getByRole("listbox")).getByRole("button", { name: /B5-206/ }));

    expect(mockRpc).toHaveBeenCalledWith("moradores_com_app");
    const opcoes = [...document.querySelectorAll("#notif-moradores option")].map((o) => [o.value, o.getAttribute("label")]);
    // Do cadastro primeiro; do app depois, sem repetir quem já está no cadastro.
    expect(opcoes).toEqual([["Ana Lima", null], ["Teste Claude", "Usa o app"]]);
    expect(within(modal).queryByText(/Nenhum morador cadastrado nesta unidade/)).not.toBeInTheDocument();
  });
});
