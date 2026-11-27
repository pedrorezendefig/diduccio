import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * A tela lê moradores, unidades (para o seletor e o rótulo "B<bloco>-<unidade>")
 * e vagas (para o contador de veículos) via três chamadas a `listar`, e grava
 * — criar, editar, excluir — via `criar`/`editar`/`remover`, os três de
 * `../api/db` (Supabase direto, sem Edge Function: RLS decide quem pode
 * escrever). Nada toca rede de verdade aqui: `../api/db` inteiro é mockado, e
 * `confirm` (do ConfirmProvider real) é resolvido clicando no botão do
 * diálogo que ele mesmo renderiza.
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

import Moradores from "../pages/Moradores";

const UNIDADE_EXISTENTE = { id: 1509, bloco: "A", unidade: "101" };

// Espelha o formato real do banco: campos opcionais vêm `null` (não ""), e
// `id_unidade` é número, como confirmado consultando as 317 linhas reais.
const MORADOR_EXISTENTE = {
  id: 1782783575973,
  id_unidade: 1509,
  nome: "Ana Souza",
  cpf: null,
  tipo_vinculo: "Proprietário",
  telefone: null,
  email: null,
  data_entrada: null,
  data_saida: null,
  status: "Ativo",
  rg: null,
  tipo_morador: "Titular",
};

function respostaListar(tabela) {
  if (tabela === "MORADORES") return Promise.resolve([MORADOR_EXISTENTE]);
  if (tabela === "UNIDADES") return Promise.resolve([UNIDADE_EXISTENTE]);
  if (tabela === "VAGAS") return Promise.resolve([]);
  return Promise.resolve([]);
}

function montar() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Moradores />
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListar.mockImplementation(respostaListar);
});

async function abrirModalDeNovoMorador(user) {
  montar();
  await screen.findByRole("heading", { name: "Moradores" });
  await user.click(screen.getByRole("button", { name: "Novo morador" }));
  return screen.getByRole("dialog", { name: "Novo morador" });
}

// A unidade vem da busca do sistema (BuscaUnidade): digita e escolhe na lista.
async function escolherUnidade(user, dialog) {
  await user.type(within(dialog).getByPlaceholderText(/Digite/), "101");
  await user.click(within(within(dialog).getByRole("listbox")).getByRole("button", { name: /101/ }));
}

// Excluir mora no modal de ver (guia de marca): abre a linha e pede lá.
async function pedirExclusao(user) {
  montar();
  await screen.findByRole("heading", { name: "Moradores" });
  await user.click(screen.getByRole("button", { name: `Ver o cadastro de ${MORADOR_EXISTENTE.nome}` }));
  const ver = await screen.findByRole("dialog", { name: "Cadastro do morador" });
  await user.click(within(ver).getByRole("button", { name: "Excluir" }));
  return screen.findByRole("dialog", { name: /Excluir o morador/ });
}

describe("Carregar a lista", () => {
  it("chama listar para MORADORES, UNIDADES e VAGAS e exibe os moradores na tabela", async () => {
    montar();
    await screen.findByRole("heading", { name: "Moradores" });

    expect(mockListar).toHaveBeenCalledWith("MORADORES");
    expect(mockListar).toHaveBeenCalledWith("UNIDADES");
    expect(mockListar).toHaveBeenCalledWith("VAGAS");
    expect(await screen.findByText("Ana Souza")).toBeInTheDocument();
  });

  it("falha na leitura mostra erro em vez de tela vazia sem explicação", async () => {
    mockListar.mockRejectedValue(new Error("Falha de rede"));
    montar();

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Não foi possível carregar os moradores");
  });
});

describe("Criar morador: sucesso", () => {
  it("valida, converte id_unidade para número, chama criar sem id, fecha o modal e recarrega", async () => {
    const user = userEvent.setup();
    mockCriar.mockResolvedValue({ success: true, data: { id: 2, nome: "Novo Morador" } });

    const dialog = await abrirModalDeNovoMorador(user);
    await user.type(within(dialog).getByLabelText(/^Nome completo/), "Novo Morador");
    await escolherUnidade(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));

    expect(await screen.findByText("Novo Morador cadastrado")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Novo morador" })).not.toBeInTheDocument();

    expect(mockCriar).toHaveBeenCalledTimes(1);
    const [tabela, dados] = mockCriar.mock.calls[0];
    expect(tabela).toBe("MORADORES");
    // Sem `id`: quem gera é o banco. Mandar "" (o valor do form vazio) quebraria o insert.
    expect(dados).not.toHaveProperty("id");
    // O <select> devolve string; a coluna é bigint com FK para unidades.id.
    expect(dados.id_unidade).toBe(UNIDADE_EXISTENTE.id);
    expect(typeof dados.id_unidade).toBe("number");
    expect(dados.nome).toBe("Novo Morador");

    // A lista recarrega: montagem (3 chamadas) + recarga pós-cadastro (3 chamadas).
    expect(mockListar).toHaveBeenCalledTimes(6);
  });
});

