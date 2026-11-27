import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ToastProvider, ConfirmProvider } from "../ui";

/**
 * Salão de festas e churrasqueira são telas gêmeas — uma nasceu como cópia da
 * outra. As TABELAS de anexo delas, não:
 *
 *   uploads_festas        id = TEXTO, sem identity  →  a tela precisa gerar
 *                         id_festa = NUMERIC
 *   uploads_churrasqueira id = BIGINT identity      →  a tela NÃO pode mandar
 *                         id_festa = TEXTO
 *
 * É invertido nos dois campos. Copiar o bloco de uma tela para a outra —
 * exatamente o que já aconteceu nesta base, quando remover anexo da piscina
 * apagava da churrasqueira — grava sem erro nenhum e quebra o vínculo entre o
 * anexo e a reserva: o arquivo sobe, a linha entra, e o anexo simplesmente não
 * aparece mais em tela. Nada falha, nada avisa.
 *
 * Por isso o teste olha o FORMATO da chamada, e não só se ela aconteceu.
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

const mockEnviar = vi.fn();
const mockRemoverAnexo = vi.fn();
const mockRemoverPasta = vi.fn();
vi.mock("../api/anexos", () => ({
  enviarAnexo: (...a) => mockEnviar(...a),
  urlDoAnexo: async (r) => r?.caminho_storage ? "https://bucket.local/assinada" : (r?.url_drive ?? null),
  urlsDosAnexos: async (cs) => new Map((cs ?? []).filter(Boolean).map((c) => [c, "https://bucket.local/assinada"])),
  removerAnexo: (...a) => mockRemoverAnexo(...a),
  removerAnexosDoRegistro: (...a) => mockRemoverPasta(...a),
  arquivoDoApp: (c) => String(c ?? "").startsWith("reservas-morador/"),
}));

const Festas = (await import("../pages/Festas")).default;
const Churrasqueira = (await import("../pages/Churrasqueira")).default;

const USUARIO = { nome: "Marcelo Tavares", cargo: "Sindico" };

function montar(Pagina) {
  return render(
    <MemoryRouter>
      <ThemeProvider><ToastProvider><ConfirmProvider>
        <Pagina user={USUARIO} />
      </ConfirmProvider></ToastProvider></ThemeProvider>
    </MemoryRouter>
  );
}

/**
 * Uma reserva completa: as telas validam unidade, morador, cpf, contato, data e
 * taxa antes de salvar, e sem todos eles o teste pararia na validação em vez de
 * chegar no que interessa. `rg` só é exigido pela churrasqueira — as duas telas
 * são gêmeas, mas não idênticas nem aqui.
 *
 * Os valores são inventados de propósito. A primeira versão deste arquivo
 * trazia o CPF, o RG e o telefone de um morador real, copiados de uma linha do
 * banco enquanto eu montava o cenário — e isso iria para o repositório, onde
 * dado pessoal não entra nem em teste.
 */
const RESERVA = {
  id: 77, data_reserva: "2026-05-16", unidade_id: 1504, morador: "Fulano de Teste",
  status: "Pendente", cpf: "000.000.000-00", contato: "(21) 90000-0000", valor_taxa: 100,
  rg: "00.000.000-0", churrasqueira: "CH-A",
};

/** Entra em Editar pelo lápis da reserva, com o formulário já preenchido. */
async function editarPrimeira(user) {
  await user.click(await screen.findByRole("button", { name: "Editar reserva de Fulano de Teste" }));
}

/** Anexa um PDF e salva. */
async function anexarESalvar(user) {
  // O formulário é um <Modal>, desenhado num portal no <body>: fora do container.
  const entrada = document.querySelector('input[type="file"]');
  await user.upload(entrada, new File(["%PDF-1.4"], "contrato.pdf", { type: "application/pdf" }));
  // O FileReader é assíncrono: sem esperar, o clique em Salvar acontece antes
  // de `fotosNovas` existir e o teste passaria sem ter enviado nada.
  await waitFor(() => expect(document.querySelectorAll(".res-anexo--novo").length).toBeGreaterThan(0));
  await user.click(screen.getByRole("button", { name: /Salvar/i }));
}

