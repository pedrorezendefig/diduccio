import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * Mudanças no padrão do guia de marca: lista em linhas, a linha abre o modal
 * de VER (só leitura), o lápis abre o de editar, e o filtro é busca + pílulas
 * com "Mais filtros".
 */

const MUDANCAS = [
  { id: 1, id_unidade: 10, morador: "Ana Lima", cpf: "123.456.789-00", contato: "(21) 99999-0000",
    data_mudanca: "2027-04-01T11:00:00+00:00", data_fim: "2027-04-01T20:00:00+00:00",
    status: "Agendado", tipo: "Entrada", periodo: "Manhã", obs: "Elevador de serviço", monitor: "Bira" },
  { id: 2, id_unidade: 11, morador: "Bruno Reis", data_mudanca: "2027-05-02T13:00:00+00:00",
    status: "Cancelado", tipo: "Saída", periodo: "Tarde" },
];
const UNIDADES = [{ id: 10, bloco: 5, unidade: 206 }, { id: 11, bloco: 2, unidade: 104 }];

vi.mock("../api/db", () => ({
  listar: vi.fn((t) => Promise.resolve(t === "MUDANCAS" ? MUDANCAS : t === "UNIDADES" ? UNIDADES : [])),
  criar: vi.fn(() => Promise.resolve({ success: true })),
  editar: vi.fn(() => Promise.resolve({ success: true })),
  remover: vi.fn(() => Promise.resolve({ success: true })),
}));

import Mudancas from "../pages/Mudancas";
import { editar } from "../api/db";

function montar() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Mudancas user={{ nome: "Marcelo", cargo: "Sindico" }} />
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("Mudanças no padrão do guia", () => {
  it("a linha abre o modal de ver, sem campo nenhum", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: "Ver a mudança de Ana Lima (B5-206)" }));

    const dialogo = screen.getByRole("dialog", { name: "Detalhes da mudança" });
    expect(within(dialogo).getByText("Elevador de serviço")).toBeInTheDocument();
    expect(within(dialogo).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: /Editar/ })).toBeInTheDocument();
  });

  it("o lápis abre o modal de editar, com o formulário preenchido", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: "Editar a mudança de Ana Lima" }));

    const dialogo = screen.getByRole("dialog", { name: "Editar mudança" });
    expect(within(dialogo).getByDisplayValue("Ana Lima")).toBeInTheDocument();
    expect(within(dialogo).getByRole("radio", { name: "Agendado" })).toHaveAttribute("aria-checked", "true");
  });

  it("as pílulas filtram pela situação, com a contagem", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText("Ana Lima");
    await user.click(screen.getByRole("button", { name: /^Cancelado/ }));

    expect(screen.queryByText("Ana Lima")).not.toBeInTheDocument();
    expect(screen.getByText("Bruno Reis")).toBeInTheDocument();
  });

  it("Mais filtros abre o painel e mostra Limpar filtros quando há filtro ligado", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText("Ana Lima");
    await user.click(screen.getByRole("button", { name: /Mais filtros/ }));
    await user.click(screen.getByRole("radio", { name: "Saída" }));

    expect(screen.queryByText("Ana Lima")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Limpar filtros/ }));
    expect(screen.getByText("Ana Lima")).toBeInTheDocument();
  });

  it("clicar no nome da coluna ordena, e de novo inverte", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText("Ana Lima");
    const nomes = () => screen.getAllByRole("button", { name: /^Ver a mudança de .*\(/ }).map((b) => b.getAttribute("aria-label"));

    await user.click(screen.getByRole("button", { name: "Ordenar por Responsável" }));
    expect(nomes()[0]).toMatch(/Ana Lima/);

    await user.click(screen.getByRole("button", { name: /^Ordenar por Responsável, crescente/ }));
    expect(nomes()[0]).toMatch(/Bruno Reis/);
    expect(screen.getByRole("button", { name: /^Ordenar por Responsável, decrescente/ })).toBeInTheDocument();
  });

  it("mostra quem monitora na lista e no modal de ver", async () => {
    const user = userEvent.setup();
    montar();
    expect(await screen.findByText("Bira")).toBeInTheDocument();
    expect(screen.getByText("Ninguém")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver a mudança de Ana Lima (B5-206)" }));
    expect(within(screen.getByRole("dialog")).getByText("Bira")).toBeInTheDocument();
  });

  it("o editar marca o monitor e o salvar manda a coluna nova", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: "Editar a mudança de Ana Lima" }));
    const dialogo = screen.getByRole("dialog", { name: "Editar mudança" });
    expect(within(dialogo).getByRole("radio", { name: "Bira" })).toHaveAttribute("aria-checked", "true");

    await user.click(within(dialogo).getByRole("radio", { name: "Elias" }));
    await user.click(within(dialogo).getByRole("button", { name: "Salvar" }));

    expect(editar).toHaveBeenCalledWith("MUDANCAS", 1, expect.objectContaining({ monitor: "Elias" }));
  });

  it("o bloco fica no Mais filtros e filtra pelo bloco da unidade", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText("Ana Lima");
    expect(screen.queryByRole("radiogroup", { name: "Bloco" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Mais filtros/ }));
    const blocos = screen.getByRole("radiogroup", { name: "Bloco" });
    await user.click(within(blocos).getByRole("radio", { name: /^B2/ }));

    expect(screen.queryByText("Ana Lima")).not.toBeInTheDocument();
    expect(screen.getByText("Bruno Reis")).toBeInTheDocument();
  });

  it("no celular, o campo de situação abre a folha e escolher filtra e fecha", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText("Ana Lima");
    await user.click(screen.getByRole("button", { name: /^Situação: Todas/ }));

    const folha = screen.getByRole("dialog", { name: "Situação" });
    expect(within(folha).getByRole("radio", { name: /Todas/ })).toHaveAttribute("aria-checked", "true");
    await user.click(within(folha).getByRole("radio", { name: /Cancelado/ }));

    expect(screen.queryByRole("dialog", { name: "Situação" })).not.toBeInTheDocument();
    expect(screen.queryByText("Ana Lima")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Situação: Cancelado/ })).toBeInTheDocument();
  });
});
