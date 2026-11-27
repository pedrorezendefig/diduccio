import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, within, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";
import { can, ROLES } from "../auth/permissions";

/**
 * A página de Tarefas com o banco falso: carrega, filtra, move, cria, exclui.
 * E, no fim, a ligação ao sistema — rota, menu, permissão, estilo, demo —,
 * que é o que costuma faltar numa tela nova sem nenhum teste acusar.
 */

const mockListar = vi.fn();
const mockListarResponsaveis = vi.fn();
const mockCriar = vi.fn();
const mockEditar = vi.fn();
const mockRemover = vi.fn();
const mockLerNotas = vi.fn();
const mockSalvarNotas = vi.fn();
vi.mock("../api/db", () => ({
  listar: (...a) => mockListar(...a),
  listarResponsaveis: (...a) => mockListarResponsaveis(...a),
  criar: (...a) => mockCriar(...a),
  editar: (...a) => mockEditar(...a),
  remover: (...a) => mockRemover(...a),
  lerNotas: (...a) => mockLerNotas(...a),
  salvarNotas: (...a) => mockSalvarNotas(...a),
}));

import Tarefas from "../pages/Tarefas";

const CARLA = { id: 10, nome: "Carla Souza", cargo: "Sindico" };
const RAFAEL = { id: 20, nome: "Rafael", cargo: "Auxiliar Administrativo" };
const dia = (deslocamento) => new Date(Date.now() + deslocamento * 86400000).toISOString();

const TAREFAS = [
  { id: 1, titulo: "Enviar comunicado", situacao: "A_FAZER", responsavel_id: 10, prazo: dia(-2).slice(0, 10) },
  { id: 2, titulo: "Conferir contas", situacao: "EM_ANDAMENTO", responsavel_id: 20 },
  { id: 3, titulo: "Convocar assembleia", situacao: "CONCLUIDA", responsavel_id: 10, concluida_em: dia(-1) },
  { id: 4, titulo: "Pagar fornecedor antigo", situacao: "CONCLUIDA", responsavel_id: 10, concluida_em: dia(-30) },
];

function montar(user = CARLA) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Tarefas user={user} />
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  });
  mockListar.mockImplementation(async (tabela) => ({
    TAREFAS: TAREFAS.map((t) => ({ ...t })),
    UNIDADES: [],
  })[tabela] ?? []);
  mockListarResponsaveis.mockImplementation(async () => [CARLA, RAFAEL]);
  mockEditar.mockReset().mockImplementation(async (_t, id, campos) => ({ success: true, data: { id, ...campos } }));
  // Um id por tarefa criada: com o mesmo id em todas, o quadro repetiria a
  // `key` e o teste passaria por cima de um cartão sumido.
  let proximoId = 99;
  mockCriar.mockReset().mockImplementation(async (_t, linha) => ({ success: true, data: { id: proximoId++, ...linha } }));
  mockRemover.mockResolvedValue({ success: true });
  // `clearAllMocks` não descarta os `...Once` que um teste deixou sem usar;
  // sem o reset, eles vazariam para o teste seguinte.
  mockLerNotas.mockReset().mockResolvedValue("");
  mockSalvarNotas.mockReset().mockResolvedValue({ success: true });
});

const coluna = (nome) => screen.getByRole("region", { name: nome });

