import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import {
  Button, Card, Badge, Stat, PageHeader, Skeleton, Ocupado, EmptyState,
  Field, Input, Select, Textarea, Checkbox,
  Table, Tabs, Modal,
  ToastProvider, useToast,
  ConfirmProvider, useConfirm,
} from "../ui";

afterEach(cleanup);

/* ======================= AÇÃO E SUPERFÍCIE ======================= */

describe("Button", () => {
  it("dispara onClick", async () => {
    const aoClicar = vi.fn();
    render(<Button onClick={aoClicar}>Salvar</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(aoClicar).toHaveBeenCalledOnce();
  });

  it("em loading fica desabilitado e marcado como busy", () => {
    render(<Button loading>Salvando</Button>);
    const b = screen.getByRole("button");
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
  });

  it("não dispara onClick quando desabilitado", async () => {
    const aoClicar = vi.fn();
    render(<Button disabled onClick={aoClicar}>Nada</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(aoClicar).not.toHaveBeenCalled();
  });

  it("aplica a classe da variante e do tamanho", () => {
    render(<Button variant="danger" size="sm">Excluir</Button>);
    const b = screen.getByRole("button");
    expect(b.className).toContain("vit-btn--danger");
    expect(b.className).toContain("vit-btn--sm");
  });
});

describe("Card, Badge, Stat, PageHeader, Skeleton, EmptyState", () => {
  it("Card não recebe sombra por padrão, só a classe de borda", () => {
    const { container } = render(<Card>conteudo</Card>);
    const el = container.firstChild;
    expect(el.className).toContain("vit-card");
    expect(el.style.boxShadow).toBe("");
  });

  it("Badge aplica o tom", () => {
    render(<Badge tone="danger">Inadimplente</Badge>);
    expect(screen.getByText("Inadimplente").className).toContain("vit-badge--danger");
  });

  it("Stat mostra rótulo, valor e dica", () => {
    render(<Stat label="Ocupadas" value="117" hint="de 128" tone="brand" />);
    expect(screen.getByText("Ocupadas")).toBeInTheDocument();
    expect(screen.getByText("117")).toBeInTheDocument();
    expect(screen.getByText("de 128")).toBeInTheDocument();
  });

  it("PageHeader usa h1 e mostra meta e ações", () => {
    render(
      <PageHeader
        title="Unidades"
        meta="128 unidades · 9 inadimplentes"
        actions={<Button>Nova</Button>}
      />
    );
    expect(screen.getByRole("heading", { level: 1, name: "Unidades" })).toBeInTheDocument();
    expect(screen.getByText("128 unidades · 9 inadimplentes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova" })).toBeInTheDocument();
  });

  it("Skeleton com count gera N placeholders", () => {
    const { container } = render(<Skeleton count={4} />);
    expect(container.querySelectorAll(".vit-skel")).toHaveLength(4);
  });

  it("Ocupado só aparece quando aberto, e é anunciado pelo leitor de tela", () => {
    const { rerender } = render(<Ocupado open={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<Ocupado open mensagem="Salvando a reserva..." />);
    const veu = screen.getByRole("status");
    expect(veu).toHaveAttribute("aria-live", "polite");
    expect(veu).toHaveTextContent("Salvando a reserva...");
  });

  it("EmptyState sempre oferece o próximo passo", () => {
    render(
      <EmptyState
        title="Nenhuma unidade cadastrada"
        description="Cadastre a primeira unidade ou importe a planilha."
        action={<Button variant="primary">Nova unidade</Button>}
      />
    );
    expect(screen.getByText("Nenhuma unidade cadastrada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova unidade" })).toBeInTheDocument();
  });
});

/* ======================= FORMULÁRIO ======================= */

describe("Field", () => {
  it("liga rótulo ao controle", () => {
    render(<Field label="CPF"><Input /></Field>);
    expect(screen.getByLabelText("CPF")).toBeInTheDocument();
  });

  it("liga a ajuda por aria-describedby", () => {
    render(<Field label="CPF" help="Só números"><Input /></Field>);
    const input = screen.getByLabelText("CPF");
    const ajudaId = input.getAttribute("aria-describedby");
    expect(ajudaId).toBeTruthy();
    expect(document.getElementById(ajudaId)).toHaveTextContent("Só números");
  });

  it("com erro marca aria-invalid e mostra a mensagem abaixo", () => {
    render(<Field label="CPF" error="CPF inválido"><Input /></Field>);
    const input = screen.getByLabelText("CPF");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("CPF inválido")).toBeInTheDocument();
  });

  it("o erro substitui a ajuda, para não empilhar duas mensagens", () => {
    render(<Field label="CPF" help="Só números" error="CPF inválido"><Input /></Field>);
    expect(screen.queryByText("Só números")).not.toBeInTheDocument();
    expect(screen.getByText("CPF inválido")).toBeInTheDocument();
  });

  it("Select e Textarea também recebem a ligação", () => {
    const { unmount } = render(
      <Field label="Bloco"><Select><option value="5">B5</option></Select></Field>
    );
    expect(screen.getByLabelText("Bloco")).toBeInTheDocument();
    unmount();
    render(<Field label="Observação"><Textarea /></Field>);
    expect(screen.getByLabelText("Observação")).toBeInTheDocument();
  });

  it("Checkbox tem rótulo clicável", async () => {
    const aoMudar = vi.fn();
    render(<Checkbox label="Morador cadastrado" onChange={aoMudar} />);
    await userEvent.click(screen.getByText("Morador cadastrado"));
    expect(aoMudar).toHaveBeenCalled();
  });
});

