import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, ConfirmProvider } from "../ui";
import {
  atestadoVencido, idade, lerQrDaCarteirinha, nomeDaCarteirinha, textoDaIdade, textoDoQr,
} from "../lib/carteirinha";

/**
 * Piscina no padrão do ViT e a carteirinha nova ("Clássico renovado", com
 * data de nascimento e QR code).
 */

const mockListar = vi.fn();
const mockCriar = vi.fn();
const mockEditar = vi.fn();
vi.mock("../api/db", () => ({
  listar: (...a) => mockListar(...a),
  criar: (...a) => mockCriar(...a),
  editar: (...a) => mockEditar(...a),
  remover: vi.fn(),
}));
const mockEnviar = vi.fn();
const mockRemoverAnexo = vi.fn(async () => ({ success: true }));
vi.mock("../api/anexos", () => ({
  enviarAnexo: (...a) => mockEnviar(...a),
  urlDoAnexo: vi.fn(async () => null),
  urlsDosAnexos: vi.fn(async () => new Map()),
  removerAnexo: (...a) => mockRemoverAnexo(...a),
  removerAnexosDoRegistro: vi.fn(),
}));
const mockImagem = vi.fn(async () => new Blob(["png"]));
const mockRecortar = vi.fn(() => "data:image/jpeg;base64,RECORTE");
vi.mock("../components/piscina/imagemDaCarteirinha", () => ({
  LARGURA: 1011, ALTURA: 639,
  imagemDaCarteirinha: (...a) => mockImagem(...a),
  recortar: (...a) => mockRecortar(...a),
}));
vi.mock("../lib/baixar", () => ({ entregarArquivo: vi.fn(async () => "baixado"), nomeDeArquivo: (n) => n, BAIXADO: "baixado" }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async (texto) => `data:image/png;base64,${btoa(texto)}`) } }));

import Piscina from "../pages/Piscina";

const UNIDADES = [{ id: 52, bloco: "5", unidade: "206" }, { id: 11, bloco: "1", unidade: "101" }];
const CADASTROS = [
  { id: 7, id_unidade: 52, nome: "mariana costa silva", url_foto: "data:image/png;base64,AAAA", nascimento: "1994-08-12", validade_atestado: "2099-03-15", status: "Ativo", cpf: "12345678901", telefone: "21999990000" },
  { id: 8, id_unidade: 11, nome: "João Pedro", nascimento: "2015-01-02", validade_atestado: "2020-01-01", status: "Ativo" },
  { id: 9, id_unidade: 11, nome: "Ana Lima", status: "Inativo" },
];

const envolver = (el) => <ToastProvider><ConfirmProvider>{el}</ConfirmProvider></ToastProvider>;

describe("regras da carteirinha", () => {
  const dia = new Date("2026-11-05T12:00:00-03:00");

  it("calcula a idade em anos completos, no fuso de Brasília", () => {
    expect(idade("1994-08-12", dia)).toBe(32);
    expect(idade("2000-11-05", dia)).toBe(26);
    expect(idade("2000-11-06", dia)).toBe(25);
    expect(idade("06/11/2000", dia)).toBe(25);
    expect(idade("", dia)).toBeNull();
    expect(textoDaIdade("2025-10-01", dia)).toBe("1 ano");
  });

  it("o atestado vale até o fim do dia da validade", () => {
    expect(atestadoVencido("2026-11-05", dia)).toBe(false);
    expect(atestadoVencido("2026-11-04", dia)).toBe(true);
    expect(atestadoVencido("", dia)).toBe(false);
  });

  it("o QR leva só o id e o sistema lê de volta", () => {
    expect(textoDoQr(7)).toBe("NR-PISCINA:7");
    expect(lerQrDaCarteirinha("NR-PISCINA:7")).toBe("7");
    expect(lerQrDaCarteirinha("https://outro.site")).toBeNull();
    expect(lerQrDaCarteirinha("NR-PISCINA:1; drop table")).toBeNull();
  });

  it("o nome longo perde o último sobrenome e a preposição pendurada", () => {
    expect(nomeDaCarteirinha("Ana Lima")).toBe("Ana Lima");
    expect(nomeDaCarteirinha("Maria Eduarda dos Santos Oliveira")).toBe("Maria Eduarda dos Santos");
    expect(nomeDaCarteirinha("Maria Eduarda Vasconcelos de Oliveira")).toBe("Maria Eduarda Vasconcelos");
    // Corta até caber, não só um sobrenome.
    expect(nomeDaCarteirinha("Maria Aparecida Fernandes Albuquerque Silva")).toBe("Maria Aparecida Fernandes");
  });
});

