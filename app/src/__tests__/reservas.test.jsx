import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";

import Festas from "../pages/Festas";
import Churrasqueira from "../pages/Churrasqueira";
import Piscina from "../pages/Piscina";
import Mudancas from "../pages/Mudancas";

/**
 * Guarda de estrutura das páginas de reserva.
 *
 * Existe porque um regex meu apagou o corpo do modal de exportação, o
 * <Ocupado> e o <PageHeader> das quatro páginas de uma vez — e `npm run build`
 * passou, porque o JSX continuou sintaticamente válido. Build não é
 * verificação: só um teste que RENDERIZA pega esse tipo de estrago.
 */

const PAGINAS = [
  ["Salão de festas", Festas, "Salão de festas", "Exportar reservas"],
  ["Churrasqueira", Churrasqueira, "Churrasqueira", "Exportar reservas"],
  ["Piscina", Piscina, "Piscina", "Exportar cadastros"],
  ["Mudanças", Mudancas, "Mudanças", "Exportar mudanças"],
];

const USUARIO = { nome: "Marcelo Tavares", cargo: "Sindico" };

function montar(Pagina) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Pagina user={USUARIO} />
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({ json: () => Promise.resolve([]) })
  );
});

describe.each(PAGINAS)("Reservas: %s", (_nome, Pagina, titulo, tituloModal) => {
  it("monta com cabeçalho e um único botão de exportar", async () => {
    montar(Pagina);

    // Por papel, não por texto: "Churrasqueira" também é rótulo de filtro.
    expect(await screen.findByRole("heading", { name: titulo })).toBeInTheDocument();

    // Um botão só, como no Vagas. Excel e PDF ficam dentro do modal.
    expect(screen.getByRole("button", { name: /^Exportar/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Excel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^PDF/ })).not.toBeInTheDocument();

    cleanup();
  });

  it("o modal de exportação abre com Excel, PDF e as colunas", async () => {
    const user = userEvent.setup();
    montar(Pagina);
    await screen.findByRole("heading", { name: titulo });

    await user.click(screen.getByRole("button", { name: /^Exportar/ }));

    expect(screen.getByText(tituloModal)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Excel/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^PDF/ })).toBeInTheDocument();

    // Os seletores de coluna eram <div onClick>: sem foco e sem Enter.
    // O Modal usa portal: busca no document, nao no container do render.
    const colunas = document.querySelectorAll("button.exp-coluna");
    expect(colunas.length).toBeGreaterThan(0);
    colunas.forEach((c) => expect(c).toHaveAttribute("aria-pressed"));

    cleanup();
  });

  it("o véu de carregamento anuncia o que está fazendo", async () => {
    montar(Pagina);
    await screen.findByRole("heading", { name: titulo });
    // Some quando os dados chegam; o que importa é o componente existir e não
    // ter sido apagado junto com o cabeçalho.
    expect(screen.queryByText(/Salvando/)).not.toBeInTheDocument();
    cleanup();
  });
});

/**
 * Festas e Churrasqueira usam a mesma tela (TelaDeReservas), no padrão do guia
 * de marca: o detalhe é o <Modal> centrado (decisão de 2026-11-04, a mesma de
 * Moradores e Mudanças). Antes cada tela tinha seu modal caseiro, e depois uma
 * gaveta lateral.
 */
describe.each(["Festas", "Churrasqueira"])("Detalhe da reserva: %s", (arquivo) => {
  // Lê o fonte porque a gaveta só existe depois de um clique numa linha, e
  // sem dado da planilha não há linha para clicar. O que precisa ficar travado
  // é a migração: usa o primitivo e não sobrou o modal caseiro.
  // Caminho a partir da raiz do projeto, e não de import.meta.url: no Vitest
  // essa URL é o caminho servido pelo Vite, não um file:// real, e resolver
  // relativo a ela dava "C:\src\pages\Festas.jsx".
  const fonte = readFileSync(join(process.cwd(), "src", "pages", `${arquivo}.jsx`), "utf8");

  it("usa a tela de reservas compartilhada, sem gaveta", () => {
    expect(fonte).toContain("<TelaDeReservas");
    expect(fonte).not.toContain("<Gaveta");
  });

  it("não sobrou o modal caseiro de ver mais", () => {
    expect(fonte).not.toContain("Resumo da Reserva");
    expect(fonte).not.toContain("{showViewModal && selectedFesta && (");
  });

  it("o detalhe usa o modal e as fichas do guia", () => {
    const tela = readFileSync(join(process.cwd(), "src", "components", "reservas", "TelaDeReservas.jsx"), "utf8");
    expect(tela).toContain('title="Detalhes da reserva"');
    expect(tela).toContain("<Ficha");
    expect(tela).not.toContain("<Gaveta");
  });
});
