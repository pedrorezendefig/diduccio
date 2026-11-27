import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * A janela "Notícias no app" do Comunicado (23/11/2026): publicadas e
 * arquivadas, com ver e editar (título, texto, quebras e letra).
 */
const api = vi.hoisted(() => ({
  listarTodasAsNoticias: vi.fn(),
  editarNoticia: vi.fn(),
  republicarNoticia: vi.fn(),
  retirarNoticia: vi.fn(),
  fixarNoticia: vi.fn(),
  anexosDaNoticia: vi.fn(),
  tirarAnexoDaNoticia: vi.fn(),
  tirarPdfDaNoticia: vi.fn(),
  linkDoPdfDaNoticia: vi.fn(),
  acrescentarAnexosNaNoticia: vi.fn(),
}));
vi.mock("../api/noticias", async (original) => ({ ...(await original()), ...api }));
const confirmar = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../ui/useConfirm", () => ({ default: () => confirmar, useConfirm: () => confirmar }));

import { ToastProvider } from "../ui/Toast";
import NoticiasDoApp from "../components/comunicado/NoticiasDoApp";

const FOTO = { id: 31, caminho: "3/1-piscina.jpg", tipo: "imagem", nome: "piscina.jpg", tamanho: 250000, ordem: 0, url: "https://bucket/3/1-piscina.jpg" };

const NOTICIAS = [
  { id: 3, titulo: "Manutenção da piscina", texto: "A piscina fecha terça.\nDas 8h às 14h.", tamanho_texto: null, fixada: true, publicada_em: "2026-11-23T13:00:00Z", retirada_em: null, caminho_pdf: "noticias/3/c.pdf", anexos: 1 },
  { id: 2, titulo: "Coleta de lixo reciclável", texto: "Agora às quartas.", tamanho_texto: 18, fixada: false, publicada_em: "2026-11-20T13:00:00Z", retirada_em: null, caminho_pdf: null, anexos: 0 },
  { id: 1, titulo: "Festa junina", texto: "Já passou.", tamanho_texto: null, fixada: false, publicada_em: "2026-06-10T13:00:00Z", retirada_em: "2026-07-01T13:00:00Z", caminho_pdf: null, anexos: 0 },
];

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.listarTodasAsNoticias.mockResolvedValue({ success: true, data: NOTICIAS });
  api.editarNoticia.mockResolvedValue({ success: true });
  api.republicarNoticia.mockResolvedValue({ success: true });
  api.retirarNoticia.mockResolvedValue({ success: true });
  api.fixarNoticia.mockResolvedValue({ success: true });
  api.anexosDaNoticia.mockImplementation(async (id) => ({ success: true, data: id === 3 ? [FOTO] : [] }));
  api.tirarAnexoDaNoticia.mockResolvedValue({ success: true });
  api.tirarPdfDaNoticia.mockResolvedValue({ success: true });
  api.acrescentarAnexosNaNoticia.mockResolvedValue({ success: true, falharam: [] });
});

const abrir = () => {
  const onMudou = vi.fn();
  render(<ToastProvider><NoticiasDoApp open onClose={vi.fn()} onMudou={onMudou} /></ToastProvider>);
  return { onMudou };
};

describe("Notícias no app: a lista", () => {
  it("começa nas publicadas, com a contagem das duas pílulas", async () => {
    abrir();
    expect(await screen.findByText("Manutenção da piscina")).toBeInTheDocument();
    expect(screen.getByText("Coleta de lixo reciclável")).toBeInTheDocument();
    expect(screen.queryByText("Festa junina")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Arquivadas/ }));
    expect(screen.getByText("Festa junina")).toBeInTheDocument();
    expect(screen.queryByText("Manutenção da piscina")).not.toBeInTheDocument();
  });

  it("a busca procura no título e no texto", async () => {
    abrir();
    await screen.findByText("Manutenção da piscina");
    await userEvent.type(screen.getByPlaceholderText("Título ou texto da notícia"), "quartas");
    expect(screen.getByText("Coleta de lixo reciclável")).toBeInTheDocument();
    expect(screen.queryByText("Manutenção da piscina")).not.toBeInTheDocument();
  });
});

describe("Notícias no app: editar", () => {
  it("o lápis abre o editar com o celular; salva título, texto com quebra e letra", async () => {
    const user = userEvent.setup();
    const { onMudou } = abrir();
    await screen.findByText("Coleta de lixo reciclável");
    await user.click(screen.getByRole("button", { name: "Editar a notícia Coleta de lixo reciclável" }));
    const dialogo = screen.getByRole("dialog", { name: "Editar notícia" });
    const titulo = within(dialogo).getByLabelText(/Título no app/);
    await user.clear(titulo);
    await user.type(titulo, "Coleta seletiva");
    expect(within(dialogo).getByText("18px")).toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: "Aumentar a letra no app" }));
    await user.click(within(dialogo).getByRole("button", { name: "Editar o texto da notícia no app" }));
    const caixa = within(dialogo).getByRole("textbox", { name: "Texto da notícia no app" });
    await user.type(caixa, "{Enter}Às 8h.");
    await user.click(within(dialogo).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.editarNoticia).toHaveBeenCalledWith(2, { titulo: "Coleta seletiva", texto: "Agora às quartas.\nÀs 8h.", tamanhoTexto: 20 }));
    expect(onMudou).toHaveBeenCalled();
    // Depois de salvar, volta para o ver.
    expect(await screen.findByRole("dialog", { name: "Notícia no app" })).toBeInTheDocument();
  });

  it("sem mudança, o Salvar fica desligado", async () => {
    abrir();
    await screen.findByText("Coleta de lixo reciclável");
    await userEvent.click(screen.getByRole("button", { name: "Editar a notícia Coleta de lixo reciclável" }));
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });
});