describe("carregar", () => {
  it("lê tarefas e unidades, e os responsáveis pela função do 0043", async () => {
    montar();
    expect(await screen.findByRole("button", { name: "Enviar comunicado" })).toBeInTheDocument();
    expect(mockListar).toHaveBeenCalledWith("TAREFAS");
    expect(mockListar).toHaveBeenCalledWith("UNIDADES");
    expect(mockListarResponsaveis).toHaveBeenCalledTimes(1);
    expect(within(coluna("Em andamento")).getByRole("button", { name: "Conferir contas" })).toBeInTheDocument();
  });

  it("nunca lê a perfis_publicos, que o 0016 derrubou", async () => {
    // Foi o defeito que derrubou o quadro em produção: aqui o `listar` é falso
    // e responde qualquer nome, então só perguntar o que foi pedido o pega.
    montar();
    await screen.findByRole("button", { name: "Enviar comunicado" });
    const pedidas = mockListar.mock.calls.map(([tabela]) => String(tabela).toLowerCase());
    expect(pedidas).not.toContain("perfis_publicos");
    expect(pedidas.sort()).toEqual(["tarefas", "unidades"]);
  });

  it("sem a lista de responsáveis o quadro abre mesmo assim, e avisa", async () => {
    mockListarResponsaveis.mockRejectedValue(new Error("Não consegui ler os responsáveis: function does not exist"));
    montar(RAFAEL);
    expect(await screen.findByRole("button", { name: "Conferir contas" })).toBeInTheDocument();
    expect(await screen.findByText("Não consegui carregar a lista de responsáveis.")).toBeInTheDocument();
    expect(screen.queryByText("Não foi possível carregar as tarefas")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova tarefa" })).toBeEnabled();
  });

  it("o cabeçalho conta abertas e atrasadas", async () => {
    montar();
    expect(await screen.findByText("2 abertas · 1 atrasada")).toBeInTheDocument();
  });

  it("falha ao carregar diz o que houve, em vez de um quadro vazio", async () => {
    mockListar.mockRejectedValue(new Error("Sua sessão expirou. Entre de novo."));
    montar();
    expect(await screen.findByText("Sua sessão expirou. Entre de novo.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "A fazer" })).not.toBeInTheDocument();
  });
});

describe("filtros", () => {
  it("\"Minhas\" mostra só as de quem está logado", async () => {
    // O filtro é do síndico (e do dev), que veem o quadro inteiro.
    montar(CARLA);
    await screen.findByRole("button", { name: "Enviar comunicado" });
    await userEvent.click(screen.getByRole("button", { name: /^Minhas/ }));
    expect(screen.queryByRole("button", { name: "Conferir contas" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar comunicado" })).toBeInTheDocument();
  });

  it("o auxiliar não vê tarefa de outro, mesmo que ela chegue à tela", async () => {
    // No banco o 0045 já recorta. No modo demonstração não há banco, e a tela
    // tem de contar a mesma história: a tarefa do síndico não aparece.
    montar(RAFAEL);
    await screen.findByRole("button", { name: "Conferir contas" });
    expect(screen.queryByRole("button", { name: "Enviar comunicado" })).not.toBeInTheDocument();
    expect(screen.getByText(/^1 aberta/)).toBeInTheDocument();
  });

  it("o auxiliar não tem o filtro \"Todas | Minhas\": tudo o que ele vê é dele", async () => {
    // O 0045 só entrega ao auxiliar as tarefas em que ele é o responsável.
    montar(RAFAEL);
    await screen.findByRole("button", { name: "Conferir contas" });
    expect(screen.queryByRole("group", { name: "Quais tarefas mostrar" })).not.toBeInTheDocument();
  });

  it("a busca filtra na hora", async () => {
    montar();
    await screen.findByRole("button", { name: "Enviar comunicado" });
    await userEvent.type(screen.getByRole("textbox", { name: "Buscar tarefa" }), "contas");
    expect(screen.queryByRole("button", { name: "Enviar comunicado" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conferir contas" })).toBeInTheDocument();
  });

  it("concluída antiga fica escondida até pedir", async () => {
    montar();
    await screen.findByRole("button", { name: "Convocar assembleia" });
    expect(screen.queryByRole("button", { name: "Pagar fornecedor antigo" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ver concluídas anteriores (1)" }));
    expect(screen.getByRole("button", { name: "Pagar fornecedor antigo" })).toBeInTheDocument();
  });
});

describe("mover", () => {
  it("grava só a situação, e o cartão muda de coluna", async () => {
    montar();
    await userEvent.click(await screen.findByRole("button", { name: "Mover Enviar comunicado" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Mover tarefa" })).getByRole("button", { name: "Aguardando" }));
    expect(mockEditar).toHaveBeenCalledWith("TAREFAS", 1, { situacao: "AGUARDANDO" });
    expect(within(coluna("Aguardando")).getByRole("button", { name: "Enviar comunicado" })).toBeInTheDocument();
  });

  it("se o banco recusa, o cartão volta e a frase aparece", async () => {
    mockEditar.mockResolvedValue({ success: false, message: "new row violates row-level security policy" });
    montar();
    await userEvent.click(await screen.findByRole("button", { name: "Mover Enviar comunicado" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Mover tarefa" })).getByRole("button", { name: "Aguardando" }));
    expect(await screen.findByText("Você não tem permissão para mexer nas tarefas.")).toBeInTheDocument();
    expect(within(coluna("A fazer")).getByRole("button", { name: "Enviar comunicado" })).toBeInTheDocument();
  });
});

describe("criar e excluir", () => {
  it("\"Nova tarefa\" grava e a tarefa aparece no quadro", async () => {
    montar();
    await screen.findByRole("button", { name: "Enviar comunicado" });
    await userEvent.click(screen.getByRole("button", { name: "Nova tarefa" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Título" }), "Trocar lâmpadas");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(mockCriar).toHaveBeenCalledWith("TAREFAS", expect.objectContaining({ titulo: "Trocar lâmpadas", responsavel_id: 10, situacao: "A_FAZER" }));
    expect(await within(coluna("A fazer")).findByRole("button", { name: "Trocar lâmpadas" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Nova tarefa" })).not.toBeInTheDocument();
  });

  it("o síndico exclui pela gaveta", async () => {
    montar(CARLA);
    await userEvent.click(await screen.findByRole("button", { name: "Conferir contas" }));
    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: 'Excluir "Conferir contas"?' })).getByRole("button", { name: "Excluir" }));
    expect(mockRemover).toHaveBeenCalledWith("TAREFAS", 2);
    expect(screen.queryByRole("button", { name: "Conferir contas" })).not.toBeInTheDocument();
  });

  it("o auxiliar exclui as dele", async () => {
    montar(RAFAEL);
    await userEvent.click(await screen.findByRole("button", { name: "Conferir contas" }));
    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: 'Excluir "Conferir contas"?' })).getByRole("button", { name: "Excluir" }));
    expect(mockRemover).toHaveBeenCalledWith("TAREFAS", 2);
  });

  it("o auxiliar só pode pôr a si mesmo como responsável", async () => {
    // Passar a tarefa para o síndico é recusado pelo 0045 — e a tarefa
    // sumiria da tela dele. A gaveta nem oferece.
    montar(RAFAEL);
    await screen.findByRole("button", { name: "Conferir contas" });
    await userEvent.click(screen.getByRole("button", { name: "Nova tarefa" }));
    const responsavel = screen.getByRole("combobox", { name: "Responsável" });
    const opcoes = within(responsavel).getAllByRole("option").map((o) => o.value).filter(Boolean);
    expect(opcoes).toEqual(["20"]);
    expect(responsavel).toHaveValue("20");
  });

  it("o síndico pode pôr o auxiliar como responsável", async () => {
    montar(CARLA);
    await screen.findByRole("button", { name: "Conferir contas" });
    await userEvent.click(screen.getByRole("button", { name: "Nova tarefa" }));
    const opcoes = within(screen.getByRole("combobox", { name: "Responsável" })).getAllByRole("option").map((o) => o.value).filter(Boolean);
    expect(opcoes).toEqual(expect.arrayContaining(["10", "20"]));
  });
});

describe("no celular", () => {
  it("vira abas", async () => {
    window.matchMedia = (query) => ({
      matches: true, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    });
    montar();
    expect(await screen.findByRole("tablist")).toBeInTheDocument();
  });
});

describe("a tela está ligada ao sistema", () => {
  const ler = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

  it("síndico, auxiliar e dev entram; porteiro e conselheiro não", () => {
    for (const cargo of [ROLES.SINDICO, ROLES.AUX, ROLES.DEV]) expect(can({ cargo }, "verTarefas")).toBe(true);
    for (const cargo of [ROLES.PORTEIRO, ROLES.CONSELHEIRO]) expect(can({ cargo }, "verTarefas")).toBe(false);
  });

  it("síndico, dev e auxiliar excluem, como manda o 0045", () => {
    for (const cargo of [ROLES.SINDICO, ROLES.DEV, ROLES.AUX]) expect(can({ cargo }, "excluirTarefa")).toBe(true);
    for (const cargo of [ROLES.PORTEIRO, ROLES.CONSELHEIRO]) expect(can({ cargo }, "excluirTarefa")).toBe(false);
  });

  it("só síndico e dev veem o quadro inteiro", () => {
    expect(can({ cargo: ROLES.SINDICO }, "verTodasTarefas")).toBe(true);
    expect(can({ cargo: ROLES.DEV }, "verTodasTarefas")).toBe(true);
    expect(can({ cargo: ROLES.AUX }, "verTodasTarefas")).toBe(false);
  });

  it("aparece no menu logo depois do Dashboard, com o mesmo recorte", () => {
    const menu = (ler("src/components/Sidebar.jsx") + ler("src/auth/menu.js"));
    expect(menu).toMatch(/Tarefas: \[ROLES\.SINDICO, ROLES\.AUX, ROLES\.DEV\]/);
    expect(menu).toMatch(/\["Dashboard", LayoutGrid\],\n\s+\["Tarefas", SquareCheckBig\],/);
  });

  it("a rota existe só para quem vê a tela", () => {
    // Um bloco próprio, e não o `cargo !== "Conselheiro"`, que deixaria o
    // porteiro abrir /tarefas pela barra de endereço.
    expect(ler("src/App.jsx")).toMatch(
      /\["Sindico", "Auxiliar Administrativo", "Desenvolvedor"\]\.includes\(usuarioLogado\.cargo\) && \(\n\s+<Route path="\/tarefas"/
    );
  });

  it("o estilo foi carregado", () => {
    expect(ler("src/main.jsx")).toContain("import './styles/tarefas.css'");
  });

  it("toda classe tar-notas do bloco tem regra no tarefas.css", () => {
    // O tokens-e-classes só cobre o prefixo vit-; classe sem regra não avisa.
    const css = ler("src/styles/tarefas.css");
    const usadas = new Set(
      [ler("src/components/BlocoDeNotas.jsx"), ler("src/pages/Tarefas.jsx")]
        .flatMap((t) => [...t.matchAll(/\btar-notas[\w-]*/g)].map((m) => m[0]))
    );
    expect(usadas.size).toBeGreaterThan(3);
    for (const classe of usadas) expect(css, `.${classe} sem regra`).toMatch(new RegExp(`\\.${classe}\\b`));
  });

  it("a página não cita a perfis_publicos, que o 0016 derrubou", () => {
    const pagina = ler("src/pages/Tarefas.jsx");
    expect(pagina).not.toContain("PERFIS_PUBLICOS");
    expect(pagina).not.toContain("perfis_publicos");
  });
});

/** Promessa que o teste resolve na ordem que quiser. */
function adiada() {
  let resolver;
  const promessa = new Promise((r) => { resolver = r; });
  return { promessa, resolver };
}

async function pedirMover(nomeCartao, destino) {
  await userEvent.click(await screen.findByRole("button", { name: `Mover ${nomeCartao}` }));
  await userEvent.click(within(screen.getByRole("dialog", { name: "Mover tarefa" })).getByRole("button", { name: destino }));
}

describe("movimentos seguidos do mesmo cartão", () => {
  const preparar = () => {
    const d1 = adiada();
    const d2 = adiada();
    mockEditar.mockReturnValueOnce(d1.promessa).mockReturnValueOnce(d2.promessa);
    return { d1, d2 };
  };

  it("o primeiro falha depois de o segundo dar certo: o cartão fica onde o banco está", async () => {
    const { d1, d2 } = preparar();
    montar();
    await pedirMover("Enviar comunicado", "Aguardando");
    await pedirMover("Enviar comunicado", "Em andamento");
    await act(async () => { d2.resolver({ success: true, data: { id: 1, situacao: "EM_ANDAMENTO" } }); });
    await act(async () => { d1.resolver({ success: false, message: "falhou" }); });
    expect(within(coluna("Em andamento")).getByRole("button", { name: "Enviar comunicado" })).toBeInTheDocument();
  });

  it("as duas dão certo fora de ordem: a resposta velha não sobrescreve a nova", async () => {
    const { d1, d2 } = preparar();
    montar();
    await pedirMover("Enviar comunicado", "Aguardando");
    await pedirMover("Enviar comunicado", "Em andamento");
    await act(async () => { d2.resolver({ success: true, data: { id: 1, situacao: "EM_ANDAMENTO" } }); });
    await act(async () => { d1.resolver({ success: true, data: { id: 1, situacao: "AGUARDANDO" } }); });
    expect(within(coluna("Em andamento")).getByRole("button", { name: "Enviar comunicado" })).toBeInTheDocument();
  });

  it("as duas falham: volta para onde o banco confirmou, não para o palpite do primeiro movimento", async () => {
    const { d1, d2 } = preparar();
    montar();
    await pedirMover("Enviar comunicado", "Aguardando");
    await pedirMover("Enviar comunicado", "Em andamento");
    await act(async () => { d1.resolver({ success: false, message: "falhou" }); });
    await act(async () => { d2.resolver({ success: false, message: "falhou" }); });
    expect(within(coluna("A fazer")).getByRole("button", { name: "Enviar comunicado" })).toBeInTheDocument();
  });
});

describe("tentar de novo", () => {
  it("mostra o carregando, não dispara cargas em paralelo e monta o quadro", async () => {
    mockListar.mockRejectedValueOnce(new Error("Sem rede."))
      .mockRejectedValueOnce(new Error("Sem rede."));
    montar();
    await screen.findByText("Sem rede.");
    expect(mockListar).toHaveBeenCalledTimes(2);
    await userEvent.dblClick(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("button", { name: "Enviar comunicado" })).toBeInTheDocument();
    expect(mockListar).toHaveBeenCalledTimes(4);
    expect(mockListarResponsaveis).toHaveBeenCalledTimes(2);
  });

  it("com a carga falha, o cabeçalho não conta, não há filtros e Nova tarefa fica desligada", async () => {
    mockListar.mockRejectedValue(new Error("Sem rede."));
    montar();
    await screen.findByText("Sem rede.");
    expect(screen.getByText("Não foi possível carregar")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Buscar tarefa" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova tarefa" })).toBeDisabled();
  });
});

describe("editar e mesclar a resposta do banco", () => {
  it("editar pela gaveta chama editar com o id e o cartão mostra o título novo", async () => {
    montar();
    await userEvent.click(await screen.findByRole("button", { name: "Conferir contas" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Título" }), " do mês");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(mockEditar).toHaveBeenCalledWith("TAREFAS", 2, expect.objectContaining({ titulo: "Conferir contas do mês" }));
    expect(await screen.findByRole("button", { name: "Conferir contas do mês" })).toBeInTheDocument();
  });

  it("mover mescla a linha do banco: o cartão ganha a data de conclusão", async () => {
    mockEditar.mockResolvedValue({ success: true, data: { id: 1, situacao: "CONCLUIDA", concluida_em: dia(0) } });
    montar();
    await pedirMover("Enviar comunicado", "Concluído");
    expect((await screen.findByRole("button", { name: "Enviar comunicado" })).closest(".tar-cartao")).toHaveTextContent(/Concluída \d{2}\/\d{2}/);
  });
});

describe("respostas atrasadas de rodadas anteriores", () => {
  const tres = () => {
    const ds = [adiada(), adiada(), adiada()];
    ds.forEach((d) => mockEditar.mockReturnValueOnce(d.promessa));
    return ds;
  };
  const ok = (situacao) => ({ success: true, data: { id: 1, situacao } });
  const cartaoEm = (col) => within(coluna(col)).getByRole("button", { name: "Enviar comunicado" });

  it("sucesso atrasado do primeiro movimento não move o cartão do terceiro", async () => {
    const [d1, d2, d3] = tres();
    montar();
    await pedirMover("Enviar comunicado", "Aguardando");
    await pedirMover("Enviar comunicado", "Em andamento");
    await act(async () => { d2.resolver(ok("EM_ANDAMENTO")); });
    await pedirMover("Enviar comunicado", "Concluído");
    await act(async () => { d1.resolver(ok("AGUARDANDO")); });
    expect(cartaoEm("Concluído")).toBeInTheDocument();
    await act(async () => { d3.resolver(ok("CONCLUIDA")); });
    expect(cartaoEm("Concluído")).toBeInTheDocument();
  });

  it("falha atrasada do primeiro movimento não gera aviso nem mexe no cartão", async () => {
    const [d1, d2, d3] = tres();
    montar();
    await pedirMover("Enviar comunicado", "Aguardando");
    await pedirMover("Enviar comunicado", "Em andamento");
    await act(async () => { d2.resolver(ok("EM_ANDAMENTO")); });
    await pedirMover("Enviar comunicado", "Concluído");
    await act(async () => { d1.resolver({ success: false, message: "new row violates row-level security policy" }); });
    expect(screen.queryByText("Você não tem permissão para mexer nas tarefas.")).not.toBeInTheDocument();
    expect(cartaoEm("Concluído")).toBeInTheDocument();
    await act(async () => { d3.resolver(ok("CONCLUIDA")); });
    expect(cartaoEm("Concluído")).toBeInTheDocument();
  });

  it("na mesma rodada, o sucesso velho não rebaixa o confirmado: o terceiro que falha volta ao segundo", async () => {
    const [d1, d2, d3] = tres();
    montar();
    await pedirMover("Enviar comunicado", "Aguardando");
    await pedirMover("Enviar comunicado", "Em andamento");
    await act(async () => { d2.resolver(ok("EM_ANDAMENTO")); });
    await act(async () => { d1.resolver(ok("AGUARDANDO")); });
    await pedirMover("Enviar comunicado", "Concluído");
    await act(async () => { d3.resolver({ success: false, message: "falhou" }); });
    expect(cartaoEm("Em andamento")).toBeInTheDocument();
  });

  it("o primeiro dá certo e o segundo falha: o cartão volta para a coluna do primeiro", async () => {
    const d1 = adiada();
    const d2 = adiada();
    mockEditar.mockReturnValueOnce(d1.promessa).mockReturnValueOnce(d2.promessa);
    montar();
    await pedirMover("Enviar comunicado", "Aguardando");
    await pedirMover("Enviar comunicado", "Em andamento");
    await act(async () => { d1.resolver(ok("AGUARDANDO")); });
    await act(async () => { d2.resolver({ success: false, message: "falhou" }); });
    expect(cartaoEm("Aguardando")).toBeInTheDocument();
  });

  it("o segundo falha com o primeiro ainda no ar, e o primeiro dá certo depois: o cartão vai para a coluna do primeiro", async () => {
    // O banco termina com a situação do primeiro. Se a rodada fechasse na
    // falha do segundo, esse sucesso chegaria como resposta velha e seria
    // ignorado: o cartão ficaria em "A fazer" com o banco em "Aguardando".
    const d1 = adiada();
    const d2 = adiada();
    mockEditar.mockReturnValueOnce(d1.promessa).mockReturnValueOnce(d2.promessa);
    montar();
    await pedirMover("Enviar comunicado", "Aguardando");
    await pedirMover("Enviar comunicado", "Em andamento");
    await act(async () => { d2.resolver({ success: false, message: "falhou" }); });
    expect(cartaoEm("A fazer")).toBeInTheDocument();
    await act(async () => { d1.resolver({ success: true, data: { id: 1, situacao: "AGUARDANDO", movida_por: "Carla Souza" } }); });
    expect(cartaoEm("Aguardando")).toBeInTheDocument();
  });

  it("depois dessa falha, um terceiro movimento que falha volta para o que o primeiro confirmou", async () => {
    const [d1, d2, d3] = tres();
    montar();
    await pedirMover("Enviar comunicado", "Aguardando");
    await pedirMover("Enviar comunicado", "Em andamento");
    await act(async () => { d2.resolver({ success: false, message: "falhou" }); });
    await pedirMover("Enviar comunicado", "Concluído");
    await act(async () => { d1.resolver(ok("AGUARDANDO")); });
    // O terceiro ainda está no ar: o sucesso velho não tira o cartão de onde a pessoa o pôs.
    expect(cartaoEm("Concluído")).toBeInTheDocument();
    await act(async () => { d3.resolver({ success: false, message: "falhou" }); });
    expect(cartaoEm("Aguardando")).toBeInTheDocument();
  });
});

/**
 * O bloco de notas na página: carrega junto com o quadro sem poder derrubá-lo,
 * e cada linha que vira tarefa sai do bloco só depois de a tarefa existir.
 */
describe("bloco de notas", () => {
  const NOTAS = "Trocar lâmpada\n\nLigar para a Enel";
  // Abrir relê o banco antes de mostrar o bloco: o diálogo chega depois.
  const abrirBloco = async (nome = /^Bloco de notas/) => {
    // Espera o quadro, e não uma tarefa específica: o auxiliar só vê as dele.
    await screen.findByRole("region", { name: "A fazer" });
    await userEvent.click(screen.getByRole("button", { name: nome }));
    return screen.findByRole("dialog", { name: "Bloco de notas" });
  };
  const botaoDoBloco = () => screen.getByRole("button", { name: /^Bloco de notas/ });
  const virarEmTarefa = async (bloco, linha) => {
    await userEvent.click(within(bloco).getByRole("button", { name: `Virar em tarefa: ${linha}` }));
    const gaveta = await screen.findByRole("dialog", { name: "Nova tarefa" });
    await userEvent.click(within(gaveta).getByRole("button", { name: "Salvar" }));
  };
  const saidaCancelada = () => {
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  };

  it("aba velha: abrir relê o banco e mostra o que outro aparelho escreveu; virar uma linha não o apaga", async () => {
    // Carregou "A" de manhã; no celular, na reunião, entrou "B".
    mockLerNotas.mockResolvedValueOnce("A").mockResolvedValue("A\nB");
    montar();
    expect(await screen.findByRole("button", { name: "Bloco de notas, 1 linha" })).toBeInTheDocument();
    const aberto = await abrirBloco();
    expect(within(aberto).getByRole("textbox", { name: "Anotações" })).toHaveValue("A\nB");
    await virarEmTarefa(aberto, "A");
    await screen.findByRole("dialog", { name: "Bloco de notas" });
    expect(mockSalvarNotas).toHaveBeenLastCalledWith(10, "B");
  });

  it("outro aparelho escreveu entre abrir o bloco e salvar a tarefa: a linha sai do texto do banco", async () => {
    mockLerNotas.mockResolvedValueOnce("A").mockResolvedValueOnce("A").mockResolvedValue("A\nB");
    montar();
    const aberto = await abrirBloco();
    await virarEmTarefa(aberto, "A");
    const reaberto = await screen.findByRole("dialog", { name: "Bloco de notas" });
    expect(mockSalvarNotas).toHaveBeenLastCalledWith(10, "B");
    expect(within(reaberto).getByRole("textbox", { name: "Anotações" })).toHaveValue("B");
  });

  it("os dois aparelhos mudaram: junta as duas versões e avisa", async () => {
    mockLerNotas.mockResolvedValueOnce("A").mockResolvedValueOnce("A").mockResolvedValue("A\nB");
    mockSalvarNotas.mockResolvedValue({ success: false, message: "Failed to fetch" });
    montar();
    // Sem rede: "C" fica só nesta tela (fechar duas vezes deixa sair sem salvar).
    const aberto = await abrirBloco();
    await userEvent.type(within(aberto).getByRole("textbox", { name: "Anotações" }), "{Enter}C");
    await userEvent.click(within(aberto).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(aberto.querySelector(".tar-notas__estado")).toHaveTextContent(/Não foi possível salvar/));
    await userEvent.click(within(aberto).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bloco de notas" })).not.toBeInTheDocument());

    mockSalvarNotas.mockResolvedValue({ success: true });
    const reaberto = await abrirBloco();
    expect(within(reaberto).getByRole("textbox", { name: "Anotações" })).toHaveValue("A\nB\nC");
    expect(await screen.findByText("O bloco mudou em outro aparelho. Juntei as duas versões.")).toBeInTheDocument();
  });

  it("falha ao reler ao abrir: o bloco abre no modo \"não carregado\"", async () => {
    mockLerNotas.mockResolvedValueOnce("A").mockRejectedValue(new Error("Failed to fetch"));
    montar();
    const aberto = await abrirBloco();
    expect(within(aberto).getByText(/Não consegui carregar o que estava salvo/)).toBeInTheDocument();
    expect(within(aberto).getByRole("textbox", { name: "Anotações" })).toHaveValue("A");
  });

  // O jsdom diz "prerender"; a volta da aba é "visible".
  const voltarAba = () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    try {
      act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    } finally {
      delete document.visibilityState;
    }
  };

  it("a aba volta a ficar visível com o bloco fechado: relê em silêncio", async () => {
    mockLerNotas.mockResolvedValueOnce("A").mockResolvedValue("A\nB");
    montar();
    await screen.findByRole("button", { name: "Bloco de notas, 1 linha" });
    voltarAba();
    expect(await screen.findByRole("button", { name: "Bloco de notas, 2 linhas" })).toBeInTheDocument();
    expect(mockLerNotas).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Juntei as duas versões/)).not.toBeInTheDocument();
  });

  it("com o bloco aberto, a aba voltar não relê (o bloco está no meio da edição)", async () => {
    montar();
    await abrirBloco();
    const antes = mockLerNotas.mock.calls.length;
    voltarAba();
    expect(mockLerNotas).toHaveBeenCalledTimes(antes);
  });

  it("o botão fica ocupado enquanto a linha virada sai do bloco, e o bloco só reabre no fim", async () => {
    mockLerNotas.mockResolvedValueOnce(NOTAS).mockResolvedValueOnce(NOTAS);
    const releitura = adiada();
    mockLerNotas.mockReturnValueOnce(releitura.promessa);
    montar();
    const aberto = await abrirBloco();
    await virarEmTarefa(aberto, "Trocar lâmpada");
    await waitFor(() => expect(botaoDoBloco()).toHaveAttribute("aria-busy", "true"));
    expect(botaoDoBloco()).toBeDisabled();
    expect(screen.queryByRole("dialog", { name: "Bloco de notas" })).not.toBeInTheDocument();
    await act(async () => { releitura.resolver(NOTAS); });
    expect(await screen.findByRole("dialog", { name: "Bloco de notas" })).toBeInTheDocument();
    expect(botaoDoBloco()).not.toHaveAttribute("aria-busy");
  });

  it("se outra gaveta abriu enquanto a linha saía, o bloco não reabre por cima dela", async () => {
    mockLerNotas.mockResolvedValueOnce(NOTAS).mockResolvedValueOnce(NOTAS);
    const releitura = adiada();
    mockLerNotas.mockReturnValueOnce(releitura.promessa);
    montar();
    const aberto = await abrirBloco();
    await virarEmTarefa(aberto, "Trocar lâmpada");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nova tarefa" })).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Nova tarefa" }));
    await act(async () => { releitura.resolver(NOTAS); });
    expect(screen.getByRole("dialog", { name: "Nova tarefa" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Bloco de notas" })).not.toBeInTheDocument();
    // A linha em branco que ficaria no começo sai junto.
    expect(mockSalvarNotas).toHaveBeenLastCalledWith(10, "Ligar para a Enel");
  });

  it("sair da página com texto por gravar pede confirmação; sem nada por gravar, não", async () => {
    mockSalvarNotas.mockReturnValue(new Promise(() => {}));
    montar();
    await screen.findByRole("button", { name: "Enviar comunicado" });
    expect(saidaCancelada()).toBe(false);
    const aberto = await abrirBloco();
    // Ainda dentro do debounce, com o bloco aberto: a última frase só existe aqui.
    await userEvent.type(within(aberto).getByRole("textbox", { name: "Anotações" }), "x");
    expect(saidaCancelada()).toBe(true);
  });

  it("depois de gravar, sair da página não pede confirmação", async () => {
    montar();
    const aberto = await abrirBloco();
    await userEvent.type(within(aberto).getByRole("textbox", { name: "Anotações" }), "x");
    await userEvent.click(within(aberto).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bloco de notas" })).not.toBeInTheDocument());
    expect(saidaCancelada()).toBe(false);
  });

  it("\"Virar as N\" leva o foco ao título da página, e não ao botão desligado", async () => {
    mockLerNotas.mockResolvedValue("a\nb");
    const primeira = adiada();
    mockCriar.mockReturnValueOnce(primeira.promessa);
    montar();
    const aberto = await abrirBloco();
    await userEvent.click(within(aberto).getByRole("button", { name: "Virar as 2 em tarefas" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Criar 2 tarefas em A fazer?" })).getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Tarefas" })).toHaveFocus());
    await act(async () => { primeira.resolver({ success: true, data: { id: 500, titulo: "a", situacao: "A_FAZER" } }); });
    expect(await screen.findByText("2 tarefas criadas.")).toBeInTheDocument();
    // Terminou: o foco volta ao botão do bloco, de onde a pessoa saiu.
    await waitFor(() => expect(botaoDoBloco()).toHaveFocus());
  });

  it("virar todas relê o banco antes de tirar as linhas: o que outro aparelho escreveu fica", async () => {
    mockLerNotas.mockResolvedValueOnce("a\nb").mockResolvedValueOnce("a\nb").mockResolvedValue("a\nb\nX");
    montar();
    const aberto = await abrirBloco();
    await userEvent.click(within(aberto).getByRole("button", { name: "Virar as 2 em tarefas" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Criar 2 tarefas em A fazer?" })).getByRole("button", { name: "Criar" }));
    expect(await screen.findByText("2 tarefas criadas.")).toBeInTheDocument();
    expect(mockSalvarNotas).toHaveBeenLastCalledWith(10, "X");
  });

  it("a releitura falha ao tirar a linha: o bloco reabre sem leitura, e fechar sem digitar não grava por cima", async () => {
    // O caminho do defeito: a linha sai só desta tela; se fechar gravasse,
    // o texto sem a nota do outro aparelho iria para o banco.
    mockLerNotas.mockResolvedValueOnce(NOTAS).mockResolvedValueOnce(NOTAS).mockRejectedValue(new Error("Failed to fetch"));
    montar();
    const aberto = await abrirBloco();
    await virarEmTarefa(aberto, "Ligar para a Enel");
    const reaberto = await screen.findByRole("dialog", { name: "Bloco de notas" });
    expect(within(reaberto).getByText(/Não consegui carregar o que estava salvo/)).toBeInTheDocument();
    expect(within(reaberto).getByRole("textbox", { name: "Anotações" })).toHaveValue("Trocar lâmpada");
    await userEvent.click(within(reaberto).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bloco de notas" })).not.toBeInTheDocument());
    expect(mockSalvarNotas).not.toHaveBeenCalled();
    // A página guarda o texto, avisa, e pergunta antes de sair.
    expect(await screen.findByText(/O bloco de notas não foi salvo/)).toBeInTheDocument();
    expect(saidaCancelada()).toBe(true);
  });

  it("uma gravação velha que responde por último não traz de volta o texto de antes", async () => {
    // Sem rede: fechar duas vezes deixa sair; a gravação da saída fica no ar.
    const velha = adiada();
    mockLerNotas.mockResolvedValue("A\nB");
    mockSalvarNotas
      .mockResolvedValueOnce({ success: false, message: "Failed to fetch" })
      .mockResolvedValueOnce({ success: false, message: "Failed to fetch" })
      .mockReturnValueOnce(velha.promessa)
      .mockResolvedValue({ success: true });
    montar();
    const aberto = await abrirBloco();
    await userEvent.type(within(aberto).getByRole("textbox", { name: "Anotações" }), "{Enter}C");
    await userEvent.click(within(aberto).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(aberto.querySelector(".tar-notas__estado")).toHaveTextContent(/Não foi possível salvar/));
    await userEvent.click(within(aberto).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(mockSalvarNotas).toHaveBeenCalledTimes(3));

    // A rede voltou: reabre, escreve mais e fecha — esta gravação responde primeiro.
    const reaberto = await abrirBloco();
    await userEvent.type(within(reaberto).getByRole("textbox", { name: "Anotações" }), "{Enter}D");
    await userEvent.click(within(reaberto).getByRole("button", { name: "Fechar" }));
    expect(await screen.findByRole("button", { name: "Bloco de notas, 4 linhas" })).toBeInTheDocument();

    // Agora a velha ("A\nB\nC") responde. A tela não volta para 3 linhas.
    await act(async () => { velha.resolver({ success: true }); });
    expect(screen.getByRole("button", { name: "Bloco de notas, 4 linhas" })).toBeInTheDocument();
    expect(saidaCancelada()).toBe(false);
  });

  it("depois de salvar a tarefa vinda do bloco, o foco vai ao título enquanto a linha sai", async () => {
    mockLerNotas.mockResolvedValueOnce(NOTAS).mockResolvedValueOnce(NOTAS);
    const releitura = adiada();
    mockLerNotas.mockReturnValueOnce(releitura.promessa);
    montar();
    const aberto = await abrirBloco();
    await virarEmTarefa(aberto, "Trocar lâmpada");
    await waitFor(() => expect(botaoDoBloco()).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByRole("heading", { level: 1, name: "Tarefas" })).toHaveFocus();
    await act(async () => { releitura.resolver(NOTAS); });
    const reaberto = await screen.findByRole("dialog", { name: "Bloco de notas" });
    await userEvent.click(within(reaberto).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bloco de notas" })).not.toBeInTheDocument());
    expect(botaoDoBloco()).toHaveFocus();
  });

  it("ao abrir o bloco, o foco vai ao título enquanto o banco é relido", async () => {
    mockLerNotas.mockResolvedValueOnce("A");
    const leitura = adiada();
    mockLerNotas.mockReturnValueOnce(leitura.promessa);
    montar();
    await screen.findByRole("button", { name: "Bloco de notas, 1 linha" });
    await userEvent.click(botaoDoBloco());
    expect(botaoDoBloco()).toBeDisabled();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Tarefas" }));
    await act(async () => { leitura.resolver("A"); });
    const aberto = await screen.findByRole("dialog", { name: "Bloco de notas" });
    // Fechar o bloco devolve o foco ao botão dele, e não ao título.
    await userEvent.click(within(aberto).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bloco de notas" })).not.toBeInTheDocument());
    expect(botaoDoBloco()).toHaveFocus();
  });

  it("o foco no título não rola a página até o topo", async () => {
    mockLerNotas.mockResolvedValueOnce("A");
    const leitura = adiada();
    mockLerNotas.mockReturnValueOnce(leitura.promessa);
    montar();
    await screen.findByRole("button", { name: "Bloco de notas, 1 linha" });
    const titulo = screen.getByRole("heading", { level: 1, name: "Tarefas" });
    const foco = vi.spyOn(titulo, "focus");
    try {
      // Voltar à aba com o foco em lugar nenhum: a releitura leva o foco ao título.
      document.activeElement?.blur?.();
      voltarAba();
      await waitFor(() => expect(foco).toHaveBeenCalled());
      for (const args of foco.mock.calls) expect(args[0]).toEqual({ preventScroll: true });
      await act(async () => { leitura.resolver("A"); });
      // Acabou a releitura e o bloco não abriu: o foco volta ao botão.
      await waitFor(() => expect(botaoDoBloco()).toHaveFocus());
    } finally {
      foco.mockRestore();
    }
  });

  it("se a pessoa levou o foco a outro campo durante a espera, ele fica lá", async () => {
    mockLerNotas.mockResolvedValueOnce("A");
    const leitura = adiada();
    mockLerNotas.mockReturnValueOnce(leitura.promessa);
    montar();
    await screen.findByRole("button", { name: "Bloco de notas, 1 linha" });
    document.activeElement?.blur?.();
    voltarAba();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Tarefas" })).toHaveFocus());
    const busca = screen.getByRole("textbox", { name: "Buscar tarefa" });
    busca.focus();
    await act(async () => { leitura.resolver("A"); });
    await waitFor(() => expect(botaoDoBloco()).not.toHaveAttribute("aria-busy"));
    expect(busca).toHaveFocus();
  });

  it("a releitura na volta da aba não tira o foco de quem está em outro campo", async () => {
    mockLerNotas.mockResolvedValueOnce("A");
    const leitura = adiada();
    mockLerNotas.mockReturnValueOnce(leitura.promessa);
    montar();
    await screen.findByRole("button", { name: "Bloco de notas, 1 linha" });
    const busca = screen.getByRole("textbox", { name: "Buscar tarefa" });
    busca.focus();
    voltarAba();
    await waitFor(() => expect(botaoDoBloco()).toHaveAttribute("aria-busy", "true"));
    expect(busca).toHaveFocus();
    await act(async () => { leitura.resolver("A"); });
  });

  it("lê o bloco de quem está logado, e o botão conta as linhas", async () => {
    mockLerNotas.mockResolvedValue(NOTAS);
    montar();
    expect(await screen.findByRole("button", { name: "Bloco de notas, 2 linhas" })).toBeEnabled();
    expect(mockLerNotas).toHaveBeenCalledWith(10);
  });

  it("bloco vazio: o botão não mostra contador", async () => {
    montar();
    await screen.findByRole("button", { name: "Enviar comunicado" });
    const botao = screen.getByRole("button", { name: "Bloco de notas" });
    expect(botao.querySelector(".tar-notas__conta")).toBeNull();
  });

  it("o botão vem antes de Nova tarefa", async () => {
    montar();
    await screen.findByRole("button", { name: "Enviar comunicado" });
    const bloco = screen.getByRole("button", { name: /^Bloco de notas/ });
    const nova = screen.getByRole("button", { name: "Nova tarefa" });
    expect(bloco.compareDocumentPosition(nova) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("virar uma linha abre a nova tarefa com o título; salvar cria, tira a linha e reabre o bloco", async () => {
    mockLerNotas.mockResolvedValue(NOTAS);
    montar();
    const aberto = await abrirBloco();
    await userEvent.click(within(aberto).getByRole("button", { name: "Virar em tarefa: Ligar para a Enel" }));

    const gaveta = await screen.findByRole("dialog", { name: "Nova tarefa" });
    expect(screen.queryByRole("dialog", { name: "Bloco de notas" })).not.toBeInTheDocument();
    expect(within(gaveta).getByRole("textbox", { name: "Título" })).toHaveValue("Ligar para a Enel");
    await userEvent.click(within(gaveta).getByRole("button", { name: "Salvar" }));

    expect(mockCriar).toHaveBeenCalledWith("TAREFAS", expect.objectContaining({ titulo: "Ligar para a Enel", responsavel_id: 10 }));
    expect(await within(coluna("A fazer")).findByRole("button", { name: "Ligar para a Enel" })).toBeInTheDocument();
    const reaberto = await screen.findByRole("dialog", { name: "Bloco de notas" });
    expect(mockSalvarNotas).toHaveBeenCalledWith(10, "Trocar lâmpada");
    expect(within(reaberto).queryByRole("button", { name: "Virar em tarefa: Ligar para a Enel" })).not.toBeInTheDocument();
    expect(within(reaberto).getByRole("button", { name: "Virar em tarefa: Trocar lâmpada" })).toBeInTheDocument();
  });

  it("cancelar a nova tarefa não mexe no bloco, e ele reabre", async () => {
    mockLerNotas.mockResolvedValue(NOTAS);
    montar();
    const aberto = await abrirBloco();
    await userEvent.click(within(aberto).getByRole("button", { name: "Virar em tarefa: Trocar lâmpada" }));
    const gaveta = await screen.findByRole("dialog", { name: "Nova tarefa" });
    await userEvent.click(within(gaveta).getByRole("button", { name: "Cancelar" }));

    const reaberto = await screen.findByRole("dialog", { name: "Bloco de notas" });
    expect(within(reaberto).getByRole("textbox", { name: "Anotações" })).toHaveValue(NOTAS);
    expect(mockCriar).not.toHaveBeenCalled();
    expect(mockSalvarNotas).not.toHaveBeenCalled();
  });

  it("se a tarefa não é criada, a linha fica no bloco", async () => {
    mockLerNotas.mockResolvedValue(NOTAS);
    mockCriar.mockResolvedValue({ success: false, message: "new row violates row-level security policy" });
    montar();
    const aberto = await abrirBloco();
    await userEvent.click(within(aberto).getByRole("button", { name: "Virar em tarefa: Trocar lâmpada" }));
    const gaveta = await screen.findByRole("dialog", { name: "Nova tarefa" });
    await userEvent.click(within(gaveta).getByRole("button", { name: "Salvar" }));
    expect(await within(gaveta).findByText("Você não tem permissão para mexer nas tarefas.")).toBeInTheDocument();
    expect(mockSalvarNotas).not.toHaveBeenCalled();
  });

  it("virar todas cria uma de cada vez, em A fazer e com quem está logado; as que falham ficam no bloco", async () => {
    mockLerNotas.mockResolvedValue("a\nb\nc");
    const ordem = [];
    mockCriar.mockImplementation(async (_t, linha) => {
      ordem.push(`começa ${linha.titulo}`);
      await Promise.resolve();
      await Promise.resolve();
      ordem.push(`termina ${linha.titulo}`);
      if (linha.titulo === "b") return { success: false, message: "falhou" };
      return { success: true, data: { id: 100 + ordem.length, ...linha } };
    });
    montar();
    const aberto = await abrirBloco("Bloco de notas, 3 linhas");
    await userEvent.click(within(aberto).getByRole("button", { name: "Virar as 3 em tarefas" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Criar 3 tarefas em A fazer?" })).getByRole("button", { name: "Criar" }));

    expect(await screen.findByText("2 criadas, 1 não. As que faltaram ficaram no bloco.")).toBeInTheDocument();
    expect(ordem).toEqual(["começa a", "termina a", "começa b", "termina b", "começa c", "termina c"]);
    expect(mockCriar).toHaveBeenCalledWith("TAREFAS", {
      titulo: "a", descricao: null, responsavel_id: 10, prazo: null, id_unidade: null, situacao: "A_FAZER",
    });
    expect(mockSalvarNotas).toHaveBeenLastCalledWith(10, "b");
    expect(within(coluna("A fazer")).getByRole("button", { name: "a" })).toBeInTheDocument();
    expect(within(coluna("A fazer")).getByRole("button", { name: "c" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bloco de notas, 1 linha" })).toBeInTheDocument();
  });

  it("virar todas sem falha diz quantas criou e esvazia o bloco", async () => {
    mockLerNotas.mockResolvedValue("a\nb");
    montar();
    const aberto = await abrirBloco();
    await userEvent.click(within(aberto).getByRole("button", { name: "Virar as 2 em tarefas" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Criar 2 tarefas em A fazer?" })).getByRole("button", { name: "Criar" }));
    expect(await screen.findByText("2 tarefas criadas.")).toBeInTheDocument();
    expect(mockSalvarNotas).toHaveBeenLastCalledWith(10, "");
    expect(screen.getByRole("button", { name: "Bloco de notas" })).toBeInTheDocument();
  });

  it("falha ao ler o bloco não derruba o quadro, avisa, e fechar o bloco vazio não grava por cima", async () => {
    mockLerNotas.mockRejectedValue(new Error("Não consegui ler o bloco de notas: relation does not exist"));
    montar();
    expect(await screen.findByRole("button", { name: "Enviar comunicado" })).toBeInTheDocument();
    expect(await screen.findByText("Não consegui carregar o bloco de notas.")).toBeInTheDocument();
    expect(screen.queryByText("Não foi possível carregar as tarefas")).not.toBeInTheDocument();

    const aberto = await abrirBloco();
    expect(within(aberto).getByText(/Não consegui carregar o que estava salvo/)).toBeInTheDocument();
    await userEvent.click(within(aberto).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog", { name: "Bloco de notas" })).not.toBeInTheDocument();
    expect(mockSalvarNotas).not.toHaveBeenCalled();
  });

  it("fechar depois de digitar grava o bloco de quem está logado", async () => {
    montar(RAFAEL);
    const aberto = await abrirBloco();
    await userEvent.type(within(aberto).getByRole("textbox", { name: "Anotações" }), "Pintar a grade");
    await userEvent.click(within(aberto).getByRole("button", { name: "Fechar" }));
    expect(mockSalvarNotas).toHaveBeenCalledWith(20, "Pintar a grade");
    expect(await screen.findByRole("button", { name: "Bloco de notas, 1 linha" })).toBeInTheDocument();
  });

  it("com o quadro sem carregar, o bloco fica desligado", async () => {
    mockListar.mockRejectedValue(new Error("Sem rede."));
    montar();
    await screen.findByText("Sem rede.");
    expect(screen.getByRole("button", { name: /^Bloco de notas/ })).toBeDisabled();
  });
});
