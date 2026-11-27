import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider } from "../ui";
import { ConfirmProvider } from "../ui/Confirm";
import Comunicado from "../pages/Comunicado";
import * as noticias from "../api/noticias";

// O banco das notícias (0079) fica de fora: aqui se confere o que a tela
// manda. Quem pode publicar é o banco que decide (verificar-noticias).
vi.mock("../api/noticias", () => ({
  listarNoticiasNoApp: vi.fn(async () => ({ success: true, data: [] })),
  publicarNoticia: vi.fn(async () => ({ success: true, id: 1 })),
  fixarNoticia: vi.fn(async () => ({ success: true })),
  retirarNoticia: vi.fn(async () => ({ success: true })),
}));

/**
 * A folha do comunicado precisa continuar A4 em qualquer largura de tela: é
 * o que garante que a prévia mostre o mesmo que sai no PDF e na imagem. E as
 * cores dela não podem seguir o tema — a folha é papel branco impresso.
 */

function montar() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Comunicado />
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  noticias.listarNoticiasNoApp.mockResolvedValue({ success: true, data: [] });
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({ json: () => Promise.resolve({ success: true, texto: "" }) })
  );
});

describe("Comunicado", () => {
  it("a folha mantém a largura de um A4, não a da tela", () => {
    const { container } = montar();
    // 794px = A4 a 96dpi. Encolher acontece por transform, nunca mudando a
    // largura: mudar a largura reflui o texto e a prévia deixa de bater com
    // o arquivo exportado.
    const folha = container.querySelector('[style*="794px"]');
    expect(folha).toBeInTheDocument();
  });

  it("o texto da folha não usa cor de tema", () => {
    const { container } = montar();
    const html = container.innerHTML;
    // No tema escuro var(--fg-default) é quase branco: sobre a folha branca
    // o comunicado ficava invisível, e saía assim no PDF.
    expect(html).not.toContain("var(--fg-default)");
  });

  it("exportar é um botão visível, não um menu escondido", async () => {
    montar();
    expect(screen.getByRole("button", { name: /Exportar/ })).toBeInTheDocument();
  });

  it("o modal oferece PDF, JPEG, compartilhar e imprimir", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: /Exportar/ }));

    expect(screen.getByRole("button", { name: /Baixar PDF/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Baixar JPEG/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Compartilhar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Imprimir/ })).toBeInTheDocument();
  });

  it("as opções de exportação são alcançáveis pelo teclado", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: /Exportar/ }));

    // Eram <div onClick>: não recebiam foco nem respondiam ao Enter.
    document.querySelectorAll("button.com-saida").forEach((b) => {
      expect(b.tagName).toBe("BUTTON");
    });
    expect(document.querySelectorAll("button.com-saida").length).toBe(4);
  });
});

describe("Comunicado: publicar no app do morador", () => {
  const NO_APP = [
    { id: 7, titulo: "Obra na garagem", fixada: true, publicada_em: "2026-11-04T01:30:00Z", caminho_pdf: "noticias/7/1-comunicado.pdf" },
    { id: 6, titulo: "Dedetização", fixada: false, publicada_em: "2026-10-30T13:00:00Z", caminho_pdf: null },
  ];

  it("sem título não abre a publicação", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: /Publicar no app/ }));
    expect(await screen.findByText("Escreva o título do comunicado antes de publicar.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Publicar no app do morador" })).not.toBeInTheDocument();
    expect(noticias.publicarNoticia).not.toHaveBeenCalled();
  });

  it("lista o que está no app, com a data de Brasília e o PDF", async () => {
    noticias.listarNoticiasNoApp.mockResolvedValue({ success: true, data: NO_APP });
    montar();
    const lista = await screen.findByRole("region", { name: "No app do morador" });
    expect(await within(lista).findByText("Obra na garagem")).toBeInTheDocument();
    // 01:30 em UTC do dia 4 ainda é dia 3 em Brasília.
    expect(within(lista).getByText(/03\/11\/2026 · com PDF/)).toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: "Desafixar Obra na garagem" })).toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: "Fixar Dedetização" })).toBeInTheDocument();
  });

  it("fixar e retirar (com confirmação) chamam o banco e recarregam", async () => {
    const user = userEvent.setup();
    noticias.listarNoticiasNoApp.mockResolvedValue({ success: true, data: NO_APP });
    montar();
    const lista = await screen.findByRole("region", { name: "No app do morador" });

    await user.click(await within(lista).findByRole("button", { name: "Fixar Dedetização" }));
    expect(noticias.fixarNoticia).toHaveBeenCalledWith(6, true);

    await user.click(within(lista).getByRole("button", { name: "Retirar Dedetização" }));
    const confirma = await screen.findByRole("dialog", { name: /Retirar "Dedetização" do app\?/ });
    expect(noticias.retirarNoticia).not.toHaveBeenCalled();
    await user.click(within(confirma).getByRole("button", { name: "Retirar" }));
    await waitFor(() => expect(noticias.retirarNoticia).toHaveBeenCalledWith(6));
    await waitFor(() => expect(noticias.listarNoticiasNoApp.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it("erro ao ler a lista não quebra a tela", async () => {
    noticias.listarNoticiasNoApp.mockResolvedValue({ success: false, data: [] });
    montar();
    expect(await screen.findByText("Não foi possível ver as notícias do app agora.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exportar/ })).toBeInTheDocument();
  });
});