describe("Criar morador: falha silenciosa (REGRA CRÍTICA)", () => {
  it("{ success: false } mostra erro, NÃO mostra toast de sucesso, e mantém o modal aberto", async () => {
    const user = userEvent.setup();
    mockCriar.mockResolvedValue({
      success: false,
      message: "new row violates row-level security policy for table \"moradores\"",
    });

    const dialog = await abrirModalDeNovoMorador(user);
    await user.type(within(dialog).getByLabelText(/^Nome completo/), "Outro Morador");
    await escolherUnidade(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Você não tem permissão para alterar moradores.");
    // A mensagem crua do Postgres nunca chega à tela.
    expect(aviso).not.toHaveTextContent("row-level security");

    // Nenhum toast de sucesso.
    expect(screen.queryByText(/cadastrado$/)).not.toBeInTheDocument();
    // O modal continua aberto: a gravação não aconteceu.
    expect(screen.getByRole("dialog", { name: "Novo morador" })).toBeInTheDocument();
    // Sem sucesso, a lista NÃO recarrega: só as 3 chamadas da montagem.
    expect(mockListar).toHaveBeenCalledTimes(3);
  });
});

describe("Erro de chave estrangeira vira mensagem humana", () => {
  it("id_unidade inexistente mostra 'Unidade não encontrada', não o texto do Postgres", async () => {
    const user = userEvent.setup();
    mockCriar.mockResolvedValue({
      success: false,
      message:
        "insert or update on table \"moradores\" violates foreign key constraint " +
        "\"moradores_id_unidade_fkey\"",
    });

    const dialog = await abrirModalDeNovoMorador(user);
    await user.type(within(dialog).getByLabelText(/^Nome completo/), "Morador Orfao");
    await escolherUnidade(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Unidade não encontrada");
    expect(aviso).not.toHaveTextContent("foreign key");
    expect(aviso).not.toHaveTextContent("moradores_id_unidade_fkey");
  });
});

describe("Excluir morador", () => {
  it("pede confirmação antes de chamar remover", async () => {
    const user = userEvent.setup();

    expect(await pedirExclusao(user)).toBeInTheDocument();
    // Nada foi excluído ainda: sem confirmação, `remover` não é chamado.
    expect(mockRemover).not.toHaveBeenCalled();
  });

  it("confirmando, chama remover com o id e recarrega a lista", async () => {
    const user = userEvent.setup();
    mockRemover.mockResolvedValue({ success: true });

    const pergunta = await pedirExclusao(user);
    await user.click(within(pergunta).getByRole("button", { name: "Excluir" }));

    expect(await screen.findByText(`${MORADOR_EXISTENTE.nome} foi removido`)).toBeInTheDocument();
    expect(mockRemover).toHaveBeenCalledWith("MORADORES", MORADOR_EXISTENTE.id);
    expect(mockListar).toHaveBeenCalledTimes(6); // montagem (3) + recarga pós-exclusão (3)
  });

  it("{ success: false } por RLS mostra mensagem humana e não recarrega a lista", async () => {
    const user = userEvent.setup();
    mockRemover.mockResolvedValue({
      success: false,
      message: "new row violates row-level security policy for table \"moradores\"",
    });

    const pergunta = await pedirExclusao(user);
    await user.click(within(pergunta).getByRole("button", { name: "Excluir" }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Você não tem permissão para alterar moradores.");
    expect(mockListar).toHaveBeenCalledTimes(3); // só a montagem, exclusão não aconteceu
  });
});

describe("Moradores no padrão do guia", () => {
  it("a linha abre o ver, só leitura, com o CPF mascarado", async () => {
    const user = userEvent.setup();
    mockListar.mockImplementation((t) => t === "MORADORES"
      ? Promise.resolve([{ ...MORADOR_EXISTENTE, nome: "ana souza", cpf: "12345678901", telefone: "11987654321" }])
      : respostaListar(t));
    montar();
    await user.click(await screen.findByRole("button", { name: /^Abrir o cadastro de Ana Souza/ }));
    const ver = await screen.findByRole("dialog", { name: "Cadastro do morador" });
    expect(within(ver).getByText("Ana Souza")).toBeInTheDocument();
    expect(within(ver).queryByText("123.456.789-01")).not.toBeInTheDocument();
    expect(within(ver).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(ver).getByRole("button", { name: "WhatsApp" })).toBeInTheDocument();
  });

  it("as pílulas de situação contam e filtram", async () => {
    const user = userEvent.setup();
    mockListar.mockImplementation((t) => t === "MORADORES"
      ? Promise.resolve([MORADOR_EXISTENTE, { ...MORADOR_EXISTENTE, id: 2, nome: "Bruno Lima", status: "Inativo" }])
      : respostaListar(t));
    montar();
    await screen.findByText("Bruno Lima");
    await user.click(screen.getByRole("button", { name: /^Inativos/ }));
    expect(screen.queryByText("Ana Souza")).not.toBeInTheDocument();
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
  });

  it("no cadastro, vínculo, tipo e situação são botões lado a lado", async () => {
    const user = userEvent.setup();
    const dialog = await abrirModalDeNovoMorador(user);
    expect(within(dialog).getByRole("radio", { name: "Proprietário" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByRole("radio", { name: "Titular" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByRole("radio", { name: "Ativo" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("O erro do cadastro é da tela, não do navegador", () => {
  it("sem nome, Cadastrar mostra a frase no campo e não grava", async () => {
    const user = userEvent.setup();
    const dialog = await abrirModalDeNovoMorador(user);
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    expect(await within(dialog).findByText("Informe o nome.")).toBeInTheDocument();
    expect(mockCriar).not.toHaveBeenCalled();
  });
});
