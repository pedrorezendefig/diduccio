import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * O contrato só sai com o comprovante de pagamento anexado.
 *
 * Trava de TELA, para hoje: antes do app do morador, o comprovante é qualquer
 * anexo ligado à reserva em `uploads_festas` / `uploads_churrasqueira`. Sem
 * anexo, "Gerar Contrato" avisa e não gera; anexado, gera.
 */

const mockListar = vi.fn();
vi.mock("../api/db", () => ({
  listar: (...a) => mockListar(...a),
  criar: vi.fn(), editar: vi.fn(), remover: vi.fn(),
}));
vi.mock("../api/anexos", () => ({
  enviarAnexo: vi.fn(),
  urlDoAnexo: async () => "https://bucket.local/assinada",
  urlsDosAnexos: async (cs) => new Map((cs ?? []).filter(Boolean).map((c) => [c, "https://bucket.local/assinada"])),
  removerAnexo: vi.fn(),
  removerAnexosDoRegistro: vi.fn(),
  arquivoDoApp: (c) => String(c ?? "").startsWith("reservas-morador/"),
}));

// O PDF em si não interessa aqui, só se ele foi gerado.
const mockSalvar = vi.fn();
const mockTexto = vi.fn();
vi.mock("jspdf", () => {
  const doc = new Proxy({}, {
    get: (_, chave) => {
      if (chave === "save") return mockSalvar;
      if (chave === "text") return (...a) => { mockTexto(...a); return doc; };
      if (chave === "internal") return { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
      if (chave === "splitTextToSize") return (t) => [String(t)];
      if (chave === "getTextWidth") return () => 10;
      if (chave === "lastAutoTable") return { finalY: 100 };
      if (chave === "then") return undefined;
      return () => doc;
    },
  });
  return { jsPDF: function jsPDF() { return doc; } };
});
vi.mock("jspdf-autotable", () => ({ default: vi.fn() }));

const Festas = (await import("../pages/Festas")).default;
const Churrasqueira = (await import("../pages/Churrasqueira")).default;

const RESERVA = {
  id: 77, data_reserva: "2026-05-16", unidade_id: 1504, morador: "Fulano de Teste",
  status: "Pendente", cpf: "000.000.000-00", contato: "(21) 90000-0000", valor_taxa: 100,
  rg: "00.000.000-0", churrasqueira: "CH-A",
};

function dados(comComprovante) {
  return (tabela) => {
    if (tabela === "FESTAS" || tabela === "CHURRASQUEIRA") return Promise.resolve([RESERVA]);
    if (tabela === "UNIDADES") return Promise.resolve([{ id: 1504, bloco: 15, unidade: 4 }]);
    if (tabela === "MORADORES") return Promise.resolve([]);
    return Promise.resolve(comComprovante
      ? [{ id: 1, id_festa: RESERVA.id, nome_arquivo: "pix.pdf", caminho_storage: "festas/77/pix.pdf" }]
      : []);
  };
}

function montar(Pagina) {
  return render(
    <MemoryRouter>
      <ThemeProvider><ToastProvider><ConfirmProvider>
        <Pagina user={{ nome: "Marcelo Tavares", cargo: "Sindico" }} />
      </ConfirmProvider></ToastProvider></ThemeProvider>
    </MemoryRouter>
  );
}

/** Abre o menu da reserva e devolve o item "Gerar Contrato", sem clicar. */
/** O contrato sai do modal de ver a reserva (guia de marca, 2026-11-04). */
async function abrirMenu(user) {
  await user.click(await screen.findByRole("button", { name: "Ver reserva de Fulano de Teste" }));
  const detalhe = await screen.findByRole("dialog", { name: "Detalhes da reserva" });
  return within(detalhe).getByRole("button", { name: /^Gerar contrato/ });
}

beforeEach(() => vi.clearAllMocks());

describe.each([["Salão de festas", Festas], ["Churrasqueira", Churrasqueira]])("%s", (_, Pagina) => {
  // Status provisório de tela: some quando o app do morador for lançado.
  it("pendente sem comprovante aparece como Falta Pagamento", async () => {
    mockListar.mockImplementation(dados(false));
    montar(Pagina);
    // A pílula do filtro existe antes de a reserva chegar: espera a linha.
    await screen.findAllByRole("button", { name: /Ver reserva de Fulano de Teste/ });
    expect(screen.getAllByText("Falta Pagamento").length).toBeGreaterThan(1); // pílula + selo
  });

  it("com comprovante volta a ser o status gravado", async () => {
    mockListar.mockImplementation(dados(true));
    montar(Pagina);
    await screen.findAllByRole("button", { name: /Ver reserva de Fulano de Teste/ });
    // Só a pílula do filtro: nenhum selo de reserva.
    expect(screen.getAllByText("Falta Pagamento")).toHaveLength(1);
  });

  it("sem comprovante: não gera, avisa e o item aparece travado", async () => {
    mockListar.mockImplementation(dados(false));
    const user = userEvent.setup();
    montar(Pagina);
    const item = await abrirMenu(user);
    // O menu fecha no clique: a dica se confere antes.
    expect(item.classList.contains("res-contrato--travado")).toBe(true);
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.textContent).toContain("anexe o comprovante");

    await user.click(item);
    expect(mockSalvar).not.toHaveBeenCalled();
    expect(await screen.findByText("Anexe o comprovante de pagamento para gerar o contrato.")).toBeTruthy();
  });

  it("com comprovante anexado: gera o contrato", async () => {
    mockListar.mockImplementation(dados(true));
    const user = userEvent.setup();
    montar(Pagina);
    const item = await abrirMenu(user);
    expect(item.classList.contains("res-contrato--travado")).toBe(false);
    expect(item.textContent).not.toContain("anexe o comprovante");

    // Antes de gerar, a tela pergunta o documento (RG ou CPF).
    await user.click(item);
    const escolha = await screen.findByRole("dialog", { name: "Gerar contrato" });
    expect(within(escolha).getByRole("radio", { name: "RG" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(escolha).getByRole("button", { name: /^Gerar$/ }));
    expect(mockSalvar).toHaveBeenCalledTimes(1);
  });

  it("o botão de contrato da linha (Ações) abre a mesma escolha", async () => {
    mockListar.mockImplementation(dados(true));
    const user = userEvent.setup();
    montar(Pagina);
    await user.click(await screen.findByRole("button", { name: "Gerar contrato de Fulano de Teste" }));
    const escolha = await screen.findByRole("dialog", { name: "Gerar contrato" });
    await user.click(within(escolha).getByRole("button", { name: /^Gerar$/ }));
    expect(mockSalvar).toHaveBeenCalledTimes(1);
  });

  it("sem comprovante, o botão da linha avisa e não gera", async () => {
    mockListar.mockImplementation(dados(false));
    const user = userEvent.setup();
    montar(Pagina);
    const botao = await screen.findByRole("button", { name: /^Gerar contrato de Fulano de Teste \(anexe o comprovante\)/ });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    await user.click(botao);
    expect(mockSalvar).not.toHaveBeenCalled();
    expect(await screen.findByText("Anexe o comprovante de pagamento para gerar o contrato.")).toBeTruthy();
  });

  it("o contrato sai com o documento escolhido", async () => {
    mockListar.mockImplementation(dados(true));
    const user = userEvent.setup();
    montar(Pagina);
    await user.click(await abrirMenu(user));
    const escolha = await screen.findByRole("dialog", { name: "Gerar contrato" });
    await user.click(within(escolha).getByRole("radio", { name: "CPF" }));
    await user.click(within(escolha).getByRole("button", { name: /^Gerar$/ }));

    // O contrato escreve palavra por palavra: junta e tira o espaço dobrado.
    const escrito = mockTexto.mock.calls.map((c) => String(c[0])).join(" ").replace(/\s+/g, " ");
    expect(escrito).toContain("portador do CPF");
    expect(escrito).toContain(RESERVA.cpf);
    expect(escrito).not.toContain("portador do RG");
  });
});
