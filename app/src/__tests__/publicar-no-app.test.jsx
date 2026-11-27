import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Publicar no app do morador (0082): título editável só para o app, prévia
 * ao vivo no celular, e quantos anexos quiser (vídeo, imagem, PDF).
 */
const { publicarNoticia } = vi.hoisted(() => ({ publicarNoticia: vi.fn() }));
vi.mock("../api/noticias", async (original) => ({ ...(await original()), publicarNoticia }));

import PublicarNoApp from "../components/comunicado/PublicarNoApp";

const TEXTO = "A piscina fecha amanhã das 9h às 12h.\n\nPedimos a compreensão de todos.";
const arquivo = (nome, tipo, tamanho = 1000) => {
  const f = new File(["x"], nome, { type: tipo });
  Object.defineProperty(f, "size", { value: tamanho });
  return f;
};

beforeEach(() => {
  publicarNoticia.mockReset().mockResolvedValue({ success: true, id: 5, semPdf: false, falharam: [] });
  URL.createObjectURL = vi.fn(() => "blob:previa");
  URL.revokeObjectURL = vi.fn();
});

function abrir(extra = {}) {
  const props = {
    onClose: vi.fn(),
    gerarPdf: vi.fn(async () => new Blob(["%PDF"], { type: "application/pdf" })),
    onPublicado: vi.fn(),
    ...extra,
  };
  render(<PublicarNoApp open tituloInicial="Manutenção da piscina" texto={TEXTO} {...props} />);
  return props;
}

describe("Publicar no app: o título e a prévia", () => {
  it("o título começa igual ao da folha e a prévia mostra título e texto como no app", () => {
    abrir();
    expect(screen.getByLabelText(/Título no app/)).toHaveValue("Manutenção da piscina");
    const previa = within(screen.getByRole("complementary", { name: "Prévia no app do morador" }));
    expect(previa.getByRole("heading", { name: "Manutenção da piscina" })).toBeInTheDocument();
    expect(previa.getByText("A piscina fecha amanhã das 9h às 12h.")).toBeInTheDocument();
    expect(previa.getByText("Pedimos a compreensão de todos.")).toBeInTheDocument();
    expect(previa.getByText("Comunicado em PDF")).toBeInTheDocument();
  });

  it("editar o título muda a prévia na hora; título curto não publica", async () => {
    const user = userEvent.setup();
    abrir();
    const campo = screen.getByLabelText(/Título no app/);
    await user.clear(campo);
    await user.type(campo, "Piscina fechada amanhã");
    const previa = within(screen.getByRole("complementary", { name: "Prévia no app do morador" }));
    expect(previa.getByRole("heading", { name: "Piscina fechada amanhã" })).toBeInTheDocument();
    await user.clear(campo);
    await user.type(campo, "Pi");
    expect(screen.getByText("O título precisa de 3 a 160 caracteres.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Publicar no app/ })).toBeDisabled();
  });

  it("fixar mostra o selo na prévia; sem o PDF do comunicado, ele sai da prévia", async () => {
    const user = userEvent.setup();
    abrir();
    const previa = within(screen.getByRole("complementary", { name: "Prévia no app do morador" }));
    await user.click(screen.getByRole("switch", { name: /Fixar no topo/ }));
    expect(previa.getByText("Fixada")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: /Anexar o comunicado em PDF/ }));
    expect(previa.queryByText("Comunicado em PDF")).not.toBeInTheDocument();
  });
});