describe("Notícias no app: ver, retirar e publicar de novo", () => {
  it("o ver da publicada mostra o texto com as quebras e deixa retirar", async () => {
    abrir();
    await screen.findByText("Manutenção da piscina");
    // A linha e o olho têm o mesmo nome: os dois abrem o ver.
    await userEvent.click(screen.getAllByRole("button", { name: "Ver a notícia Manutenção da piscina" })[0]);
    const dialogo = screen.getByRole("dialog", { name: "Notícia no app" });
    expect(within(dialogo).getByLabelText("Texto da notícia").innerHTML).toContain("A piscina fecha terça.<br>Das 8h às 14h.");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Retirar do app" }));
    await waitFor(() => expect(api.retirarNoticia).toHaveBeenCalledWith(3));
  });

  it("a arquivada pode ser publicada de novo", async () => {
    abrir();
    await screen.findByText("Manutenção da piscina");
    await userEvent.click(screen.getByRole("button", { name: /Arquivadas/ }));
    await userEvent.click(screen.getAllByRole("button", { name: "Ver a notícia Festa junina" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Publicar de novo" }));
    await waitFor(() => expect(api.republicarNoticia).toHaveBeenCalledWith(1));
  });
});

describe("Notícias no app: anexos (0117)", () => {
  const verPiscina = async () => {
    abrir();
    await screen.findByText("Manutenção da piscina");
    await userEvent.click(screen.getAllByRole("button", { name: "Ver a notícia Manutenção da piscina" })[0]);
    return within(screen.getByRole("dialog", { name: "Notícia no app" }));
  };

  it("o ver lista o PDF do comunicado e as fotos, com abrir e tirar", async () => {
    const d = await verPiscina();
    expect(await d.findByText("piscina.jpg")).toBeInTheDocument();
    expect(d.getByText("Comunicado em PDF")).toBeInTheDocument();
    expect(d.getByText("2 no app")).toBeInTheDocument();
    expect(d.getByRole("button", { name: "Abrir piscina.jpg" })).toBeInTheDocument();
  });

  it("tirar a foto pede confirmação e chama o banco", async () => {
    const d = await verPiscina();
    await d.findByText("piscina.jpg");
    await userEvent.click(d.getByRole("button", { name: "Tirar piscina.jpg" }));
    expect(confirmar).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tirar "piscina.jpg" da notícia?', danger: true }));
    await waitFor(() => expect(api.tirarAnexoDaNoticia).toHaveBeenCalledWith(FOTO));
  });

  it("tirar o PDF do comunicado", async () => {
    const d = await verPiscina();
    await d.findByText("piscina.jpg");
    await userEvent.click(d.getByRole("button", { name: "Tirar o comunicado em PDF" }));
    await waitFor(() => expect(api.tirarPdfDaNoticia).toHaveBeenCalledWith(3, "noticias/3/c.pdf"));
  });

  it("sem anexos, avisa", async () => {
    abrir();
    await screen.findByText("Coleta de lixo reciclável");
    await userEvent.click(screen.getAllByRole("button", { name: "Ver a notícia Coleta de lixo reciclável" })[0]);
    expect(await screen.findByText("Esta notícia não tem foto, vídeo nem documento.")).toBeInTheDocument();
  });

  const editarPiscina = async () => {
    abrir();
    await screen.findByText("Manutenção da piscina");
    await userEvent.click(screen.getByRole("button", { name: "Editar a notícia Manutenção da piscina" }));
    const d = within(screen.getByRole("dialog", { name: "Editar notícia" }));
    await d.findByText("piscina.jpg");
    return d;
  };
  const arquivo = (nome, tipo, tamanho = 1000) => new File([new Uint8Array(tamanho)], nome, { type: tipo });

  it("o ver não tem campo de arquivo; o editar acrescenta depois dos que já existem", async () => {
    const d0 = await verPiscina();
    await d0.findByText("piscina.jpg");
    expect(screen.queryByLabelText("Acrescentar arquivos à notícia")).toBeNull();
    await userEvent.click(d0.getByRole("button", { name: "Editar" }));
    const d = within(screen.getByRole("dialog", { name: "Editar notícia" }));
    await d.findByText("piscina.jpg");
    const novos = [arquivo("aviso.pdf", "application/pdf"), arquivo("quadra.png", "image/png")];
    await userEvent.upload(d.getByLabelText("Acrescentar arquivos à notícia"), novos);
    await waitFor(() => expect(api.acrescentarAnexosNaNoticia).toHaveBeenCalledWith(3, novos, expect.objectContaining({ ordemInicial: 1 })));
    expect(await screen.findByText("2 arquivos acrescentados à notícia.")).toBeInTheDocument();
  });

  it("arquivo que o app não mostra fica de fora, com o motivo", async () => {
    const d = await editarPiscina();
    await userEvent.upload(d.getByLabelText("Acrescentar arquivos à notícia"), [arquivo("planilha.xlsx", "application/vnd.ms-excel")], { applyAccept: false });
    expect(await d.findByText(/planilha\.xlsx: Só vídeo/)).toBeInTheDocument();
    expect(api.acrescentarAnexosNaNoticia).not.toHaveBeenCalled();
  });

  it("o que não subiu é avisado", async () => {
    api.acrescentarAnexosNaNoticia.mockResolvedValue({ success: true, falharam: ["quadra.png"] });
    const d = await editarPiscina();
    await userEvent.upload(d.getByLabelText("Acrescentar arquivos à notícia"), [arquivo("aviso.pdf", "application/pdf"), arquivo("quadra.png", "image/png")]);
    expect(await screen.findByText(/Não subiu: quadra\.png/)).toBeInTheDocument();
  });

});
