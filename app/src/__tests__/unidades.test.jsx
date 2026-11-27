import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * A tela lê a lista de unidades via `listar` e grava tudo — criar, editar,
 * excluir — via `criar`/`editar`/`remover`, os três de `../api/db` (Supabase
 * direto, sem Edge Function: RLS decide quem pode escrever). Nada toca rede
 * de verdade aqui: `../api/db` inteiro é mockado, e `confirm` (do
 * ConfirmProvider real) é resolvido clicando no botão do diálogo que ele
 * mesmo renderiza — a confirmação antes de excluir é parte do que os testes
 * verificam, não um detalhe a esconder atrás de mock.
 */

const mockListar = vi.fn();
const mockCriar = vi.fn();
const mockEditar = vi.fn();
const mockRemover = vi.fn();
vi.mock("../api/db", () => ({
  listar: (...a) => mockListar(...a),
  criar: (...a) => mockCriar(...a),
  editar: (...a) => mockEditar(...a),
  remover: (...a) => mockRemover(...a),
}));

import Unidades from "../pages/Unidades";

const UNIDADE_EXISTENTE = {
  id: 1, bloco: "A", unidade: "101", ocupado: "Sim", status: "Adimplente", valor: 0,
};

function montar() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Unidades />
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Lista não-vazia por padrão: com zero unidades a tabela cai no EmptyState,
  // que tem seu PRÓPRIO botão "Nova unidade" — dois botões com o mesmo nome
  // acessível quebrariam getByRole nos testes que não são sobre a lista vazia.
  mockListar.mockResolvedValue([UNIDADE_EXISTENTE]);
});

// Devolve o próprio diálogo: `getByLabelText(/^Unidade/)` sem escopo bate
// também no <select aria-label="Unidades por página"> da paginação, que
// convive na mesma árvore. Escopar ao dialog evita esse falso positivo.
async function abrirModalDeNovaUnidade(user) {
  montar();
  await screen.findByRole("heading", { name: "Unidades" });
  await user.click(screen.getByRole("button", { name: "Nova unidade" }));
  return screen.getByRole("dialog", { name: "Nova unidade" });
}

// Excluir mora no modal de ver (guia de marca): abre a linha e pede lá.
async function pedirExclusao(user) {
  montar();
  await screen.findByRole("heading", { name: "Unidades" });
  await user.click(screen.getByRole("button", { name: "Abrir a unidade BA-101" }));
  const ver = await screen.findByRole("dialog", { name: "Detalhes da unidade" });
  await user.click(within(ver).getByRole("button", { name: "Excluir" }));
  return screen.findByRole("dialog", { name: /Excluir a unidade/ });
}

describe("Carregar a lista", () => {
  it("chama listar(\"UNIDADES\") e exibe as unidades na tabela", async () => {
    montar();
    await screen.findByRole("heading", { name: "Unidades" });

    expect(mockListar).toHaveBeenCalledWith("UNIDADES");
    expect(await screen.findByText("BA-101")).toBeInTheDocument();
  });

  it("falha na leitura mostra erro em vez de tela vazia sem explicação", async () => {
    mockListar.mockRejectedValue(new Error("Falha de rede"));
    montar();

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Não foi possível carregar as unidades");
  });
});

describe("Criar unidade: sucesso", () => {
  it("valida, chama criar sem id, fecha o modal e recarrega a lista", async () => {
    const user = userEvent.setup();
    mockCriar.mockResolvedValue({ success: true, data: { id: 2, bloco: "B", unidade: "202" } });

    const dialog = await abrirModalDeNovaUnidade(user);
    await user.type(within(dialog).getByLabelText(/^Bloco/), "B");
    await user.type(within(dialog).getByLabelText(/^Unidade/), "202");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));

    expect(await screen.findByText("Unidade B-202 cadastrada")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Nova unidade" })).not.toBeInTheDocument();

    expect(mockCriar).toHaveBeenCalledTimes(1);
    const [tabela, dados] = mockCriar.mock.calls[0];
    expect(tabela).toBe("UNIDADES");
    // Sem `id`: quem gera é o banco. Mandar "" (o valor do form vazio) quebraria o insert.
    expect(dados).not.toHaveProperty("id");
    expect(dados).toEqual({ bloco: "B", unidade: "202", ocupado: "Não", status: "Adimplente", valor: 0 });

    // A lista recarrega: montagem + recarga pós-cadastro.
    expect(mockListar).toHaveBeenCalledTimes(2);
  });
});

