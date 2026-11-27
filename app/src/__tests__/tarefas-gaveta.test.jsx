import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";
import GavetaDeTarefa from "../components/GavetaDeTarefa";

const PESSOAS = [
  { id: 10, nome: "Carla Souza", cargo: "Sindico" },
  { id: 20, nome: "Rafael", cargo: "Auxiliar Administrativo" },
];
const UNIDADES = [{ id: 7, bloco: 5, unidade: 206 }];
const CARLA = { id: 10, nome: "Carla Souza", cargo: "Sindico" };

function montar(props = {}) {
  const eventos = {
    onFechar: vi.fn(),
    onSalvar: vi.fn(async () => ({ success: true })),
    onExcluir: vi.fn(async () => ({ success: true })),
  };
  render(
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <GavetaDeTarefa pessoas={PESSOAS} unidades={UNIDADES} user={CARLA} podeExcluir={false} {...eventos} {...props} />
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
  return eventos;
}

describe("nova tarefa", () => {
  it("abre vazia, com quem cria como responsável e na situação pedida", () => {
    montar({ situacaoInicial: "AGUARDANDO" });
    expect(screen.getByRole("dialog", { name: "Nova tarefa" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Responsável" })).toHaveValue("10");
    expect(screen.getByRole("radio", { name: "Aguardando" })).toHaveAttribute("aria-checked", "true");
  });

  it("sem título não salva, e diz por quê", async () => {
    const { onSalvar } = montar();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Dê um título à tarefa.")).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it("salva no formato da tabela", async () => {
    const { onSalvar } = montar();
    await userEvent.type(screen.getByRole("textbox", { name: "Título" }), "Trocar lâmpadas do hall");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Responsável" }), "20");
    await userEvent.click(screen.getByRole("radio", { name: "Em andamento" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith({
      titulo: "Trocar lâmpadas do hall",
      descricao: null,
      responsavel_id: 20,
      prazo: null,
      id_unidade: null,
      situacao: "EM_ANDAMENTO",
    });
  });

  it("falha ao salvar fica na gaveta, com a frase de gente", async () => {
    const onSalvar = vi.fn(async () => ({ success: false, message: "new row violates row-level security policy" }));
    montar({ onSalvar });
    await userEvent.type(screen.getByRole("textbox", { name: "Título" }), "X");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Você não tem permissão para mexer nas tarefas.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Nova tarefa" })).toBeInTheDocument();
  });

  it("tarefa que sumiu ou sem permissão no banco também fica na gaveta, com a frase de gente", async () => {
    const onSalvar = vi.fn(async () => ({ success: false, message: "Cannot coerce the result to a single JSON object" }));
    montar({ onSalvar });
    await userEvent.type(screen.getByRole("textbox", { name: "Título" }), "X");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(
      await screen.findByText("A tarefa não existe mais ou você não tem permissão. Recarregue a página.")
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Nova tarefa" })).toBeInTheDocument();
  });

  it("vinda do bloco de notas, nasce com o título da linha", async () => {
    const { onSalvar } = montar({ tituloInicial: "Ligar para a Enel" });
    expect(screen.getByRole("dialog", { name: "Nova tarefa" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("Ligar para a Enel");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith(expect.objectContaining({ titulo: "Ligar para a Enel", responsavel_id: 10 }));
  });

  it("título inicial não vale para tarefa que já existe", () => {
    montar({ tarefa: { id: 5, titulo: "Existente", situacao: "A_FAZER", responsavel_id: 10 }, tituloInicial: "Outro" });
    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("Existente");
  });

  it("não oferece excluir o que ainda não existe", () => {
    montar({ podeExcluir: true });
    expect(screen.queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
  });
});

describe("tarefa existente", () => {
  const TAREFA = {
    id: 5, titulo: "Cotar conserto do portão", descricao: "Três orçamentos", situacao: "EM_ANDAMENTO",
    responsavel_id: 20, prazo: "2026-10-02", id_unidade: 7,
    created_by: "Carla Souza", created_at: "2026-09-26T13:00:00Z",
  };

  it("vem preenchida, com a linha de quem criou", () => {
    montar({ tarefa: TAREFA });
    const dialogo = screen.getByRole("dialog", { name: "Editar tarefa" });
    expect(within(dialogo).getByText("Tarefa #5. Criada por Carla Souza em 26/09.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("Cotar conserto do portão");
    expect(screen.getByLabelText("Prazo")).toHaveValue("2026-10-02");
    expect(screen.getByRole("combobox", { name: "Responsável" })).toHaveValue("20");
  });

  it("o auxiliar não vê Excluir", () => {
    montar({ tarefa: TAREFA, podeExcluir: false });
    expect(screen.queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
  });

  it("excluir pergunta antes, e só exclui confirmando", async () => {
    const { onExcluir } = montar({ tarefa: TAREFA, podeExcluir: true });
    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    const pergunta = await screen.findByRole("dialog", { name: 'Excluir "Cotar conserto do portão"?' });
    expect(onExcluir).not.toHaveBeenCalled();
    await userEvent.click(within(pergunta).getByRole("button", { name: "Excluir" }));
    expect(onExcluir).toHaveBeenCalledWith(TAREFA);
  });

  it("responsável fora da lista não se perde ao abrir e salvar sem mexer", async () => {
    const { onSalvar } = montar({ tarefa: { ...TAREFA, responsavel_id: 99 } });
    expect(screen.getByRole("combobox", { name: "Responsável" })).toHaveValue("99");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith(expect.objectContaining({ responsavel_id: 99 }));
  });

  it("tarefa existente sem responsável não é dada a quem abriu", async () => {
    const { onSalvar } = montar({ tarefa: { ...TAREFA, responsavel_id: null } });
    expect(screen.getByRole("combobox", { name: "Responsável" })).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Escolha o responsável.")).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it("enquanto exclui, Salvar, Excluir e Cancelar ficam desligados", async () => {
    montar({ tarefa: TAREFA, podeExcluir: true, onExcluir: vi.fn(() => new Promise(() => {})) });
    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    const pergunta = await screen.findByRole("dialog", { name: 'Excluir "Cotar conserto do portão"?' });
    await userEvent.click(within(pergunta).getByRole("button", { name: "Excluir" }));
    expect(await screen.findByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Excluir" })).toBeDisabled();
  });

  it("onSalvar que rejeita não deixa a gaveta travada", async () => {
    const onSalvar = vi.fn(async () => { throw new Error("Failed to fetch"); });
    montar({ tarefa: TAREFA, onSalvar });
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Sem conexão com o servidor. Tente de novo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  it("o texto de ajuda da Unidade está ligado ao campo", () => {
    montar({ tarefa: { ...TAREFA, id_unidade: null } });
    const campo = screen.getByRole("textbox", { name: "Unidade" });
    expect(campo).toHaveAccessibleDescription(/Opcional/);
  });

  it("as setas movem a seleção e o foco da situação", async () => {
    montar({ tarefa: TAREFA });
    const atual = screen.getByRole("radio", { name: "Em andamento" });
    expect(atual).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "A fazer" })).toHaveAttribute("tabindex", "-1");
    atual.focus();
    await userEvent.keyboard("{ArrowRight}");
    const proximo = screen.getByRole("radio", { name: "Aguardando" });
    expect(proximo).toHaveAttribute("aria-checked", "true");
    expect(proximo).toHaveFocus();
  });
});
