import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../theme/ThemeProvider";
import QuadroDeTarefas from "../components/QuadroDeTarefas";
import { agruparPorSituacao } from "../lib/tarefas";

/**
 * O quadro sem rede: recebe as tarefas agrupadas e devolve eventos. É aqui
 * que se prova que os três caminhos de mover (arrastar, botão, gaveta) chegam
 * ao mesmo `onMover` — a gaveta é testada à parte.
 */

const TAREFAS = [
  { id: 1, titulo: "Enviar comunicado da dedetização", situacao: "A_FAZER", responsavel_id: 10 },
  { id: 2, titulo: "Conferir a prestação de contas", situacao: "EM_ANDAMENTO", responsavel_id: 20, id_unidade: 7 },
  { id: 3, titulo: "Laudo do elevador", situacao: "AGUARDANDO", responsavel_id: 99 },
];
const PESSOAS = new Map([["10", { id: 10, nome: "Carla Souza", cargo: "Sindico" }], ["20", { id: 20, nome: "Rafael", cargo: "Auxiliar Administrativo" }]]);
const UNIDADES = new Map([["7", { id: 7, bloco: 5, unidade: 206 }]]);

function montar(props = {}) {
  const eventos = { onMover: vi.fn(), onAbrir: vi.fn(), onAdicionar: vi.fn(), onMostrarAnteriores: vi.fn() };
  render(
    <ThemeProvider>
      <QuadroDeTarefas
        grupos={agruparPorSituacao(TAREFAS)}
        pessoaPorId={PESSOAS}
        unidadePorId={UNIDADES}
        agora={Date.parse("2026-09-30T15:00:00-03:00")}
        {...eventos}
        {...props}
      />
    </ThemeProvider>
  );
  return eventos;
}

const cartao = (titulo) => screen.getByRole("button", { name: titulo }).closest("li");

describe("no computador", () => {
  it("mostra as quatro colunas com a contagem", () => {
    montar();
    for (const [nome, n] of [["A fazer", 1], ["Em andamento", 1], ["Aguardando", 1], ["Concluído", 0]]) {
      const coluna = screen.getByRole("region", { name: nome });
      expect(within(coluna).getByText(String(n))).toBeInTheDocument();
    }
  });

  it("o cartão mostra a unidade e as iniciais do responsável", () => {
    montar();
    const c = cartao("Conferir a prestação de contas");
    expect(within(c).getByText("B5-206")).toBeInTheDocument();
    expect(within(c).getByLabelText("Responsável: Rafael")).toHaveTextContent("R");
  });

  it("o cartão mostra o número da tarefa", () => {
    // É por ele que se fala da tarefa na reunião e no WhatsApp: "a 12 já foi?".
    montar();
    expect(within(cartao("Conferir a prestação de contas")).getByText("#2")).toBeInTheDocument();
    expect(within(cartao("Laudo do elevador")).getByText("#3")).toBeInTheDocument();
  });

  it("responsável desconhecido aparece como tal, e não como vazio", () => {
    montar();
    expect(within(cartao("Laudo do elevador")).getByLabelText("Responsável: Sem responsável")).toHaveTextContent("?");
  });

  it("arrastar para outra coluna chama onMover com a situação nova", () => {
    const { onMover } = montar();
    const origem = cartao("Enviar comunicado da dedetização");
    const destino = screen.getByRole("region", { name: "Aguardando" });
    fireEvent.dragStart(origem);
    fireEvent.dragOver(destino);
    fireEvent.drop(destino);
    expect(onMover).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "AGUARDANDO");
  });

  it("soltar na mesma coluna não move nada", () => {
    const { onMover } = montar();
    fireEvent.dragStart(cartao("Enviar comunicado da dedetização"));
    fireEvent.drop(screen.getByRole("region", { name: "A fazer" }));
    expect(onMover).not.toHaveBeenCalled();
  });

  it("clicar no título abre a tarefa", async () => {
    const { onAbrir } = montar();
    await userEvent.click(screen.getByRole("button", { name: "Laudo do elevador" }));
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
  });

  it("\"Adicionar tarefa\" fica só em A fazer", async () => {
    const { onAdicionar } = montar();
    const botoes = screen.getAllByRole("button", { name: "Adicionar tarefa" });
    expect(botoes).toHaveLength(1);
    expect(screen.getByRole("region", { name: "A fazer" })).toContainElement(botoes[0]);
    await userEvent.click(botoes[0]);
    expect(onAdicionar).toHaveBeenCalledWith("A_FAZER");
  });

  it("concluídas escondidas ganham o botão para mostrar", async () => {
    const { onMostrarAnteriores } = montar({ escondidas: 5 });
    await userEvent.click(screen.getByRole("button", { name: "Ver concluídas anteriores (5)" }));
    expect(onMostrarAnteriores).toHaveBeenCalled();
  });
});

describe("o botão Mover, que é o caminho do teclado e do celular", () => {
  it("abre as outras três situações e move", async () => {
    const { onMover } = montar();
    await userEvent.click(screen.getByRole("button", { name: "Mover Enviar comunicado da dedetização" }));
    const dialogo = screen.getByRole("dialog", { name: "Mover tarefa" });
    const opcoes = within(dialogo).getAllByRole("button").map((b) => b.textContent).filter((t) => t !== "");
    expect(opcoes).toEqual(expect.arrayContaining(["Em andamento", "Aguardando", "Concluído"]));
    expect(opcoes).not.toContain("A fazer");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Concluído" }));
    expect(onMover).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "CONCLUIDA");
    expect(screen.queryByRole("dialog", { name: "Mover tarefa" })).not.toBeInTheDocument();
  });
});

