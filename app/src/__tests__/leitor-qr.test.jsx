import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider } from "../ui";
import LeitorQR from "../components/LeitorQR";
import { codigoDeRetirada, lerQRDeRetirada } from "../lib/codigoDeRetirada";

/**
 * O leitor do QR do morador (Encomendas > Ler QR do morador e a janela de
 * retirada). A câmera não existe no jsdom: o teste confere o caminho de
 * quando ela falta (digitar) e a regra do que conta como código.
 */
const montar = (aoLer = vi.fn()) => {
  render(
    <ThemeProvider>
      <ToastProvider>
        <LeitorQR aberto aoFechar={() => {}} aoLer={aoLer} />
      </ToastProvider>
    </ThemeProvider>
  );
  return aoLer;
};

describe("o que conta como código de retirada", () => {
  it.each([
    ["7KQ3M", "7KQ3M"],
    [" 7kq3m ", "7KQ3M"],
    ["7KQ-3M", "7KQ3M"],
    ["IL9ZA", "IL9ZA"],
  ])("%j vira %s", (texto, codigo) => expect(codigoDeRetirada(texto)).toBe(codigo));

  it.each([
    ["https://golpe.com/7KQ3M"],
    ["7KQ3"],
    ["7KQ3MM"],
    ["7KQ0M"], // zero não existe no alfabeto
    ["7KQOM"], // nem a letra O
    ["7KQ1M"], // nem o um
    ["0427B"], // a etiqueta não é o código
    [""],
  ])("%j é recusado", (texto) => expect(codigoDeRetirada(texto)).toBeNull());
});

describe("o leitor", () => {
  it("sem câmera, explica e deixa digitar; só aceita o formato do código", async () => {
    const user = userEvent.setup();
    const aoLer = montar();
    expect(await screen.findByText(/não abre a câmera|Não deu para abrir a câmera/)).toBeInTheDocument();
    const usar = screen.getByRole("button", { name: "Usar este código" });
    expect(usar).toBeDisabled();
    await user.type(screen.getByLabelText("Ou digite o código"), "0427B");
    expect(usar).toBeDisabled();
    await user.clear(screen.getByLabelText("Ou digite o código"));
    await user.type(screen.getByLabelText("Ou digite o código"), "7kq3m");
    await user.click(usar);
    expect(aoLer).toHaveBeenCalledWith("7KQ3M");
  });
});

describe("o QR do app diz quem o mostra (2026-11-04)", () => {
  it.each([
    ["7KQ3M", { codigo: "7KQ3M", idApp: null }],
    ["7KQ3M.42", { codigo: "7KQ3M", idApp: 42 }],
    [" 7kq3m.7 ", { codigo: "7KQ3M", idApp: 7 }],
  ])("%j", (texto, lido) => expect(lerQRDeRetirada(texto)).toEqual(lido));

  it.each([["7KQ3M.x"], ["0427B.4"], ["https://golpe.com/7KQ3M.4"]])("%j é recusado", (texto) =>
    expect(lerQRDeRetirada(texto)).toBeNull()
  );
});