describe("tela Piscina", () => {
  beforeEach(() => {
    mockCriar.mockReset();
    mockImagem.mockClear();
    mockEditar.mockReset();
    mockListar.mockImplementation(async (t) => (t === "PISCINA" ? CADASTROS : t === "UNIDADES" ? UNIDADES : []));
  });

  it("lista com unidade, idade, atestado vencido e as pílulas de situação", async () => {
    render(envolver(<Piscina user={{ nome: "Lucas", cargo: "Sindico" }} />));
    expect(await screen.findByText("Mariana Costa Silva")).toBeInTheDocument();
    expect(screen.getByText("B5-206")).toBeInTheDocument();
    expect(screen.getAllByText("Vencido").length).toBeGreaterThan(0);
    expect(screen.getByText(/3 cadastros · 2 ativos · 1 com atestado vencido/)).toBeInTheDocument();
  });

  it("ver mostra a carteirinha com nascimento, validade e o QR do cadastro", async () => {
    render(envolver(<Piscina user={{ nome: "Lucas", cargo: "Sindico" }} />));
    await userEvent.click(await screen.findByRole("button", { name: "Ver o cadastro de Mariana Costa Silva" }));
    const modal = await screen.findByRole("dialog", { name: "Cadastro na piscina" });
    const cartao = modal.querySelector("#carteirinha-piscina");
    expect(within(cartao).getByText("12/08/1994")).toBeInTheDocument();
    expect(within(cartao).getByText("15/03/2099")).toBeInTheDocument();
    expect(within(cartao).getByText("B5-206")).toBeInTheDocument();
    const qr = await within(cartao).findByAltText("QR code da carteirinha");
    expect(atob(qr.getAttribute("src").split(",")[1])).toBe("NR-PISCINA:7");
    // As manchas do fundo levam a cor no próprio SVG: por CSS, a imagem baixada
    // saía com elas pretas (o html-to-image não leva o fill do CSS).
    const manchas = [...cartao.querySelectorAll(".cart__fundo path")];
    expect(manchas.length).toBe(5);
    expect(manchas.every((m) => /^#[0-9A-F]{6}$/i.test(m.getAttribute("fill")))).toBe(true);
    expect(within(modal).getByRole("button", { name: /Baixar carteirinha/ })).toBeInTheDocument();
    // O CPF inteiro só no editar.
    expect(within(modal).queryByText("123.456.789-01")).not.toBeInTheDocument();
  });

  it("editar grava o nascimento e a validade como data", async () => {
    mockEditar.mockResolvedValue({ success: true });
    render(envolver(<Piscina user={{ nome: "Lucas", cargo: "Sindico" }} />));
    await userEvent.click(await screen.findByRole("button", { name: "Editar o cadastro de Mariana Costa Silva" }));
    const modal = await screen.findByRole("dialog", { name: "Editar cadastro" });
    await userEvent.click(within(modal).getByRole("radio", { name: "Inativo" }));
    await userEvent.click(within(modal).getByRole("button", { name: "Salvar" }));
    expect(mockEditar).toHaveBeenCalledWith("PISCINA", 7, expect.objectContaining({
      nome: "Mariana Costa Silva", nascimento: "1994-08-12", validade_atestado: "2099-03-15", status: "Inativo",
    }));
  });

  it("antes de baixar pergunta se quer recortar; o recorte da foto inteira vai para a carteirinha", async () => {
    render(envolver(<Piscina user={{ nome: "Lucas", cargo: "Sindico" }} />));
    await userEvent.click(await screen.findByRole("button", { name: "Ver o cadastro de Mariana Costa Silva" }));
    const modal = await screen.findByRole("dialog", { name: "Cadastro na piscina" });
    await userEvent.click(within(modal).getByRole("button", { name: /Baixar carteirinha/ }));

    const aviso = await screen.findByRole("dialog", { name: "Quer recortar a foto antes de baixar?" });
    expect(mockImagem).not.toHaveBeenCalled();
    await userEvent.click(within(aviso).getByRole("button", { name: /Recortar a foto/ }));

    // A foto aparece INTEIRA; ao carregar, surge o círculo do recorte.
    const recorte = await screen.findByRole("dialog", { name: "Recortar a foto" });
    const inteira = within(recorte).getByAltText("A foto inteira");
    Object.defineProperty(inteira, "naturalWidth", { value: 800 });
    Object.defineProperty(inteira, "naturalHeight", { value: 1000 });
    fireEvent.load(inteira);
    expect(within(recorte).getByRole("group", { name: /Área do recorte/ })).toBeInTheDocument();
    await userEvent.click(within(recorte).getByRole("button", { name: "Diminuir o círculo" }));
    mockEnviar.mockResolvedValue({ success: true, caminho: "piscina/7/1-carteirinha.jpg" });
    mockEditar.mockResolvedValue({ success: true });
    await userEvent.click(within(recorte).getByRole("button", { name: "Salvar recorte" }));
    expect(mockRecortar).toHaveBeenCalledWith(inteira, expect.objectContaining({ lado: expect.any(Number) }));
    expect(mockRecortar.mock.calls[0][1].lado).toBeLessThan(640); // 80% de 800, diminuído

    // Salvo para sempre: o recorte sobe à parte e o cadastro aponta para ele.
    await waitFor(() => expect(mockEditar).toHaveBeenCalledWith("PISCINA", 7, { caminho_foto_carteirinha: "piscina/7/1-carteirinha.jpg" }));
    expect(mockEnviar).toHaveBeenCalledWith("piscina", 7, "data:image/jpeg;base64,RECORTE", "carteirinha.jpg");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Recortar a foto" })).not.toBeInTheDocument());

    // Com o recorte feito, o cartão mostra o recorte e baixar não pergunta mais.
    expect(within(modal).getByAltText(/Foto de mariana/i)).toHaveAttribute("src", "data:image/jpeg;base64,RECORTE");
    await userEvent.click(within(modal).getByRole("button", { name: /Baixar carteirinha/ }));
    await waitFor(() => expect(mockImagem).toHaveBeenCalledTimes(1));
    expect(mockImagem.mock.calls[0][1]).toBe("data:image/jpeg;base64,RECORTE");
  });

  it("\"Baixar assim\" baixa sem recortar", async () => {
    render(envolver(<Piscina user={{ nome: "Lucas", cargo: "Sindico" }} />));
    await userEvent.click(await screen.findByRole("button", { name: "Ver o cadastro de Mariana Costa Silva" }));
    const modal = await screen.findByRole("dialog", { name: "Cadastro na piscina" });
    await userEvent.click(within(modal).getByRole("button", { name: /Baixar carteirinha/ }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Quer recortar a foto antes de baixar?" })).getByRole("button", { name: /Baixar assim/ }));
    await waitFor(() => expect(mockImagem).toHaveBeenCalledTimes(1));
  });

  it("o recorte salvo aparece na carteirinha e a foto inteira continua guardada", async () => {
    mockListar.mockImplementation(async (t) => (t === "PISCINA"
      ? [{ ...CADASTROS[0], caminho_foto_carteirinha: "piscina/7/1-carteirinha.jpg" }]
      : t === "UNIDADES" ? UNIDADES : []));
    const { urlsDosAnexos } = await import("../api/anexos");
    urlsDosAnexos.mockImplementation(async (cs) => new Map(cs.filter(Boolean).map((c) => [c, "data:image/jpeg;base64,SALVO"])));
    render(envolver(<Piscina user={{ nome: "Lucas", cargo: "Sindico" }} />));
    await userEvent.click(await screen.findByRole("button", { name: "Ver o cadastro de Mariana Costa Silva" }));
    const modal = await screen.findByRole("dialog", { name: "Cadastro na piscina" });
    expect(within(modal.querySelector("#carteirinha-piscina")).getByAltText(/Foto de mariana/i)).toHaveAttribute("src", "data:image/jpeg;base64,SALVO");
    expect(within(modal).getByRole("button", { name: /Recortar de novo/ })).toBeInTheDocument();
    // Já recortada: baixa direto, sem perguntar.
    await userEvent.click(within(modal).getByRole("button", { name: /Baixar carteirinha/ }));
    await waitFor(() => expect(mockImagem).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Quer recortar a foto antes de baixar?" })).not.toBeInTheDocument();
    urlsDosAnexos.mockImplementation(async () => new Map());
  });
});