describe("no celular", () => {
  it("uma situação por vez, em abas com contagem", async () => {
    montar({ estreito: true });
    const abas = screen.getByRole("tablist");
    expect(within(abas).getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Enviar comunicado da dedetização" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Laudo do elevador" })).not.toBeInTheDocument();
    await userEvent.click(within(abas).getByRole("tab", { name: /Aguardando/ }));
    expect(screen.getByRole("button", { name: "Laudo do elevador" })).toBeInTheDocument();
  });

  it("não arrasta: o dedo rola a tela", () => {
    montar({ estreito: true });
    expect(cartao("Enviar comunicado da dedetização")).not.toHaveAttribute("draggable", "true");
  });
});

function Vivo(props) {
  const [tarefas, setTarefas] = useState(TAREFAS);
  return (
    <ThemeProvider>
      <QuadroDeTarefas
        grupos={agruparPorSituacao(tarefas)}
        pessoaPorId={PESSOAS}
        unidadePorId={UNIDADES}
        agora={Date.parse("2026-09-30T15:00:00-03:00")}
        onAbrir={() => {}}
        onAdicionar={() => {}}
        onMostrarAnteriores={() => {}}
        onMover={(t, s) => setTarefas((antes) => antes.map((x) => (x.id === t.id ? { ...x, situacao: s } : x)))}
        {...props}
      />
    </ThemeProvider>
  );
}

describe("foco e anúncio depois de mover", () => {
  const TITULO = "Enviar comunicado da dedetização";

  it("no computador, o foco vai para o Mover do cartão na coluna nova", async () => {
    render(<Vivo />);
    await userEvent.click(screen.getByRole("button", { name: `Mover ${TITULO}` }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Mover tarefa" })).getByRole("button", { name: "Aguardando" }));
    const botao = screen.getByRole("button", { name: `Mover ${TITULO}` });
    expect(botao).toHaveFocus();
    expect(screen.getByRole("region", { name: "Aguardando" })).toContainElement(botao);
  });

  it("no celular, a aba de destino é aberta e o foco vai para o cartão", async () => {
    render(<Vivo estreito />);
    await userEvent.click(screen.getByRole("button", { name: `Mover ${TITULO}` }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Mover tarefa" })).getByRole("button", { name: "Aguardando" }));
    expect(screen.getByRole("tab", { name: /Aguardando/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: `Mover ${TITULO}` })).toHaveFocus();
  });

  it("anuncia a mudança para leitores de tela, pelo botão e pelo arrasto", async () => {
    render(<Vivo />);
    expect(document.querySelector(".tar-anuncio")).toHaveAttribute("aria-live", "polite");
    await userEvent.click(screen.getByRole("button", { name: `Mover ${TITULO}` }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Mover tarefa" })).getByRole("button", { name: "Aguardando" }));
    expect(screen.getByText(`“${TITULO}” movida para Aguardando.`)).toBeInTheDocument();
    fireEvent.dragStart(cartao("Laudo do elevador"));
    fireEvent.drop(screen.getByRole("region", { name: "Concluído" }));
    expect(screen.getByText("“Laudo do elevador” movida para Concluído.")).toBeInTheDocument();
  });

  it("duas tarefas para a mesma coluna dão anúncios diferentes", () => {
    render(<Vivo />);
    const anuncio = () => document.querySelector(".tar-anuncio").textContent;
    fireEvent.dragStart(cartao(TITULO));
    fireEvent.drop(screen.getByRole("region", { name: "Aguardando" }));
    const primeiro = anuncio();
    fireEvent.dragStart(cartao("Conferir a prestação de contas"));
    fireEvent.drop(screen.getByRole("region", { name: "Aguardando" }));
    expect(anuncio()).not.toBe(primeiro);
    expect(anuncio()).toContain("Conferir a prestação de contas");
  });
});

describe("arrastar, em detalhe", () => {
  it("soltar sem ter começado a arrastar não move nada", () => {
    const { onMover } = montar();
    fireEvent.drop(screen.getByRole("region", { name: "Aguardando" }));
    expect(onMover).not.toHaveBeenCalled();
  });

  it("destaca só a coluna de destino, não a de origem", () => {
    montar();
    fireEvent.dragStart(cartao("Enviar comunicado da dedetização"));
    fireEvent.dragOver(screen.getByRole("region", { name: "A fazer" }));
    fireEvent.dragOver(screen.getByRole("region", { name: "Aguardando" }));
    expect(screen.getByRole("region", { name: "Aguardando" })).toHaveClass("tar-coluna--alvo");
    expect(screen.getByRole("region", { name: "A fazer" })).not.toHaveClass("tar-coluna--alvo");
  });

  it("sair da coluna tira o destaque", () => {
    montar();
    fireEvent.dragStart(cartao("Enviar comunicado da dedetização"));
    const destino = screen.getByRole("region", { name: "Aguardando" });
    fireEvent.dragOver(destino);
    fireEvent.dragLeave(destino, { relatedTarget: document.body });
    expect(destino).not.toHaveClass("tar-coluna--alvo");
  });
});

describe("pequenos detalhes", () => {
  it("sem concluídas escondidas não há botão para mostrar", () => {
    montar({ escondidas: 0 });
    expect(screen.queryByRole("button", { name: /Ver concluídas anteriores/ })).not.toBeInTheDocument();
  });

  it("no celular o botão Mover tem o texto visível", () => {
    montar({ estreito: true });
    expect(screen.getByRole("button", { name: "Mover Enviar comunicado da dedetização" })).toHaveTextContent("Mover");
  });

  it("o avatar é uma imagem com nome", () => {
    montar();
    expect(screen.getByRole("img", { name: "Responsável: Rafael" })).toBeInTheDocument();
  });
});
