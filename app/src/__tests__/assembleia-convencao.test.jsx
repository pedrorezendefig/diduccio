import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * Aba Convenção da Assembleia: perguntar à Convenção (IA com os trechos que a
 * busca acha + as atas), ver e baixar os dois PDFs, ler a transcrição.
 */

const mockListarAnexos = vi.fn();
const mockUrlDoAnexo = vi.fn();
vi.mock("../api/anexos", () => ({
  enviarAnexo: vi.fn(), removerAnexo: vi.fn(),
  listarAnexos: (...a) => mockListarAnexos(...a),
  urlDoAnexo: (...a) => mockUrlDoAnexo(...a),
  urlParaBaixar: vi.fn(),
}));
const mockChamar = vi.fn();
vi.mock("../api/edge", () => ({
  chamarEdgeFunction: (...a) => mockChamar(...a),
  mensagemDaEdgeFunction: () => "falhou",
}));

import Convencao from "../components/assembleia/Convencao";

const ATAS = [{
  titulo: "AGE de março", data_assembleia: "2026-03-20", resumo_geral: "",
  decisoes: JSON.stringify(["Fica permitida uma segunda vaga para motos no estacionamento"]),
}];

const envolver = (el) => <ToastProvider><ConfirmProvider>{el}</ConfirmProvider></ToastProvider>;

describe("aba Convenção", () => {
  beforeEach(() => {
    mockChamar.mockReset();
    mockListarAnexos.mockResolvedValue({
      success: true,
      arquivos: [{ nome: "1700-original.pdf", caminho: "assembleias/convencao/1700-original.pdf", tamanho: 15626340 }],
    });
    mockUrlDoAnexo.mockResolvedValue("https://assinada/original.pdf");
  });

  it("pergunta à IA e mostra a resposta com os itens de onde ela saiu", async () => {
    mockChamar.mockResolvedValue({
      ok: true,
      corpo: {
        success: true,
        resposta: "Pelo item 9.9, só vota quem está quite.",
        trechos: [{ rotulo: "Item 9.9", capitulo: "CAPÍTULO IX", texto: "9.9. Ressalvadas as matérias..." }],
        atas: [],
      },
    });
    render(envolver(<Convencao atas={ATAS} podeEscrever />));
    await userEvent.type(screen.getByLabelText("Sua pergunta"), "inadimplente pode votar?");
    await userEvent.click(screen.getByRole("button", { name: "Perguntar" }));

    expect(mockChamar).toHaveBeenCalledWith("ia", { acao: "perguntar-convencao", pergunta: "inadimplente pode votar?" }, expect.anything());
    expect(await screen.findByText("Pelo item 9.9, só vota quem está quite.")).toBeInTheDocument();
    expect(screen.getByText("Item 9.9")).toBeInTheDocument();
  });

  it("a original guardada abre dentro do sistema; a transcrita ainda pede o envio", async () => {
    render(envolver(<Convencao atas={[]} podeEscrever />));
    await userEvent.click(await screen.findByRole("button", { name: "Ver o PDF da Convenção original" }));
    const modal = await screen.findByRole("dialog", { name: "Convenção original" });
    expect(within(modal).getByTitle("Convenção original")).toHaveAttribute("src", "https://assinada/original.pdf");
    expect(screen.getByRole("button", { name: "Enviar o PDF da Convenção transcrita" })).toBeInTheDocument();
  });

  it("o conselheiro não envia PDF", async () => {
    render(envolver(<Convencao atas={[]} podeEscrever={false} />));
    await screen.findByRole("button", { name: "Ver o PDF da Convenção original" });
    expect(screen.queryByRole("button", { name: /Enviar o PDF|Trocar o PDF/ })).not.toBeInTheDocument();
  });

});