/**
 * DUAS reservas, não uma. Com uma linha só, `Array.sort` nunca chama o
 * comparador — e foi exatamente assim que o `parseDate` quebrado passou por
 * esta suíte e estourou na tela do Lucas ao abrir /festas.
 */
const SEGUNDA = { ...RESERVA, id: 78, morador: "Ana Prado", data_reserva: "2024-11-03" };

function dados({ chaveUpload, idUpload, caminho = "festas/77/contrato.pdf" }) {
  return (tabela) => {
    if (tabela === "FESTAS" || tabela === "CHURRASQUEIRA") return Promise.resolve([RESERVA, SEGUNDA]);
    if (tabela === "UNIDADES") return Promise.resolve([{ id: 1504, bloco: 15, unidade: 4 }]);
    if (tabela === "MORADORES") return Promise.resolve([]);
    return Promise.resolve([{
      id: idUpload, [chaveUpload]: RESERVA.id,
      nome_arquivo: "contrato.pdf", caminho_storage: caminho,
    }]);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCriar.mockResolvedValue({ success: true, data: { id: 77 } });
  mockEditar.mockResolvedValue({ success: true, data: { id: 77 } });
  mockRemover.mockResolvedValue({ success: true });
  mockEnviar.mockResolvedValue({ success: true, caminho: "festas/77/x.pdf", nome: "x.pdf" });
  mockRemoverAnexo.mockResolvedValue({ success: true });
  mockRemoverPasta.mockResolvedValue({ success: true, removidos: 1 });
});

/** Abre a reserva, aciona Excluir e confirma no diálogo. */
async function excluirPrimeira(user) {
  // Pela reserva, não pela posição: com duas linhas a ordenação decide quem vem
  // primeiro, e a churrasqueira ainda desenha o mesmo botão duas vezes (tabela
  // e cartão do celular). Índice fixo testava uma linha diferente a cada vez.
  await user.click(await screen.findByRole("button", { name: "Ver reserva de Fulano de Teste" }));
  const detalhe = await screen.findByRole("dialog", { name: "Detalhes da reserva" });
  await user.click(within(detalhe).getByRole("button", { name: "Excluir" }));
  // O diálogo de confirmação, que abre por cima do detalhe: os dois têm "Excluir".
  const dialogos = await screen.findAllByRole("dialog");
  await user.click(within(dialogos[dialogos.length - 1]).getByRole("button", { name: "Excluir" }));
}

/**
 * Abrir o DETALHE de uma reserva.
 *
 * Este bloco existe porque dois defeitos de renderização seguidos escaparam da
 * suíte e apareceram na tela do Lucas — o segundo aqui, na gaveta: as telas
 * liam `selectedFesta.id_unidade`, mas a coluna em `festas`/`churrasqueira` é
 * `unidade_id`. O nome errado veio de `moradores`, onde `id_unidade` existe de
 * verdade. Campo inexistente é `undefined`, `undefined.toString()` derruba a
 * árvore inteira, e nenhum teste que apenas MONTA a página encosta nisso.
 */