/* ======================= TABLE ======================= */

const COLUNAS = [
  { key: "unidade", label: "Unidade", tipo: "id" },
  { key: "morador", label: "Morador" },
  { key: "taxa", label: "Taxa", tipo: "num", sortable: true },
];

const LINHAS = [
  { unidade: "B5-304", morador: "Renata Vasconcelos", taxa: "742,10" },
  { unidade: "B5-117", morador: "Aurélio Bittencourt", taxa: "2.226,30" },
  { unidade: "B5-1102", morador: "", taxa: null },
];

describe("Table", () => {
  it("renderiza cabeçalho e linhas", () => {
    render(<Table columns={COLUNAS} rows={LINHAS} getRowKey={(l) => l.unidade} />);
    expect(screen.getByText("Unidade")).toBeInTheDocument();
    expect(screen.getByText("B5-304")).toBeInTheDocument();
    expect(screen.getByText("Renata Vasconcelos")).toBeInTheDocument();
  });

  it("célula sem valor recebe hífen, nunca fica em branco", () => {
    const { container } = render(
      <Table columns={COLUNAS} rows={LINHAS} getRowKey={(l) => l.unidade} />
    );
    // A linha B5-1102 tem morador "" e taxa null: dois hifens.
    expect(container.querySelectorAll(".vit-table__vazio")).toHaveLength(2);
  });

  it("número recebe a classe monoespaçada tabular", () => {
    const { container } = render(
      <Table columns={COLUNAS} rows={LINHAS} getRowKey={(l) => l.unidade} />
    );
    expect(container.querySelectorAll(".vit-table__num").length).toBeGreaterThan(0);
  });

  /**
   * O cabeçalho de coluna numérica precisa ir para a direita junto com o valor.
   *
   * Só a célula recebia a classe de alinhamento, então o rótulo ficava na
   * esquerda e o número na direita — as duas pontas da mesma coluna. Nas horas
   * de entrada e saída da tela de Entregas a distância passava de 50px e o
   * horário parecia estar embaixo da coluna vizinha.
   */
  it("o cabeçalho de coluna numérica alinha à direita, como a célula", () => {
    const { container } = render(
      <Table columns={COLUNAS} rows={LINHAS} getRowKey={(l) => l.unidade} />
    );
    const cabecalhos = [...container.querySelectorAll("thead th")];
    const taxa = cabecalhos.find((th) => th.textContent.includes("Taxa"));
    const unidade = cabecalhos.find((th) => th.textContent.includes("Unidade"));
    expect(taxa.className).toContain("vit-table__th-num");
    // E a coluna de texto continua à esquerda: alinhar tudo à direita seria
    // trocar um desalinhamento por outro.
    expect(unidade.className).not.toContain("vit-table__th-num");
  });

  it("a classe do cabeçalho existe no CSS, com o alinhamento", () => {
    // O componente e a folha de estilo são arquivos diferentes: a classe pode
    // ser aplicada e não existir. O teste passaria e a tela continuaria torta.
    const css = readFileSync("src/styles/ui.css", "utf8");
    expect(css).toMatch(/th\.vit-table__th-num\s*\{[^}]*text-align:\s*right/);
  });

  it("ordenação alterna asc e desc na mesma coluna", async () => {
    const aoOrdenar = vi.fn();
    const { rerender } = render(
      <Table columns={COLUNAS} rows={LINHAS} onSort={aoOrdenar} getRowKey={(l) => l.unidade} />
    );
    await userEvent.click(screen.getByRole("button", { name: /Taxa/ }));
    expect(aoOrdenar).toHaveBeenCalledWith({ key: "taxa", dir: "asc" });

    rerender(
      <Table columns={COLUNAS} rows={LINHAS} sort={{ key: "taxa", dir: "asc" }}
             onSort={aoOrdenar} getRowKey={(l) => l.unidade} />
    );
    await userEvent.click(screen.getByRole("button", { name: /Taxa/ }));
    expect(aoOrdenar).toHaveBeenLastCalledWith({ key: "taxa", dir: "desc" });
  });

  it("expõe aria-sort na coluna ordenada", () => {
    render(
      <Table columns={COLUNAS} rows={LINHAS} sort={{ key: "taxa", dir: "desc" }}
             onSort={() => {}} getRowKey={(l) => l.unidade} />
    );
    expect(screen.getByRole("columnheader", { name: /Taxa/ }))
      .toHaveAttribute("aria-sort", "descending");
  });

  it("carregando mostra esqueleto na forma da tabela, não spinner", () => {
    const { container } = render(<Table columns={COLUNAS} rows={[]} loading />);
    expect(container.querySelectorAll(".vit-skel").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
  });

  it("sem linhas mostra o estado vazio e nenhuma tabela", () => {
    const { container } = render(
      <Table columns={COLUNAS} rows={[]} empty={<EmptyState title="Nada aqui" />} />
    );
    expect(screen.getByText("Nada aqui")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
  });

  it("ações de linha continuam no DOM, para seguirem acessíveis por teclado", () => {
    render(
      <Table
        columns={COLUNAS}
        rows={LINHAS}
        getRowKey={(l) => l.unidade}
        rowActions={(l) => <Button size="sm">Editar {l.unidade}</Button>}
      />
    );
    // Sem hover: os botões existem e são focáveis. Nunca display:none.
    expect(screen.getByRole("button", { name: "Editar B5-304" })).toBeInTheDocument();
  });

  it("cada célula carrega o rótulo da coluna, usado no colapso mobile", () => {
    const { container } = render(
      <Table columns={COLUNAS} rows={LINHAS} getRowKey={(l) => l.unidade} />
    );
    expect(container.querySelector('td[data-rotulo="Unidade"]')).toBeInTheDocument();
  });
});

/* ======================= TABS ======================= */

describe("Tabs", () => {
  it("marca a aba ativa e notifica a troca", async () => {
    const aoMudar = vi.fn();
    render(
      <Tabs
        items={[
          { value: "pendentes", label: "Pendentes", count: 14 },
          { value: "entregues", label: "Entregues" },
        ]}
        value="pendentes"
        onChange={aoMudar}
      />
    );
    expect(screen.getByRole("tab", { name: /Pendentes/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("14")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Entregues" }));
    expect(aoMudar).toHaveBeenCalledWith("entregues");
  });
});

/* ======================= MODAL ======================= */

describe("Modal", () => {
  it("fechado não renderiza nada", () => {
    render(<Modal open={false} title="Editar">corpo</Modal>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("aberto expõe dialog modal com o título", () => {
    render(<Modal open onClose={() => {}} title="Editar unidade">corpo</Modal>);
    const d = screen.getByRole("dialog");
    expect(d).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Editar unidade" })).toBeInTheDocument();
  });

  it("Esc fecha", () => {
    const aoFechar = vi.fn();
    render(<Modal open onClose={aoFechar} title="Editar">corpo</Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(aoFechar).toHaveBeenCalled();
  });

  it("clique no fundo fecha, clique no conteúdo não", () => {
    const aoFechar = vi.fn();
    const { container } = render(<Modal open onClose={aoFechar} title="Editar">corpo</Modal>);
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(aoFechar).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.querySelector(".vit-overlay"));
    expect(aoFechar).toHaveBeenCalledOnce();
    expect(container).toBeTruthy();
  });

  it("trava o scroll do body enquanto aberto e devolve ao fechar", () => {
    const { rerender } = render(<Modal open onClose={() => {}} title="X">c</Modal>);
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<Modal open={false} onClose={() => {}} title="X">c</Modal>);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("botão de fechar tem nome acessível", () => {
    render(<Modal open onClose={() => {}} title="Editar">corpo</Modal>);
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
  });
});

/* ======================= TOAST ======================= */

function DisparaToast() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success("Unidade salva")}>ok</button>
      <button onClick={() => toast.error("Não foi possível salvar a unidade")}>erro</button>
    </>
  );
}

describe("Toast", () => {
  it("mostra sucesso como status", async () => {
    render(<ToastProvider><DisparaToast /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "ok" }));
    expect(await screen.findByText("Unidade salva")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("erro usa role alert, para leitor de tela interromper", async () => {
    render(<ToastProvider><DisparaToast /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "erro" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar a unidade"
    );
  });

  it("pode ser fechado na mão", async () => {
    render(<ToastProvider><DisparaToast /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "ok" }));
    await userEvent.click(screen.getByRole("button", { name: "Fechar aviso" }));
    await waitFor(() =>
      expect(screen.queryByText("Unidade salva")).not.toBeInTheDocument()
    );
  });

  it("empilha vários avisos", async () => {
    render(<ToastProvider><DisparaToast /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "ok" }));
    await userEvent.click(screen.getByRole("button", { name: "erro" }));
    expect(document.querySelectorAll(".vit-toast")).toHaveLength(2);
  });

  it("fora do provider explica o erro", () => {
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<DisparaToast />)).toThrow(/ToastProvider/);
    silencio.mockRestore();
  });

  it("código fora do React consegue avisar pelo repórter", async () => {
    // postBackend não tem contexto do React: reporta por este canal em vez
    // de usar alert() nativo.
    const { reportarErro } = await import("../api/reporter");
    render(<ToastProvider><span /></ToastProvider>);
    reportarErro("Sessão inválida");
    expect(await screen.findByRole("alert")).toHaveTextContent("Sessão inválida");
  });

  it("sem provider montado, o repórter avisa no console e não trava a aba", async () => {
    const { reportarErro } = await import("../api/reporter");
    cleanup();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportarErro("erro sem provider");
    expect(aviso).toHaveBeenCalledWith("[Diduccio]", "erro sem provider");
    aviso.mockRestore();
  });
});

/* ======================= CONFIRM ======================= */

function DisparaConfirm({ aoResponder }) {
  const confirm = useConfirm();
  return (
    <button
      onClick={async () => {
        const r = await confirm({
          title: "Excluir a reserva de B5-304?",
          description: "Salão de festas, sábado 14h. Não dá para desfazer.",
          confirmLabel: "Excluir",
          danger: true,
        });
        aoResponder(r);
      }}
    >
      excluir
    </button>
  );
}

describe("Confirm", () => {
  it("resolve true ao confirmar", async () => {
    const aoResponder = vi.fn();
    render(<ConfirmProvider><DisparaConfirm aoResponder={aoResponder} /></ConfirmProvider>);
    await userEvent.click(screen.getByRole("button", { name: "excluir" }));
    expect(await screen.findByText("Excluir a reserva de B5-304?")).toBeInTheDocument();
    expect(screen.getByText(/Não dá para desfazer/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(aoResponder).toHaveBeenCalledWith(true));
  });

  it("resolve false ao cancelar", async () => {
    const aoResponder = vi.fn();
    render(<ConfirmProvider><DisparaConfirm aoResponder={aoResponder} /></ConfirmProvider>);
    await userEvent.click(screen.getByRole("button", { name: "excluir" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(aoResponder).toHaveBeenCalledWith(false));
  });

  it("ação destrutiva usa o botão danger", async () => {
    render(<ConfirmProvider><DisparaConfirm aoResponder={() => {}} /></ConfirmProvider>);
    await userEvent.click(screen.getByRole("button", { name: "excluir" }));
    const botao = await screen.findByRole("button", { name: "Excluir" });
    expect(botao.className).toContain("vit-btn--danger");
  });

  it("fora do provider explica o erro", () => {
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<DisparaConfirm aoResponder={() => {}} />)).toThrow(/ConfirmProvider/);
    silencio.mockRestore();
  });
});