describe("Publicar no app: os anexos", () => {
  it("aceita vídeo, imagem e PDF, recusa o resto e o que passa de 50 MB", async () => {
    const user = userEvent.setup({ applyAccept: false });
    abrir();
    const entrada = document.querySelector("input[type=file]");
    await user.upload(entrada, [
      arquivo("aviso.mp4", "video/mp4", 8e6),
      arquivo("foto.jpg", "image/jpeg"),
      arquivo("regras.pdf", "application/pdf"),
      arquivo("planilha.zip", "application/zip"),
      arquivo("filme.mov", "video/quicktime", 60 * 1024 * 1024),
    ]);
    const lista = within(screen.getByRole("list", { name: /Anexos, na ordem/ }));
    expect(lista.getAllByRole("listitem")).toHaveLength(3);
    expect(lista.getByText("aviso.mp4")).toBeInTheDocument();
    const recusa = screen.getByRole("alert");
    expect(recusa).toHaveTextContent("planilha.zip: Só vídeo");
    expect(recusa).toHaveTextContent("filme.mov: Passa de 50 MB");
    const previa = within(screen.getByRole("complementary", { name: "Prévia no app do morador" }));
    expect(previa.getByText("regras.pdf")).toBeInTheDocument();
  });

  it("subir, descer e tirar mudam a ordem; publicar manda na ordem da lista", async () => {
    const user = userEvent.setup();
    const props = abrir();
    const entrada = document.querySelector("input[type=file]");
    const a = arquivo("a.jpg", "image/jpeg");
    const b = arquivo("b.pdf", "application/pdf");
    const c = arquivo("c.mp4", "video/mp4");
    await user.upload(entrada, [a, b, c]);
    await user.click(screen.getByRole("button", { name: "Subir c.mp4" }));
    await user.click(screen.getByRole("button", { name: "Tirar a.jpg" }));
    const campo = screen.getByLabelText(/Título no app/);
    await user.clear(campo);
    await user.type(campo, "Piscina fechada");
    await user.click(screen.getByRole("switch", { name: /Fixar no topo/ }));
    await user.click(screen.getByRole("button", { name: /Publicar no app/ }));

    await waitFor(() => expect(publicarNoticia).toHaveBeenCalled());
    const pedido = publicarNoticia.mock.calls[0][0];
    expect(pedido.titulo).toBe("Piscina fechada");
    expect(pedido.texto).toBe(TEXTO);
    expect(pedido.fixada).toBe(true);
    expect(pedido.pdf).toBeInstanceOf(Blob);
    expect(pedido.anexos.map((f) => f.name)).toEqual(["c.mp4", "b.pdf"]);
    await waitFor(() => expect(props.onPublicado).toHaveBeenCalledWith(expect.objectContaining({ success: true, pdfFalhou: false })));
  });

  it("o PDF do comunicado que não gera não impede publicar: a tela é avisada", async () => {
    const user = userEvent.setup();
    const props = abrir({ gerarPdf: vi.fn(async () => { throw new Error("canvas"); }) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: /Publicar no app/ }));
    await waitFor(() => expect(props.onPublicado).toHaveBeenCalledWith(expect.objectContaining({ success: true, pdfFalhou: true })));
    expect(publicarNoticia.mock.calls[0][0].pdf).toBeNull();
  });
});

describe("Publicar no app: texto, quebras e letra editáveis na prévia (23/11/2026)", () => {
  it("clica no texto do celular, edita com Enter e publica o texto novo (a folha não muda)", async () => {
    const user = userEvent.setup();
    abrir();
    const previa = within(screen.getByRole("complementary", { name: "Prévia no app do morador" }));
    await user.click(previa.getByRole("button", { name: "Editar o texto da notícia no app" }));
    const caixa = previa.getByRole("textbox", { name: "Texto da notícia no app" });
    expect(caixa).toHaveValue(TEXTO);
    await user.clear(caixa);
    await user.type(caixa, "Piscina fechada amanhã.{Enter}Das 9h às 12h.{Enter}{Enter}Obrigado.");
    await user.click(screen.getByLabelText(/Título no app/)); // sai da edição
    // Fora da edição, a prévia mostra a quebra de linha e o parágrafo novo.
    const texto = previa.getByRole("button", { name: "Editar o texto da notícia no app" });
    expect(texto.innerHTML).toContain("<p>Piscina fechada amanhã.<br>Das 9h às 12h.</p><p>Obrigado.</p>");
    expect(screen.getByRole("button", { name: /Texto da folha/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publicar no app" }));
    await waitFor(() => expect(publicarNoticia).toHaveBeenCalled());
    expect(publicarNoticia.mock.calls[0][0]).toMatchObject({
      texto: "Piscina fechada amanhã.\nDas 9h às 12h.\n\nObrigado.",
      tamanhoTexto: null,
    });
  });

  it("muda o tamanho da letra e manda junto; o padrão vai vazio", async () => {
    const user = userEvent.setup();
    abrir();
    expect(screen.getByText("Padrão")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aumentar a letra no app" }));
    await user.click(screen.getByRole("button", { name: "Aumentar a letra no app" }));
    expect(screen.getByText("20px")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publicar no app" }));
    await waitFor(() => expect(publicarNoticia).toHaveBeenCalled());
    expect(publicarNoticia.mock.calls[0][0]).toMatchObject({ tamanhoTexto: 20 });
  });

  it("texto vazio não publica; 'Texto da folha' desfaz a edição", async () => {
    const user = userEvent.setup();
    abrir();
    const previa = within(screen.getByRole("complementary", { name: "Prévia no app do morador" }));
    await user.click(previa.getByRole("button", { name: "Editar o texto da notícia no app" }));
    await user.clear(previa.getByRole("textbox", { name: "Texto da notícia no app" }));
    expect(screen.getByRole("button", { name: "Publicar no app" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Texto da folha/ }));
    expect(previa.getByText("Pedimos a compreensão de todos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar no app" })).toBeEnabled();
  });
});
