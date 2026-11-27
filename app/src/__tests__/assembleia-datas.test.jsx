import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * A data da ata aparecia "2026-07-07" na tela de Assembleia.
 *
 * `assembleias.data_assembleia` é `date` no Postgres e chega em ISO. A tela e o
 * chat passavam o valor por um `soData` herdado da planilha, que só tirava a
 * hora do fim ("08/06/2026 00:00" → "08/06/2026") — sobre ISO, devolve o
 * próprio ISO. É o mesmo defeito que a Churrasqueira e as Festas já tiveram
 * (datas-na-tela.test.js), em outra tela.
 *
 * O chat tem uma segunda ponta, menos visível: `dataBate` reconhece a data na
 * pergunta ("o que foi decidido em 07/07/2026?") para responder sem chamar a
 * IA. Lendo o ISO, ele pegava "26-07-07" e só acertava por coincidência com o
 * botão de sugestão, que também estava em ISO. Trocar só a exibição faria o
 * botão passar a cair na IA — que responde, mas devagar e gastando cota. Por
 * isso estes testes olham a renderização E o caminho local do chat.
 */

const mockListar = vi.fn();
vi.mock("../api/db", () => ({
  listar: (...a) => mockListar(...a),
  criar: vi.fn(), editar: vi.fn(), remover: vi.fn(),
}));
vi.mock("../api/anexos", () => ({
  enviarAnexo: vi.fn(), urlDoAnexo: vi.fn(), removerAnexosDoRegistro: vi.fn(),
}));
const mockChamarEdgeFunction = vi.fn();
vi.mock("../api/edge", () => ({
  chamarEdgeFunction: (...a) => mockChamarEdgeFunction(...a),
  mensagemDaEdgeFunction: () => "falhou",
}));

import Assembleia from "../pages/Assembleia";
import AssembleiaChat from "../components/AssembleiaChat";

const USUARIO = { id: "dev", nome: "Lucas", cargo: "Desenvolvedor", email: "lucas@vitta.test" };

// Como o Postgres devolve a linha: a data em ISO, as listas em JSON.
const ATA = {
  id: "ATA-1",
  titulo: "Assembleia de julho",
  data_assembleia: "2026-07-07",
  resumo_geral: "Tratou do portão.",
  decisoes: JSON.stringify(["Troca do portão aprovada"]),
  assinantes: JSON.stringify(["Maria Silva"]),
};

const envolver = (el) => (
  <MemoryRouter>
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>{el}</ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  mockListar.mockResolvedValue([ATA]);
  // O chat rola até a última mensagem ao abrir; o jsdom não implementa isso.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("a data da ata na tela de Assembleia", () => {
  it("o histórico mostra dd/mm/aaaa, e não o ISO do banco", async () => {
    render(envolver(<Assembleia user={USUARIO} />));

    expect(await screen.findByText("07/07/2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-07-07")).not.toBeInTheDocument();
  });
});

describe("a data da ata no chat das atas", () => {
  async function abrirChat(user) {
    render(envolver(<AssembleiaChat atas={[ATA]} />));
    await user.click(screen.getByTitle("Perguntar sobre as atas"));
  }

  it("as sugestões vêm em dd/mm/aaaa", async () => {
    const user = userEvent.setup();
    await abrirChat(user);

    expect(screen.getByRole("button", { name: "O que foi decidido em 07/07/2026?" })).toBeInTheDocument();
    expect(screen.queryByText(/2026-07-07/)).not.toBeInTheDocument();
  });

  it("a sugestão continua sendo respondida na hora, sem chamar a IA", async () => {
    // É a ponta escondida: a sugestão só era respondida localmente porque o
    // ISO da sugestão coincidia com o ISO lido errado pelo `dataBate`.
    const user = userEvent.setup();
    await abrirChat(user);

    await user.click(screen.getByRole("button", { name: "O que foi decidido em 07/07/2026?" }));

    expect(await screen.findByText("Assembleia de julho — 07/07/2026")).toBeInTheDocument();
    expect(screen.getByText("Troca do portão aprovada")).toBeInTheDocument();
    expect(mockChamarEdgeFunction).not.toHaveBeenCalled();
  });

  it.each([
    "o que foi decidido em 07/07/2026?",
    "o que foi decidido em 7/7/2026?",
    "quais foram as decisões de 7 de julho de 2026?",
  ])("a pergunta digitada %j acha a ata pela data, sem chamar a IA", async (pergunta) => {
    const user = userEvent.setup();
    await abrirChat(user);

    await user.type(screen.getByPlaceholderText("Pergunte sobre uma ata…"), pergunta);
    await user.click(screen.getByTitle("Enviar"));

    expect(await screen.findByText("Assembleia de julho — 07/07/2026")).toBeInTheDocument();
    expect(mockChamarEdgeFunction).not.toHaveBeenCalled();
  });
});

describe("a tela de Assembleia no padrão do ViT", () => {
  it("a linha abre o modal de ver, só leitura, com decisões e quem assinou", async () => {
    const user = userEvent.setup();
    render(envolver(<Assembleia user={USUARIO} />));

    await user.click(await screen.findByRole("button", { name: "Abrir a ata Assembleia de julho" }));

    const modal = await screen.findByRole("dialog", { name: "Ata da assembleia" });
    expect(modal).toHaveTextContent("Troca do portão aprovada");
    expect(modal).toHaveTextContent("Maria Silva");
    expect(modal.querySelector("input, textarea")).toBeNull();
  });

  it("editar grava título, data e listas, sem mexer no PDF", async () => {
    const { editar } = await import("../api/db");
    editar.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(envolver(<Assembleia user={USUARIO} />));

    await user.click(await screen.findByRole("button", { name: "Editar a ata Assembleia de julho" }));
    const titulo = await screen.findByLabelText("Título");
    await user.clear(titulo);
    await user.type(titulo, "AGO julho");
    await user.click(screen.getByRole("button", { name: "Adicionar decisão" }));
    await user.type(screen.getByLabelText("Decisão 2"), "Pintura da fachada");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(editar).toHaveBeenCalledWith("ASSEMBLEIAS", "ATA-1", {
      titulo: "AGO julho",
      data_assembleia: "2026-07-07",
      resumo_geral: "Tratou do portão.",
      decisoes: JSON.stringify(["Troca do portão aprovada", "Pintura da fachada"]),
      assinantes: JSON.stringify(["Maria Silva"]),
    });
  });

  it("o conselheiro só lê: sem Nova ata e sem lápis", async () => {
    render(envolver(<Assembleia user={{ ...USUARIO, cargo: "Conselheiro" }} />));

    expect(await screen.findByText("07/07/2026")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nova ata" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Editar a ata/ })).not.toBeInTheDocument();
  });

  it("Nova ata só gera o resumo depois de escolher o PDF", async () => {
    const user = userEvent.setup();
    render(envolver(<Assembleia user={USUARIO} />));

    await user.click(await screen.findByRole("button", { name: "Nova ata" }));
    expect(await screen.findByRole("button", { name: /Gerar resumo com IA/ })).toBeDisabled();
  });
});