describe("Criar unidade: falha silenciosa (REGRA CRÍTICA)", () => {
  it("{ success: false } mostra erro, NÃO mostra toast de sucesso, e mantém o modal aberto", async () => {
    const user = userEvent.setup();
    mockCriar.mockResolvedValue({
      success: false,
      message: "new row violates row-level security policy for table \"unidades\"",
    });

    const dialog = await abrirModalDeNovaUnidade(user);
    await user.type(within(dialog).getByLabelText(/^Bloco/), "C");
    await user.type(within(dialog).getByLabelText(/^Unidade/), "303");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Você não tem permissão para alterar unidades.");
    // A mensagem crua do Postgres nunca chega à tela.
    expect(aviso).not.toHaveTextContent("row-level security");

    // Nenhum toast de sucesso: nem o texto de "cadastrada" aparece em lugar nenhum.
    expect(screen.queryByText(/cadastrada/)).not.toBeInTheDocument();
    // O modal continua aberto: a gravação não aconteceu.
    expect(screen.getByRole("dialog", { name: "Nova unidade" })).toBeInTheDocument();
    // Sem sucesso, a lista NÃO recarrega — só a chamada da montagem.
    expect(mockListar).toHaveBeenCalledTimes(1);
  });
});

describe("Editar unidade: falha silenciosa", () => {
  it("{ success: false } sem mensagem cai na mensagem genérica, sem recarregar a lista", async () => {
    const user = userEvent.setup();
    mockEditar.mockResolvedValue({ success: false });

    montar();
    await screen.findByRole("heading", { name: "Unidades" });
    await user.click(
      screen.getByRole("button", { name: "Editar a unidade BA-101" })
    );
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Não foi possível salvar. Tente novamente.");
    expect(mockListar).toHaveBeenCalledTimes(1);
  });
});

describe("Excluir unidade", () => {
  it("pede confirmação antes de chamar remover", async () => {
    const user = userEvent.setup();

    expect(await pedirExclusao(user)).toBeInTheDocument();
    // Nada foi excluído ainda: sem confirmação, `remover` não é chamado.
    expect(mockRemover).not.toHaveBeenCalled();
  });

  it("confirmando, chama remover e recarrega a lista", async () => {
    const user = userEvent.setup();
    mockRemover.mockResolvedValue({ success: true });

    const pergunta = await pedirExclusao(user);
    await user.click(within(pergunta).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByText(`Unidade ${UNIDADE_EXISTENTE.bloco}-${UNIDADE_EXISTENTE.unidade} excluída`))
      .toBeInTheDocument();
    expect(mockRemover).toHaveBeenCalledWith("UNIDADES", UNIDADE_EXISTENTE.id);
    expect(mockListar).toHaveBeenCalledTimes(2); // montagem + recarga pós-exclusão
  });

  it("{ success: false } por RLS mostra mensagem humana e não recarrega a lista", async () => {
    const user = userEvent.setup();
    mockRemover.mockResolvedValue({
      success: false,
      message: "new row violates row-level security policy for table \"unidades\"",
    });

    const pergunta = await pedirExclusao(user);
    await user.click(within(pergunta).getByRole("button", { name: "Excluir" }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Você não tem permissão para alterar unidades.");
    expect(mockListar).toHaveBeenCalledTimes(1); // só a montagem, exclusão não aconteceu
  });
});

describe("Unidades no padrão do guia", () => {
  const LISTA = [
    UNIDADE_EXISTENTE,
    { id: 2, bloco: "5", unidade: "206", ocupado: "Não", status: "Inadimplente", valor: 1240.5 },
  ];

  it("a busca acha a unidade pelo número junto, e as pílulas contam a situação", async () => {
    const user = userEvent.setup();
    mockListar.mockResolvedValue(LISTA);
    montar();
    await screen.findByText("B5-206");
    expect(screen.getByRole("button", { name: /^Inadimplentes/ })).toHaveTextContent("1");

    await user.type(screen.getByPlaceholderText(/Bloco ou unidade/), "5206");
    expect(screen.getByText("B5-206")).toBeInTheDocument();
    expect(screen.queryByText("BA-101")).not.toBeInTheDocument();
  });

  it("clicar na linha abre o ver, com a dívida e sem campo nenhum", async () => {
    const user = userEvent.setup();
    mockListar.mockResolvedValue(LISTA);
    montar();
    await user.click(await screen.findByRole("button", { name: "Abrir a unidade B5-206" }));
    const ver = await screen.findByRole("dialog", { name: "Detalhes da unidade" });
    expect(within(ver).getByText(/1\.240,50/)).toBeInTheDocument();
    expect(within(ver).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("no cadastro, ocupação e situação são botões lado a lado", async () => {
    const user = userEvent.setup();
    const dialog = await abrirModalDeNovaUnidade(user);
    expect(within(dialog).getByRole("radio", { name: "Vazia" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(dialog).getByRole("radio", { name: "Inadimplente" }));
    expect(within(dialog).getByLabelText(/Valor em aberto/)).toBeInTheDocument();
  });
});