describe.each([
  ["Salão de festas", () => Festas, "festas"],
  ["Churrasqueira", () => Churrasqueira, "churrasqueira"],
])("%s: abrir o detalhe", (_nome, Pagina, _chave) => {
  beforeEach(() => { mockListar.mockImplementation(dados({ chaveUpload: "id_festa", idUpload: "UP-1-0" })); });

  it("mostra a unidade da reserva sem derrubar a tela", async () => {
    const user = userEvent.setup();
    montar(Pagina());
    await screen.findByText("Fulano de Teste");

    const olhos = await screen.findAllByRole("button", { name: /Ver reserva de Fulano de Teste/ });
    await user.click(olhos[0]);

    // A unidade 1504 vem de `unidade_id`. Com o nome antigo o detalhe nem abria.
    const detalhe = await screen.findByRole("dialog");
    // Aparece no topo e no cartão da reserva, à esquerda (desenho de Encomendas).
    expect(within(detalhe).getAllByText(/B15-4/).length).toBeGreaterThan(0);
  });

  it("reserva sem unidade não derruba a tela", async () => {
    // Coluna anulável é a regra no banco, não a exceção: `unidade_id` pode
    // estar em branco e a gaveta só deve dizer que não há unidade.
    mockListar.mockImplementation((tabela) =>
      tabela === "FESTAS" || tabela === "CHURRASQUEIRA"
        ? Promise.resolve([{ ...RESERVA, unidade_id: null }, SEGUNDA])
        : dados({ chaveUpload: "id_festa", idUpload: "UP-1-0" })(tabela));

    const user = userEvent.setup();
    montar(Pagina());
    await screen.findByText("Fulano de Teste");

    const olhos = await screen.findAllByRole("button", { name: /Ver reserva de Fulano de Teste/ });
    await user.click(olhos[0]);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("Salão de festas: anexo", () => {
  beforeEach(() => { mockListar.mockImplementation(dados({ chaveUpload: "id_festa", idUpload: "UP-1-0" })); });

  it("exclui a reserva ANTES dos anexos, e varre a pasta do bucket", async () => {
    const user = userEvent.setup();
    montar(Festas);
    await screen.findByText("Fulano de Teste");

    await excluirPrimeira(user);

    await waitFor(() => expect(mockRemoverPasta).toHaveBeenCalledWith("festas", 77));

    // A reserva sai primeiro: se a ordem se invertesse e a exclusão da reserva
    // falhasse, sobraria uma reserva viva sem nenhum documento — irreversível.
    const ordem = mockRemover.mock.calls.map(c => c[0]);
    expect(ordem[0]).toBe("FESTAS");
    expect(ordem).toContain("UPLOADS_FESTAS");
  });

  it("grava a linha de anexo com id de TEXTO e id_festa NUMÉRICO", async () => {
    const user = userEvent.setup();
    montar(Festas);
    await screen.findByText("Fulano de Teste");

    await editarPrimeira(user);
    await anexarESalvar(user);

    await waitFor(() => expect(mockCriar).toHaveBeenCalledWith("UPLOADS_FESTAS", expect.anything()));
    const linha = mockCriar.mock.calls.find(c => c[0] === "UPLOADS_FESTAS")[1];

    // `uploads_festas.id` é text primary key SEM identity: se a tela não mandar,
    // o insert falha. E `id_festa` é numeric — mandar "77" como texto grava,
    // mas o vínculo com a reserva se perde na comparação da tela.
    expect(typeof linha.id).toBe("string");
    expect(typeof linha.id_festa).toBe("number");
    expect(linha.caminho_storage).toBe("festas/77/x.pdf");
    expect(mockEnviar).toHaveBeenCalledWith("festas", 77, expect.any(String));
  });

  it("desfaz o upload quando a linha do anexo não entra", async () => {
    // Arquivo no bucket sem linha que o referencie não aparece em tela nenhuma
    // e nunca mais é apagado por ninguém: órfão invisível, para sempre.
    mockCriar.mockImplementation(async (tabela) =>
      tabela === "UPLOADS_FESTAS" ? { success: false, message: "erro" } : { success: true, data: { id: 77 } });

    const user = userEvent.setup();
    montar(Festas);
    await screen.findByText("Fulano de Teste");

    await editarPrimeira(user);
    await anexarESalvar(user);

    await waitFor(() => expect(mockRemoverAnexo).toHaveBeenCalledWith("festas/77/x.pdf"));
  });

  it("não apaga nada do bucket quando a exclusão da reserva é negada", async () => {
    mockRemover.mockResolvedValue({ success: false, message: "row-level security" });
    const user = userEvent.setup();
    montar(Festas);
    await screen.findByText("Fulano de Teste");

    await excluirPrimeira(user);

    await waitFor(() => expect(mockRemover).toHaveBeenCalled());
    expect(mockRemoverPasta).not.toHaveBeenCalled();
    expect(mockRemoverAnexo).not.toHaveBeenCalled();
  });
});

describe("Churrasqueira: anexo", () => {
  beforeEach(() => { mockListar.mockImplementation(dados({ chaveUpload: "id_festa", idUpload: 5 })); });

  it("exclui a reserva ANTES dos anexos, e varre a pasta do bucket", async () => {
    const user = userEvent.setup();
    montar(Churrasqueira);
    await screen.findByText("Fulano de Teste");

    await excluirPrimeira(user);

    await waitFor(() => expect(mockRemoverPasta).toHaveBeenCalledWith("churrasqueira", 77));
    expect(mockRemover.mock.calls[0][0]).toBe("CHURRASQUEIRA");
  });

  it("grava a linha de anexo SEM id e com id_festa em TEXTO — o inverso de festas", async () => {
    const user = userEvent.setup();
    montar(Churrasqueira);
    await screen.findByText("Fulano de Teste");

    await editarPrimeira(user);
    await anexarESalvar(user);

    await waitFor(() => expect(mockCriar).toHaveBeenCalledWith("UPLOADS_CHURRASQUEIRA", expect.anything()));
    const linha = mockCriar.mock.calls.find(c => c[0] === "UPLOADS_CHURRASQUEIRA")[1];

    // Aqui `id` é bigint identity: mandar um "UP-..." de texto, copiado da tela
    // gêmea, faz o insert falhar. E `id_festa` é TEXTO, não numeric.
    expect(linha.id).toBeUndefined();
    expect(typeof linha.id_festa).toBe("string");
    expect(mockEnviar).toHaveBeenCalledWith("churrasqueira", 77, expect.any(String));
  });
});

describe.each([
  ["Salão de festas", () => Festas],
  ["Churrasqueira", () => Churrasqueira],
])("%s: filtro de bloco", (_nome, Pagina) => {
  it("fica no Mais filtros e filtra pelo bloco da unidade", async () => {
    // Duas unidades em blocos diferentes: a segunda reserva vai para o bloco 2.
    mockListar.mockImplementation((tabela) => {
      if (tabela === "FESTAS" || tabela === "CHURRASQUEIRA") return Promise.resolve([RESERVA, { ...SEGUNDA, unidade_id: 201 }]);
      if (tabela === "UNIDADES") return Promise.resolve([{ id: 1504, bloco: 15, unidade: 4 }, { id: 201, bloco: 2, unidade: 1 }]);
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    montar(Pagina());
    await screen.findByText("Fulano de Teste");

    await user.click(screen.getByRole("button", { name: /Mais filtros/ }));
    await user.click(within(screen.getByRole("radiogroup", { name: "Bloco" })).getByRole("radio", { name: "B2" }));

    expect(screen.queryByText("Fulano de Teste")).not.toBeInTheDocument();
    expect(screen.getByText("Ana Prado")).toBeInTheDocument();
  });
});


/**
 * Trocar o comprovante (0098): o Auxiliar Administrativo tira o anexo da
 * reserva. Anexo posto pela administração sai da lista e do bucket; o
 * comprovante que o morador mandou pelo app sai só da lista (o arquivo é o
 * recibo dele, o mesmo que o app e Confirmações mostram).
 */
describe.each([
  ["Salão de festas", () => Festas, "UPLOADS_FESTAS", "id_festa", "UP-1-0"],
  ["Churrasqueira", () => Churrasqueira, "UPLOADS_CHURRASQUEIRA", "id_festa", 5],
])("%s: o auxiliar tira o anexo", (_, pagina, tabela, chaveUpload, idUpload) => {
  async function tirar(caminho) {
    mockListar.mockImplementation(dados({ chaveUpload, idUpload, caminho }));
    const user = userEvent.setup();
    render(
      <MemoryRouter><ThemeProvider><ToastProvider><ConfirmProvider>
        {React.createElement(pagina(), { user: { nome: "Nayra Brito", cargo: "Auxiliar Administrativo" } })}
      </ConfirmProvider></ToastProvider></ThemeProvider></MemoryRouter>
    );
    await editarPrimeira(user);
    await user.click((await screen.findAllByRole("button", { name: "Remover contrato.pdf" }))[0]);
    const dialogos = await screen.findAllByRole("dialog");
    await user.click(within(dialogos[dialogos.length - 1]).getByRole("button", { name: "Remover" }));
    await waitFor(() => expect(mockRemover).toHaveBeenCalledWith(tabela, idUpload));
  }

  it("anexo da administração: sai da reserva e do bucket", async () => {
    await tirar("festas/77/contrato.pdf");
    await waitFor(() => expect(mockRemoverAnexo).toHaveBeenCalledWith("festas/77/contrato.pdf"));
  });

  it("comprovante enviado pelo app: sai da reserva, mas o arquivo fica", async () => {
    await tirar("reservas-morador/12/pix.pdf");
    expect(mockRemoverAnexo).not.toHaveBeenCalled();
  });
});
